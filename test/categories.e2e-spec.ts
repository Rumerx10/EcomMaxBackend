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

describe('Categories (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let otherStore: TestStore;
  let staff: ReturnType<typeof storeClient>;
  let shopper: ReturnType<typeof storeClient>;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
    otherStore = await createStore(prisma);
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

  const addProduct = (
    categoryId: string,
    sku: string,
    status: 'ACTIVE' | 'DRAFT' = 'ACTIVE',
  ) =>
    prisma.product.create({
      data: {
        sellerId: store.id,
        categoryId,
        title: sku,
        slug: sku.toLowerCase(),
        sku,
        price: 100,
        status,
      },
    });

  it('staff create categories; the slug comes from the name', async () => {
    const res = await staff
      .post('/categories')
      .send({ name: 'Hybrid Inverters' })
      .expect(201);
    expect(res.body).toMatchObject({
      name: 'Hybrid Inverters',
      slug: 'hybrid-inverters',
      productCount: 0,
    });
    expect(res.body.sellerId).toBeUndefined();
  });

  it('shoppers cannot create, update or delete', async () => {
    await shopper.post('/categories').send({ name: 'Nope' }).expect(401);
    const customer = await createUser(prisma, store.id);
    const customerClient = storeClient(
      app,
      store.host,
      (await login(app, store.host, customer.phone)).accessToken,
    );
    await customerClient.post('/categories').send({ name: 'Nope' }).expect(403);
  });

  it('slugs are unique per store, not across stores', async () => {
    await staff.post('/categories').send({ name: 'Batteries' }).expect(201);
    const duplicate = await staff
      .post('/categories')
      .send({ name: 'Batteries again', slug: 'batteries' })
      .expect(409);
    expect(duplicate.body.message).toMatch(/slug/);

    const otherStaff = storeClient(
      app,
      otherStore.host,
      (await login(app, otherStore.host, otherStore.owner.phone)).accessToken,
    );
    await otherStaff
      .post('/categories')
      .send({ name: 'Batteries' })
      .expect(201);
  });

  it('shoppers see active categories and count only products on sale', async () => {
    const live = await staff
      .post('/categories')
      .send({ name: 'Panels' })
      .expect(201);
    const hidden = await staff
      .post('/categories')
      .send({ name: 'Hidden', isActive: false })
      .expect(201);
    await addProduct(live.body.id, 'P-1');
    await addProduct(live.body.id, 'P-2', 'DRAFT');

    const forShoppers = await shopper.get('/categories?limit=100').expect(200);
    const slugs = forShoppers.body.data.map((c: { slug: string }) => c.slug);
    expect(slugs).toContain('panels');
    expect(slugs).not.toContain('hidden');
    expect(
      forShoppers.body.data.find((c: { slug: string }) => c.slug === 'panels')
        .productCount,
    ).toBe(1);
    await shopper.get(`/categories/${hidden.body.id}`).expect(404);
    await shopper.get('/categories/slug/panels').expect(200);

    const forStaff = await staff
      .get('/categories?limit=100&isActive=false')
      .expect(200);
    expect(forStaff.body.data.map((c: { slug: string }) => c.slug)).toEqual([
      'hidden',
    ]);
    const panelsForStaff = await staff
      .get(`/categories/${live.body.id}`)
      .expect(200);
    expect(panelsForStaff.body.productCount).toBe(2);
  });

  it('builds a tree but refuses cycles and unknown parents', async () => {
    const solar = await staff
      .post('/categories')
      .send({ name: 'Solar' })
      .expect(201);
    const panels = await staff
      .post('/categories')
      .send({ name: 'Rooftop panels', parentId: solar.body.id })
      .expect(201);
    const children = await staff
      .get(`/categories?parentId=${solar.body.id}`)
      .expect(200);
    expect(children.body.data.map((c: { id: string }) => c.id)).toEqual([
      panels.body.id,
    ]);

    await staff
      .patch(`/categories/${solar.body.id}`)
      .send({ parentId: panels.body.id })
      .expect(400);
    await staff
      .patch(`/categories/${solar.body.id}`)
      .send({ parentId: solar.body.id })
      .expect(400);
    await staff
      .post('/categories')
      .send({
        name: 'Orphan',
        parentId: '0192f3c4-0000-7000-8000-000000000999',
      })
      .expect(404);
  });

  it('deletes only empty categories', async () => {
    const parent = await staff
      .post('/categories')
      .send({ name: 'Chargers' })
      .expect(201);
    const child = await staff
      .post('/categories')
      .send({ name: 'Home chargers', parentId: parent.body.id })
      .expect(201);
    await addProduct(child.body.id, 'EV-1');

    await staff.delete(`/categories/${parent.body.id}`).expect(409);
    const withProducts = await staff
      .delete(`/categories/${child.body.id}`)
      .expect(409);
    expect(withProducts.body.message).toMatch(/1 product/);

    await prisma.product.deleteMany({
      where: { sellerId: store.id, sku: 'EV-1' },
    });
    await staff.delete(`/categories/${child.body.id}`).expect(204);
    await staff.delete(`/categories/${parent.body.id}`).expect(204);
    await staff.get(`/categories/${parent.body.id}`).expect(404);
  });

  it("cannot read, change or delete another store's categories", async () => {
    const foreign = await prisma.category.create({
      data: { sellerId: otherStore.id, name: 'Foreign', slug: 'foreign' },
    });
    await staff.get(`/categories/${foreign.id}`).expect(404);
    await staff
      .patch(`/categories/${foreign.id}`)
      .send({ name: 'Mine now' })
      .expect(404);
    await staff.delete(`/categories/${foreign.id}`).expect(404);
    await staff
      .post('/categories')
      .send({ name: 'Child of foreign', parentId: foreign.id })
      .expect(404);
    expect(
      (await prisma.category.findUnique({ where: { id: foreign.id } }))?.name,
    ).toBe('Foreign');
  });

  it('validates input', async () => {
    const res = await staff
      .post('/categories')
      .send({ name: '', slug: 'Bad Slug!' })
      .expect(400);
    expect(res.body.message.join(' ')).toMatch(/slug|name/i);
    await staff.get('/categories?limit=1000').expect(400);
    await staff.get('/categories/not-a-uuid').expect(400);
  });
});
