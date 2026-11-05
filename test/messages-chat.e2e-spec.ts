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

describe('Store messages and chat (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let store: TestStore;
  let staff: ReturnType<typeof storeClient>;

  const customer = async () => {
    const user = await createUser(prisma, store.id);
    return {
      ...user,
      client: storeClient(
        app,
        store.host,
        (await login(app, store.host, user.phone)).accessToken,
      ),
    };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    store = await createStore(prisma);
    staff = storeClient(
      app,
      store.host,
      (await login(app, store.host, store.owner.phone)).accessToken,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('contact and feedback messages', () => {
    it('a guest writes from the contact page and must say how to reply', async () => {
      const guest = storeClient(app, store.host);
      await guest
        .post('/messages')
        .send({
          kind: 'CONTACT',
          name: 'Rafi',
          body: 'Do you install in Sylhet?',
        })
        .expect(400);
      await guest
        .post('/messages')
        .send({ kind: 'CONTACT', name: 'Rafi', email: 'r@x.com', body: 'Hi' })
        .expect(400);
      const sent = await guest
        .post('/messages')
        .send({
          kind: 'CONTACT',
          name: 'Rafi',
          email: 'Rafi@Example.com',
          body: 'Do you install in Sylhet?',
        })
        .expect(201);
      expect(sent.body).toMatchObject({
        kind: 'CONTACT',
        name: 'Rafi',
        email: 'rafi@example.com',
        topic: null,
        wantsReply: true,
        isRead: false,
        userId: null,
      });
    });

    it('signed-in feedback is filled in from the account', async () => {
      const me = await customer();
      const sent = await me.client
        .post('/messages')
        .send({
          kind: 'FEEDBACK',
          topic: 'bug',
          subject: 'Cart',
          body: 'The cart button does nothing on my phone.',
        })
        .expect(201);
      expect(sent.body).toMatchObject({
        kind: 'FEEDBACK',
        topic: 'bug',
        phone: me.phone,
        userId: me.id,
        wantsReply: false,
      });
      await me.client
        .post('/messages')
        .send({ kind: 'FEEDBACK', topic: 'rant', body: 'Not a real topic.' })
        .expect(400);
    });

    it('staff list, filter, mark read and delete; nobody else can', async () => {
      const list = (await staff.get('/admin/messages').expect(200)).body;
      expect(list.data.length).toBeGreaterThanOrEqual(2);
      expect(list.unread).toBe(list.data.length);
      const feedback = (
        await staff.get('/admin/messages?kind=FEEDBACK').expect(200)
      ).body.data;
      expect(
        feedback.every((m: { kind: string }) => m.kind === 'FEEDBACK'),
      ).toBe(true);

      const first = list.data[0];
      await staff
        .patch(`/admin/messages/${first.id}`)
        .send({ isRead: true })
        .expect(200);
      const unread = (
        await staff.get('/admin/messages?isRead=false').expect(200)
      ).body;
      expect(unread.data.map((m: { id: string }) => m.id)).not.toContain(
        first.id,
      );
      expect(unread.unread).toBe(list.unread - 1);

      const me = await customer();
      await me.client.get('/admin/messages').expect(403);
      await storeClient(app, store.host).get('/admin/messages').expect(401);

      const other = await createStore(prisma);
      const otherStaff = storeClient(
        app,
        other.host,
        (await login(app, other.host, other.owner.phone)).accessToken,
      );
      expect(
        (await otherStaff.get('/admin/messages').expect(200)).body.data,
      ).toEqual([]);
      await otherStaff.delete(`/admin/messages/${first.id}`).expect(404);

      await staff.delete(`/admin/messages/${first.id}`).expect(204);
      await staff.delete(`/admin/messages/${first.id}`).expect(404);
    });
  });

  describe('chat', () => {
    it('a customer writes, staff answer, and each side counts what it has not read', async () => {
      const me = await customer();
      expect((await me.client.get('/chat').expect(200)).body).toEqual({
        conversationId: null,
        unread: 0,
        messages: [],
      });

      await me.client
        .post('/chat/messages')
        .send({ body: 'Is the 10 kW system in stock?' })
        .expect(201);
      await me.client
        .post('/chat/messages')
        .send({ body: 'I am in Dhaka.' })
        .expect(201);
      await me.client.post('/chat/messages').send({ body: '   ' }).expect(400);

      const inbox = (await staff.get('/admin/chats').expect(200)).body;
      const conversation = inbox.data.find(
        (c: { customer: { id: string } }) => c.customer.id === me.id,
      );
      expect(conversation).toMatchObject({
        lastMessage: 'I am in Dhaka.',
        unread: 2,
        customer: { phone: me.phone },
      });
      expect(inbox.unread).toBeGreaterThanOrEqual(1);

      const reply = await staff
        .post(`/admin/chats/${conversation.id}/messages`)
        .send({ body: 'Yes, we can deliver tomorrow.' })
        .expect(201);
      expect(reply.body).toMatchObject({
        fromStore: true,
        senderName: `Store ${store.slug}`,
      });

      const thread = (await me.client.get('/chat').expect(200)).body;
      expect(thread.unread).toBe(1);
      expect(
        thread.messages.map((m: { body: string; fromStore: boolean }) => [
          m.fromStore,
          m.body,
        ]),
      ).toEqual([
        [false, 'Is the 10 kW system in stock?'],
        [false, 'I am in Dhaka.'],
        [true, 'Yes, we can deliver tomorrow.'],
      ]);
      await me.client.post('/chat/read').expect(204);
      expect((await me.client.get('/chat').expect(200)).body.unread).toBe(0);

      // Answering marked the customer's messages read.
      const seen = (
        await staff.get(`/admin/chats/${conversation.id}`).expect(200)
      ).body;
      expect(seen.unread).toBe(0);
      expect(seen.customer).toMatchObject({ id: me.id });
      await me.client.post('/chat/messages').send({ body: 'Thanks!' });
      await staff.post(`/admin/chats/${conversation.id}/read`).expect(204);
      expect(
        (await staff.get(`/admin/chats/${conversation.id}`).expect(200)).body
          .unread,
      ).toBe(0);
    });

    it('staff use the inbox, customers only see their own conversation', async () => {
      await staff.get('/chat').expect(403);
      await staff.post('/chat/messages').send({ body: 'hi' }).expect(403);
      await storeClient(app, store.host).get('/chat').expect(401);

      const a = await customer();
      const b = await customer();
      await a.client
        .post('/chat/messages')
        .send({ body: 'From A' })
        .expect(201);
      expect((await b.client.get('/chat').expect(200)).body.messages).toEqual(
        [],
      );
      await a.client.get('/admin/chats').expect(403);

      const other = await createStore(prisma);
      const otherStaff = storeClient(
        app,
        other.host,
        (await login(app, other.host, other.owner.phone)).accessToken,
      );
      expect(
        (await otherStaff.get('/admin/chats').expect(200)).body.data,
      ).toEqual([]);
      const conversationId = (
        await prisma.conversation.findFirstOrThrow({ where: { userId: a.id } })
      ).id;
      await otherStaff.get(`/admin/chats/${conversationId}`).expect(404);
      await otherStaff
        .post(`/admin/chats/${conversationId}/messages`)
        .send({ body: 'Hello from another store' })
        .expect(404);
    });
  });
});
