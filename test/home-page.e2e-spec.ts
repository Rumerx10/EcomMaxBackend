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

describe('Home page (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let otherStore: TestStore;
  let staff: ReturnType<typeof storeClient>;
  let customer: ReturnType<typeof storeClient>;
  let shopper: ReturnType<typeof storeClient>;
  let productIds: string[];

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
    otherStore = await createStore(prisma);
    staff = storeClient(
      app,
      store.host,
      (await login(app, store.host, store.owner.phone)).accessToken,
    );
    const buyer = await createUser(prisma, store.id);
    customer = storeClient(
      app,
      store.host,
      (await login(app, store.host, buyer.phone)).accessToken,
    );
    shopper = storeClient(app, store.host);

    const category = await prisma.category.create({
      data: { sellerId: store.id, name: 'Batteries', slug: 'batteries' },
    });
    productIds = [];
    for (const sku of ['BAT-1', 'INV-1']) {
      const product = await prisma.product.create({
        data: {
          sellerId: store.id,
          categoryId: category.id,
          title: sku,
          slug: sku.toLowerCase(),
          sku,
          price: 50_000,
        },
      });
      productIds.push(product.id);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const page = () => ({
    hero: {
      badge: 'Official range',
      title: 'Power your home with',
      highlight: 'the sun.',
      subtitle: 'Panels, inverters and batteries.',
      image: {
        url: 'https://images.example.com/hero.jpg',
        alt: 'Solar panels',
      },
      primary: { label: 'Shop solar', href: '/products' },
      secondary: null,
      showProduct: true,
      featuredProductId: productIds[0],
      showCoupon: false,
    },
    sections: [
      {
        id: 'combo',
        type: 'combo',
        visible: true,
        title: 'Backup kit',
        text: 'Battery and inverter together',
        productIds,
        comboPrice: 90_000,
        couponCode: 'KIT10',
        image: null,
      },
      {
        id: 'ads',
        type: 'banners',
        visible: false,
        title: '',
        slides: [
          {
            image: 'https://images.example.com/ad.jpg',
            alt: 'Eid sale',
            href: '/deals',
          },
        ],
        autoplaySeconds: 5,
      },
      {
        id: 'batteries',
        type: 'products',
        visible: true,
        title: 'Batteries',
        subtitle: '',
        source: 'category',
        categorySlug: 'batteries',
        limit: 4,
      },
    ],
  });

  it('shows the default page, named after the store, until one is saved', async () => {
    const res = await shopper.get('/store/home').expect(200);
    expect(res.body).toMatchObject({
      customised: false,
      updatedAt: null,
      hero: { title: `Welcome to Store ${store.slug}` },
    });
    expect(res.body.sections.length).toBeGreaterThan(0);
  });

  it('staff save the page; the order of the sections is kept', async () => {
    const res = await staff.put('/store/home').send(page()).expect(200);
    expect(res.body.customised).toBe(true);
    expect(res.body.sections.map((s: { id: string }) => s.id)).toEqual([
      'combo',
      'ads',
      'batteries',
    ]);
  });

  it('shoppers see only the visible sections; staff see all', async () => {
    const forShopper = await shopper.get('/store/home').expect(200);
    expect(forShopper.body.sections.map((s: { id: string }) => s.id)).toEqual([
      'combo',
      'batteries',
    ]);
    expect(forShopper.body.hero.title).toBe('Power your home with');

    const forStaff = await staff.get('/store/home').expect(200);
    expect(forStaff.body.sections).toHaveLength(3);
  });

  it('keeps each store to its own page', async () => {
    const res = await storeClient(app, otherStore.host)
      .get('/store/home')
      .expect(200);
    expect(res.body.customised).toBe(false);
  });

  it('only staff can change it', async () => {
    await shopper.put('/store/home').send(page()).expect(401);
    await customer.put('/store/home').send(page()).expect(403);
    await customer.delete('/store/home').expect(403);
  });

  it('refuses invalid pages and keeps the saved one', async () => {
    const unknownType = page();
    unknownType.sections.push({
      id: 'x',
      type: 'marquee',
      visible: true,
    } as never);
    await staff.put('/store/home').send(unknownType).expect(400);

    const repeated = page();
    repeated.sections[2].id = 'combo';
    const res = await staff.put('/store/home').send(repeated).expect(400);
    expect(res.body.message).toContain('Two sections share the id');

    const missingCategory = page();
    Object.assign(missingCategory.sections[2], { categorySlug: 'kettles' });
    await staff.put('/store/home').send(missingCategory).expect(400);

    const unsafeLink = page();
    unsafeLink.hero.primary = { label: 'Go', href: '//evil.example' };
    await staff.put('/store/home').send(unsafeLink).expect(400);

    const still = await staff.get('/store/home').expect(200);
    expect(still.body.sections).toHaveLength(3);
  });

  it("refuses another store's products", async () => {
    const otherCategory = await prisma.category.create({
      data: { sellerId: otherStore.id, name: 'Panels', slug: 'panels' },
    });
    const foreign = await prisma.product.create({
      data: {
        sellerId: otherStore.id,
        categoryId: otherCategory.id,
        title: 'Panel',
        slug: 'panel',
        sku: 'PNL-1',
        price: 10_000,
      },
    });
    const body = page();
    body.hero.featuredProductId = foreign.id;
    const res = await staff.put('/store/home').send(body).expect(400);
    expect(res.body.message).toContain('not in this store');
  });

  it('goes back to the default page', async () => {
    await staff.delete('/store/home').expect(204);
    const res = await shopper.get('/store/home').expect(200);
    expect(res.body.customised).toBe(false);
  });
});
