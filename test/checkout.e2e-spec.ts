import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createApp,
  createStore,
  createUser,
  login,
  nextPhone,
  PASSWORD,
  storeClient,
  type TestStore,
} from './helpers.js';

const ADDRESS = {
  name: 'Rahim Uddin',
  phone: '01812345678',
  district: 'Dhaka',
  thana: 'Mirpur',
  villageOrWard: 'Ward 6',
  addressLine: 'House 18, Road 7',
};

describe('Checkout and orders (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let staff: ReturnType<typeof storeClient>;
  let rateId: string;
  let categoryId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
    await prisma.seller.update({
      where: { id: store.id },
      data: { taxRate: 5, installationFee: 15000 },
    });
    staff = storeClient(
      app,
      store.host,
      (await login(app, store.host, store.owner.phone)).accessToken,
    );
    categoryId = (
      await prisma.category.create({
        data: { sellerId: store.id, name: 'All', slug: 'all' },
      })
    ).id;
    rateId = (
      await staff
        .post('/shipping-rates')
        .send({ name: 'Inside Dhaka', price: 80 })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let skuCounter = 0;
  const newProduct = async (data: {
    price: number;
    stock: number;
    costPrice?: number;
    title?: string;
  }) => {
    skuCounter++;
    const title = data.title ?? `Product ${skuCounter}`;
    return prisma.product.create({
      data: {
        sellerId: store.id,
        categoryId,
        title,
        slug: `p-${skuCounter}-${randomUUID().slice(0, 8)}`,
        sku: `SKU-${skuCounter}`,
        price: data.price,
        stock: data.stock,
        costPrice: data.costPrice,
      },
    });
  };

  const product = (id: string) =>
    prisma.product.findUniqueOrThrow({ where: { id } });

  // A guest with a cart of the given lines; returns their client and token.
  const guestWithCart = async (
    lines: { productId: string; quantity?: number; variant?: string }[],
  ) => {
    let token: string | undefined;
    for (const line of lines) {
      const req = storeClient(app, store.host).post('/cart/items');
      if (token) req.set('X-Guest-Token', token);
      token = (await req.send(line).expect(200)).body.guestToken;
    }
    return token!;
  };

  const guestCheckout = (
    token: string,
    body: Record<string, unknown>,
    key = randomUUID(),
  ) =>
    storeClient(app, store.host)
      .post('/checkout')
      .set('X-Guest-Token', token)
      .set('Idempotency-Key', key)
      .send({ shippingRateId: rateId, address: ADDRESS, ...body });

  describe('as a guest', () => {
    it('creates the account, saves the address, takes stock and signs the buyer in', async () => {
      const panel = await newProduct({
        price: 19500,
        stock: 5,
        costPrice: 15000,
      });
      const token = await guestWithCart([{ productId: panel.id, quantity: 2 }]);
      await storeClient(app, store.host)
        .post('/wishlist/items')
        .set('X-Guest-Token', token)
        .send({ productId: panel.id });
      const phone = nextPhone();

      const res = await guestCheckout(token, {
        name: 'Rahim Uddin',
        phone,
        password: PASSWORD,
      }).expect(201);
      const { order, auth, created } = res.body;
      expect(created).toBe(true);
      expect(order).toMatchObject({
        status: 'PENDING',
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        subtotal: '39000.00',
        discountAmount: '0.00',
        shippingAmount: '80.00',
        taxAmount: '1950.00',
        totalAmount: '41030.00',
        itemCount: 2,
        shipping: {
          name: 'Rahim Uddin',
          phone: '+8801812345678',
          district: 'Dhaka',
          method: 'Inside Dhaka',
        },
      });
      expect(order.orderNumber).toBeGreaterThan(1000);
      expect(order.items[0]).toMatchObject({
        unitPrice: '19500.00',
        quantity: 2,
        totalPrice: '39000.00',
      });
      expect(order.items[0].unitCost).toBeUndefined();
      expect(order.events.map((e: { title: string }) => e.title)).toEqual([
        'Order placed',
      ]);
      expect(order.payments).toMatchObject([
        { method: 'COD', status: 'PENDING', amount: '41030.00' },
      ]);
      expect(auth.user).toMatchObject({
        role: 'CUSTOMER',
        phone,
        name: 'Rahim Uddin',
      });

      expect(await product(panel.id)).toMatchObject({ stock: 3, soldCount: 2 });
      const buyer = storeClient(app, store.host, auth.accessToken);
      expect(
        (await buyer.get('/orders').expect(200)).body.data.map(
          (o: { id: string }) => o.id,
        ),
      ).toEqual([order.id]);
      const addresses = (await buyer.get('/addresses').expect(200)).body;
      expect(addresses).toMatchObject([{ district: 'Dhaka', isDefault: true }]);
      expect(
        (await buyer.get('/wishlist').expect(200)).body.items,
      ).toHaveLength(1);
      // The guest cart is gone.
      expect(
        (
          await storeClient(app, store.host)
            .get('/cart')
            .set('X-Guest-Token', token)
            .expect(200)
        ).body.items,
      ).toEqual([]);
    });

    it('sending the same Idempotency-Key again returns the same order and takes nothing twice', async () => {
      const panel = await newProduct({ price: 1000, stock: 5 });
      const token = await guestWithCart([{ productId: panel.id }]);
      const phone = nextPhone();
      const key = randomUUID();
      const first = await guestCheckout(
        token,
        { name: 'Twice', phone, password: PASSWORD },
        key,
      ).expect(201);
      const again = await guestCheckout(
        token,
        { name: 'Twice', phone, password: PASSWORD },
        key,
      ).expect(200);
      expect(again.body.created).toBe(false);
      expect(again.body.order.id).toBe(first.body.order.id);
      expect((await product(panel.id)).stock).toBe(4);

      const other = await guestWithCart([{ productId: panel.id }]);
      await guestCheckout(
        other,
        { name: 'Other', phone: nextPhone(), password: PASSWORD },
        key,
      ).expect(409);
    });

    it('needs name, phone, password, an address, an Idempotency-Key and a cart', async () => {
      const panel = await newProduct({ price: 1000, stock: 5 });
      const token = await guestWithCart([{ productId: panel.id }]);
      const missing = await guestCheckout(token, { name: 'Xi' }).expect(400);
      expect(missing.body.message).toMatch(/phone, password/);
      await guestCheckout(token, {
        name: 'No address',
        phone: nextPhone(),
        password: PASSWORD,
        address: undefined,
      }).expect(400);
      await storeClient(app, store.host)
        .post('/checkout')
        .set('X-Guest-Token', token)
        .send({
          shippingRateId: rateId,
          address: ADDRESS,
          name: 'Xi',
          phone: nextPhone(),
          password: PASSWORD,
        })
        .expect(400);
      await storeClient(app, store.host)
        .post('/checkout')
        .set('Idempotency-Key', randomUUID())
        .send({
          shippingRateId: rateId,
          address: ADDRESS,
          name: 'Xi',
          phone: nextPhone(),
          password: PASSWORD,
        })
        .expect(400);
      expect((await product(panel.id)).stock).toBe(5);
    });

    it('a phone that already has an account needs its password', async () => {
      const existing = await createUser(prisma, store.id);
      const panel = await newProduct({ price: 1000, stock: 5 });
      const token = await guestWithCart([{ productId: panel.id }]);
      const wrong = await guestCheckout(token, {
        name: 'Me',
        phone: existing.phone,
        password: 'not my password',
      }).expect(409);
      expect(wrong.body.message).toMatch(/already has an account/);

      const right = await guestCheckout(token, {
        name: 'Me',
        phone: existing.phone,
        password: PASSWORD,
      }).expect(201);
      expect(right.body.auth.user.id).toBe(existing.id);
    });
  });

  describe('as a signed-in customer', () => {
    let customer: { id: string; phone: string };
    let me: ReturnType<typeof storeClient>;

    beforeAll(async () => {
      customer = await createUser(prisma, store.id);
      me = storeClient(
        app,
        store.host,
        (await login(app, store.host, customer.phone)).accessToken,
      );
    });

    const checkout = (body: Record<string, unknown>, key = randomUUID()) =>
      me
        .post('/checkout')
        .set('Idempotency-Key', key)
        .send({ shippingRateId: rateId, ...body });

    it('uses a saved address, a coupon and installation, with VAT after the discount', async () => {
      const panel = await newProduct({ price: 19500, stock: 5 });
      const address = (
        await me
          .post('/addresses')
          .send({ ...ADDRESS, label: 'Home' })
          .expect(201)
      ).body;
      await staff
        .post('/coupons')
        .send({ code: 'save10', discountValue: 10 })
        .expect(201);
      await me.post('/cart/items').send({ productId: panel.id }).expect(200);

      const res = await checkout({
        addressId: address.id,
        couponCode: 'save10',
        installation: true,
      }).expect(201);
      expect(res.body.auth).toBeNull();
      expect(res.body.order).toMatchObject({
        subtotal: '19500.00',
        discountAmount: '1950.00',
        taxAmount: '877.50',
        shippingAmount: '80.00',
        installationFee: '15000.00',
        totalAmount: '33507.50',
        couponCode: 'SAVE10',
      });
      const coupon = await prisma.coupon.findFirstOrThrow({
        where: { sellerId: store.id, code: 'SAVE10' },
      });
      expect(coupon.usedCount).toBe(1);
      expect((await me.get('/cart').expect(200)).body.items).toEqual([]);
    });

    it('prices chosen options and records the variant', async () => {
      const battery = await prisma.product.create({
        data: {
          sellerId: store.id,
          categoryId,
          title: 'Battery',
          slug: `battery-${randomUUID().slice(0, 8)}`,
          sku: `BAT-${randomUUID().slice(0, 6)}`,
          price: 150000,
          stock: 3,
          options: {
            create: {
              name: 'Capacity',
              values: {
                create: [
                  { label: '6.4 kWh', position: 0 },
                  { label: '9.6 kWh', priceDelta: 95000, position: 1 },
                ],
              },
            },
          },
        },
      });
      await me
        .post('/cart/items')
        .send({ productId: battery.id, variant: 'Capacity: 9.6 kWh' })
        .expect(200);
      const res = await checkout({ address: ADDRESS }).expect(201);
      expect(res.body.order.items).toMatchObject([
        {
          title: 'Battery',
          variant: 'Capacity: 9.6 kWh',
          unitPrice: '245000.00',
        },
      ]);
    });

    it('a used-up coupon stops the order and nothing changes', async () => {
      const panel = await newProduct({ price: 5000, stock: 5 });
      await staff
        .post('/coupons')
        .send({
          code: 'ONCE',
          discountValue: 500,
          discountType: 'FIXED_AMOUNT',
          usageLimit: 1,
        })
        .expect(201);
      await me.post('/cart/items').send({ productId: panel.id }).expect(200);
      await checkout({ address: ADDRESS, couponCode: 'ONCE' }).expect(201);

      await me.post('/cart/items').send({ productId: panel.id }).expect(200);
      const res = await checkout({
        address: ADDRESS,
        couponCode: 'ONCE',
      }).expect(400);
      expect(res.body.message).toMatch(/used up/);
      expect((await product(panel.id)).stock).toBe(4);
      expect((await me.get('/cart').expect(200)).body.items).toHaveLength(1);
      await me.delete('/cart').expect(200);
    });

    it('lists the lines that cannot be bought instead of ordering them', async () => {
      const panel = await newProduct({ price: 5000, stock: 5 });
      const gone = await newProduct({ price: 7000, stock: 5 });
      await me.post('/cart/items').send({ productId: panel.id }).expect(200);
      await me
        .post('/cart/items')
        .send({ productId: gone.id, quantity: 3 })
        .expect(200);
      await prisma.product.update({
        where: { id: gone.id },
        data: { stock: 1 },
      });

      const res = await checkout({ address: ADDRESS }).expect(409);
      expect(res.body.items).toMatchObject([
        { productId: gone.id, problem: 'not_enough_stock', stock: 1 },
      ]);
      expect((await product(panel.id)).stock).toBe(5);
      await me.delete('/cart').expect(200);
    });

    it('refuses installation when the store offers none, and unknown delivery options', async () => {
      const panel = await newProduct({ price: 5000, stock: 5 });
      await me.post('/cart/items').send({ productId: panel.id }).expect(200);
      await checkout({ address: ADDRESS, shippingRateId: randomUUID() }).expect(
        404,
      );
      await prisma.seller.update({
        where: { id: store.id },
        data: { installationFee: null },
      });
      await checkout({ address: ADDRESS, installation: true }).expect(400);
      await prisma.seller.update({
        where: { id: store.id },
        data: { installationFee: 15000 },
      });
      await me.delete('/cart').expect(200);
      await checkout({ address: ADDRESS }).expect(400);
    });
  });

  it('two buyers racing for the last unit: one order, one sold-out answer, stock 0', async () => {
    const last = await newProduct({ price: 1000, stock: 1 });
    const [a, b] = [
      await guestWithCart([{ productId: last.id }]),
      await guestWithCart([{ productId: last.id }]),
    ];
    const results = await Promise.all([
      guestCheckout(a, { name: 'Ana', phone: nextPhone(), password: PASSWORD }),
      guestCheckout(b, { name: 'Bob', phone: nextPhone(), password: PASSWORD }),
    ]);
    expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([
      201, 409,
    ]);
    expect(await product(last.id)).toMatchObject({ stock: 0, soldCount: 1 });
  });

  describe('after the order', () => {
    const placeOrder = async (stock = 5) => {
      const item = await newProduct({ price: 2000, stock });
      const token = await guestWithCart([{ productId: item.id, quantity: 2 }]);
      const res = await guestCheckout(token, {
        name: 'Buyer',
        phone: nextPhone(),
        password: PASSWORD,
      }).expect(201);
      return {
        item,
        order: res.body.order,
        buyer: storeClient(app, store.host, res.body.auth.accessToken),
      };
    };

    it('staff move it along; delivery marks cash on delivery paid', async () => {
      const { order } = await placeOrder();
      for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED']) {
        await staff
          .patch(`/admin/orders/${order.id}/status`)
          .send({ status, note: `to ${status}` })
          .expect(200);
      }
      const done = (await staff.get(`/admin/orders/${order.id}`).expect(200))
        .body;
      expect(done).toMatchObject({
        status: 'DELIVERED',
        paymentStatus: 'PAID',
      });
      expect(done.payments[0].status).toBe('PAID');
      expect(done.events.map((e: { title: string }) => e.title)).toEqual([
        'Order placed',
        'Being packed',
        'Shipped',
        'Delivered',
      ]);
      expect(done.customer).toMatchObject({ name: 'Buyer' });

      await staff
        .patch(`/admin/orders/${order.id}/status`)
        .send({ status: 'PROCESSING' })
        .expect(409);
    });

    it('the customer cancels before shipping: stock comes back and payment is off', async () => {
      const { item, order, buyer } = await placeOrder();
      expect((await product(item.id)).stock).toBe(3);
      const res = await buyer
        .post(`/orders/${order.id}/cancel`)
        .send({ reason: 'Wrong capacity' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Wrong capacity',
        paymentStatus: 'FAILED',
      });
      expect(await product(item.id)).toMatchObject({ stock: 5, soldCount: 0 });
      await buyer
        .post(`/orders/${order.id}/cancel`)
        .send({ reason: 'again' })
        .expect(409);
    });

    it('cannot be cancelled by the customer once shipped; staff can skip restocking', async () => {
      const { item, order, buyer } = await placeOrder();
      await staff
        .patch(`/admin/orders/${order.id}/status`)
        .send({ status: 'PROCESSING' })
        .expect(200);
      await staff
        .patch(`/admin/orders/${order.id}/status`)
        .send({ status: 'SHIPPED' })
        .expect(200);
      await buyer
        .post(`/orders/${order.id}/cancel`)
        .send({ reason: 'Too late' })
        .expect(409);

      await staff
        .patch(`/admin/orders/${order.id}/status`)
        .send({ status: 'RETURNED', restock: false })
        .expect(200);
      expect((await product(item.id)).stock).toBe(3);
    });

    it('staff find orders by number, phone and status', async () => {
      const { order } = await placeOrder();
      const byNumber = await staff
        .get(`/admin/orders?search=%23${order.orderNumber}`)
        .expect(200);
      expect(byNumber.body.data.map((o: { id: string }) => o.id)).toEqual([
        order.id,
      ]);
      expect(byNumber.body.data[0]).toMatchObject({
        itemCount: 2,
        previewImages: [],
        paidAt: null,
      });
      const byPhone = await staff
        .get(`/admin/orders?search=${order.shipping.phone.replace('+88', '')}`)
        .expect(200);
      expect(byPhone.body.data.map((o: { id: string }) => o.id)).toContain(
        order.id,
      );
      const pending = await staff
        .get('/admin/orders?status=PENDING&limit=100')
        .expect(200);
      expect(
        pending.body.data.every(
          (o: { status: string }) => o.status === 'PENDING',
        ),
      ).toBe(true);
    });

    it('staff mark cash received and refunds, once each', async () => {
      const { order, buyer } = await placeOrder();
      const paid = await staff
        .patch(`/admin/orders/${order.id}/payment`)
        .send({ status: 'PAID' })
        .expect(200);
      expect(paid.body).toMatchObject({ paymentStatus: 'PAID' });
      expect(paid.body.payments.at(-1)).toMatchObject({
        status: 'PAID',
        paidAt: expect.any(String),
      });
      expect(paid.body.events.at(-1).title).toBe('Payment received');
      await staff
        .patch(`/admin/orders/${order.id}/payment`)
        .send({ status: 'PAID' })
        .expect(409);
      await buyer
        .post(`/orders/${order.id}/cancel`)
        .send({ reason: 'Changed my mind' })
        .expect(409);

      const refunded = await staff
        .patch(`/admin/orders/${order.id}/payment`)
        .send({ status: 'REFUNDED' })
        .expect(200);
      expect(refunded.body.paymentStatus).toBe('REFUNDED');
      await staff
        .patch(`/admin/orders/${order.id}/payment`)
        .send({ status: 'REFUNDED' })
        .expect(409);
      await staff
        .patch(`/admin/orders/${order.id}/payment`)
        .send({ status: 'LATER' })
        .expect(400);
      await buyer
        .patch(`/admin/orders/${order.id}/payment`)
        .send({ status: 'PAID' })
        .expect(403);
    });

    it('a cancelled order cannot be marked paid', async () => {
      const { order, buyer } = await placeOrder();
      await buyer
        .post(`/orders/${order.id}/cancel`)
        .send({ reason: 'No longer needed' })
        .expect(200);
      await staff
        .patch(`/admin/orders/${order.id}/payment`)
        .send({ status: 'PAID' })
        .expect(409);
    });

    it('the summary counts orders by status and money by payment status', async () => {
      const before = (await staff.get('/admin/orders/summary').expect(200))
        .body;
      const { order } = await placeOrder();
      const cancelled = await placeOrder();
      await cancelled.buyer
        .post(`/orders/${cancelled.order.id}/cancel`)
        .send({ reason: 'Ordered twice' })
        .expect(200);
      const after = (await staff.get('/admin/orders/summary').expect(200)).body;

      expect(after.orders).toBe(before.orders + 2);
      expect(after.byStatus.PENDING).toBe(before.byStatus.PENDING + 1);
      expect(after.byStatus.CANCELLED).toBe(before.byStatus.CANCELLED + 1);
      expect(after.byPaymentStatus.PENDING.count).toBe(
        before.byPaymentStatus.PENDING.count + 1,
      );
      expect(Number(after.byPaymentStatus.PENDING.amount)).toBeCloseTo(
        Number(before.byPaymentStatus.PENDING.amount) +
          Number(order.totalAmount),
      );
      expect(after.byPaymentStatus.FAILED.count).toBe(
        before.byPaymentStatus.FAILED.count + 1,
      );
      expect(Number(after.revenue)).toBeCloseTo(
        Number(before.revenue) + Number(order.totalAmount),
      );
      expect(after.awaitingCod).toBe(before.awaitingCod + 1);

      const shopper = storeClient(app, store.host);
      await shopper.get('/admin/orders/summary').expect(401);
    });

    it("nobody sees orders that aren't theirs", async () => {
      const { order } = await placeOrder();
      const stranger = await createUser(prisma, store.id);
      const strangerClient = storeClient(
        app,
        store.host,
        (await login(app, store.host, stranger.phone)).accessToken,
      );
      await strangerClient.get(`/orders/${order.id}`).expect(404);
      await strangerClient.get(`/admin/orders/${order.id}`).expect(403);

      const otherStore = await createStore(prisma);
      const otherStaff = storeClient(
        app,
        otherStore.host,
        (await login(app, otherStore.host, otherStore.owner.phone)).accessToken,
      );
      await otherStaff.get(`/admin/orders/${order.id}`).expect(404);
      await otherStaff
        .patch(`/admin/orders/${order.id}/status`)
        .send({ status: 'CANCELLED' })
        .expect(404);
      expect(
        (await otherStaff.get('/admin/orders').expect(200)).body.data,
      ).toEqual([]);
    });
  });
});
