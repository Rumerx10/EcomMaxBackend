import { fixed2 } from '../../common/utils/money.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { OrderDto, OrderSummaryDto } from './dto/order-response.dto.js';

const customer = { select: { id: true, name: true, phone: true } } as const;

// How many item pictures an order list shows.
export const PREVIEW_IMAGES = 4;

export const ORDER_SUMMARY_INCLUDE = {
  items: {
    select: { quantity: true, imageUrl: true },
    orderBy: { id: 'asc' as const },
  },
  payments: {
    select: { paidAt: true },
    where: { paidAt: { not: null } },
    orderBy: { paidAt: 'desc' as const },
    take: 1,
  },
  user: customer,
} satisfies Prisma.OrderInclude;

export const ORDER_DETAIL_INCLUDE = {
  // Ids are UUIDv7, so ordering by id is the order they were written in.
  items: { orderBy: { id: 'asc' as const } },
  events: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  payments: { orderBy: { createdAt: 'asc' as const } },
  user: customer,
} satisfies Prisma.OrderInclude;

type OrderRow = Omit<SummaryRow, 'items' | 'payments'> & {
  items: { quantity: number; imageUrl: string | null }[];
  payments: { paidAt: Date | null }[];
};

type SummaryRow = Prisma.OrderGetPayload<{
  include: typeof ORDER_SUMMARY_INCLUDE;
}>;
type DetailRow = Prisma.OrderGetPayload<{
  include: typeof ORDER_DETAIL_INCLUDE;
}>;

export const toOrderSummary = (
  order: OrderRow,
  staff: boolean,
): OrderSummaryDto => ({
  id: order.id,
  orderNumber: order.orderNumber,
  status: order.status,
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus,
  currency: order.currency,
  totalAmount: fixed2(order.totalAmount),
  itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
  previewImages: order.items
    .flatMap((item) => (item.imageUrl ? [item.imageUrl] : []))
    .slice(0, PREVIEW_IMAGES),
  paidAt:
    order.payments
      .map((payment) => payment.paidAt)
      .filter((paidAt): paidAt is Date => paidAt !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
  shipName: order.shipName,
  ...(staff ? { customer: order.user } : {}),
  createdAt: order.createdAt,
});

export const toOrderDto = (order: DetailRow, staff: boolean): OrderDto =>
  Object.assign(toOrderSummary(order, staff), {
    subtotal: fixed2(order.subtotal),
    discountAmount: fixed2(order.discountAmount),
    shippingAmount: fixed2(order.shippingAmount),
    installationFee: fixed2(order.installationFee),
    taxAmount: fixed2(order.taxAmount),
    couponCode: order.couponCode,
    note: order.note,
    shipping: {
      name: order.shipName,
      phone: order.shipPhone,
      district: order.shipDistrict,
      thana: order.shipThana,
      villageOrWard: order.shipVillageOrWard,
      addressLine: order.shipAddressLine,
      postCode: order.shipPostCode,
      method: order.shippingMethod,
    },
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      title: item.title,
      sku: item.sku,
      variant: item.variant,
      imageUrl: item.imageUrl,
      unitPrice: fixed2(item.unitPrice),
      quantity: item.quantity,
      totalPrice: fixed2(item.totalPrice),
      ...(staff ? { unitCost: fixed2(item.unitCost) } : {}),
    })),
    events: order.events.map(({ status, title, note, createdAt }) => ({
      status,
      title,
      note,
      createdAt,
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      status: payment.status,
      amount: fixed2(payment.amount),
      transactionId: payment.transactionId,
      paidAt: payment.paidAt,
    })),
    cancelReason: order.cancelReason,
    cancelledAt: order.cancelledAt,
    updatedAt: order.updatedAt,
  });
