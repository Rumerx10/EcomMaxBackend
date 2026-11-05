import { Prisma } from '../../generated/prisma/client.js';
import { TIMEZONE } from './period.js';

// SQL pieces shared by the dashboard and the sales report.

// Cancelled and returned orders bring in no money.
export const COUNTED = Prisma.sql`o.status NOT IN ('CANCELLED', 'RETURNED')`;

// Postgres stores createdAt as UTC without a time zone; casting the bounds the same way keeps
// the comparison independent of the session's time zone.
export const at = (date: Date) =>
  Prisma.sql`CAST(${date.toISOString()} AS timestamp)`;

export const localTime = Prisma.sql`(o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TIMEZONE}`;

// Start of the hour, day, month or year an order falls in, as local "YYYY-MM-DDTHH:MM".
export const bucketOf = (unit: string) =>
  Prisma.sql`to_char(date_trunc(${unit}, ${localTime}), 'YYYY-MM-DD"T"HH24:MI')`;

// Price minus cost per item line, for lines that have a cost price.
export const ITEM_PROFIT = Prisma.sql`coalesce(sum((oi."unitPrice" - oi."unitCost") * oi.quantity)
  FILTER (WHERE oi."unitCost" IS NOT NULL), 0)`;

// Units and profit of each order, joined beside it: (units, profit) per order row.
export const ORDER_ITEMS = Prisma.sql`CROSS JOIN LATERAL (
  SELECT coalesce(sum(oi.quantity), 0)::int AS units, ${ITEM_PROFIT} AS profit
  FROM order_items oi
  WHERE oi."sellerId" = o."sellerId" AND oi."orderId" = o.id
) i`;
