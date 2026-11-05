import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export const E2E_DB_PORT = Number(process.env.E2E_DB_PORT ?? 54330);

// Starts an in-memory Postgres for the e2e run, applies prisma/migrations in order (so the
// tests also prove the migrations work), and serves it on E2E_DB_PORT for the app's pg pool.
export default async function setup() {
  const db = await PGlite.create();
  const migrations = new URL('../prisma/migrations/', import.meta.url);
  const folders = readdirSync(migrations)
    .filter((name) => /^\d+_/.test(name))
    .sort();
  for (const folder of folders) {
    await db.exec(
      readFileSync(new URL(`${folder}/migration.sql`, migrations), 'utf8'),
    );
  }

  const server = new PGLiteSocketServer({
    db,
    host: '127.0.0.1',
    port: E2E_DB_PORT,
    maxConnections: 20,
  });
  await server.start();

  return async () => {
    await server.stop();
    await db.close();
  };
}
