import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createApp,
  createStore,
  login,
  storeClient,
  type TestStore,
} from './helpers.js';

const IMG = 'https://cdn.example.com/p';

describe('Products (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let staff: ReturnType<typeof storeClient>;
  let shopper: ReturnType<typeof storeClient>;
  let solarId: string;
  let rooftopId: string;
  let batteriesId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
    staff = storeClient(
      app,
      store.host,
      (await login(app, store.host, store.owner.phone)).accessToken,
    );
    shopper = storeClient(app, store.host);
    solarId = (
      await staff.post('/categories').send({ name: 'Solar' }).expect(201)
    ).body.id;
    rooftopId = (
      await staff
        .post('/categories')
        .send({ name: 'Rooftop', parentId: solarId })
        .expect(201)
    ).body.id;
    batteriesId = (
      await staff.post('/categories').send({ name: 'Batteries' }).expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // Titles become slugs, which are unique per store, so each product gets its own.
  const product = (overrides: Record<string, unknown> = {}) => {
    const sku = `SKU-${Math.random().toString(36).slice(2, 8)}`;
    return {
      title: `Panel ${sku}`,
      sku,
      categoryId: rooftopId,
      price: 19500,
      stock: 10,
      ...overrides,
    };
  };

  describe('creating', () => {
    it('saves images, options and sanitised HTML; staff see the cost price, shoppers do not', async () => {
      const res = await staff
        .post('/products')
        .send(
          product({
            title: 'Lynx Home Battery',
            categoryId: batteriesId,
            price: 150000,
            discountPercent: 10,
            costPrice: 120000,
            description:
              '<p style="text-align:center">Safe <script>alert(1)</script><b>storage</b></p>',
            images: [
              { url: `${IMG}/1.jpg`, alt: 'Front' },
              { url: `${IMG}/2.jpg` },
            ],
            options: [
              {
                name: 'Capacity',
                values: [
                  { label: '6.4 kWh' },
                  { label: '9.6 kWh', priceDelta: 95000 },
                ],
              },
            ],
            specs: [['Chemistry', 'LFP']],
            tags: ['home'],
          }),
        )
        .expect(201);

      expect(res.body).toMatchObject({
        slug: 'lynx-home-battery',
        price: '150000.00',
        originalPrice: '166666.67',
        costPrice: '120000.00',
        priceRange: { min: '150000.00', max: '245000.00' },
        thumbnail: `${IMG}/1.jpg`,
        hasOptions: true,
        specs: [['Chemistry', 'LFP']],
        category: { id: batteriesId, slug: 'batteries' },
      });
      expect(res.body.description).not.toMatch(/script|alert|<b>/);
      expect(res.body.description).toContain('text-align:center');
      expect(res.body.images.map((i: { url: string }) => i.url)).toEqual([
        `${IMG}/1.jpg`,
        `${IMG}/2.jpg`,
      ]);
      expect(
        res.body.options[0].values.map(
          (v: { priceDelta: string }) => v.priceDelta,
        ),
      ).toEqual(['0.00', '95000.00']);

      const forShopper = await shopper
        .get(`/products/${res.body.id}`)
        .expect(200);
      expect(forShopper.body.costPrice).toBeUndefined();
      await shopper.get('/products/slug/lynx-home-battery').expect(200);
    });

    it('SKUs and slugs are unique per store only', async () => {
      await staff
        .post('/products')
        .send(product({ sku: 'DUP-1', title: 'First' }))
        .expect(201);
      const dup = await staff
        .post('/products')
        .send(product({ sku: 'DUP-1', title: 'Second' }))
        .expect(409);
      expect(dup.body.message).toMatch(/sku/);
      await staff
        .post('/products')
        .send(product({ title: 'First' }))
        .expect(409);

      const other = await createStore(prisma);
      const otherStaff = storeClient(
        app,
        other.host,
        (await login(app, other.host, other.owner.phone)).accessToken,
      );
      const category = (
        await otherStaff.post('/categories').send({ name: 'Any' }).expect(201)
      ).body.id;
      await otherStaff
        .post('/products')
        .send(product({ sku: 'DUP-1', title: 'First', categoryId: category }))
        .expect(201);
    });

    it('validates options, images and the category', async () => {
      const fourOptions = ['A', 'B', 'C', 'D'].map((name) => ({
        name,
        values: [{ label: 'x' }],
      }));
      await staff
        .post('/products')
        .send(product({ options: fourOptions }))
        .expect(400);
      await staff
        .post('/products')
        .send(
          product({
            options: [
              { name: 'Size', values: [{ label: 'XL' }, { label: 'xl' }] },
            ],
          }),
        )
        .expect(400);
      await staff
        .post('/products')
        .send(
          product({ images: [{ url: 'http://insecure.example.com/a.jpg' }] }),
        )
        .expect(400);
      await staff
        .post('/products')
        .send(product({ price: 0 }))
        .expect(400);
      await staff
        .post('/products')
        .send(product({ categoryId: '0192f3c4-0000-7000-8000-000000000999' }))
        .expect(404);
    });

    it('shoppers cannot create products', async () => {
      await shopper.post('/products').send(product()).expect(401);
    });
  });

  describe('listing', () => {
    beforeAll(async () => {
      await staff.post('/products').send(
        product({
          title: 'Cheap Panel',
          sku: 'L-CHEAP',
          price: 5000,
          tags: ['home'],
        }),
      );
      await staff.post('/products').send(
        product({
          title: 'Big Panel',
          sku: 'L-BIG',
          price: 90000,
          categoryId: solarId,
        }),
      );
      await staff.post('/products').send(
        product({
          title: 'Sold Out Panel',
          sku: 'L-OUT',
          price: 7000,
          stock: 0,
        }),
      );
      await staff
        .post('/products')
        .send(
          product({ title: 'Secret Draft', sku: 'L-DRAFT', status: 'DRAFT' }),
        );
    });

    const titles = (res: { body: { data: { title: string }[] } }) =>
      res.body.data.map((p) => p.title);

    it('shoppers never see drafts; staff can filter by status', async () => {
      expect(
        titles(await shopper.get('/products?limit=100').expect(200)),
      ).not.toContain('Secret Draft');
      await shopper.get('/products/slug/secret-draft').expect(404);
      expect(
        titles(
          await shopper.get('/products?status=DRAFT&limit=100').expect(200),
        ),
      ).not.toContain('Secret Draft');
      expect(
        titles(await staff.get('/products?status=DRAFT').expect(200)),
      ).toEqual(['Secret Draft']);
    });

    it('a category includes its subcategories', async () => {
      const solar = titles(
        await shopper.get('/products?category=solar&limit=100').expect(200),
      );
      expect(solar).toEqual(
        expect.arrayContaining(['Cheap Panel', 'Big Panel']),
      );
      const rooftop = titles(
        await shopper.get('/products?category=rooftop&limit=100').expect(200),
      );
      expect(rooftop).not.toContain('Big Panel');
      expect(
        (await shopper.get('/products?category=nope').expect(200)).body.data,
      ).toEqual([]);
    });

    it('filters by price, stock, tag and search, and sorts by price', async () => {
      const cheap = titles(
        await shopper
          .get('/products?maxPrice=8000&sort=price_asc&limit=100')
          .expect(200),
      );
      expect(cheap).toEqual(['Cheap Panel', 'Sold Out Panel']);
      expect(
        titles(
          await shopper.get('/products?maxPrice=8000&inStock=true').expect(200),
        ),
      ).toEqual(['Cheap Panel']);
      expect(
        titles(
          await shopper.get('/products?tag=home&search=cheap').expect(200),
        ),
      ).toEqual(['Cheap Panel']);
      expect(
        titles(await shopper.get('/products?search=L-BIG').expect(200)),
      ).toEqual(['Big Panel']);
    });

    it('pages through results with totals', async () => {
      const res = await shopper
        .get('/products?limit=2&page=2&sort=price_asc')
        .expect(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toMatchObject({ page: 2, limit: 2 });
      expect(res.body.meta.totalPages).toBe(Math.ceil(res.body.meta.total / 2));
    });

    it('staff can list low-stock products', async () => {
      await staff
        .patch('/store/settings')
        .send({ lowStockThreshold: 0 })
        .expect(200);
      expect(
        titles(await staff.get('/products?lowStock=true').expect(200)),
      ).toEqual(['Sold Out Panel']);
    });
  });

  describe('changing', () => {
    it('replaces images and options only when they are sent', async () => {
      const created = await staff
        .post('/products')
        .send(
          product({
            images: [{ url: `${IMG}/a.jpg` }],
            options: [
              {
                name: 'Color',
                values: [{ label: 'Black', swatch: '#000000' }],
              },
            ],
          }),
        )
        .expect(201);
      const id = created.body.id;

      const renamed = await staff
        .patch(`/products/${id}`)
        .send({ title: 'Renamed', stock: 3 })
        .expect(200);
      expect(renamed.body).toMatchObject({ title: 'Renamed', stock: 3 });
      expect(renamed.body.images).toHaveLength(1);
      expect(renamed.body.options).toHaveLength(1);

      const replaced = await staff
        .patch(`/products/${id}`)
        .send({
          images: [{ url: `${IMG}/b.jpg` }, { url: `${IMG}/c.jpg` }],
          options: [],
        })
        .expect(200);
      expect(replaced.body.images.map((i: { url: string }) => i.url)).toEqual([
        `${IMG}/b.jpg`,
        `${IMG}/c.jpg`,
      ]);
      expect(replaced.body.options).toEqual([]);
      expect(
        await prisma.productImage.count({ where: { productId: id } }),
      ).toBe(2);
      expect(
        await prisma.productOptionValue.count({
          where: { option: { productId: id } },
        }),
      ).toBe(0);
    });

    it('bulk edits are all or nothing', async () => {
      const a = (await staff.post('/products').send(product()).expect(201)).body
        .id;
      const b = (await staff.post('/products').send(product()).expect(201)).body
        .id;

      const res = await staff
        .patch('/products/bulk')
        .send({
          items: [
            { id: a, price: 111, stock: 1 },
            { id: b, status: 'ARCHIVED' },
          ],
        })
        .expect(200);
      expect(
        res.body.map((p: { price: string; status: string }) => [
          p.price,
          p.status,
        ]),
      ).toEqual([
        ['111.00', 'ACTIVE'],
        ['19500.00', 'ARCHIVED'],
      ]);

      const other = await createStore(prisma);
      const foreignCategory = await prisma.category.create({
        data: { sellerId: other.id, name: 'X', slug: 'x' },
      });
      const foreign = await prisma.product.create({
        data: {
          sellerId: other.id,
          categoryId: foreignCategory.id,
          title: 'Theirs',
          slug: 'theirs',
          sku: 'T',
          price: 1,
        },
      });
      await staff
        .patch('/products/bulk')
        .send({
          items: [
            { id: a, price: 222 },
            { id: foreign.id, price: 1 },
          ],
        })
        .expect(404);
      expect((await staff.get(`/products/${a}`).expect(200)).body.price).toBe(
        '111.00',
      );
      expect(
        (
          await prisma.product.findUnique({ where: { id: foreign.id } })
        )?.price.toFixed(2),
      ).toBe('1.00');
    });

    it("cannot touch another store's products", async () => {
      const other = await createStore(prisma);
      const category = await prisma.category.create({
        data: { sellerId: other.id, name: 'Y', slug: 'y' },
      });
      const foreign = await prisma.product.create({
        data: {
          sellerId: other.id,
          categoryId: category.id,
          title: 'Theirs',
          slug: 'theirs',
          sku: 'T2',
          price: 1,
        },
      });
      await shopper.get(`/products/${foreign.id}`).expect(404);
      await staff
        .patch(`/products/${foreign.id}`)
        .send({ title: 'Mine' })
        .expect(404);
      await staff.delete(`/products/${foreign.id}`).expect(404);
      await staff
        .post('/products')
        .send(product({ categoryId: category.id }))
        .expect(404);
    });
  });

  describe('deleting', () => {
    it('removes a product that was never ordered, with its images', async () => {
      const id = (
        await staff
          .post('/products')
          .send(product({ images: [{ url: `${IMG}/d.jpg` }] }))
          .expect(201)
      ).body.id;
      await staff.delete(`/products/${id}`).expect(204);
      await staff.get(`/products/${id}`).expect(404);
      expect(
        await prisma.productImage.count({ where: { productId: id } }),
      ).toBe(0);
    });

    it('keeps a product that has been ordered and says to archive it', async () => {
      const created = (
        await staff.post('/products').send(product()).expect(201)
      ).body;
      const customer = await prisma.user.create({
        data: {
          sellerId: store.id,
          name: 'Buyer',
          phone: '+8801900000001',
          passwordHash: 'x',
        },
      });
      await prisma.order.create({
        data: {
          sellerId: store.id,
          orderNumber: 1,
          userId: customer.id,
          subtotal: 1,
          totalAmount: 1,
          shippingMethod: 'Standard',
          shipName: 'Buyer',
          shipPhone: '+8801900000001',
          shipDistrict: 'Dhaka',
          shipThana: 'Mirpur',
          shipVillageOrWard: 'Ward 6',
          items: {
            create: {
              productId: created.id,
              title: created.title,
              sku: created.sku,
              unitPrice: 1,
              quantity: 1,
              totalPrice: 1,
            },
          },
        },
      });
      const res = await staff.delete(`/products/${created.id}`).expect(409);
      expect(res.body.message).toMatch(/Archive it instead/);
    });
  });
});
