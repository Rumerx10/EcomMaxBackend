import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DNS_TXT_RESOLVER } from '../src/modules/seller/domain.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createApp,
  createStore,
  createUser,
  login,
  PASSWORD,
  PLATFORM_DOMAIN,
  storeClient,
  type TestStore,
} from './helpers.js';

const PLATFORM_KEY = 'e2e-platform-key-that-is-long-enough-0123456789';

describe('Stores (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  // TXT records the fake DNS knows: name -> values.
  const dns = new Map<string, string[]>();

  beforeAll(async () => {
    ({ app, prisma } = await createApp((builder) =>
      builder
        .overrideProvider(DNS_TXT_RESOLVER)
        .useValue(async (name: string) =>
          (dns.get(name) ?? []).map((value) => [value]),
        ),
    ));
  });

  afterAll(async () => {
    await app.close();
  });

  const platform = () => ({
    post: (url: string) =>
      request(app.getHttpServer())
        .post(`/api/v1/platform${url}`)
        .set('X-Platform-Key', PLATFORM_KEY),
    patch: (url: string) =>
      request(app.getHttpServer())
        .patch(`/api/v1/platform${url}`)
        .set('X-Platform-Key', PLATFORM_KEY),
  });

  describe('opening a store', () => {
    const newStore = (slug: string) => ({
      name: 'Solar Bari',
      slug,
      email: 'Hello@SolarBari.com',
      phone: '+8809612000000',
      owner: { name: 'Karim Owner', phone: '01755555555', password: PASSWORD },
    });

    it('needs the platform key', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/platform/sellers')
        .send(newStore('x-store'))
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/platform/sellers')
        .set('X-Platform-Key', 'wrong')
        .send(newStore('x-store'))
        .expect(403);
    });

    it('creates the store pending, with its owner; only staff get in until it opens', async () => {
      const res = await platform()
        .post('/sellers')
        .send(newStore('solar-bari'))
        .expect(201);
      expect(res.body.store).toMatchObject({
        slug: 'solar-bari',
        status: 'PENDING',
        email: 'hello@solarbari.com',
        primaryHost: `solar-bari.${PLATFORM_DOMAIN}`,
      });
      expect(res.body.owner).toMatchObject({
        role: 'OWNER',
        phone: '+8801755555555',
      });

      const host = `solar-bari.${PLATFORM_DOMAIN}`;
      await storeClient(app, host).get('/store').expect(403);
      const { accessToken } = await login(app, host, '01755555555');
      await storeClient(app, host, accessToken)
        .get('/store/settings')
        .expect(200);

      await platform()
        .patch(`/sellers/${res.body.store.id}/status`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      const profile = await storeClient(app, host).get('/store').expect(200);
      expect(profile.body.name).toBe('Solar Bari');
    });

    it('refuses a taken or reserved slug', async () => {
      await platform()
        .post('/sellers')
        .send(newStore('solar-bari'))
        .expect(409);
      const reserved = await platform()
        .post('/sellers')
        .send(newStore('api'))
        .expect(400);
      expect(reserved.body.message).toMatch(/reserved/);
      await platform().post('/sellers').send(newStore('Bad Slug')).expect(400);
    });

    it('suspending a store shuts it at once', async () => {
      const store = await createStore(prisma);
      await storeClient(app, store.host).get('/store').expect(200);
      await platform()
        .patch(`/sellers/${store.id}/status`)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      await storeClient(app, store.host).get('/store').expect(403);
    });
  });

  describe('settings', () => {
    let store: TestStore;
    let ownerToken: string;

    beforeAll(async () => {
      store = await createStore(prisma);
      ({ accessToken: ownerToken } = await login(
        app,
        store.host,
        store.owner.phone,
      ));
    });

    it('staff update fees and contact details; money comes back with two decimals', async () => {
      const manager = await createUser(prisma, store.id, 'MANAGER');
      const managerToken = (await login(app, store.host, manager.phone))
        .accessToken;
      const res = await storeClient(app, store.host, managerToken)
        .patch('/store/settings')
        .send({
          taxRate: 5,
          installationFee: 15000,
          supportHours: 'Sat-Thu 9-21',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        taxRate: '5.00',
        installationFee: '15000.00',
      });
    });

    it('keeps a brand colour, shown in the public profile', async () => {
      await storeClient(app, store.host, ownerToken)
        .patch('/store/settings')
        .send({ brandColor: ' #0E7490 ' })
        .expect(200);
      const res = await storeClient(app, store.host).get('/store').expect(200);
      expect(res.body.brandColor).toBe('#0e7490');
      for (const brandColor of ['blue', '#abc', '#12345g']) {
        await storeClient(app, store.host, ownerToken)
          .patch('/store/settings')
          .send({ brandColor })
          .expect(400);
      }
      await storeClient(app, store.host, ownerToken)
        .patch('/store/settings')
        .send({ brandColor: null })
        .expect(200);
      expect(
        (await storeClient(app, store.host).get('/store').expect(200)).body
          .brandColor,
      ).toBeNull();
    });

    it('the public profile leaves out internal settings', async () => {
      const res = await storeClient(app, store.host).get('/store').expect(200);
      expect(res.body.taxRate).toBe('5.00');
      expect(res.body.notifyNewOrder).toBeUndefined();
      expect(res.body.status).toBeUndefined();
    });

    it('customers cannot change settings, and nobody can change slug or status here', async () => {
      const customer = await createUser(prisma, store.id);
      const token = (await login(app, store.host, customer.phone)).accessToken;
      await storeClient(app, store.host, token)
        .patch('/store/settings')
        .send({ name: 'Mine' })
        .expect(403);
      await storeClient(app, store.host, ownerToken)
        .patch('/store/settings')
        .send({ status: 'ACTIVE' })
        .expect(400);
      await storeClient(app, store.host, ownerToken)
        .patch('/store/settings')
        .send({ slug: 'other' })
        .expect(400);
    });
  });

  describe('custom domains', () => {
    let store: TestStore;
    let owner: ReturnType<typeof storeClient>;

    beforeAll(async () => {
      store = await createStore(prisma);
      owner = storeClient(
        app,
        store.host,
        (await login(app, store.host, store.owner.phone)).accessToken,
      );
    });

    it('are served only after the DNS record proves ownership', async () => {
      const hostname = `shop.${store.slug}.example`;
      const added = await owner
        .post('/store/domains')
        .send({ hostname: `HTTPS://${hostname.toUpperCase()}` })
        .expect(201);
      expect(added.body).toMatchObject({
        hostname,
        verifiedAt: null,
        isPrimary: false,
      });
      const { name, value } = added.body.verification;
      expect(name).toBe(`_store-verification.${hostname}`);

      await request(app.getHttpServer())
        .get('/api/v1/store')
        .set('X-Seller-Host', hostname)
        .expect(404);
      await owner.post(`/store/domains/${added.body.id}/verify`).expect(422);

      dns.set(name, ['some-other-record', value]);
      const verified = await owner
        .post(`/store/domains/${added.body.id}/verify`)
        .expect(200);
      expect(verified.body.isPrimary).toBe(true);
      expect(verified.body.verifiedAt).not.toBeNull();

      const profile = await request(app.getHttpServer())
        .get('/api/v1/store')
        .set('X-Seller-Host', hostname)
        .expect(200);
      expect(profile.body).toMatchObject({
        id: store.id,
        primaryHost: hostname,
      });

      await owner.delete(`/store/domains/${added.body.id}`).expect(204);
      await request(app.getHttpServer())
        .get('/api/v1/store')
        .set('X-Seller-Host', hostname)
        .expect(404);
    });

    it('moves the primary flag between verified domains', async () => {
      const first = await owner
        .post('/store/domains')
        .send({ hostname: `a.${store.slug}.example` })
        .expect(201);
      const second = await owner
        .post('/store/domains')
        .send({ hostname: `b.${store.slug}.example` })
        .expect(201);
      for (const domain of [first.body, second.body]) {
        dns.set(domain.verification.name, [domain.verification.value]);
        await owner.post(`/store/domains/${domain.id}/verify`).expect(200);
      }
      await owner.post(`/store/domains/${second.body.id}/primary`).expect(200);
      const list = await owner.get('/store/domains').expect(200);
      const primary = list.body.filter(
        (d: { isPrimary: boolean }) => d.isPrimary,
      );
      expect(primary.map((d: { id: string }) => d.id)).toEqual([
        second.body.id,
      ]);
    });

    it('refuses platform subdomains, junk and a domain another store has', async () => {
      await owner
        .post('/store/domains')
        .send({ hostname: `x.${PLATFORM_DOMAIN}` })
        .expect(400);
      await owner
        .post('/store/domains')
        .send({ hostname: 'not a domain' })
        .expect(400);

      const rival = await createStore(prisma);
      const rivalOwner = storeClient(
        app,
        rival.host,
        (await login(app, rival.host, rival.owner.phone)).accessToken,
      );
      await rivalOwner
        .post('/store/domains')
        .send({ hostname: `taken.${store.slug}.example` })
        .expect(201);
      await owner
        .post('/store/domains')
        .send({ hostname: `taken.${store.slug}.example` })
        .expect(409);
    });

    it('only the owner manages domains, and only their own', async () => {
      const manager = await createUser(prisma, store.id, 'MANAGER');
      const managerClient = storeClient(
        app,
        store.host,
        (await login(app, store.host, manager.phone)).accessToken,
      );
      await managerClient.get('/store/domains').expect(200);
      await managerClient
        .post('/store/domains')
        .send({ hostname: `m.${store.slug}.example` })
        .expect(403);

      const rival = await createStore(prisma);
      const rivalDomain = await prisma.sellerDomain.create({
        data: {
          sellerId: rival.id,
          hostname: `r.${rival.slug}.example`,
          verificationToken: 't',
        },
      });
      await owner.post(`/store/domains/${rivalDomain.id}/verify`).expect(404);
      await owner.delete(`/store/domains/${rivalDomain.id}`).expect(404);
    });
  });
});
