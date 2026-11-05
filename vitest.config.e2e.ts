import { defineConfig } from 'vitest/config';
import { E2E_DB_PORT } from './test/global-setup.js';

// E2E tests boot the whole AppModule against a throwaway in-memory Postgres (PGlite), which
// test/global-setup.ts starts with every migration applied. They never read .env and never
// touch a real database.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // All files share the one database, and PGlite runs one query at a time anyway.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${E2E_DB_PORT}/postgres?sslmode=disable`,
      // PGlite is one database session shared by every connection; two connections in
      // transactions at once would trample each other. One connection makes concurrent
      // requests wait for each other, as row locks would in Postgres.
      DATABASE_POOL_SIZE: '1',
      PLATFORM_DOMAIN: 'myplatform.test',
      JWT_ACCESS_SECRET: 'e2e-access-secret-that-is-long-enough-0123456789',
      PLATFORM_API_KEY: 'e2e-platform-key-that-is-long-enough-0123456789',
      CORS_EXTRA_ORIGINS: 'http://localhost:3000',
    },
  },
});
