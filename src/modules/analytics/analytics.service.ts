import { Injectable } from '@nestjs/common';
import { fixed2 } from '../../common/utils/money.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import type { AnalyticsDto } from './analytics.dto.js';
import {
  type Period,
  periodFor,
  type ReportRange,
  TIMEZONE,
} from './period.js';
import {
  at,
  bucketOf,
  COUNTED,
  ITEM_PROFIT,
  localTime,
  ORDER_ITEMS,
} from './sql.js';

const ZERO = new Prisma.Decimal(0);
// Two-hour heatmap slots from 8am to 10pm, as on the client's dashboard.
const SLOT_START_HOURS = [8, 10, 12, 14, 16, 18, 20];

interface BucketRow {
  bucket: string;
  orders: number;
  revenue: string;
  units: number;
  profit: string;
}
interface ProductRow {
  productId: string;
  current: boolean;
  units: number;
  revenue: string;
  profit: string;
}
interface GroupTotals {
  revenue: Prisma.Decimal;
  previousRevenue: Prisma.Decimal;
  units: number;
  previousUnits: number;
}
interface HeatRow {
  dow: number;
  hour: number;
  orders: number;
}

const sum = (values: Prisma.Decimal[]) =>
  values.reduce((total, value) => total.plus(value), ZERO);
const average = (total: Prisma.Decimal, count: number) =>
  count > 0 ? total.dividedBy(count) : ZERO;

// The seller dashboard: revenue, orders and best sellers for a period and the one before it.
// The bucketed and summed figures are raw SQL, which the tenant extension cannot see, so every
// query names the store's sellerId itself. Orders are indexed by (sellerId, createdAt), so a
// period reads only that store's rows in that range.
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  async report(range: ReportRange, now = new Date()): Promise<AnalyticsDto> {
    const sellerId = this.tenantPrisma.sellerId;
    const period = periodFor(range, now);
    const seller = await this.prisma.seller.findUniqueOrThrow({
      where: { id: sellerId },
      select: { currency: true, lowStockThreshold: true },
    });

    const [buckets, products, heat, statuses, newCustomers, lowStock] =
      await Promise.all([
        this.buckets(sellerId, period),
        this.productSales(sellerId, period),
        this.heat(sellerId, period),
        this.tenantPrisma.db.order.groupBy({
          by: ['status'],
          where: { createdAt: { gte: period.from, lt: period.to } },
          _count: { _all: true },
        }),
        this.newCustomers(period),
        this.tenantPrisma.db.product.findMany({
          where: { status: 'ACTIVE', stock: { lte: seller.lowStockThreshold } },
          select: { id: true, title: true, stock: true },
          orderBy: [{ stock: 'asc' }, { title: 'asc' }],
          take: 10,
        }),
      ]);

    const byBucket = new Map(buckets.map((row) => [row.bucket, row]));
    const series = period.buckets.map((bucket, i) => {
      const current = byBucket.get(bucket);
      const previous = byBucket.get(period.previousBuckets[i]);
      return {
        bucket,
        previousBucket: period.previousBuckets[i],
        revenue: fixed2(new Prisma.Decimal(current?.revenue ?? 0)),
        orders: current?.orders ?? 0,
        units: current?.units ?? 0,
        profit: fixed2(new Prisma.Decimal(current?.profit ?? 0)),
        previousRevenue: fixed2(new Prisma.Decimal(previous?.revenue ?? 0)),
        previousOrders: previous?.orders ?? 0,
        previousUnits: previous?.units ?? 0,
        previousProfit: fixed2(new Prisma.Decimal(previous?.profit ?? 0)),
      };
    });
    const revenue = sum(
      series.map((point) => new Prisma.Decimal(point.revenue)),
    );
    const previousRevenue = sum(
      series.map((point) => new Prisma.Decimal(point.previousRevenue)),
    );
    const orders = series.reduce((total, point) => total + point.orders, 0);
    const previousOrders = series.reduce(
      (total, point) => total + point.previousOrders,
      0,
    );

    const sales = await this.salesBreakdown(products);
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
      range,
      timezone: TIMEZONE,
      from: period.from,
      to: period.to,
      currency: seller.currency,
      totals: {
        revenue: {
          current: fixed2(revenue),
          previous: fixed2(previousRevenue),
        },
        orders: { current: orders, previous: previousOrders },
        averageOrder: {
          current: fixed2(average(revenue, orders)),
          previous: fixed2(average(previousRevenue, previousOrders)),
        },
        unitsSold: sales.units,
        profit: sales.profit,
        newCustomers,
      },
      series,
      statusCounts,
      topProducts: sales.topProducts,
      categories: sales.categories,
      segments: sales.segments,
      heatmap: this.foldHeat(heat),
      lowStock,
    };
  }

  private buckets(sellerId: string, period: Period) {
    return this.prisma.$queryRaw<BucketRow[]>`
      SELECT ${bucketOf(period.unit)} AS bucket,
             count(*)::int AS orders,
             coalesce(sum(o."totalAmount"), 0)::text AS revenue,
             coalesce(sum(i.units), 0)::int AS units,
             coalesce(sum(i.profit), 0)::text AS profit
      FROM orders o
      ${ORDER_ITEMS}
      WHERE o."sellerId" = ${sellerId}::uuid
        AND o."createdAt" >= ${at(period.previousFrom)} AND o."createdAt" < ${at(period.to)}
        AND ${COUNTED}
      GROUP BY 1`;
  }

  private productSales(sellerId: string, period: Period) {
    return this.prisma.$queryRaw<ProductRow[]>`
      SELECT oi."productId" AS "productId",
             (o."createdAt" >= ${at(period.from)}) AS current,
             sum(oi.quantity)::int AS units,
             sum(oi."totalPrice")::text AS revenue,
             ${ITEM_PROFIT}::text AS profit
      FROM order_items oi
      JOIN orders o ON o."sellerId" = oi."sellerId" AND o.id = oi."orderId"
      WHERE o."sellerId" = ${sellerId}::uuid
        AND o."createdAt" >= ${at(period.previousFrom)} AND o."createdAt" < ${at(period.to)}
        AND ${COUNTED}
      GROUP BY 1, 2`;
  }

  private heat(sellerId: string, period: Period) {
    return this.prisma.$queryRaw<HeatRow[]>`
      SELECT extract(isodow FROM ${localTime})::int AS dow,
             extract(hour FROM ${localTime})::int AS hour,
             count(*)::int AS orders
      FROM orders o
      WHERE o."sellerId" = ${sellerId}::uuid
        AND o."createdAt" >= ${at(period.from)} AND o."createdAt" < ${at(period.to)}
        AND ${COUNTED}
      GROUP BY 1, 2`;
  }

  private async newCustomers(period: Period) {
    const count = (from: Date, to: Date) =>
      this.tenantPrisma.db.user.count({
        where: { role: 'CUSTOMER', createdAt: { gte: from, lt: to } },
      });
    const [current, previous] = await Promise.all([
      count(period.from, period.to),
      count(period.previousFrom, period.from),
    ]);
    return { current, previous };
  }

  // Product rows -> totals, best sellers, and revenue per category and per tag.
  private async salesBreakdown(rows: ProductRow[]) {
    const ids = [...new Set(rows.map((row) => row.productId))];
    const products = await this.tenantPrisma.db.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        tags: true,
        category: { select: { name: true } },
      },
    });
    const info = new Map(products.map((product) => [product.id, product]));

    const perProduct = new Map<
      string,
      { units: number; revenue: Prisma.Decimal; previous: Prisma.Decimal }
    >();
    const groups = {
      categories: new Map<string, GroupTotals>(),
      segments: new Map<string, GroupTotals>(),
    };
    const add = (
      map: Map<string, GroupTotals>,
      name: string,
      row: ProductRow,
      amount: Prisma.Decimal,
    ) => {
      const entry = map.get(name) ?? {
        revenue: ZERO,
        previousRevenue: ZERO,
        units: 0,
        previousUnits: 0,
      };
      if (row.current) {
        entry.revenue = entry.revenue.plus(amount);
        entry.units += row.units;
      } else {
        entry.previousRevenue = entry.previousRevenue.plus(amount);
        entry.previousUnits += row.units;
      }
      map.set(name, entry);
    };
    let units = 0;
    let previousUnits = 0;
    let profit = ZERO;
    let previousProfit = ZERO;

    for (const row of rows) {
      const revenue = new Prisma.Decimal(row.revenue);
      const product = info.get(row.productId);
      const entry = perProduct.get(row.productId) ?? {
        units: 0,
        revenue: ZERO,
        previous: ZERO,
      };
      if (row.current) {
        entry.units += row.units;
        entry.revenue = entry.revenue.plus(revenue);
        units += row.units;
        profit = profit.plus(row.profit);
      } else {
        entry.previous = entry.previous.plus(revenue);
        previousUnits += row.units;
        previousProfit = previousProfit.plus(row.profit);
      }
      perProduct.set(row.productId, entry);
      add(groups.categories, product?.category.name ?? 'Other', row, revenue);
      for (const tag of product?.tags ?? [])
        add(groups.segments, tag, row, revenue);
    }

    const toGroups = (map: Map<string, GroupTotals>) =>
      [...map.entries()]
        .sort((a, b) => b[1].revenue.comparedTo(a[1].revenue))
        .map(([name, entry]) => ({
          name,
          revenue: fixed2(entry.revenue),
          previousRevenue: fixed2(entry.previousRevenue),
          units: entry.units,
          previousUnits: entry.previousUnits,
        }));

    return {
      units: { current: units, previous: previousUnits },
      profit: { current: fixed2(profit), previous: fixed2(previousProfit) },
      topProducts: [...perProduct.entries()]
        .filter(([, entry]) => entry.units > 0)
        .sort((a, b) => b[1].revenue.comparedTo(a[1].revenue))
        .slice(0, 10)
        .map(([productId, entry]) => ({
          productId,
          title: info.get(productId)?.title ?? 'Deleted product',
          units: entry.units,
          revenue: fixed2(entry.revenue),
          previousRevenue: fixed2(entry.previous),
        })),
      categories: toGroups(groups.categories),
      segments: toGroups(groups.segments),
    };
  }

  // Rows of (ISO weekday 1-7, hour) -> 7 x 7 counts, Monday first.
  private foldHeat(rows: HeatRow[]): number[][] {
    const grid = Array.from({ length: 7 }, () =>
      Array<number>(SLOT_START_HOURS.length).fill(0),
    );
    for (const row of rows) {
      const slot = SLOT_START_HOURS.findIndex(
        (start) => row.hour >= start && row.hour < start + 2,
      );
      if (slot >= 0) grid[row.dow - 1][slot] += row.orders;
    }
    return grid;
  }
}
