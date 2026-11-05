import type { NestExpressApplication } from '@nestjs/platform-express';
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

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storeA: TestStore;
  let storeB: TestStore;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    storeA = await createStore(prisma);
    storeB = await createStore(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('register', () => {
    it('creates a customer, normalising the phone number, and signs them in', async () => {
      const res = await storeClient(app, storeA.host)
        .post('/auth/register')
        .send({
          name: '  Rahim Uddin ',
          phone: '01811-111111',
          password: PASSWORD,
        })
        .expect(201);
      expect(res.body.user).toMatchObject({
        name: 'Rahim Uddin',
        phone: '+8801811111111',
        role: 'CUSTOMER',
        sellerId: storeA.id,
      });
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
    });

    it('refuses a phone number that already has an account at this store', async () => {
      const res = await storeClient(app, storeA.host)
        .post('/auth/register')
        .send({ name: 'Again', phone: '+8801811111111', password: PASSWORD })
        .expect(409);
      expect(res.body.message).toMatch(/phone/);
    });

    it('allows the same phone number at another store', async () => {
      await storeClient(app, storeB.host)
        .post('/auth/register')
        .send({ name: 'Rahim', phone: '01811111111', password: PASSWORD })
        .expect(201);
    });

    it('validates the input and refuses unknown fields such as role', async () => {
      const res = await storeClient(app, storeA.host)
        .post('/auth/register')
        .send({ name: 'X', phone: '12345', password: 'short' })
        .expect(400);
      expect(res.body.message.join(' ')).toMatch(/Bangladeshi mobile number/);

      await storeClient(app, storeA.host)
        .post('/auth/register')
        .send({
          name: 'Sneaky',
          phone: '01822222222',
          password: PASSWORD,
          role: 'OWNER',
        })
        .expect(400);
    });
  });

  describe('login', () => {
    it('signs in with the right password only, with the same message for both mistakes', async () => {
      const wrongPassword = await storeClient(app, storeA.host)
        .post('/auth/login')
        .send({ phone: storeA.owner.phone, password: 'not the password' })
        .expect(401);
      const noAccount = await storeClient(app, storeA.host)
        .post('/auth/login')
        .send({ phone: '01999999999', password: PASSWORD })
        .expect(401);
      expect(wrongPassword.body.message).toBe(noAccount.body.message);

      const { user } = await login(app, storeA.host, storeA.owner.phone);
      expect(user.id).toBe(storeA.owner.id);
    });

    it('refuses a deactivated account', async () => {
      const blocked = await createUser(prisma, storeA.id);
      await prisma.user.update({
        where: { id: blocked.id },
        data: { isActive: false },
      });
      await storeClient(app, storeA.host)
        .post('/auth/login')
        .send({ phone: blocked.phone, password: PASSWORD })
        .expect(401);
    });
  });

  describe('tokens', () => {
    it('only work at the store that issued them', async () => {
      const { accessToken } = await login(app, storeA.host, storeA.owner.phone);
      await storeClient(app, storeA.host, accessToken)
        .get('/users/me')
        .expect(200);
      await storeClient(app, storeB.host, accessToken)
        .get('/users/me')
        .expect(401);
    });

    it('refresh swaps the refresh token for a new one', async () => {
      const first = await login(app, storeA.host, storeA.owner.phone);
      const res = await storeClient(app, storeA.host)
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);
      expect(res.body.refreshToken).not.toBe(first.refreshToken);
      await storeClient(app, storeA.host, res.body.accessToken)
        .get('/users/me')
        .expect(200);
    });

    it('a refresh token from one store does nothing at another', async () => {
      const { refreshToken } = await login(
        app,
        storeA.host,
        storeA.owner.phone,
      );
      await storeClient(app, storeB.host)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
      await storeClient(app, storeA.host)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);
    });

    it('reusing a retired refresh token signs the user out everywhere', async () => {
      const user = await createUser(prisma, storeA.id);
      const stolen = await login(app, storeA.host, user.phone);
      const otherDevice = await login(app, storeA.host, user.phone);
      const rotated = await storeClient(app, storeA.host)
        .post('/auth/refresh')
        .send({ refreshToken: stolen.refreshToken })
        .expect(200);

      // The old token comes back: treated as theft.
      await storeClient(app, storeA.host)
        .post('/auth/refresh')
        .send({ refreshToken: stolen.refreshToken })
        .expect(401);
      for (const token of [
        rotated.body.refreshToken,
        otherDevice.refreshToken,
      ]) {
        await storeClient(app, storeA.host)
          .post('/auth/refresh')
          .send({ refreshToken: token })
          .expect(401);
      }
    });

    it('logout ends one session, logout-all ends every session', async () => {
      const user = await createUser(prisma, storeA.id);
      const one = await login(app, storeA.host, user.phone);
      const two = await login(app, storeA.host, user.phone);

      await storeClient(app, storeA.host)
        .post('/auth/logout')
        .send({ refreshToken: one.refreshToken })
        .expect(204);
      await storeClient(app, storeA.host)
        .post('/auth/logout')
        .send({ refreshToken: one.refreshToken })
        .expect(204);
      await storeClient(app, storeA.host)
        .post('/auth/refresh')
        .send({ refreshToken: one.refreshToken })
        .expect(401);

      const three = await login(app, storeA.host, user.phone);
      await storeClient(app, storeA.host, three.accessToken)
        .post('/auth/logout-all')
        .expect(204);
      for (const session of [two, three]) {
        await storeClient(app, storeA.host)
          .post('/auth/refresh')
          .send({ refreshToken: session.refreshToken })
          .expect(401);
      }
    });

    it('private routes need a token', async () => {
      await storeClient(app, storeA.host).get('/users/me').expect(401);
      await storeClient(app, storeA.host, 'not-a-jwt')
        .get('/users/me')
        .expect(401);
    });
  });
});
