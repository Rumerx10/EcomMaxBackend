import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { TenantService } from '../src/tenant/tenant.service.js';
import {
  createApp,
  createStore,
  login,
  PLATFORM_DOMAIN,
  storeClient,
  type TestStore,
} from './helpers.js';

describe('Finding the store of a request (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let active: TestStore;
  let other: TestStore;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    active = await createStore(prisma);
    other = await createStore(prisma);
    await prisma.category.create({
      data: {
        sellerId: active.id,
        name: 'Only in active',
        slug: 'only-active',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('asks for the store when the request names none', async () => {
    const res = await http().get('/api/v1/categories').expect(400);
    expect(res.body.message).toMatch(/X-Seller-Host/);
  });

  it('answers 404 for a host that is no store', async () => {
    await http()
      .get('/api/v1/categories')
      .set('X-Seller-Host', `nobody.${PLATFORM_DOMAIN}`)
      .expect(404);
  });

  it('serves each store its own data under the same path', async () => {
    const mine = await storeClient(app, active.host)
      .get('/categories')
      .expect(200);
    const theirs = await storeClient(app, other.host)
      .get('/categories')
      .expect(200);
    expect(mine.body.data.map((c: { slug: string }) => c.slug)).toEqual([
      'only-active',
    ]);
    expect(theirs.body.data).toEqual([]);
  });

  it('accepts the store host in any letter case and with a port', async () => {
    await http()
      .get('/api/v1/categories')
      .set('X-Seller-Host', `${active.host.toUpperCase()}:443`)
      .expect(200);
  });

  it('falls back to the Origin header, but an explicit X-Seller-Host wins', async () => {
    await http()
      .get('/api/v1/categories')
      .set('Origin', `https://${active.host}`)
      .expect(200);
    const res = await http()
      .get('/api/v1/categories')
      .set('Origin', `https://${active.host}`)
      .set('X-Seller-Host', other.host)
      .expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('serves a custom domain once it is verified', async () => {
    const hostname = `shop-${active.slug}.example.com`;
    const domain = await prisma.sellerDomain.create({
      data: { sellerId: active.id, hostname, verificationToken: 'token' },
    });
    await http()
      .get('/api/v1/categories')
      .set('X-Seller-Host', hostname)
      .expect(404);

    await prisma.sellerDomain.update({
      where: { id: domain.id },
      data: { verifiedAt: new Date() },
    });
    app.get(TenantService).invalidate();
    const res = await http()
      .get('/api/v1/categories')
      .set('X-Seller-Host', hostname)
      .expect(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('keeps shoppers out of a store that is not open yet, but lets its owner sign in', async () => {
    const pending = await createStore(prisma, 'PENDING');
    const res = await storeClient(app, pending.host)
      .get('/categories')
      .expect(403);
    expect(res.body.message).toMatch(/not open yet/);

    const { accessToken } = await login(app, pending.host, pending.owner.phone);
    await storeClient(app, pending.host, accessToken).get('/users').expect(200);
  });

  it('blocks a suspended store completely', async () => {
    const suspended = await createStore(prisma, 'SUSPENDED');
    await storeClient(app, suspended.host).get('/categories').expect(403);
    await storeClient(app, suspended.host)
      .post('/auth/login')
      .send({ phone: suspended.owner.phone, password: 'x' })
      .expect(403);
  });

  describe('CORS', () => {
    const preflight = (origin: string) =>
      http()
        .options('/api/v1/categories')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'x-seller-host,authorization');

    it('allows a store domain and the configured extra origins', async () => {
      const store = await preflight(`https://${active.host}`);
      expect(store.headers['access-control-allow-origin']).toBe(
        `https://${active.host}`,
      );
      expect(store.headers['access-control-allow-headers']).toMatch(
        /x-seller-host/i,
      );
      const local = await preflight('http://localhost:3000');
      expect(local.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000',
      );
    });

    it('allows the shared seller centre at admin.<platform domain>', async () => {
      const res = await preflight('https://admin.myplatform.test');
      expect(res.headers['access-control-allow-origin']).toBe(
        'https://admin.myplatform.test',
      );
    });

    it('does not allow unknown sites', async () => {
      const res = await preflight('https://evil.example.com');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
