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

describe('Users (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let ownerToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
    ({ accessToken: ownerToken } = await login(
      app,
      store.host,
      store.owner.phone,
    ));
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (token: string) => storeClient(app, store.host, token);
  const signIn = async (phone: string) =>
    (await login(app, store.host, phone)).accessToken;

  describe('your own account', () => {
    it('shows and updates the profile, but never the phone or role', async () => {
      const customer = await createUser(prisma, store.id);
      const token = await signIn(customer.phone);

      const res = await as(token)
        .patch('/users/me')
        .send({ name: 'New Name', email: 'New@Example.com' })
        .expect(200);
      expect(res.body).toMatchObject({
        name: 'New Name',
        email: 'new@example.com',
      });

      await as(token).patch('/users/me').send({ role: 'OWNER' }).expect(400);
      await as(token)
        .patch('/users/me')
        .send({ phone: '01799999999' })
        .expect(400);
      const me = await as(token).get('/users/me').expect(200);
      expect(me.body).toMatchObject({
        role: 'CUSTOMER',
        phone: customer.phone,
      });
    });

    it('takes an uploaded image or an https link as the avatar', async () => {
      const customer = await createUser(prisma, store.id);
      const token = await signIn(customer.phone);
      const uploaded = '/api/v1/uploads/0192f3c4-7b2a-7c3d-9e4f-5a6b7c8d9e0f';
      await as(token)
        .patch('/users/me')
        .send({ avatarUrl: uploaded })
        .expect(200);
      await as(token)
        .patch('/users/me')
        .send({ avatarUrl: 'https://cdn.example.com/a.png' })
        .expect(200);
      await as(token)
        .patch('/users/me')
        .send({ avatarUrl: 'http://cdn.example.com/a.png' })
        .expect(400);
      await as(token).patch('/users/me').send({ avatarUrl: null }).expect(200);
    });

    it('changing the password ends other sessions and returns new tokens', async () => {
      const customer = await createUser(prisma, store.id);
      const otherDevice = await login(app, store.host, customer.phone);
      const token = await signIn(customer.phone);

      await as(token)
        .patch('/users/me/password')
        .send({
          currentPassword: 'wrong password',
          newPassword: 'a brand new password',
        })
        .expect(400);
      const res = await as(token)
        .patch('/users/me/password')
        .send({
          currentPassword: PASSWORD,
          newPassword: 'a brand new password',
        })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));

      await storeClient(app, store.host)
        .post('/auth/refresh')
        .send({ refreshToken: otherDevice.refreshToken })
        .expect(401);
      await login(app, store.host, customer.phone, 'a brand new password');
    });

    it('closing the account deactivates it; the owner cannot close theirs', async () => {
      const customer = await createUser(prisma, store.id);
      await as(await signIn(customer.phone))
        .delete('/users/me')
        .expect(204);
      await storeClient(app, store.host)
        .post('/auth/login')
        .send({ phone: customer.phone, password: PASSWORD })
        .expect(401);

      await as(ownerToken).delete('/users/me').expect(403);
    });
  });

  describe('staff', () => {
    it('customers cannot list users', async () => {
      const customer = await createUser(prisma, store.id);
      await as(await signIn(customer.phone))
        .get('/users')
        .expect(403);
    });

    it('lists users newest first, page by page, and finds them by phone', async () => {
      const created = [];
      for (let i = 0; i < 5; i++)
        created.push(await createUser(prisma, store.id));

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const res: {
          body: { data: { id: string }[]; nextCursor: string | null };
        } = await as(ownerToken)
          .get(
            `/users?role=CUSTOMER&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
          )
          .expect(200);
        expect(res.body.data.length).toBeLessThanOrEqual(2);
        seen.push(...res.body.data.map((user) => user.id));
        cursor = res.body.nextCursor;
      } while (cursor);
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.slice(0, 5)).toEqual(
        created.map((user) => user.id).reverse(),
      );

      const local = created[2].phone.replace('+88', '');
      const found = await as(ownerToken)
        .get(`/users?search=${local}`)
        .expect(200);
      expect(found.body.data.map((user: { id: string }) => user.id)).toEqual([
        created[2].id,
      ]);
    });

    it('the owner adds managers; managers cannot add managers or change roles', async () => {
      const res = await as(ownerToken)
        .post('/users/managers')
        .send({
          name: 'Mina Manager',
          phone: '01733333333',
          password: PASSWORD,
        })
        .expect(201);
      expect(res.body.role).toBe('MANAGER');

      const managerToken = await signIn('+8801733333333');
      await as(managerToken)
        .post('/users/managers')
        .send({ name: 'Another', phone: '01744444444', password: PASSWORD })
        .expect(403);

      const customer = await createUser(prisma, store.id);
      await as(managerToken)
        .patch(`/users/${customer.id}`)
        .send({ role: 'MANAGER' })
        .expect(403);
      await as(managerToken)
        .patch(`/users/${customer.id}`)
        .send({ isActive: false })
        .expect(200);
      await as(managerToken)
        .patch(`/users/${store.owner.id}`)
        .send({ isActive: false })
        .expect(403);
    });

    it('promoting a customer ends their sessions so the new role applies on next sign-in', async () => {
      const customer = await createUser(prisma, store.id);
      const session = await login(app, store.host, customer.phone);
      const res = await as(ownerToken)
        .patch(`/users/${customer.id}`)
        .send({ role: 'MANAGER' })
        .expect(200);
      expect(res.body.role).toBe('MANAGER');
      await storeClient(app, store.host)
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      const relogin = await login(app, store.host, customer.phone);
      await as(relogin.accessToken).get('/users').expect(200);
    });

    it('nobody can make an owner or edit the owner', async () => {
      const customer = await createUser(prisma, store.id);
      await as(ownerToken)
        .patch(`/users/${customer.id}`)
        .send({ role: 'OWNER' })
        .expect(400);
      await as(ownerToken)
        .patch(`/users/${store.owner.id}`)
        .send({ isActive: false })
        .expect(403);
    });

    it("cannot see or change another store's users", async () => {
      const otherStore = await createStore(prisma);
      await as(ownerToken).get(`/users/${otherStore.owner.id}`).expect(404);
      await as(ownerToken)
        .patch(`/users/${otherStore.owner.id}`)
        .send({ isActive: false })
        .expect(404);
      const list = await as(ownerToken).get('/users?limit=100').expect(200);
      expect(
        list.body.data.every(
          (user: { sellerId: string }) => user.sellerId === store.id,
        ),
      ).toBe(true);
    });
  });
});
