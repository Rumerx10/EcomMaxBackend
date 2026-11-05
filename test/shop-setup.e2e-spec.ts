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

const ADDRESS = {
  name: 'Tanvir Hasan',
  phone: '01712345678',
  district: 'Dhaka',
  thana: 'Mirpur',
  villageOrWard: 'Ward 6',
};

describe('Addresses, shipping rates and coupons (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let staff: ReturnType<typeof storeClient>;
  let shopper: ReturnType<typeof storeClient>;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
    staff = storeClient(
      app,
      store.host,
      (await login(app, store.host, store.owner.phone)).accessToken,
    );
    shopper = storeClient(app, store.host);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('address book', () => {
    it('keeps exactly one default', async () => {
      const user = await createUser(prisma, store.id);
      const me = storeClient(
        app,
        store.host,
        (await login(app, store.host, user.phone)).accessToken,
      );

      const home = (
        await me
          .post('/addresses')
          .send({ ...ADDRESS, label: 'Home' })
          .expect(201)
      ).body;
      expect(home.isDefault).toBe(true);
      const office = (
        await me
          .post('/addresses')
          .send({ ...ADDRESS, label: 'Office' })
          .expect(201)
      ).body;
      expect(office.isDefault).toBe(false);

      await me
        .patch(`/addresses/${office.id}`)
        .send({ isDefault: true })
        .expect(200);
      let list = (await me.get('/addresses').expect(200)).body;
      expect(
        list.map((a: { label: string; isDefault: boolean }) => [
          a.label,
          a.isDefault,
        ]),
      ).toEqual([
        ['Office', true],
        ['Home', false],
      ]);

      await me.delete(`/addresses/${office.id}`).expect(204);
      list = (await me.get('/addresses').expect(200)).body;
      expect(list).toMatchObject([{ label: 'Home', isDefault: true }]);
    });

    it('is private to its owner and needs a Bangladeshi phone', async () => {
      const owner = await createUser(prisma, store.id);
      const other = await createUser(prisma, store.id);
      const ownerClient = storeClient(
        app,
        store.host,
        (await login(app, store.host, owner.phone)).accessToken,
      );
      const otherClient = storeClient(
        app,
        store.host,
        (await login(app, store.host, other.phone)).accessToken,
      );
      const address = (
        await ownerClient.post('/addresses').send(ADDRESS).expect(201)
      ).body;

      await otherClient
        .patch(`/addresses/${address.id}`)
        .send({ label: 'Mine' })
        .expect(404);
      await otherClient.delete(`/addresses/${address.id}`).expect(404);
      expect((await otherClient.get('/addresses').expect(200)).body).toEqual(
        [],
      );
      await ownerClient
        .post('/addresses')
        .send({ ...ADDRESS, phone: '12345' })
        .expect(400);
      await shopper.get('/addresses').expect(401);
    });
  });

  describe('shipping rates', () => {
    it('staff manage them; shoppers see the active ones, cheapest first within the order', async () => {
      await staff
        .post('/shipping-rates')
        .send({ name: 'Outside Dhaka', price: 150, sortOrder: 1 })
        .expect(201);
      const inside = (
        await staff
          .post('/shipping-rates')
          .send({ name: 'Inside Dhaka', price: 80, sortOrder: 0 })
          .expect(201)
      ).body;
      const hidden = (
        await staff
          .post('/shipping-rates')
          .send({ name: 'Pickup', price: 0, isActive: false })
          .expect(201)
      ).body;
      expect(inside.price).toBe('80.00');

      const forShoppers = (await shopper.get('/shipping-rates').expect(200))
        .body;
      expect(forShoppers.map((r: { name: string }) => r.name)).toEqual([
        'Inside Dhaka',
        'Outside Dhaka',
      ]);
      expect(
        (await staff.get('/shipping-rates').expect(200)).body,
      ).toHaveLength(3);

      await staff
        .patch(`/shipping-rates/${hidden.id}`)
        .send({ isActive: true })
        .expect(200);
      await staff
        .post('/shipping-rates')
        .send({ name: 'Inside Dhaka', price: 90 })
        .expect(409);
      await shopper
        .post('/shipping-rates')
        .send({ name: 'Free', price: 0 })
        .expect(401);
      await staff.delete(`/shipping-rates/${hidden.id}`).expect(204);
    });
  });

  describe('coupons', () => {
    it('stores codes in capitals, checks them and keeps them per store', async () => {
      const created = await staff
        .post('/coupons')
        .send({
          code: 'eid-25',
          discountValue: 25,
          maxDiscountAmount: 1000,
          minOrderAmount: 2000,
        })
        .expect(201);
      expect(created.body).toMatchObject({
        code: 'EID-25',
        discountValue: '25.00',
        usedCount: 0,
      });

      const check = await shopper
        .post('/coupons/check')
        .send({ code: 'Eid-25', subtotal: 10000 })
        .expect(200);
      expect(check.body).toEqual({
        code: 'EID-25',
        description: null,
        discountAmount: '1000.00',
      });
      const small = await shopper
        .post('/coupons/check')
        .send({ code: 'EID-25', subtotal: 1000 })
        .expect(400);
      expect(small.body.message).toMatch(/Spend at least 2000.00/);
      await shopper
        .post('/coupons/check')
        .send({ code: 'NOPE', subtotal: 1000 })
        .expect(404);

      const other = await createStore(prisma);
      await storeClient(app, other.host)
        .post('/coupons/check')
        .send({ code: 'EID-25', subtotal: 10000 })
        .expect(404);
    });

    it('validates percentages and dates, and only staff see the list', async () => {
      await staff
        .post('/coupons')
        .send({ code: 'TOOMUCH', discountValue: 150 })
        .expect(400);
      await staff
        .post('/coupons')
        .send({
          code: 'BACKWARDS',
          discountValue: 5,
          startsAt: '2026-12-01',
          endsAt: '2026-11-01',
        })
        .expect(400);
      await staff
        .post('/coupons')
        .send({
          code: 'FLAT500',
          discountValue: 500,
          discountType: 'FIXED_AMOUNT',
        })
        .expect(201);
      await staff
        .post('/coupons')
        .send({ code: 'FLAT500', discountValue: 1 })
        .expect(409);
      await shopper.get('/coupons').expect(401);
      const list = (await staff.get('/coupons').expect(200)).body;
      expect(list.map((c: { code: string }) => c.code)).toContain('FLAT500');
    });

    it('a deactivated coupon stops working; an unused one can be deleted', async () => {
      const coupon = (
        await staff
          .post('/coupons')
          .send({ code: 'BYE', discountValue: 5 })
          .expect(201)
      ).body;
      await staff
        .patch(`/coupons/${coupon.id}`)
        .send({ isActive: false })
        .expect(200);
      await shopper
        .post('/coupons/check')
        .send({ code: 'BYE', subtotal: 100 })
        .expect(400);
      await staff.delete(`/coupons/${coupon.id}`).expect(204);
      await shopper
        .post('/coupons/check')
        .send({ code: 'BYE', subtotal: 100 })
        .expect(404);
    });

    it('lists only public coupons that work right now', async () => {
      const make = (body: Record<string, unknown>) =>
        staff
          .post('/coupons')
          .send({ discountValue: 5, ...body })
          .expect(201);
      await make({ code: 'SHOWN', isPublic: true, description: '5% off' });
      await make({ code: 'PRIVATE' });
      await make({ code: 'OFFLINE', isPublic: true, isActive: false });
      await make({ code: 'LATER', isPublic: true, startsAt: '2099-01-01' });
      await make({ code: 'OVER', isPublic: true, endsAt: '2020-01-01' });
      const usedUp = (
        await make({ code: 'USEDUP', isPublic: true, usageLimit: 1 })
      ).body;
      await prisma.coupon.update({
        where: { id: usedUp.id },
        data: { usedCount: 1 },
      });

      const list = (await shopper.get('/coupons/public').expect(200)).body;
      expect(list).toEqual([
        {
          code: 'SHOWN',
          description: '5% off',
          discountType: 'PERCENTAGE',
          discountValue: '5.00',
          minOrderAmount: null,
          maxDiscountAmount: null,
          endsAt: null,
        },
      ]);
    });
  });
});
