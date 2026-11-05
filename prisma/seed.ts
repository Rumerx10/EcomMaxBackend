// Seeds the first seller, NextPower: its settings, OWNER account, categories, products (with
// images and options), shipping rates and coupon. The catalogue comes from
// seed-data/next-power.json, which was exported from the client's mock data.
//
// Run with `npx prisma db seed` (or `npm run db:seed`). Needs DATABASE_URL, SEED_OWNER_PHONE
// and SEED_OWNER_PASSWORD in .env (SEED_OWNER_USERNAME is optional). Running it again updates the same rows: sellers match by
// slug, categories by slug, products by SKU, shipping rates by name and coupons by code. The
// owner takes the SEED_OWNER_* values each time, and product images and options are replaced.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';

interface SeedData {
  seller: {
    name: string;
    slug: string;
    email: string;
    phone: string;
    address: string;
    supportHours: string;
    currency: string;
    brandColor: string;
    taxRate: number;
    installationFee: number;
  };
  categories: {
    slug: string;
    name: string;
    description: string;
    sortOrder: number;
  }[];
  products: {
    sku: string;
    slug: string;
    title: string;
    category: string;
    brand: string | null;
    description: string;
    price: number;
    discountPercent: number;
    stock: number;
    weight: number | null;
    tags: string[];
    highlights: string[];
    specs: [string, string][];
    warrantyInfo: string | null;
    popular: boolean;
    trending: boolean;
    latest: boolean;
    images: string[];
    options: {
      name: string;
      values: {
        label: string;
        priceDelta: number;
        swatch: string | null;
        imageUrl: string | null;
      }[];
    }[];
  }[];
  shippingRates: {
    name: string;
    price: number;
    estimate: string;
    sortOrder: number;
  }[];
  coupons: {
    code: string;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
    discountValue: number;
    description?: string;
    isPublic?: boolean;
  }[];
}

const env = (name: string) => {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is not set. Add it to .env (see .env.example).`);
  return value;
};

const ownerPhone = env('SEED_OWNER_PHONE');
if (!/^\+8801[3-9]\d{8}$/.test(ownerPhone)) {
  throw new Error('SEED_OWNER_PHONE must look like +8801XXXXXXXXX');
}
const ownerPassword = env('SEED_OWNER_PASSWORD');
if (ownerPassword.length < 8)
  throw new Error('SEED_OWNER_PASSWORD needs at least 8 characters');

const data = JSON.parse(
  readFileSync(new URL('./seed-data/next-power.json', import.meta.url), 'utf8'),
) as SeedData;
// The home page, with {product:<slug>} where a product id goes.
const homePage = readFileSync(
  new URL('./seed-data/next-power-home.json', import.meta.url),
  'utf8',
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env('DATABASE_URL') }),
});

const seed = async () => {
  const passwordHash = await argon2.hash(ownerPassword, {
    type: argon2.argon2id,
  });
  const owner = {
    phone: ownerPhone,
    name: process.env.SEED_OWNER_NAME || 'Store owner',
    // Optional sign-in name for the owner, e.g. "nextpower".
    username: process.env.SEED_OWNER_USERNAME?.trim().toLowerCase() || null,
    passwordHash,
  };

  await prisma.$transaction(
    async (tx) => {
      const seller = await tx.seller.upsert({
        where: { slug: data.seller.slug },
        create: { ...data.seller, status: 'ACTIVE' },
        update: data.seller,
      });
      const sellerId = seller.id;
      await tx.orderCounter.upsert({
        where: { sellerId },
        create: { sellerId },
        update: {},
      });

      const existingOwner = await tx.user.findFirst({
        where: { sellerId, role: 'OWNER' },
      });
      if (existingOwner) {
        await tx.user.update({ where: { id: existingOwner.id }, data: owner });
      } else {
        await tx.user.create({ data: { sellerId, role: 'OWNER', ...owner } });
      }

      const categoryIds = new Map<string, string>();
      for (const category of data.categories) {
        const { id } = await tx.category.upsert({
          where: { sellerId_slug: { sellerId, slug: category.slug } },
          create: { sellerId, ...category },
          update: category,
        });
        categoryIds.set(category.slug, id);
      }

      const productIds = new Map<string, string>();
      for (const { category, images, options, ...fields } of data.products) {
        const categoryId = categoryIds.get(category);
        if (!categoryId)
          throw new Error(`${fields.sku}: unknown category ${category}`);
        const product = await tx.product.upsert({
          where: { sellerId_sku: { sellerId, sku: fields.sku } },
          create: { sellerId, categoryId, ...fields },
          update: { categoryId, ...fields },
        });
        const productId = product.id;
        productIds.set(fields.slug, productId);

        await tx.productImage.deleteMany({ where: { sellerId, productId } });
        await tx.productImage.createMany({
          data: images.map((url, position) => ({
            sellerId,
            productId,
            url,
            alt: fields.title,
            position,
          })),
        });
        await tx.productOption.deleteMany({ where: { sellerId, productId } });
        for (const [position, option] of options.entries()) {
          await tx.productOption.create({
            data: {
              sellerId,
              productId,
              name: option.name,
              position,
              values: {
                create: option.values.map((value, i) => ({
                  ...value,
                  position: i,
                })),
              },
            },
          });
        }
      }

      for (const rate of data.shippingRates) {
        await tx.shippingRate.upsert({
          where: { sellerId_name: { sellerId, name: rate.name } },
          create: { sellerId, ...rate },
          update: rate,
        });
      }
      for (const coupon of data.coupons) {
        await tx.coupon.upsert({
          where: { sellerId_code: { sellerId, code: coupon.code } },
          create: { sellerId, ...coupon },
          update: coupon,
        });
      }

      // Created once and never updated: staff edit the home page in the seller centre, and
      // seeding again must not undo that.
      const content = JSON.parse(
        homePage.replace(/\{product:([a-z0-9-]+)\}/g, (_, slug: string) => {
          const id = productIds.get(slug);
          if (!id)
            throw new Error(`Home page: no product with the slug ${slug}`);
          return id;
        }),
      );
      await tx.homePage.upsert({
        where: { sellerId },
        create: { sellerId, content },
        update: {},
      });
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  const counts = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.productImage.count(),
    prisma.productOptionValue.count(),
  ]);
  console.log(
    `Seeded ${data.seller.name}: ${counts[0]} categories, ${counts[1]} products, ` +
      `${counts[2]} images, ${counts[3]} option values, owner ${ownerPhone}`,
  );
};

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
