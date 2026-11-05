import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { periodFor } from '../src/modules/analytics/period.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createApp,
  createStore,
  createUser,
  login,
  storeClient,
  type TestStore,
} from './helpers.js';

const HOUR = 3_600_000;

describe('Dashboard analytics (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let staff: ReturnType<typeof storeClient>;
  let panel: { id: string };
  let inverter: { id: string };
  let orderNumber = 1;

  // An order of `quantity` units of one product, placed at `at` with the given status.
  const order = async (
    sellerId: string,
    product: { id: string },
    at: Date,
    options: {
      quantity: number;
      unitPrice: number;
      unitCost?: number;
      status?: 'DELIVERED' | 'CANCELLED' | 'PENDING';
    },
  ) => {
    const user = await prisma.user.findFirstOrThrow({
      where: { sellerId, role: 'OWNER' },
    });
    const total = options.quantity * options.unitPrice;
    await prisma.order.create({
      data: {
        sellerId,
        orderNumber: orderNumber++,
        userId: user.id,
        status: options.status ?? 'DELIVERED',
        subtotal: total,
        totalAmount: total,
        shippingMethod: 'Standard',
        shipName: 'Buyer',
        shipPhone: '+8801712345678',
        shipDistrict: 'Dhaka',
        shipThana: 'Mirpur',
        shipVillageOrWard: 'Ward 6',
        idempotencyKey: randomUUID(),
        createdAt: at,
        items: {
          create: {
            productId: product.id,
            title: 'x',
            sku: 'x',
            unitPrice: options.unitPrice,
            unitCost: options.unitCost,
            quantity: options.quantity,
            totalPrice: total,
          },
        },
      },
    });
  };

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
    staff = storeClient(
      app,
      store.host,
      (await login(app, store.host, store.owner.phone)).accessToken,
    );
    const panels = await prisma.category.create({
      data: { sellerId: store.id, name: 'Solar panels', slug: 'panels' },
    });
    const inverters = await prisma.category.create({
      data: { sellerId: store.id, name: 'Inverters', slug: 'inverters' },
    });
    panel = await prisma.product.create({
      data: {
        sellerId: store.id,
        categoryId: panels.id,
        title: 'Panel',
        slug: 'panel',
        sku: 'P',
        price: 1000,
        stock: 2,
        tags: ['home'],
      },
    });
    inverter = await prisma.product.create({
      data: {
        sellerId: store.id,
        categoryId: inverters.id,
        title: 'Inverter',
        slug: 'inverter',
        sku: 'I',
        price: 5000,
        stock: 50,
        tags: ['business'],
      },
    });

    const week = periodFor('week');
    // The second day of each period, at 13:00 Dhaka time.
    const thisWeek = new Date(week.from.getTime() + 24 * HOUR + 13 * HOUR);
    const lastWeek = new Date(
      week.previousFrom.getTime() + 24 * HOUR + 13 * HOUR,
    );
    await order(store.id, panel, thisWeek, {
      quantity: 3,
      unitPrice: 1000,
      unitCost: 700,
    });
    await order(store.id, inverter, thisWeek, { quantity: 1, unitPrice: 5000 });
    await order(store.id, inverter, thisWeek, {
      quantity: 1,
      unitPrice: 5000,
      status: 'CANCELLED',
    });
    await order(store.id, panel, lastWeek, {
      quantity: 2,
      unitPrice: 1000,
      unitCost: 700,
    });

    // Another store's sales must not show up.
    const other = await createStore(prisma);
    const otherCategory = await prisma.category.create({
      data: { sellerId: other.id, name: 'X', slug: 'x' },
    });
    const otherProduct = await prisma.product.create({
      data: {
        sellerId: other.id,
        categoryId: otherCategory.id,
        title: 'Theirs',
        slug: 'theirs',
        sku: 'T',
        price: 9,
        stock: 9,
      },
    });
    await order(other.id, otherProduct, thisWeek, {
      quantity: 99,
      unitPrice: 999,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('adds up this week and last week, leaving cancelled orders and other stores out', async () => {
    const { body } = await staff.get('/admin/analytics?range=week').expect(200);
    expect(body).toMatchObject({
      range: 'week',
      timezone: 'Asia/Dhaka',
      currency: 'BDT',
    });
    expect(body.totals).toMatchObject({
      revenue: { current: '8000.00', previous: '2000.00' },
      orders: { current: 2, previous: 1 },
      averageOrder: { current: '4000.00', previous: '2000.00' },
      unitsSold: { current: 4, previous: 2 },
      profit: { current: '900.00', previous: '600.00' },
    });
    expect(body.series).toHaveLength(7);
    const busyDay = body.series[1];
    expect(busyDay).toMatchObject({
      revenue: '8000.00',
      orders: 2,
      units: 4,
      profit: '900.00',
      previousRevenue: '2000.00',
      previousOrders: 1,
      previousUnits: 2,
      previousProfit: '600.00',
    });
    expect(body.statusCounts).toMatchObject({
      DELIVERED: 2,
      CANCELLED: 1,
      PENDING: 0,
    });
  });

  it('ranks products and breaks revenue and units down by category and tag', async () => {
    const { body } = await staff.get('/admin/analytics?range=week').expect(200);
    expect(body.topProducts).toEqual([
      {
        productId: inverter.id,
        title: 'Inverter',
        units: 1,
        revenue: '5000.00',
        previousRevenue: '0.00',
      },
      {
        productId: panel.id,
        title: 'Panel',
        units: 3,
        revenue: '3000.00',
        previousRevenue: '2000.00',
      },
    ]);
    expect(body.categories).toEqual([
      {
        name: 'Inverters',
        revenue: '5000.00',
        previousRevenue: '0.00',
        units: 1,
        previousUnits: 0,
      },
      {
        name: 'Solar panels',
        revenue: '3000.00',
        previousRevenue: '2000.00',
        units: 3,
        previousUnits: 2,
      },
    ]);
    expect(body.segments.map((s: { name: string }) => s.name)).toEqual([
      'business',
      'home',
    ]);
  });

  it('places orders on the weekday and time-of-day heatmap, in Dhaka time', async () => {
    const { body } = await staff.get('/admin/analytics?range=week').expect(200);
    expect(body.heatmap).toHaveLength(7);
    expect(body.heatmap.flat().reduce((a: number, b: number) => a + b, 0)).toBe(
      2,
    );
    // 13:00 Dhaka falls in the 12pm-2pm slot (index 2).
    const slotTotals = body.heatmap.reduce(
      (totals: number[], row: number[]) =>
        totals.map((value, i) => value + row[i]),
      [0, 0, 0, 0, 0, 0, 0],
    );
    expect(slotTotals[2]).toBe(2);
  });

  it('lists low stock and works for every range', async () => {
    const { body } = await staff.get('/admin/analytics?range=year').expect(200);
    expect(body.series).toHaveLength(12);
    expect(body.lowStock).toEqual([{ id: panel.id, title: 'Panel', stock: 2 }]);
    expect(
      (await staff.get('/admin/analytics?range=today').expect(200)).body.series,
    ).toHaveLength(24);
    expect((await staff.get('/admin/analytics').expect(200)).body.range).toBe(
      'month',
    );
    await staff.get('/admin/analytics?range=decade').expect(400);
  });

  it('is for staff only', async () => {
    const customer = await createUser(prisma, store.id);
    const token = (await login(app, store.host, customer.phone)).accessToken;
    await storeClient(app, store.host, token)
      .get('/admin/analytics')
      .expect(403);
    await storeClient(app, store.host).get('/admin/analytics').expect(401);
  });
});
