import type { OrderStatus } from '../../generated/prisma/client.js';

// Where an order can go from each status. CANCELLED and RETURNED are final.
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

// Timeline titles, matching the client's order progress (components/orders/OrderProgress.tsx).
export const STATUS_TITLES: Record<OrderStatus, string> = {
  PENDING: 'Order placed',
  PROCESSING: 'Being packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

// Customers may cancel until the parcel leaves.
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ['PENDING', 'PROCESSING'];

// Cancelled and returned goods go back on the shelf.
export const RESTOCKING_STATUSES: OrderStatus[] = ['CANCELLED', 'RETURNED'];

export const canMove = (from: OrderStatus, to: OrderStatus) =>
  NEXT_STATUSES[from].includes(to);
