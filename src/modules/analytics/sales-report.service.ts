import { BadRequestException, Injectable } from '@nestjs/common';
import { fixed2 } from '../../common/utils/money.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import { TIMEZONE } from './period.js';
import {
  bucketLabel,
  localToday,
  type ReportWindow,
  reportWindow,
  type SalesPeriod,
  startsInFuture,
} from './report-period.js';
import type { SalesReportDto } from './sales-report.dto.js';
import { at, bucketOf, COUNTED, ITEM_PROFIT, ORDER_ITEMS } from './sql.js';

const BEST_SELLERS = 20;

interface BucketRow {
  bucket: string;
  orders: number;
  units: number;
  revenue: string;
  profit: string;
}
interface TotalsRow {
  orders: number;
  units: number;
  revenue: string;
  goods: string;
  discounts: string;
  delivery: string;
  installation: string;
  vat: string;
  profit: string;
  collected: string;
}
interface GroupRow {
  name: string;
  units: number;
  revenue: string;
  profit: string;
}
interface ProductRow extends GroupRow {
  productId: string;
  sku: string;
}

const money = (value: string | null | undefined) =>
  fixed2(new Prisma.Decimal(value ?? 0));

// The owner's sales report for one day, week, month, year or all time: totals, the figures
// per hour/day/month/year, categories and best sellers. Like the dashboard, the sums are raw
// SQL, so every query names the store's sellerId itself.
@Injectable()
export class SalesReportService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  async report(
    period: SalesPeriod,
    date: string | undefined,
    now = new Date(),
  ): Promise<SalesReportDto> {
    const sellerId = this.tenantPrisma.sellerId;
    const [seller, first] = await Promise.all([
      this.prisma.seller.findUniqueOrThrow({
        where: { id: sellerId },
        select: { name: true, currency: true },
      }),
      period === 'all'
        ? this.tenantPrisma.db.order.findFirst({
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          })
        : null,
    ]);
    const window = reportWindow(
      period,
      date ?? localToday(now),
      first?.createdAt ?? null,
      now,
    );
    if (startsInFuture(window, now))
      throw new BadRequestException('That period has not started yet');

    const [buckets, [totals], statuses, categories, products] =
      await Promise.all([
        this.buckets(sellerId, window),
        this.totals(sellerId, window),
        this.tenantPrisma.db.order.groupBy({
          by: ['status'],
          where: { createdAt: { gte: window.from, lt: window.to } },
          _count: { _all: true },
        }),
        this.categories(sellerId, window),
        this.products(sellerId, window),
      ]);

    const byBucket = new Map(buckets.map((row) => [row.bucket, row]));
    const revenue = new Prisma.Decimal(totals?.revenue ?? 0);
    const collected = new Prisma.Decimal(totals?.collected ?? 0);
    const orders = totals?.orders ?? 0;
    const statusCounts: Record<string, number> = {
      PENDING: 0,
      PROCESSING: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
      RETURNED: 0,
    };
    for (const row of statuses) statusCounts[row.status] = row._count._all;

    return {
      store: seller.name,
      currency: seller.currency,
      timezone: TIMEZONE,
      period,
      unit: window.unit,
      label: window.label,
      key: window.key,
      from: window.from,
      to: window.to,
      generatedAt: now,
      totals: {
        orders,
        unitsSold: totals?.units ?? 0,
        revenue: fixed2(revenue),
        goods: money(totals?.goods),
        discounts: money(totals?.discounts),
        delivery: money(totals?.delivery),
        installation: money(totals?.installation),
        vat: money(totals?.vat),
        averageOrder: fixed2(
          orders > 0 ? revenue.dividedBy(orders) : new Prisma.Decimal(0),
        ),
        profit: money(totals?.profit),
        collected: fixed2(collected),
        awaiting: fixed2(revenue.minus(collected)),
      },
      statusCounts,
      series: window.buckets.map((bucket) => {
        const row = byBucket.get(bucket);
        return {
          bucket,
          label: bucketLabel(bucket, window.unit),
          orders: row?.orders ?? 0,
          units: row?.units ?? 0,
          revenue: money(row?.revenue),
          profit: money(row?.profit),
        };
      }),
      categories: categories.map((row) => ({
        name: row.name,
        units: row.units,
        revenue: money(row.revenue),
        profit: money(row.profit),
      })),
      products: products.map((row) => ({
        productId: row.productId,
        title: row.name,
        sku: row.sku,
        units: row.units,
        revenue: money(row.revenue),
        profit: money(row.profit),
      })),
    };
  }

  private inWindow(sellerId: string, window: ReportWindow) {
    return Prisma.sql`o."sellerId" = ${sellerId}::uuid
      AND o."createdAt" >= ${at(window.from)} AND o."createdAt" < ${at(window.to)}
      AND ${COUNTED}`;
  }

  private buckets(sellerId: string, window: ReportWindow) {
    return this.prisma.$queryRaw<BucketRow[]>`
      SELECT ${bucketOf(window.unit)} AS bucket,
             count(*)::int AS orders,
             coalesce(sum(i.units), 0)::int AS units,
             coalesce(sum(o."totalAmount"), 0)::text AS revenue,
             coalesce(sum(i.profit), 0)::text AS profit
      FROM orders o
      ${ORDER_ITEMS}
      WHERE ${this.inWindow(sellerId, window)}
      GROUP BY 1`;
  }

  private totals(sellerId: string, window: ReportWindow) {
    return this.prisma.$queryRaw<TotalsRow[]>`
      SELECT count(*)::int AS orders,
             coalesce(sum(i.units), 0)::int AS units,
             coalesce(sum(o."totalAmount"), 0)::text AS revenue,
             coalesce(sum(o.subtotal), 0)::text AS goods,
             coalesce(sum(o."discountAmount"), 0)::text AS discounts,
             coalesce(sum(o."shippingAmount"), 0)::text AS delivery,
             coalesce(sum(o."installationFee"), 0)::text AS installation,
             coalesce(sum(o."taxAmount"), 0)::text AS vat,
             coalesce(sum(i.profit), 0)::text AS profit,
             coalesce(sum(o."totalAmount") FILTER (WHERE o."paymentStatus" = 'PAID'), 0)::text
               AS collected
      FROM orders o
      ${ORDER_ITEMS}
      WHERE ${this.inWindow(sellerId, window)}`;
  }

  private categories(sellerId: string, window: ReportWindow) {
    return this.prisma.$queryRaw<GroupRow[]>`
      SELECT c.name AS name,
             sum(oi.quantity)::int AS units,
             sum(oi."totalPrice")::text AS revenue,
             ${ITEM_PROFIT}::text AS profit
      FROM order_items oi
      JOIN orders o ON o."sellerId" = oi."sellerId" AND o.id = oi."orderId"
      JOIN products p ON p."sellerId" = oi."sellerId" AND p.id = oi."productId"
      JOIN categories c ON c."sellerId" = p."sellerId" AND c.id = p."categoryId"
      WHERE ${this.inWindow(sellerId, window)}
      GROUP BY c.id, c.name
      ORDER BY sum(oi."totalPrice") DESC, c.name`;
  }

  private products(sellerId: string, window: ReportWindow) {
    return this.prisma.$queryRaw<ProductRow[]>`
      SELECT p.id AS "productId",
             p.title AS name,
             p.sku AS sku,
             sum(oi.quantity)::int AS units,
             sum(oi."totalPrice")::text AS revenue,
             ${ITEM_PROFIT}::text AS profit
      FROM order_items oi
      JOIN orders o ON o."sellerId" = oi."sellerId" AND o.id = oi."orderId"
      JOIN products p ON p."sellerId" = oi."sellerId" AND p.id = oi."productId"
      WHERE ${this.inWindow(sellerId, window)}
      GROUP BY p.id, p.title, p.sku
      ORDER BY sum(oi."totalPrice") DESC, p.title
      LIMIT ${BEST_SELLERS}`;
  }
}
