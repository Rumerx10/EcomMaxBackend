import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createApp,
  createStore,
  createUser,
  login,
  storeClient,
  type TestStore,
} from './helpers.js';

describe('Invoices (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let staff: ReturnType<typeof storeClient>;
  let product: { id: string };
  let orderNumber = 1;
  // Packed and unpaid (cash on delivery), packed and paid, cancelled.
  let codOrder: string;
  let paidOrder: string;
  let cancelledOrder: string;

  const order = async (
    sellerId: string,
    productId: string,
    options: {
      status: 'PROCESSING' | 'CANCELLED';
      paid?: boolean;
      at: string;
    },
  ) => {
    const user = await prisma.user.findFirstOrThrow({
      where: { sellerId, role: 'OWNER' },
    });
    const created = await prisma.order.create({
      data: {
        sellerId,
        orderNumber: orderNumber++,
        userId: user.id,
        status: options.status,
        paymentStatus: options.paid ? 'PAID' : 'PENDING',
        subtotal: 3000,
        discountAmount: 300,
        couponCode: 'SAVE10',
        shippingAmount: 150,
        taxAmount: 135,
        totalAmount: 2985,
        shippingMethod: 'Standard delivery',
        note: 'Call before coming',
        shipName: 'Rahim Uddin',
        shipPhone: '+8801712345678',
        shipDistrict: 'Dhaka',
        shipThana: 'Mirpur',
        shipVillageOrWard: 'Ward 6',
        shipAddressLine: 'House 12, Road 3',
        shipPostCode: '1216',
        idempotencyKey: randomUUID(),
        createdAt: new Date(options.at),
        items: {
          create: [
            {
              productId,
              title: 'Solar panel 550W',
              sku: 'SP-550',
              variant: 'Black frame',
              unitPrice: 1000,
              unitCost: 700,
              quantity: 2,
              totalPrice: 2000,
            },
            {
              productId,
              title: 'MC4 connector pair',
              sku: 'MC4',
              unitPrice: 500,
              quantity: 2,
              totalPrice: 1000,
            },
          ],
        },
        ...(options.paid
          ? {
              payments: {
                create: {
                  method: 'COD',
                  status: 'PAID',
                  amount: 2985,
                  paidAt: new Date(options.at),
                },
              },
            }
          : {}),
      },
    });
    return created.id;
  };

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
    staff = storeClient(
      app,
      store.host,
      (await login(app, store.host, store.owner.phone)).accessToken,
    );
    const category = await prisma.category.create({
      data: { sellerId: store.id, name: 'Panels', slug: 'panels' },
    });
    product = await prisma.product.create({
      data: {
        sellerId: store.id,
        categoryId: category.id,
        title: 'Solar panel 550W',
        slug: 'panel',
        sku: 'SP-550',
        price: 1000,
        stock: 50,
      },
    });
    codOrder = await order(store.id, product.id, {
      status: 'PROCESSING',
      at: '2026-10-20T06:00:00Z',
    });
    paidOrder = await order(store.id, product.id, {
      status: 'PROCESSING',
      paid: true,
      at: '2026-10-21T06:00:00Z',
    });
    cancelledOrder = await order(store.id, product.id, {
      status: 'CANCELLED',
      at: '2026-10-22T06:00:00Z',
    });
    await staff
      .patch('/store/settings')
      .send({
        address: 'House 42, Road 11, Banani, Dhaka 1213',
        taxId: ' 000123456-0101 ',
        invoiceNote: 'Keep this invoice for warranty claims.',
      })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps the tax id and invoice note in the store settings', async () => {
    const { body } = await staff.get('/store/settings').expect(200);
    expect(body).toMatchObject({
      taxId: '000123456-0101',
      invoiceNote: 'Keep this invoice for warranty claims.',
    });
    await staff
      .patch('/store/settings')
      .send({ taxId: 'x'.repeat(41) })
      .expect(400);
  });

  it('prints chosen orders in the order asked, with the store once', async () => {
    const { body } = await staff
      .get(`/admin/orders/invoices?ids=${paidOrder},${codOrder},${paidOrder}`)
      .expect(200);
    expect(body.store).toEqual({
      name: `Store ${store.slug}`,
      logoUrl: null,
      address: 'House 42, Road 11, Banani, Dhaka 1213',
      phone: '+8809612345678',
      email: `${store.slug}@example.com`,
      website: store.host,
      taxId: '000123456-0101',
      invoiceNote: 'Keep this invoice for warranty claims.',
      currency: 'BDT',
    });
    expect(body.invoices.map((i: { orderId: string }) => i.orderId)).toEqual([
      paidOrder,
      codOrder,
    ]);

    const cod = body.invoices[1];
    expect(cod).toMatchObject({
      orderNumber: 1,
      status: 'PROCESSING',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      paidAt: null,
      shipTo: {
        name: 'Rahim Uddin',
        phone: '+8801712345678',
        district: 'Dhaka',
        thana: 'Mirpur',
        villageOrWard: 'Ward 6',
        addressLine: 'House 12, Road 3',
        postCode: '1216',
      },
      shippingMethod: 'Standard delivery',
      note: 'Call before coming',
      subtotal: '3000.00',
      discountAmount: '300.00',
      couponCode: 'SAVE10',
      shippingAmount: '150.00',
      installationFee: '0.00',
      taxAmount: '135.00',
      totalAmount: '2985.00',
      amountPaid: '0.00',
      amountDue: '2985.00',
    });
    expect(cod.items).toEqual([
      {
        title: 'Solar panel 550W',
        sku: 'SP-550',
        variant: 'Black frame',
        quantity: 2,
        unitPrice: '1000.00',
        totalPrice: '2000.00',
      },
      {
        title: 'MC4 connector pair',
        sku: 'MC4',
        variant: null,
        quantity: 2,
        unitPrice: '500.00',
        totalPrice: '1000.00',
      },
    ]);
    // Costs are for the store's eyes only, never on paper.
    expect(cod.items[0]).not.toHaveProperty('unitCost');

    expect(body.invoices[0]).toMatchObject({
      paymentStatus: 'PAID',
      amountPaid: '2985.00',
      amountDue: '0.00',
      paidAt: '2026-10-21T06:00:00.000Z',
    });
  });

  it('prints every order in a status, oldest first', async () => {
    const { body } = await staff
      .get('/admin/orders/invoices?status=PROCESSING')
      .expect(200);
    expect(body.invoices.map((i: { orderId: string }) => i.orderId)).toEqual([
      codOrder,
      paidOrder,
    ]);
  });

  it('asks the courier to collect nothing for a cancelled order', async () => {
    const { body } = await staff
      .get(`/admin/orders/invoices?ids=${cancelledOrder}`)
      .expect(200);
    expect(body.invoices[0]).toMatchObject({
      status: 'CANCELLED',
      amountDue: '0.00',
    });
  });

  it('turns down unclear requests and orders it cannot find', async () => {
    await staff.get('/admin/orders/invoices').expect(400);
    await staff
      .get(`/admin/orders/invoices?ids=${codOrder}&status=PROCESSING`)
      .expect(400);
    await staff.get('/admin/orders/invoices?ids=not-an-id').expect(400);
    await staff.get('/admin/orders/invoices?status=LOST').expect(400);
    const many = Array.from({ length: 51 }, () => randomUUID()).join(',');
    await staff.get(`/admin/orders/invoices?ids=${many}`).expect(400);
    await staff
      .get(`/admin/orders/invoices?ids=${codOrder},${randomUUID()}`)
      .expect(404);

    // Another store's order is not found here.
    const other = await createStore(prisma);
    const category = await prisma.category.create({
      data: { sellerId: other.id, name: 'X', slug: 'x' },
    });
    const theirs = await prisma.product.create({
      data: {
        sellerId: other.id,
        categoryId: category.id,
        title: 'Theirs',
        slug: 'theirs',
        sku: 'T',
        price: 1,
        stock: 1,
      },
    });
    const theirOrder = await order(other.id, theirs.id, {
      status: 'PROCESSING',
      at: '2026-10-23T06:00:00Z',
    });
    await staff.get(`/admin/orders/invoices?ids=${theirOrder}`).expect(404);
  });

  it('is for staff: managers yes, customers and strangers no', async () => {
    const manager = await createUser(prisma, store.id, 'MANAGER');
    const customer = await createUser(prisma, store.id);
    const as = async (phone: string) =>
      storeClient(
        app,
        store.host,
        (await login(app, store.host, phone)).accessToken,
      );
    await (
      await as(manager.phone)
    )
      .get(`/admin/orders/invoices?ids=${codOrder}`)
      .expect(200);
    await (
      await as(customer.phone)
    )
      .get(`/admin/orders/invoices?ids=${codOrder}`)
      .expect(403);
    await storeClient(app, store.host)
      .get(`/admin/orders/invoices?ids=${codOrder}`)
      .expect(401);
  });
});
