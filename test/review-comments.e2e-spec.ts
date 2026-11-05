import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createApp,
  createStore,
  createUser,
  login,
  PASSWORD,
  storeClient,
  type TestStore,
} from './helpers.js';

// The smallest valid PNG (1x1 pixel).
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('Review photos, comments and username sign-in (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let productId: string;
  let orderNumber = 9000;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
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
          sku: 'P',
          price: 100,
          stock: 9,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const signedIn = async (name: string, delivered = false) => {
    const user = await createUser(prisma, store.id);
    await prisma.user.update({ where: { id: user.id }, data: { name } });
    if (delivered) {
      await prisma.order.create({
        data: {
          sellerId: store.id,
          orderNumber: orderNumber++,
          userId: user.id,
          status: 'DELIVERED',
          subtotal: 100,
          totalAmount: 100,
          shippingMethod: 'S',
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
              sku: 'P',
              unitPrice: 100,
              quantity: 1,
              totalPrice: 100,
            },
          },
        },
      });
    }
    return storeClient(
      app,
      store.host,
      (await login(app, store.host, user.phone)).accessToken,
    );
  };

  it('uploads an image and serves it to anyone, without a store header', async () => {
    const me = await signedIn('Uploader');
    const res = await me.post('/uploads').send({ dataUrl: PNG }).expect(201);
    expect(res.body).toMatchObject({
      contentType: 'image/png',
      url: `/api/v1/uploads/${res.body.id}`,
    });
    const image = await request(app.getHttpServer())
      .get(res.body.url)
      .expect(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toMatch(/immutable/);

    await me
      .post('/uploads')
      .send({ dataUrl: 'data:image/png;base64,bm90IGFuIGltYWdl' })
      .expect(400);
    await storeClient(app, store.host)
      .post('/uploads')
      .send({ dataUrl: PNG })
      .expect(401);
  });

  it('a review takes up to 4 photos', async () => {
    const buyer = await signedIn('Photo Buyer', true);
    const url = (
      await buyer.post('/uploads').send({ dataUrl: PNG }).expect(201)
    ).body.url;
    await buyer
      .post(`/products/${productId}/reviews`)
      .send({ rating: 5, comment: 'Look', images: [url, url, url, url, url] })
      .expect(400);
    await buyer
      .post(`/products/${productId}/reviews`)
      .send({ rating: 5, comment: 'Look', images: ['javascript:alert(1)'] })
      .expect(400);
    const review = await buyer
      .post(`/products/${productId}/reviews`)
      .send({
        rating: 5,
        comment: 'Look at it',
        images: [url, 'https://cdn.example.com/roof.jpg'],
      })
      .expect(201);
    expect(review.body.images).toEqual([
      url,
      'https://cdn.example.com/roof.jpg',
    ]);
    const listed = await storeClient(app, store.host)
      .get(`/products/${productId}/reviews`)
      .expect(200);
    expect(listed.body.data[0]).toMatchObject({
      images: review.body.images,
      commentCount: 0,
    });
  });

  it('others comment and reply like a Facebook post; replies stay one level deep', async () => {
    const author = await signedIn('Rahim Uddin', true);
    const review = (
      await author
        .post(`/products/${productId}/reviews`)
        .send({ rating: 4, comment: 'Good panel' })
        .expect(201)
    ).body;
    const mina = await signedIn('Mina Rahman');
    const karim = await signedIn('Karim Ali');
    const owner = storeClient(
      app,
      store.host,
      (await login(app, store.host, store.owner.phone)).accessToken,
    );

    const question = (
      await mina
        .post(`/reviews/${review.id}/comments`)
        .send({ body: 'Which inverter?' })
        .expect(201)
    ).body;
    expect(question).toMatchObject({
      author: 'Mina R.',
      parentId: null,
      fromStore: false,
    });
    const answer = (
      await author
        .post(`/comments/${question.id}/replies`)
        .send({ body: 'The GW5K' })
        .expect(201)
    ).body;
    expect(answer.parentId).toBe(question.id);
    // Replying to a reply lands in the same thread.
    const followUp = (
      await karim
        .post(`/comments/${answer.id}/replies`)
        .send({ body: 'Same here' })
        .expect(201)
    ).body;
    expect(followUp.parentId).toBe(question.id);
    const fromStore = (
      await owner
        .post(`/comments/${question.id}/replies`)
        .send({ body: 'Thanks for asking!' })
        .expect(201)
    ).body;
    expect(fromStore.fromStore).toBe(true);
    for (let i = 0; i < 2; i++)
      await karim
        .post(`/comments/${question.id}/replies`)
        .send({ body: `More ${i}` })
        .expect(201);

    const thread = await storeClient(app, store.host)
      .get(`/reviews/${review.id}/comments`)
      .expect(200);
    expect(thread.body.data).toHaveLength(1);
    expect(thread.body.data[0]).toMatchObject({
      body: 'Which inverter?',
      replyCount: 5,
    });
    expect(
      thread.body.data[0].replies.map((r: { body: string }) => r.body),
    ).toEqual(['The GW5K', 'Same here', 'Thanks for asking!']);
    const all = await storeClient(app, store.host)
      .get(`/comments/${question.id}/replies?limit=10`)
      .expect(200);
    expect(all.body.data).toHaveLength(5);
    expect(
      (
        await storeClient(app, store.host)
          .get(`/products/${productId}/reviews`)
          .expect(200)
      ).body.data.find((r: { id: string }) => r.id === review.id).commentCount,
    ).toBe(6);

    // Only the author edits; staff may hide or delete; hidden comments vanish for others.
    await karim
      .patch(`/comments/${question.id}`)
      .send({ body: 'Hacked' })
      .expect(403);
    await mina
      .patch(`/comments/${question.id}`)
      .send({ body: 'Which inverter did you use?' })
      .expect(200);
    await karim.delete(`/comments/${question.id}`).expect(403);
    await owner
      .patch(`/admin/comments/${followUp.id}`)
      .send({ isHidden: true })
      .expect(200);
    expect(
      (
        await storeClient(app, store.host)
          .get(`/comments/${question.id}/replies`)
          .expect(200)
      ).body.data,
    ).toHaveLength(4);
    await karim
      .post(`/comments/${followUp.id}/replies`)
      .send({ body: 'To a hidden one' })
      .expect(404);

    await mina.delete(`/comments/${question.id}`).expect(204);
    expect(
      (
        await storeClient(app, store.host)
          .get(`/reviews/${review.id}/comments`)
          .expect(200)
      ).body.data,
    ).toEqual([]);
    await storeClient(app, store.host)
      .post(`/reviews/${review.id}/comments`)
      .send({ body: 'Anonymous' })
      .expect(401);
  });

  it('comments stay inside their store', async () => {
    const author = await signedIn('Sami K', true);
    const review = (
      await author
        .post(`/products/${productId}/reviews`)
        .send({ rating: 5, comment: 'Mine' })
        .expect(201)
    ).body;
    const other = await createStore(prisma);
    const stranger = storeClient(
      app,
      other.host,
      (await login(app, other.host, other.owner.phone)).accessToken,
    );
    await stranger.get(`/reviews/${review.id}/comments`).expect(404);
    await stranger
      .post(`/reviews/${review.id}/comments`)
      .send({ body: 'From elsewhere' })
      .expect(404);
  });

  it('staff can sign in with a username instead of the phone number', async () => {
    await prisma.user.update({
      where: { id: store.owner.id },
      data: { username: 'nextpower' },
    });
    const res = await storeClient(app, store.host)
      .post('/auth/login')
      .send({ login: 'NextPower', password: PASSWORD })
      .expect(200);
    expect(res.body.user).toMatchObject({
      role: 'OWNER',
      username: 'nextpower',
    });
    await storeClient(app, store.host)
      .post('/auth/login')
      .send({ login: store.owner.phone.replace('+88', ''), password: PASSWORD })
      .expect(200);
    await storeClient(app, store.host)
      .post('/auth/login')
      .send({ login: 'nextpower', password: 'wrong password' })
      .expect(401);
    await storeClient(app, store.host)
      .post('/auth/login')
      .send({ password: PASSWORD })
      .expect(400);
  });
});
