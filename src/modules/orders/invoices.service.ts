import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { fixed2 } from '../../common/utils/money.js';
import { Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import { SellerService } from '../seller/seller.service.js';
import {
  type InvoiceBatchDto,
  type InvoiceDto,
  type InvoicesQueryDto,
  MAX_INVOICES,
} from './dto/invoice.dto.js';

const ZERO = new Prisma.Decimal(0);

const INVOICE_INCLUDE = {
  // Ids are UUIDv7, so ordering by id is the order they were written in.
  items: { orderBy: { id: 'asc' as const } },
  payments: {
    where: { status: 'PAID' as const },
    select: { amount: true, paidAt: true },
  },
  user: { select: { email: true } },
} satisfies Prisma.OrderInclude;

type InvoiceRow = Prisma.OrderGetPayload<{ include: typeof INVOICE_INCLUDE }>;

// Cancelled and returned orders, and refunded ones, have nothing left to collect.
const SETTLED_STATUSES = new Set(['CANCELLED', 'RETURNED']);

const toInvoice = (order: InvoiceRow): InvoiceDto => {
  const paid = order.payments.reduce(
    (sum, payment) => sum.plus(payment.amount),
    ZERO,
  );
  const settled =
    SETTLED_STATUSES.has(order.status) || order.paymentStatus === 'REFUNDED';
  const due = settled
    ? ZERO
    : Prisma.Decimal.max(ZERO, order.totalAmount.minus(paid));
  const paidAt =
    order.payments
      .map((payment) => payment.paidAt)
      .filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paidAt,
    customerEmail: order.user.email,
    shipTo: {
      name: order.shipName,
      phone: order.shipPhone,
      district: order.shipDistrict,
      thana: order.shipThana,
      villageOrWard: order.shipVillageOrWard,
      addressLine: order.shipAddressLine,
      postCode: order.shipPostCode,
    },
    shippingMethod: order.shippingMethod,
    note: order.note,
    items: order.items.map((item) => ({
      title: item.title,
      sku: item.sku,
      variant: item.variant,
      quantity: item.quantity,
      unitPrice: fixed2(item.unitPrice),
      totalPrice: fixed2(item.totalPrice),
    })),
    subtotal: fixed2(order.subtotal),
    discountAmount: fixed2(order.discountAmount),
    couponCode: order.couponCode,
    shippingAmount: fixed2(order.shippingAmount),
    installationFee: fixed2(order.installationFee),
    taxAmount: fixed2(order.taxAmount),
    totalAmount: fixed2(order.totalAmount),
    amountPaid: fixed2(paid),
    amountDue: fixed2(due),
  };
};

// Invoices to print for packed orders: the store's details once, then each order with its
// delivery address, items, totals and what the courier should collect. Any storefront can
// render them; nothing here is specific to one seller.
@Injectable()
export class InvoicesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sellers: SellerService,
  ) {}

  async invoices(query: InvoicesQueryDto): Promise<InvoiceBatchDto> {
    if (Boolean(query.ids) === Boolean(query.status)) {
      throw new BadRequestException('Name the orders: ids or a status');
    }
    const rows = await this.tenantPrisma.db.order.findMany({
      where: query.ids ? { id: { in: query.ids } } : { status: query.status },
      include: INVOICE_INCLUDE,
      orderBy: { orderNumber: 'asc' },
      take: MAX_INVOICES,
    });

    let orders = rows;
    if (query.ids) {
      const byId = new Map(rows.map((row) => [row.id, row]));
      if (query.ids.some((id) => !byId.has(id))) {
        throw new NotFoundException('Order not found');
      }
      orders = query.ids.map((id) => byId.get(id)!);
    }

    const store = await this.sellers.getSettings(this.tenantPrisma.sellerId);
    return {
      store: {
        name: store.name,
        logoUrl: store.logoUrl,
        address: store.address,
        phone: store.phone,
        email: store.email,
        website: store.primaryHost,
        taxId: store.taxId,
        invoiceNote: store.invoiceNote,
        currency: store.currency,
      },
      invoices: orders.map(toInvoice),
    };
  }
}
