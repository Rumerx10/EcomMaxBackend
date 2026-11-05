import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp } from './helpers.js';

describe('Health (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers without a store or a token', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('sends the helmet security headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
