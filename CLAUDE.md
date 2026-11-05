# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install            # also runs `prisma generate` (postinstall)
npm run dev            # nest start --watch (the README's `start:dev` does not exist here)
npm run start:debug    # watch mode with inspector
npm run build          # nest build -> dist/ (output dir is wiped first)
npm run start:prod     # node dist/main
npm run lint           # oxlint --type-aware src/ test/
npm run format         # prettier on src/ and test/

npm test               # vitest unit tests (*.spec.ts)
npm run test:e2e       # vitest e2e tests (*.e2e-spec.ts) via vitest.config.e2e.ts
npm run test:cov       # unit tests with v8 coverage

# Single test file / single test by name
npx vitest run src/app.controller.spec.ts
npx vitest run -t "should return"
npx vitest run --config ./vitest.config.e2e.ts test/app.e2e-spec.ts

# Prisma (v7, reads prisma.config.ts)
npx prisma generate                    # regenerate the client after editing prisma/schema.prisma
npx prisma migrate dev --name <name>   # create + apply a migration (uses DIRECT_URL)
npx prisma migrate deploy              # apply pending migrations without creating new ones
npm run db:seed                        # prisma/seed.ts: NextPower + its catalogue; safe to re-run
npm run db:check                       # schema rules checked in an in-memory Postgres (no DB needed)
npx prisma studio
```

The server listens on `process.env.PORT` (`.env` sets 5000, and `src/main.ts` also falls back to 5000). Keep it off 3000, which the Next.js client in `../client` uses. Copy `.env.example` to `.env`; it lists every variable.
- `DATABASE_URL` is the app's connection; the Neon pooled ("-pooler") URL is fine.
- `DIRECT_URL` is the non-pooled URL. `prisma.config.ts` uses it for Migrate, because poolers break Migrate, and falls back to `DATABASE_URL`.
- The seed needs `SEED_OWNER_PHONE` (`+8801XXXXXXXXX`) and `SEED_OWNER_PASSWORD`.
- `prisma.config.ts` and `prisma/seed.ts` load `.env` through `dotenv/config`. Neither test suite needs a database or `.env`: `npm run test:e2e` starts its own in-memory Postgres and sets every variable in `vitest.config.e2e.ts`, and ConfigModule ignores `.env` when `NODE_ENV=test`.

## Toolchain specifics

This is not the classic Jest/ESLint/CommonJS Nest starter, so defaults from older Nest projects don't apply:

- **Native ESM.** `package.json` has `"type": "module"` and tsconfig uses `module`/`moduleResolution: nodenext`. Relative imports must include the `.js` extension (`import { AppService } from './app.service.js'`), including in tests. `src/main.ts` uses top-level `await bootstrap()`.
- **Vitest, not Jest.** `globals: true`, so `describe`/`it`/`expect` need no import (types come from `vitest/globals` in tsconfig). Mocks use `vi.*`, not `jest.*`. Unit specs sit next to the source in `src/`; e2e specs live in `test/` and use supertest against `AppModule`. Both configs set `resolve.tsconfigPaths` so tsconfig path aliases (such as those `nest g library` adds) resolve in tests.
- **oxlint, not ESLint.** It runs type-aware through `oxlint-tsgolint`. `typescript/no-floating-promises` is an error, so every promise has to be awaited or handled. `no-explicit-any` is off.
- **Versions:** NestJS 12, TypeScript 6, Vite 8 / Vitest 4, Express 5 types.
- TS runs in `strict` mode with `strictPropertyInitialization: false`. The build uses `tsconfig.build.json` (rootDir `src`, excludes specs and `test/`).
- Prettier uses single quotes and trailing commas. `.gitattributes` forces LF line endings.

## Architecture

This is the central API of a multi-tenant SaaS e-commerce platform. Many sellers each run their own store with their own frontend; NextPower (`../client`) is the first. The client is not wired to the API yet and still runs on mock data. **`PLAN.md` is the to-do list and the record of design decisions; read it before starting new work and tick steps off as they are finished.**

### Database

- `prisma/schema.prisma` is multi-tenant. `Seller` is the tenant, and `SellerDomain` maps verified custom domains to it (subdomains use `Seller.slug`).
  - Every table carries `sellerId`. Links between seller-owned tables are composite, `(sellerId, xId) -> (sellerId, id)`, so each referenced model has `@@unique([sellerId, id])`, and Prisma `connect` takes `{ sellerId_id: { sellerId, id } }`. Indexes lead with `sellerId`.
  - `User`s have a `Role`: `OWNER` (the seller; the partial unique index `users_one_owner_per_seller` allows one per seller), `MANAGER` or `CUSTOMER`. They sign in with phone + password, per seller. `Session` stores hashed refresh tokens.
  - Guests shop without an account: `Cart` / `Wishlist` rows are found by a `guestToken`. Checkout (cash on delivery included) takes name, phone, a Bangladesh address (district, thana, village/ward) and a password, then creates the `CUSTOMER` user and moves the guest cart to them.
  - The other models: the catalogue (`Category`, `Product`, images, options and option values), `Address` (one default per user, partial unique index), `Review`, `Coupon`, `ShippingRate`, and sales (`Order`, `OrderItem`, `Payment`, `OrderEvent`). Order numbers come from the per-seller `OrderCounter`, and `Order.idempotencyKey` blocks double submits.
  - Sales history is `Restrict`: suspend, deactivate or archive instead of deleting.
  - Ids are UUIDv7 (`@db.Uuid`) and money is `Decimal(12, 2)`.
  - Partial indexes need the `partialIndexes` preview feature in the generator block.
  - The comment at the top of the schema states the rules.
- Migrations live in `prisma/migrations/` (`..._init` so far). After a schema change, run `npx prisma migrate dev --name <name>` and `npm run db:check`, which tests the schema's database rules in an in-memory Postgres (PGlite) through `scripts/schema-check.mjs`.
- `prisma/seed.ts` seeds NextPower from `prisma/seed-data/next-power.json`, which was exported from the client's mock catalogue. Re-running it updates the same rows. Edit the JSON, not the client, to change the seed.

### Request pipeline (every route is under `/api/v1`)

- `src/app.setup.ts` (`configureApp`, shared by `main.ts` and the e2e tests): helmet, CORS for store origins, the `api/v1` prefix, and the global `ValidationPipe` (whitelist, no implicit conversion; DTOs convert with `@Type`/`@Transform`). Swagger is at `/api/docs` outside production.
- `src/config/env.validation.ts`: every env variable is validated at startup.
- `src/tenant/`: `TenantMiddleware` finds the store from `X-Seller-Host` (else `Origin`, else `Host`) through `TenantService` (cached) and keeps it in `TenantContext` (AsyncLocalStorage).
- Global guards, in order:
  1. `ThrottlerGuard`;
  2. `TenantGuard` (store required unless `@NoTenant()`; PENDING only for staff routes or `@AllowPendingStore()`);
  3. `JwtAuthGuard` (default deny unless `@Public()`; a token only works at its own store);
  4. `RolesGuard` (`@Roles(...)`).
- `PrismaExceptionFilter` maps Prisma errors to 409/404.

### Data access rule

Feature services use `TenantPrismaService.db`, never `PrismaService`. It is a Prisma extension (`tenant-scope.ts`) that adds the current `sellerId` to every query on every model except `Seller`, and refuses any other seller's id.
- Creates pass `sellerId: this.tenantPrisma.sellerId`, because Prisma's types require it.
- Writes use scalar ids, never `seller: { connect }`.
- Transactions go through `db.$transaction`, and helpers take `TenantTransactionClient`.
- Raw SQL (only in `analytics`) must name `sellerId` itself.
- The plain `PrismaService` is only for cross-store work: store lookup, onboarding, the `sellers` table.

### Feature modules (`src/modules/`)

- `auth`: register, login, refresh with rotation and reuse detection (`Session` stores SHA-256 hashes), logout. argon2id passwords.
- `users`: profile, password change, staff user management with cursor pagination.
- `seller`: `/platform/sellers` (`X-Platform-Key`), `/store` profile (with `brandColor`, which the shared seller centre themes itself with), settings and DNS-verified custom domains. CORS allows every active store host, `admin.<PLATFORM_DOMAIN>` (the shared seller centre; `admin` is a reserved slug) and `CORS_EXTRA_ORIGINS`.
- `category`, `products`: catalogue. `products/pricing.ts` is the one place that prices variants: price plus option deltas, with the discount used only for the "was" price.
- `cart`: guest token (`X-Guest-Token`) or user carts and wishlists, repriced on every read, and a merge after sign-in.
- `addresses`, `shipping`, `coupons` (`coupon-rules.ts` holds the discount logic; `isPublic` coupons are listed at `GET /coupons/public`).
- `orders`: `checkout.service.ts` (one transaction, `Idempotency-Key`), customer orders, staff order management (`order-status.ts` holds the status rules), `GET /admin/orders/summary`, `PATCH /admin/orders/:id/payment` and the printable invoices (`invoices.service.ts`, `GET /admin/orders/invoices`).
- `reviews`: buyers only; ratings recalculated in the same transaction. Up to 4 photos; comment threads (`comments.service.ts`).
- `uploads`: images stored in the database, served at `/api/v1/uploads/<id>`. Image fields take such a URL or an https link (`common/validators/is-image-url.decorator.ts`).
- `messages`: contact form and feedback (`POST /messages`), read by staff at `/admin/messages`.
- `chat`: one conversation per customer with the store (`/chat`), the staff inbox at `/admin/chats`; clients poll.
- `analytics`: the seller dashboard and the owner's sales report (JSON and PDF via PDFKit), in Dhaka time.
- `home-page`: the shop's home page as one JSON document per store (`HomePage`): the hero plus ordered sections, each validated by its own DTO class chosen by `type` (`dto/home-page.dto.ts`). `GET /store/home` is public (hidden sections only for staff); `PUT`/`DELETE` are staff. The seed writes NextPower's page from `prisma/seed-data/next-power-home.json` (`{product:<slug>}` becomes the product id) only when it has none.

### Tests

- `npm test`: unit specs next to the code.
- `npm run test:e2e`: the whole app against an in-memory Postgres (PGlite with every migration, `test/global-setup.ts`), with `DATABASE_POOL_SIZE=1` because PGlite is a single session. `test/helpers.ts` creates stores and users under random slugs, so files share the database.
- Known: about 1 in 3 to 1 in 7 e2e runs on Windows, a Vitest worker aborts with 0xC0000409 and the remaining files don't run. It isn't a test failure; see PLAN.md step 13.

Two integrations span files:

- **NestJS Observe instrumentation.** `src/app.module.ts` calls `createObserveModule()` and exports both `ObserveModule` and `ObserveInstrument`. `src/main.ts` passes `ObserveInstrument` to `NestFactory.create(AppModule, { instrument })`; if you refactor or split `AppModule`, keep that export reachable from `main.ts`. The agent is enabled only when `NODE_ENV=production` and `OBSERVE_APP_KEY`/`OBSERVE_APP_SECRET` are set; elsewhere, tests included, it is switched off.
- **Prisma 7 with the `pg` driver adapter.** Keep `prisma`, `@prisma/client` and `@prisma/adapter-pg` on the same 7.x version. A bare `npm i -D prisma` installs the 8.0 release candidate, a different toolchain with a contract-based workflow and no `schema.prisma`, so always pin `prisma@^7`.
  - `prisma/schema.prisma` uses the `prisma-client` generator, which writes TypeScript into `src/generated/prisma/`. That directory is gitignored (and therefore skipped by Prettier), is compiled by `nest build` along with the rest of `src/`, and is imported as `../generated/prisma/client.js`, not from `@prisma/client`. The datasource block has no `url`; the URL comes from `prisma.config.ts`, which reads `process.env.DATABASE_URL` directly (not `env()`, which throws) so that `prisma generate` works without a database.
  - `src/prisma/PrismaService` extends the generated `PrismaClient` and passes it a `PrismaPg` adapter. Its constructor throws if `DATABASE_URL` is missing. Its pool size comes from `DATABASE_POOL_SIZE` (default 10). `onModuleInit` calls `$connect()`; with a driver adapter that opens no connection, so an unreachable database shows up on the first query, or at `GET /api/v1/health`, which pings it. `onModuleDestroy` runs `$disconnect()`, which `app.enableShutdownHooks()` (in `configureApp`) triggers on SIGTERM/SIGINT.
  - `PrismaModule` is `@Global()` and imported once in `AppModule`, so feature modules inject `PrismaService` without importing it.
  - The `PrismaClient` constructor returns a Proxy, so `instanceof PrismaService` is `false`. In Vitest, `toBeInstanceOf` (or any assertion that has to print the instance) overflows the stack. Assert on its API instead.
- `npm run deploy` runs `nest deploy` (NestJS Mau, `@nestjs/mau`).
