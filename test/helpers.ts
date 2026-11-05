import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/utils/password.js';
import type { SellerStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const PLATFORM_DOMAIN = 'myplatform.test';
export const PASSWORD = 'correct horse battery';

// The whole app, as main.ts configures it. `override` can swap providers, e.g. DNS lookups.
export const createApp = async (
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (
    builder,
  ) => builder,
) => {
  const moduleRef = await override(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
};

export interface TestStore {
  id: string;
  slug: string;
  host: string;
  owner: { id: string; phone: string };
}

// A store with its order counter and owner, under a random slug so test files can share the
// database. All accounts use PASSWORD.
export const createStore = async (
  prisma: PrismaService,
  status: SellerStatus = 'ACTIVE',
): Promise<TestStore> => {
  const slug = `store-${randomBytes(4).toString('hex')}`;
  const seller = await prisma.seller.create({
    data: {
      name: `Store ${slug}`,
      slug,
      email: `${slug}@example.com`,
      phone: '+8809612345678',
      status,
    },
  });
  await prisma.orderCounter.create({ data: { sellerId: seller.id } });
  const owner = await createUser(prisma, seller.id, 'OWNER', '+8801700000000');
  return { id: seller.id, slug, host: `${slug}.${PLATFORM_DOMAIN}`, owner };
};

let phoneCounter = 10_000_000;
export const nextPhone = () =>
  `+88017${String(phoneCounter++).padStart(8, '0')}`;

export const createUser = async (
  prisma: PrismaService,
  sellerId: string,
  role: 'OWNER' | 'MANAGER' | 'CUSTOMER' = 'CUSTOMER',
  phone = nextPhone(),
) => {
  const user = await prisma.user.create({
    data: {
      sellerId,
      role,
      name: `${role} ${phone}`,
      phone,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
  return { id: user.id, phone };
};

// Signs in and returns the access token, refresh token and user.
export const login = async (
  app: NestExpressApplication,
  host: string,
  phone: string,
  password = PASSWORD,
) => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('X-Seller-Host', host)
    .send({ phone, password })
    .expect(200);
  return res.body as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };
};

// A supertest agent for one store, optionally signed in.
export const storeClient = (
  app: NestExpressApplication,
  host: string,
  token?: string,
) => {
  const server = app.getHttpServer();
  const prepare = (req: request.Test) => {
    req.set('X-Seller-Host', host);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };
  return {
    get: (url: string) => prepare(request(server).get(`/api/v1${url}`)),
    post: (url: string) => prepare(request(server).post(`/api/v1${url}`)),
    patch: (url: string) => prepare(request(server).patch(`/api/v1${url}`)),
    put: (url: string) => prepare(request(server).put(`/api/v1${url}`)),
    delete: (url: string) => prepare(request(server).delete(`/api/v1${url}`)),
  };
};
