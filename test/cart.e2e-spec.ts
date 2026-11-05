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

describe('Cart and wishlist (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let panelId: string;
  let batteryId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
    const category = await prisma.category.create({
      data: { sellerId: store.id, name: 'All', slug: 'all' },
    });
    const base = { sellerId: store.id, categoryId: category.id };
    panelId = (
      await prisma.product.create({
        data: {
          ...base,
          title: 'Panel',
          slug: 'panel',
          sku: 'PANEL',
          price: 19500,
          stock: 5,
        },
      })
    ).id;
    batteryId = (
      await prisma.product.create({
        data: {
          ...base,
          title: 'Battery',
          slug: 'battery',
          sku: 'BATTERY',
          price: 150000,
          stock: 3,
          options: {
            create: {
              name: 'Capacity',
              values: {
                create: [
                  { label: '6.4 kWh', priceDelta: 0, position: 0 },
                  { label: '9.6 kWh', priceDelta: 95000, position: 1 },
                ],
              },
            },
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const guest = (token?: string) => {
    const client = storeClient(app, store.host);
    const withToken = <T extends { set: (k: string, v: string) => T }>(
      req: T,
    ) => (token ? req.set('X-Guest-Token', token) : req);
    return {
      get: (url: string) => withToken(client.get(url)),
      post: (url: string) => withToken(client.post(url)),
      patch: (url: string) => withToken(client.patch(url)),
      delete: (url: string) => withToken(client.delete(url)),
    };
  };

  it('gives a guest a token with the first cart and prices lines on the server', async () => {
    const empty = await guest().get('/cart').expect(200);
    expect(empty.body).toEqual({
      guestToken: null,
      items: [],
      itemCount: 0,
      subtotal: '0.00',
    });

    const first = await guest()
      .post('/cart/items')
      .send({ productId: panelId, quantity: 2 })
      .expect(200);
    const token = first.body.guestToken;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.headers['x-guest-token']).toBe(token);
    expect(first.body).toMatchObject({ itemCount: 2, subtotal: '39000.00' });

    const again = await guest(token)
      .post('/cart/items')
      .send({ productId: batteryId, variant: 'Capacity: 9.6 kWh' })
      .expect(200);
    expect(again.body.guestToken).toBe(token);
    expect(
      again.body.items.map((i: { variant: string; unitPrice: string }) => [
        i.variant,
        i.unitPrice,
      ]),
    ).toEqual([
      ['', '19500.00'],
      ['Capacity: 9.6 kWh', '245000.00'],
    ]);
    expect(again.body.subtotal).toBe('284000.00');

    // Another visitor without the token sees nothing.
    expect((await guest().get('/cart').expect(200)).body.items).toEqual([]);
  });

  it('adding the same item raises its quantity, but never beyond the stock', async () => {
    const { body } = await guest()
      .post('/cart/items')
      .send({ productId: panelId, quantity: 3 })
      .expect(200);
    const token = body.guestToken;
    const more = await guest(token)
      .post('/cart/items')
      .send({ productId: panelId, quantity: 2 })
      .expect(200);
    expect(more.body.items).toHaveLength(1);
    expect(more.body.items[0].quantity).toBe(5);
    const tooMany = await guest(token)
      .post('/cart/items')
      .send({ productId: panelId })
      .expect(409);
    expect(tooMany.body.message).toMatch(/Only 5 left/);

    const lineId = more.body.items[0].id;
    await guest(token)
      .patch(`/cart/items/${lineId}`)
      .send({ quantity: 9 })
      .expect(409);
    const fewer = await guest(token)
      .patch(`/cart/items/${lineId}`)
      .send({ quantity: 1 })
      .expect(200);
    expect(fewer.body.subtotal).toBe('19500.00');
    const removed = await guest(token)
      .delete(`/cart/items/${lineId}`)
      .expect(200);
    expect(removed.body.items).toEqual([]);
  });

  it('needs valid options for products that have them', async () => {
    await guest()
      .post('/cart/items')
      .send({ productId: batteryId })
      .expect(400);
    await guest()
      .post('/cart/items')
      .send({ productId: batteryId, variant: 'Capacity: 99 kWh' })
      .expect(400);
    await guest()
      .post('/cart/items')
      .send({ productId: panelId, variant: 'Color: Red' })
      .expect(400);
  });

  it('flags lines that can no longer be bought and leaves them out of the subtotal', async () => {
    const category = await prisma.category.findFirstOrThrow({
      where: { sellerId: store.id },
    });
    const temp = await prisma.product.create({
      data: {
        sellerId: store.id,
        categoryId: category.id,
        title: 'Temp',
        slug: 'temp',
        sku: 'TEMP',
        price: 100,
        stock: 4,
      },
    });
    const { body } = await guest()
      .post('/cart/items')
      .send({ productId: temp.id, quantity: 4 })
      .expect(200);
    const token = body.guestToken;
    await guest(token)
      .post('/cart/items')
      .send({ productId: panelId })
      .expect(200);

    await prisma.product.update({ where: { id: temp.id }, data: { stock: 2 } });
    let cart = await guest(token).get('/cart').expect(200);
    expect(
      cart.body.items.find(
        (i: { productId: string }) => i.productId === temp.id,
      ).problem,
    ).toBe('not_enough_stock');
    expect(cart.body.subtotal).toBe('19500.00');

    await prisma.product.update({
      where: { id: temp.id },
      data: { status: 'DRAFT' },
    });
    cart = await guest(token).get('/cart').expect(200);
    expect(
      cart.body.items.find(
        (i: { productId: string }) => i.productId === temp.id,
      ).problem,
    ).toBe('unavailable');
  });

  it('refuses drafts, other stores’ products and made-up tokens', async () => {
    const category = await prisma.category.findFirstOrThrow({
      where: { sellerId: store.id },
    });
    const draft = await prisma.product.create({
      data: {
        sellerId: store.id,
        categoryId: category.id,
        title: 'Draft',
        slug: 'draft',
        sku: 'DRAFT',
        price: 1,
        stock: 1,
        status: 'DRAFT',
      },
    });
    await guest().post('/cart/items').send({ productId: draft.id }).expect(404);

    const other = await createStore(prisma);
    const otherCategory = await prisma.category.create({
      data: { sellerId: other.id, name: 'X', slug: 'x' },
    });
    const foreign = await prisma.product.create({
      data: {
        sellerId: other.id,
        categoryId: otherCategory.id,
        title: 'F',
        slug: 'f',
        sku: 'F',
        price: 1,
        stock: 9,
      },
    });
    await guest()
      .post('/cart/items')
      .send({ productId: foreign.id })
      .expect(404);

    await guest('not-a-real-token').get('/cart').expect(400);
  });

  it('a guest token from one store opens nothing at another', async () => {
    const { body } = await guest()
      .post('/cart/items')
      .send({ productId: panelId })
      .expect(200);
    const other = await createStore(prisma);
    const res = await storeClient(app, other.host)
      .get('/cart')
      .set('X-Guest-Token', body.guestToken)
      .expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('after sign-in, the guest cart and wishlist move to the account and add up', async () => {
    const customer = await createUser(prisma, store.id);
    const { accessToken } = await login(app, store.host, customer.phone);
    const me = storeClient(app, store.host, accessToken);
    await me
      .post('/cart/items')
      .send({ productId: panelId, quantity: 1 })
      .expect(200);

    const { body } = await guest()
      .post('/cart/items')
      .send({ productId: panelId, quantity: 2 })
      .expect(200);
    const token = body.guestToken;
    await guest(token)
      .post('/cart/items')
      .send({ productId: batteryId, variant: 'Capacity: 6.4 kWh' })
      .expect(200);
    await guest(token)
      .post('/wishlist/items')
      .send({ productId: batteryId })
      .expect(200);

    const merged = await me
      .post('/cart/merge')
      .set('X-Guest-Token', token)
      .expect(200);
    expect(
      merged.body.items.map((i: { productId: string; quantity: number }) => [
        i.productId,
        i.quantity,
      ]),
    ).toEqual([
      [panelId, 3],
      [batteryId, 1],
    ]);
    expect(merged.body.guestToken).toBeNull();
    expect(
      (await me.get('/wishlist').expect(200)).body.items.map(
        (i: { productId: string }) => i.productId,
      ),
    ).toEqual([batteryId]);
    expect((await guest(token).get('/cart').expect(200)).body.items).toEqual(
      [],
    );
    expect(
      await prisma.cart.count({
        where: { sellerId: store.id, guestToken: token },
      }),
    ).toBe(0);
  });

  it('merging needs a signed-in user', async () => {
    await guest().post('/cart/merge').expect(400);
  });

  describe('wishlist', () => {
    it('saves products once and removes them, for guests too', async () => {
      const first = await guest()
        .post('/wishlist/items')
        .send({ productId: panelId })
        .expect(200);
      const token = first.body.guestToken;
      await guest(token)
        .post('/wishlist/items')
        .send({ productId: panelId })
        .expect(200);
      const two = await guest(token)
        .post('/wishlist/items')
        .send({ productId: batteryId })
        .expect(200);
      expect(
        two.body.items.map((i: { productId: string }) => i.productId).sort(),
      ).toEqual([panelId, batteryId].sort());
      expect(
        two.body.items.every((i: { available: boolean }) => i.available),
      ).toBe(true);

      const removed = await guest(token)
        .delete(`/wishlist/items/${panelId}`)
        .expect(200);
      expect(
        removed.body.items.map((i: { productId: string }) => i.productId),
      ).toEqual([batteryId]);
    });

    it('the same guest token works for the cart and the wishlist', async () => {
      const cart = await guest()
        .post('/cart/items')
        .send({ productId: panelId })
        .expect(200);
      const wishlist = await guest(cart.body.guestToken)
        .post('/wishlist/items')
        .send({ productId: panelId })
        .expect(200);
      expect(wishlist.body.guestToken).toBe(cart.body.guestToken);
    });
  });
});
