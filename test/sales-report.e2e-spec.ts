import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createApp,
  createStore,
  createUser,
  login,
  storeClient,
  type TestStore,
} from './helpers.js';

// Collects a binary response body (supertest only buffers text and JSON by itself). The
// parser gets the raw response stream, whatever supertest's types call it.
const binary: Parameters<request.Test['parse']>[0] = (res, done) => {
  const stream = res as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('Sales report (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let owner: ReturnType<typeof storeClient>;
  let panel: { id: string };
  let inverter: { id: string };
  let orderNumber = 1;

  // One order of one product, placed at `at` (UTC).
  const order = async (
    product: { id: string },
    at: string,
    options: {
      quantity: number;
      unitPrice: number;
      unitCost?: number;
      shipping?: number;
      status?: 'DELIVERED' | 'CANCELLED' | 'PENDING';
      paid?: boolean;
    },
  ) => {
    const subtotal = options.quantity * options.unitPrice;
    const shipping = options.shipping ?? 0;
    await prisma.order.create({
      data: {
        sellerId: store.id,
        orderNumber: orderNumber++,
        userId: store.owner.id,
        status: options.status ?? 'DELIVERED',
        paymentStatus: options.paid ? 'PAID' : 'PENDING',
        subtotal,
        shippingAmount: shipping,
        totalAmount: subtotal + shipping,
        shippingMethod: 'Standard',
        shipName: 'Buyer',
        shipPhone: '+8801712345678',
        shipDistrict: 'Dhaka',
        shipThana: 'Mirpur',
        shipVillageOrWard: 'Ward 6',
        idempotencyKey: randomUUID(),
        createdAt: new Date(at),
        items: {
          create: {
            productId: product.id,
            title: 'x',
            sku: 'x',
            unitPrice: options.unitPrice,
            unitCost: options.unitCost,
            quantity: options.quantity,
            totalPrice: subtotal,
          },
        },
      },
    });
  };

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
    owner = storeClient(
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
        sku: 'P-1',
        price: 1000,
        stock: 20,
      },
    });
    inverter = await prisma.product.create({
      data: {
        sellerId: store.id,
        categoryId: inverters.id,
        title: 'Inverter',
        slug: 'inverter',
        sku: 'I-1',
        price: 5000,
        stock: 20,
      },
    });

    // Tuesday 4 March 2025, 13:00 in Dhaka.
    await order(panel, '2025-03-04T07:00:00Z', {
      quantity: 3,
      unitPrice: 1000,
      unitCost: 700,
      shipping: 100,
      paid: true,
    });
    // Still 5 March in UTC, but 02:00 on Thursday 6 March in Dhaka.
    await order(inverter, '2025-03-05T20:00:00Z', {
      quantity: 1,
      unitPrice: 5000,
      status: 'PENDING',
    });
    await order(inverter, '2025-03-06T10:00:00Z', {
      quantity: 2,
      unitPrice: 5000,
      status: 'CANCELLED',
    });
    await order(panel, '2025-04-10T06:00:00Z', {
      quantity: 1,
      unitPrice: 1000,
      unitCost: 700,
      paid: true,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('adds up a month: money, units, profit, payments and statuses', async () => {
    const { body } = await owner
      .get('/admin/reports/sales?period=month&date=2025-03-15')
      .expect(200);
    expect(body).toMatchObject({
      store: `Store ${store.slug}`,
      currency: 'BDT',
      period: 'month',
      unit: 'day',
      label: 'March 2025',
      key: '2025-03',
    });
    expect(body.totals).toEqual({
      orders: 2,
      unitsSold: 4,
      revenue: '8100.00',
      goods: '8000.00',
      discounts: '0.00',
      delivery: '100.00',
      installation: '0.00',
      vat: '0.00',
      averageOrder: '4050.00',
      profit: '900.00',
      collected: '3100.00',
      awaiting: '5000.00',
    });
    expect(body.statusCounts).toMatchObject({
      DELIVERED: 1,
      PENDING: 1,
      CANCELLED: 1,
    });
    expect(body.series).toHaveLength(31);
    expect(body.series[3]).toEqual({
      bucket: '2025-03-04T00:00',
      label: 'Tue 4 Mar',
      orders: 1,
      units: 3,
      revenue: '3100.00',
      profit: '900.00',
    });
    expect(body.series[4].orders).toBe(0);
    expect(body.series[5]).toMatchObject({ orders: 1, revenue: '5000.00' });
    expect(body.categories).toEqual([
      { name: 'Inverters', units: 1, revenue: '5000.00', profit: '0.00' },
      { name: 'Solar panels', units: 3, revenue: '3000.00', profit: '900.00' },
    ]);
    expect(body.products).toEqual([
      {
        productId: inverter.id,
        title: 'Inverter',
        sku: 'I-1',
        units: 1,
        revenue: '5000.00',
        profit: '0.00',
      },
      {
        productId: panel.id,
        title: 'Panel',
        sku: 'P-1',
        units: 3,
        revenue: '3000.00',
        profit: '900.00',
      },
    ]);
  });

  it('reports a Monday-to-Sunday week, one Dhaka day by hour, and a year by month', async () => {
    const week = (
      await owner
        .get('/admin/reports/sales?period=week&date=2025-03-05')
        .expect(200)
    ).body;
    expect(week.label).toBe('3–9 March 2025');
    expect(week.series).toHaveLength(7);
    expect(week.totals.orders).toBe(2);

    const day = (
      await owner
        .get('/admin/reports/sales?period=day&date=2025-03-06')
        .expect(200)
    ).body;
    expect(day.label).toBe('Thursday 6 March 2025');
    expect(day.totals).toMatchObject({ orders: 1, revenue: '5000.00' });
    expect(day.series[2]).toMatchObject({ label: '2am–3am', orders: 1 });

    const year = (
      await owner
        .get('/admin/reports/sales?period=year&date=2025-01-01')
        .expect(200)
    ).body;
    expect(year.series).toHaveLength(12);
    expect(year.series[2]).toMatchObject({ label: 'Mar 2025', orders: 2 });
    expect(year.series[3]).toMatchObject({ orders: 1, profit: '300.00' });
    expect(year.totals).toMatchObject({ orders: 3, unitsSold: 5 });
  });

  it('reports all time from the first order', async () => {
    const { body } = await owner
      .get('/admin/reports/sales?period=all')
      .expect(200);
    expect(body.label).toMatch(/^All time, 4 March 2025 to /);
    expect(body.key).toBe('all-time');
    expect(body.series[0].bucket).toMatch(/^2025-0[13]-01T00:00$/);
    expect(body.totals).toMatchObject({ orders: 3, revenue: '9100.00' });
  });

  it('downloads the report as a PDF', async () => {
    const res = await owner
      .get('/admin/reports/sales/pdf?period=month&date=2025-03-01')
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="${store.slug}-sales-2025-03.pdf"`,
    );
    expect(res.headers['cache-control']).toBe('no-store');
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('turns down bad dates, unknown periods and periods still to come', async () => {
    await owner
      .get('/admin/reports/sales?period=day&date=2025-02-30')
      .expect(400);
    await owner.get('/admin/reports/sales?date=25-03-01').expect(400);
    await owner.get('/admin/reports/sales?period=decade').expect(400);
    const { body } = await owner
      .get('/admin/reports/sales?period=day&date=2099-01-01')
      .expect(400);
    expect(body.message).toBe('That period has not started yet');
  });

  it('is for the owner only', async () => {
    for (const role of ['MANAGER', 'CUSTOMER'] as const) {
      const user = await createUser(prisma, store.id, role);
      const token = (await login(app, store.host, user.phone)).accessToken;
      await storeClient(app, store.host, token)
        .get('/admin/reports/sales')
        .expect(403);
    }
    await storeClient(app, store.host)
      .get('/admin/reports/sales/pdf')
      .expect(401);
  });
});
