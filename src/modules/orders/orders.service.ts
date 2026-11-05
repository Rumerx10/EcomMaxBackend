import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toCursorPage } from '../../common/dto/cursor-query.dto.js';
import { fixed2 } from '../../common/utils/money.js';
import { normalizeBdPhone } from '../../common/utils/phone.js';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import {
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../tenant/tenant-prisma.service.js';
import type {
  OrderDto,
  OrderListResponseDto,
  StoreOrdersSummaryDto,
} from './dto/order-response.dto.js';
import type {
  MyOrdersQueryDto,
  StoreOrdersQueryDto,
  UpdateOrderStatusDto,
} from './dto/order-query.dto.js';
import {
  canMove,
  CUSTOMER_CANCELLABLE,
  RESTOCKING_STATUSES,
  STATUS_TITLES,
} from './order-status.js';
import {
  ORDER_DETAIL_INCLUDE,
  ORDER_SUMMARY_INCLUDE,
  toOrderDto,
  toOrderSummary,
} from './order-view.js';

interface Transition {
  note?: string;
  restock?: boolean;
  cancelReason?: string;
}

// Orders after checkout: the customer's own history and cancellation, and the store's order
// management. Every status change is checked against NEXT_STATUSES, applied only if nobody
// changed the order meanwhile, and written to the timeline.
@Injectable()
export class OrdersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  listMine(
    userId: string,
    query: MyOrdersQueryDto,
  ): Promise<OrderListResponseDto> {
    return this.list(
      { userId, ...(query.status ? { status: query.status } : {}) },
      query,
      false,
    );
  }

  async getMine(userId: string, id: string): Promise<OrderDto> {
    return toOrderDto(await this.require({ id, userId }), false);
  }

  async cancelMine(
    userId: string,
    id: string,
    reason: string,
  ): Promise<OrderDto> {
    const order = await this.require({ id, userId });
    if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
      throw new ConflictException(
        'This order is on its way and can no longer be cancelled',
      );
    }
    if (order.paymentStatus === 'PAID') {
      throw new ConflictException(
        'This order is paid. Contact the store to cancel and refund it.',
      );
    }
    await this.transition(order.id, order.status, 'CANCELLED', {
      note: reason,
      cancelReason: reason,
      restock: true,
    });
    return this.getMine(userId, id);
  }

  listStore(query: StoreOrdersQueryDto): Promise<OrderListResponseDto> {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.from || query.to)
      where.createdAt = { gte: query.from, lt: query.to };
    if (query.search) {
      const search = query.search.trim().replace(/^#/, '');
      const phone = normalizeBdPhone(search);
      if (phone) {
        where.OR = [{ shipPhone: phone }, { user: { phone } }];
      } else if (/^\d{1,9}$/.test(search)) {
        where.orderNumber = Number(search);
      } else {
        where.shipName = { contains: search, mode: 'insensitive' };
      }
    }
    return this.list(where, query, true);
  }

  // How many orders are in each status, and the money in each payment status.
  async storeSummary(): Promise<StoreOrdersSummaryDto> {
    const [statuses, payments, awaitingCod] = await Promise.all([
      this.db.order.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.db.order.groupBy({
        by: ['paymentStatus'],
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.db.order.count({
        where: { paymentMethod: 'COD', paymentStatus: 'PENDING' },
      }),
    ]);
    const zero = new Prisma.Decimal(0);
    const byStatus = Object.fromEntries(
      Object.values(OrderStatus).map((status) => [
        status,
        statuses.find((row) => row.status === status)?._count._all ?? 0,
      ]),
    ) as Record<OrderStatus, number>;
    const byPaymentStatus = Object.fromEntries(
      Object.values(PaymentStatus).map((status) => {
        const row = payments.find((r) => r.paymentStatus === status);
        return [
          status,
          {
            count: row?._count._all ?? 0,
            amount: fixed2(row?._sum.totalAmount ?? zero),
          },
        ];
      }),
    ) as StoreOrdersSummaryDto['byPaymentStatus'];
    const counted = statuses.filter(
      (row) => !RESTOCKING_STATUSES.includes(row.status),
    );
    const revenue = counted.reduce(
      (sum, row) => sum.plus(row._sum.totalAmount ?? zero),
      zero,
    );
    const countedOrders = counted.reduce((n, row) => n + row._count._all, 0);
    return {
      orders: statuses.reduce((n, row) => n + row._count._all, 0),
      byStatus,
      byPaymentStatus,
      revenue: fixed2(revenue),
      averageOrder: fixed2(
        countedOrders
          ? revenue.dividedBy(countedOrders).toDecimalPlaces(2)
          : zero,
      ),
      awaitingCod,
    };
  }

  async getStore(id: string): Promise<OrderDto> {
    return toOrderDto(await this.require({ id }), true);
  }

  // Staff record money that arrived outside a gateway (cash, bank transfer) or a refund.
  async setPayment(id: string, status: 'PAID' | 'REFUNDED'): Promise<OrderDto> {
    const order = await this.require({ id });
    if (status === 'REFUNDED' && order.paymentStatus !== 'PAID') {
      throw new ConflictException('Only a paid order can be refunded');
    }
    if (status === 'PAID' && order.paymentStatus === 'PAID') {
      throw new ConflictException('This order is already paid');
    }
    if (status === 'PAID' && order.status === 'CANCELLED') {
      throw new ConflictException('A cancelled order cannot be marked paid');
    }
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      const latest = order.payments.at(-1);
      if (latest) {
        await tx.payment.update({
          where: { id: latest.id },
          data:
            status === 'PAID'
              ? { status, paidAt: now }
              : { status, refundedAt: now },
        });
      }
      await tx.order.update({ where: { id }, data: { paymentStatus: status } });
      await tx.orderEvent.create({
        data: {
          sellerId: this.tenantPrisma.sellerId,
          orderId: id,
          title: status === 'PAID' ? 'Payment received' : 'Payment refunded',
        },
      });
    });
    return this.getStore(id);
  }

  async changeStatus(id: string, dto: UpdateOrderStatusDto): Promise<OrderDto> {
    const order = await this.require({ id });
    if (!canMove(order.status, dto.status)) {
      throw new ConflictException(
        `An order that is ${order.status} cannot become ${dto.status}`,
      );
    }
    await this.transition(order.id, order.status, dto.status, {
      note: dto.note,
      restock: dto.restock ?? true,
      cancelReason: dto.status === 'CANCELLED' ? dto.note : undefined,
    });
    return this.getStore(id);
  }

  private async list(
    where: Prisma.OrderWhereInput,
    query: { cursor?: string; limit: number },
    staff: boolean,
  ): Promise<OrderListResponseDto> {
    const rows = await this.db.order.findMany({
      where,
      include: ORDER_SUMMARY_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = toCursorPage(rows, query.limit);
    return {
      data: page.data.map((order) => toOrderSummary(order, staff)),
      nextCursor: page.nextCursor,
    };
  }

  private async require(where: { id: string; userId?: string }) {
    const order = await this.db.order.findFirst({
      where,
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private transition(
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
    options: Transition,
  ): Promise<void> {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      // Only if the status is still the one we looked at: two people moving the same order at
      // once can't both win.
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: from },
        data: {
          status: to,
          ...(to === 'CANCELLED'
            ? { cancelledAt: now, cancelReason: options.cancelReason ?? null }
            : {}),
        },
      });
      if (count === 0) {
        throw new ConflictException(
          'The order was changed meanwhile. Reload it and try again.',
        );
      }

      if (RESTOCKING_STATUSES.includes(to) && options.restock !== false) {
        await this.restock(tx, orderId);
      }
      await this.settlePayments(tx, orderId, to, now);
      await tx.orderEvent.create({
        data: {
          sellerId: this.tenantPrisma.sellerId,
          orderId,
          status: to,
          title: STATUS_TITLES[to],
          note: options.note ?? null,
        },
      });
    });
  }

  private async restock(tx: TenantTransactionClient, orderId: string) {
    const items = await tx.orderItem.findMany({ where: { orderId } });
    const perProduct = new Map<string, number>();
    for (const item of items) {
      perProduct.set(
        item.productId,
        (perProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }
    for (const productId of [...perProduct.keys()].sort()) {
      const quantity = perProduct.get(productId)!;
      await tx.product.updateMany({
        where: { id: productId },
        data: {
          stock: { increment: quantity },
          soldCount: { decrement: quantity },
        },
      });
    }
  }

  // Cash on delivery is paid when the parcel is delivered; an unpaid cancelled order's payment
  // will never come. Refunds of paid orders are handled with the payment provider (step 10).
  private async settlePayments(
    tx: TenantTransactionClient,
    orderId: string,
    to: OrderStatus,
    now: Date,
  ) {
    if (to === 'DELIVERED') {
      const { count } = await tx.payment.updateMany({
        where: { orderId, method: 'COD', status: 'PENDING' },
        data: { status: 'PAID', paidAt: now },
      });
      if (count > 0) {
        await tx.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'PAID' },
        });
      }
    }
    if (to === 'CANCELLED') {
      const { count } = await tx.payment.updateMany({
        where: { orderId, status: 'PENDING' },
        data: { status: 'FAILED', failureReason: 'Order cancelled' },
      });
      if (count > 0) {
        await tx.order.updateMany({
          where: { id: orderId, paymentStatus: 'PENDING' },
          data: { paymentStatus: 'FAILED' },
        });
      }
    }
  }
}
