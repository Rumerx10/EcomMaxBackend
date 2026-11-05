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

describe('Reviews (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let staff: ReturnType<typeof storeClient>;
  let productId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
    staff = storeClient(
      app,
      store.host,
      (await login(app, store.host, store.owner.phone)).accessToken,
    );
    const category = await prisma.category.create({
      data: { sellerId: store.id, name: 'All', slug: 'all' },
    });
    productId = (
      await prisma.product.create({
        data: {
          sellerId: store.id,
          categoryId: category.id,
          title: 'Panel',
          slug: 'panel',
          sku: 'PANEL',
          price: 100,
          stock: 50,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  let orderNumber = 5000;
  // A customer who has (or has not yet) received the product.
  const buyer = async (
    name: string,
    status: 'DELIVERED' | 'SHIPPED' = 'DELIVERED',
  ) => {
    const user = await createUser(prisma, store.id);
    await prisma.user.update({ where: { id: user.id }, data: { name } });
    await prisma.order.create({
      data: {
        sellerId: store.id,
        orderNumber: orderNumber++,
        userId: user.id,
        status,
        subtotal: 100,
        totalAmount: 100,
        shippingMethod: 'Standard',
        shipName: name,
        shipPhone: user.phone,
        shipDistrict: 'Dhaka',
        shipThana: 'Mirpur',
        shipVillageOrWard: 'Ward 6',
        idempotencyKey: randomUUID(),
        items: {
          create: {
            productId,
            title: 'Panel',
            sku: 'PANEL',
            unitPrice: 100,
            quantity: 1,
            totalPrice: 100,
          },
        },
      },
    });
    return storeClient(
      app,
      store.host,
      (await login(app, store.host, user.phone)).accessToken,
    );
  };

  it('only people who received the product can review it, once', async () => {
    const waiting = await buyer('Shipped Sam', 'SHIPPED');
    await waiting
      .post(`/products/${productId}/reviews`)
      .send({ rating: 5, comment: 'Not here yet' })
      .expect(403);

    const stranger = storeClient(
      app,
      store.host,
      (await login(app, store.host, (await createUser(prisma, store.id)).phone))
        .accessToken,
    );
    await stranger
      .post(`/products/${productId}/reviews`)
      .send({ rating: 1, comment: 'Never bought it' })
      .expect(403);

    const happy = await buyer('Tanvir Hasan');
    expect(
      (await happy.get('/reviews/to-review').expect(200)).body.map(
        (i: { productId: string }) => i.productId,
      ),
    ).toEqual([productId]);
    const review = await happy
      .post(`/products/${productId}/reviews`)
      .send({ rating: 5, comment: 'Runs the whole house' })
      .expect(201);
    expect(review.body).toMatchObject({
      rating: 5,
      author: 'Tanvir H.',
      isPublished: true,
    });
    await happy
      .post(`/products/${productId}/reviews`)
      .send({ rating: 4, comment: 'Again' })
      .expect(409);
    expect((await happy.get('/reviews/to-review').expect(200)).body).toEqual(
      [],
    );
  });

  it('keeps the product rating and the star summary up to date', async () => {
    const second = await buyer('Mina');
    const created = await second
      .post(`/products/${productId}/reviews`)
      .send({ rating: 2, comment: 'Slow delivery' })
      .expect(201);

    let page = await storeClient(app, store.host)
      .get(`/products/${productId}/reviews`)
      .expect(200);
    expect(page.body.summary).toEqual({
      ratingAvg: '3.50',
      ratingCount: 2,
      distribution: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 1 },
    });
    expect(
      (
        await storeClient(app, store.host)
          .get(`/products/${productId}`)
          .expect(200)
      ).body,
    ).toMatchObject({
      ratingAvg: '3.50',
      ratingCount: 2,
    });

    await second
      .patch(`/reviews/${created.body.id}`)
      .send({ rating: 4 })
      .expect(200);
    page = await storeClient(app, store.host)
      .get(`/products/${productId}/reviews`)
      .expect(200);
    expect(page.body.summary.ratingAvg).toBe('4.50');

    // Staff hide it: gone from the page and from the rating.
    await staff
      .patch(`/admin/reviews/${created.body.id}`)
      .send({ isPublished: false })
      .expect(200);
    page = await storeClient(app, store.host)
      .get(`/products/${productId}/reviews`)
      .expect(200);
    expect(page.body.summary).toMatchObject({
      ratingAvg: '5.00',
      ratingCount: 1,
    });
    expect(page.body.data).toHaveLength(1);
    expect(
      (
        await staff.get('/admin/reviews?isPublished=false').expect(200)
      ).body.data.map((r: { id: string }) => r.id),
    ).toEqual([created.body.id]);
  });

  it('authors edit and delete only their own reviews; staff can delete any', async () => {
    const author = await buyer('Karim Uddin');
    const other = await buyer('Rafi');
    const review = (
      await author
        .post(`/products/${productId}/reviews`)
        .send({ rating: 3, comment: 'Okay so far' })
        .expect(201)
    ).body;

    await other.patch(`/reviews/${review.id}`).send({ rating: 1 }).expect(404);
    await other.delete(`/reviews/${review.id}`).expect(404);
    const mine = (await author.get('/reviews/mine').expect(200)).body.data;
    expect(mine.map((r: { id: string }) => r.id)).toEqual([review.id]);
    expect(mine[0].product).toMatchObject({
      id: productId,
      title: expect.any(String),
      slug: expect.any(String),
    });

    await staff.delete(`/reviews/${review.id}`).expect(204);
    await author.patch(`/reviews/${review.id}`).send({ rating: 4 }).expect(404);
  });

  it('another store sees none of these reviews', async () => {
    const otherStore = await createStore(prisma);
    await storeClient(app, otherStore.host)
      .get(`/products/${productId}/reviews`)
      .expect(404);
    const otherStaff = storeClient(
      app,
      otherStore.host,
      (await login(app, otherStore.host, otherStore.owner.phone)).accessToken,
    );
    expect(
      (await otherStaff.get('/admin/reviews').expect(200)).body.data,
    ).toEqual([]);
  });
});
