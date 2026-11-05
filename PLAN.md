# Platform plan

The to-do list for building the multi-tenant e-commerce platform. Work through the steps in order, tick each box when it is done and verified, and keep the decisions below unless the owner changes them.

## Goal

A SaaS e-commerce engine, similar to Shopify. One backend (NestJS 12, Prisma 7, PostgreSQL) serves many independent sellers. Each seller has their own frontend with its own design, reached through a subdomain (`<slug>.<platform domain>`) or a custom domain. NextPower (solar equipment, Bangladesh) is the first seller, and its frontend is today's `../client`.

Scale target per seller: about 1,000 products and 100,000 to 1,000,000 customers.

## Decisions already made

1. **Tenant = `Seller`.** Every table has `sellerId` with a foreign key to `sellers`. Links between seller-owned tables are composite foreign keys, `(sellerId, xId) -> (sellerId, id)`, so Postgres rejects a row that points at another seller's data. Every table has an index that starts with `sellerId`.
2. **Users per seller.** There are three roles: `OWNER` (the seller, exactly one per store, enforced by a partial unique index), `MANAGER` and `CUSTOMER`. Accounts belong to one store, so the same phone number can register at two stores. Users sign in with phone + password; email is optional.
3. **Guests can shop.** `Cart` and `Wishlist` rows are found by a `guestToken`. Checkout, cash on delivery included, takes:
   - name and phone;
   - a Bangladesh address: district, thana/upazila and village/ward, plus optional house/road and post code;
   - a password.

   It then creates the `CUSTOMER` user inside the checkout transaction. Logging in first is never required.
4. **Order numbers count per seller** in `OrderCounter`. `Order.idempotencyKey` stops a double submit from creating two orders.
5. **Sales history is `Restrict`.** Sellers are suspended, users deactivated and products archived; they are not deleted.
6. **Field types.** Ids are UUIDv7 (`@db.Uuid`) and money is `Decimal(12, 2)`. Orders copy prices and the address at checkout. Partial indexes use Prisma's `partialIndexes` preview feature.

### How a request finds its seller (built in step 3)

- **The identifier.** Every frontend request names the host the store was served from, in the `X-Seller-Host` header. Frontend servers (SSR) set it themselves; the shared API client sets it in browsers. A missing header falls back to the `Origin` host, then to `Host`.
- **Lookup.**
  1. Normalise the host: lowercase, no port, no trailing dot.
  2. A host ending in `.<PLATFORM_DOMAIN>` maps to `Seller.slug`.
  3. Any other host must match a `SellerDomain.hostname` that has `verifiedAt` set.
- **Seller status.** A seller that isn't `ACTIVE` gets 403 on the storefront. Its OWNER and MANAGERs can still sign in to set the store up.
- **Caching.** Results are cached in memory for about 60 seconds (Redis later). The cache is cleared when a domain or seller status changes.
- **The header is not authentication.** It only chooses which public store is being viewed. Every private route needs a JWT, and the token's `sellerId` must equal the resolved seller, so a token from store A is refused on store B.
- **Request context.** The resolved seller is stored in request context (AsyncLocalStorage via `nestjs-cls`) and read with `@CurrentSeller()`.
- **Exceptions.** Routes that aren't tied to one store (health, platform onboarding, payment webhooks, which find the seller from the payment) opt out with `@NoTenant()`.

### Data access rule (built in step 4)

- Services never query seller-owned models through the raw `PrismaService`. They use `TenantPrisma`, a Prisma client extension that adds the current `sellerId` to `where` (reads, updates, deletes) and to `data` (creates) for every model that has a `sellerId` field.
- Unique lookups use the compound keys, for example `{ sellerId_id: { sellerId, id } }`.
- Later, as a second line of defence: Postgres row-level security keyed on `app.seller_id`.

## To do

### 0. Schema: done

- [x] Multi-tenant `prisma/schema.prisma`, 22 models: `Seller`, `SellerDomain`, `OrderCounter`, `User`, `Session`, `Category`, `Product`, `ProductImage`, `ProductOption`, `ProductOptionValue`, `Address`, `Cart`, `CartItem`, `Wishlist`, `WishlistItem`, `Review`, `Coupon`, `ShippingRate`, `Order`, `OrderItem`, `Payment`, `OrderEvent`. The comment at the top of the file states the rules.
- [x] `scripts/schema-check.mjs`: 35 database-level checks in an in-memory Postgres. All passed on 2026-10-25, together with `prisma validate`, `tsc`, lint and the unit tests.

### 1. Database setup: done

- [x] `.env.example` with `PORT`, `DATABASE_URL`, `DIRECT_URL`, `PLATFORM_DOMAIN`, `CORS_EXTRA_ORIGINS`, the JWT secrets and the `SEED_OWNER_*` values. `prisma.config.ts` uses `DIRECT_URL` for Migrate, because Neon's pooler breaks it, and falls back to `DATABASE_URL`.
- [x] First migration, `prisma/migrations/20261025103656_init`, generated from the schema. On 2026-10-25, `migrate deploy` applied it to an empty local Postgres (PGlite).
- [x] **Applied to Neon** (2026-10-26): the owner dropped the old empty `vendor` table, then `npx prisma migrate deploy` (4 migrations so far) and `npm run db:seed`.
- [x] **On Neon** (2026-11-02): `20261029100000_invoice_settings` and `20261029120000_store_brand_color`. Until they ran, every store lookup failed with P2022 (column does not exist).
- [x] **On Neon** (2026-11-03): `20261103120000_home_page`, and NextPower's home page saved from `seed-data/next-power-home.json` by a one-off script (the full seed was not re-run, as it rewrites product images).
- [x] `prisma/seed.ts` (`npm run db:seed`), registered in `prisma.config.ts`. It seeds:
  - NextPower (`next-power`: ACTIVE, 5% VAT, installation fee 15,000) with its `OrderCounter`;
  - the OWNER user from the `SEED_OWNER_*` env values, password hashed with argon2id;
  - 7 categories and 27 products with 80 images and options, from `prisma/seed-data/next-power.json` (exported from the client's mock catalogue);
  - the client's 3 shipping rates and the `SAVE10` coupon.

  Ratings start at 0, because the client's star ratings were placeholders. Running it a second time updates the same rows; tested locally.
- [x] `npm run db:check` runs `scripts/schema-check.mjs`; 35 checks pass. Dependencies added: `argon2` (also used by auth in step 5), and the dev packages `tsx` and `@electric-sql/pglite`.
- Done when: migrate and seed work on an empty database (done locally), and `npm run db:check` passes (done).

### 2. App foundation: done (2026-10-25)

- [x] `@nestjs/config` with `src/config/env.validation.ts`: every variable is validated at startup and the process stops on a bad one. Tests never read `.env` (`ignoreEnvFile` under `NODE_ENV=test`).
- [x] `src/app.setup.ts` (`configureApp`, shared by `main.ts` and the e2e tests):
  - helmet, a 1 MB JSON body limit, `TRUST_PROXY`, shutdown hooks;
  - the global prefix `api/v1`, with Swagger at `/api/docs` outside production (the owner's choices from their `main.ts`);
  - CORS that allows any active or pending store host, worked out per request, plus `CORS_EXTRA_ORIGINS`.
- [x] Global `ValidationPipe` with whitelist, forbidNonWhitelisted and transform. `enableImplicitConversion` is off, because it turned `?isActive=false` into `true` (tested); DTOs convert with `@Type` and `@Transform`.
- [x] The owner's `main.ts` fixed: ESM import, `ObserveInstrument` passed again, `tagsSorter`; env now comes from ConfigModule.
- [x] `PrismaExceptionFilter`:
  - P2002 → 409, naming the field (read from the pg adapter's index name), or a message of its own for each partial index;
  - P2003/P2014 → 409, P2025 → 404, P2034 → 409;
  - anything else → a bare 500 that is logged.
- [x] Throttler: 600/min per IP globally, 10/min on register and login, off under test.
- [x] `GET /api/v1/health` (database ping) replaces the starter "Hello World"; the store lookup skips it.
- [x] The owner's `src/common` and `src/modules` (auth, users, category) were reworked onto this schema and architecture:
  - passport, bcrypt and the refresh-token JWT were dropped;
  - the broken generated spec stubs were removed;
  - the empty `src/seller` scaffold became `src/modules/seller`.
- [ ] Structured logs with request id and seller id: moved to step 13.

### 3. Seller resolution (tenant middleware): done

- [x] `src/tenant/`:
  - `host.ts` (normalisation, reserved slugs);
  - `TenantService.resolve(host)`: subdomain by slug, custom domain only when verified; 60 s cache, 10 s for misses, at most 10k entries, `invalidate()`;
  - `TenantMiddleware` uses `X-Seller-Host` only when it is present, else `Origin`, else `Host` (only when it is a store), and keeps the result in `TenantContext` (AsyncLocalStorage; no nestjs-cls needed);
  - the global `TenantGuard`: 400 without a store, 404 for an unknown host, 403 for SUSPENDED/CLOSED, PENDING only for staff routes and sign-in;
  - the decorators `@NoTenant()`, `@AllowPendingStore()` and `@CurrentSeller()`.
- [x] Unit tests (host, service, guard) and e2e `test/tenant.e2e-spec.ts` (two stores on the same path, custom domain, pending, suspended, Origin fallback, CORS).

### 4. Tenant-scoped Prisma: done

- [x] `TenantPrismaService.db`, a Prisma extension (`tenant-scope.ts`):
  - adds the current `sellerId` to every where and create on every model except `Seller`;
  - refuses another seller's id, compound keys included, and refuses `seller: { connect }`;
  - fails closed with no store in the context.
- [x] `tenant-scope.spec.ts` checks the model list against `schema.prisma`. The e2e tests try cross-store reads, updates, deletes and links (users, categories, domains, sessions): all 404 or 401.

### 5. Authentication: done

- [x] argon2id hashing, with a dummy verify so unknown phones take as long as wrong passwords. `@IsBdPhone()` normalises numbers to `+8801XXXXXXXXX`. Passwords are 8 to 128 characters with no composition rules (the owner's regex was dropped).
- [x] `POST /api/v1/auth/register`, `login`, `refresh`, `logout`, `logout-all`:
  - the refresh token is 32 random bytes, stored as a SHA-256 hash in `Session`, and rotates on every refresh;
  - reuse, or a lost race, revokes all of that user's sessions.
- [x] The access JWT (HS256, 15 min) carries `{ sub, sellerId, role }`. Tokens are returned in the body: headless frontends keep them in their own first-party cookies (BFF), because the API's domain differs from the store domains.
- [x] Global `JwtAuthGuard`: default deny, `@Public()` opt-out; a token only works at the store that issued it. Global `RolesGuard` with `@Roles(...)`.
- [x] Users: profile, password change (ends all sessions and returns new tokens), closing the account (deactivates it), and the staff list with cursor pagination and phone/name search.
- [ ] A lockout per phone after repeated failures, and a cleanup job for expired sessions: moved to step 13.

### 6. Seller onboarding and settings: done

- [x] `POST /api/v1/platform/sellers` (`X-Platform-Key` = `PLATFORM_API_KEY`, constant-time compare): seller, `OrderCounter` and OWNER in one transaction, with reserved slugs refused. Also `GET /platform/sellers` and `PATCH /platform/sellers/:id/status`.
- [x] Custom domains (OWNER):
  - add one; platform subdomains, junk and taken hostnames are refused, and a store has at most 10;
  - verify it through the TXT record `_store-verification.<host>` = `store-verification=<token>` (the resolver can be swapped in tests);
  - the first verified domain becomes primary; make another primary, or remove one; the cache is cleared each time.
- [x] `GET /store` (public profile), `GET/PATCH /store/settings` (staff). Money is a 2-decimal string.
- [x] Staff: the owner adds managers (`POST /users/managers`) and changes roles; managers can only block or unblock customers; nobody can edit the owner.
- [x] e2e `test/store.e2e-spec.ts`, `test/users.e2e-spec.ts`.
- [x] Home page builder (2026-11-03, `src/modules/home-page`): `GET /store/home` (public; shoppers get visible sections, staff all), `PUT /store/home` and `DELETE /store/home` (staff; back to the default).
  - One `HomePage` row per seller (`sellerId` is the key, like `OrderCounter`) holding `{ hero, sections }` as JSON, validated on save by `SaveHomePageDto`: each section class is picked by its `type` (class-transformer discriminator), and an unknown type fails. The hero is separate so it always comes first; sections are saved in the order sent.
  - Section types: features, categories, promoCards, products (popular / trending / latest / deals / category / manual), banners (several become a carousel in the shop), billboard, combo, videos, steps, help. A save checks that the products and categories it names are in the store.
  - Links are shop paths without the shop's prefix (`/products?category=x`) or https links; `//host` is refused. Images are uploads or https links (`IsImageUrl`).
  - Combo offers: the cart still prices each product on its own; the combo names a coupon, made in Coupons, that brings the total to the combo price at checkout. Real bundle pricing in the cart would be a later step.
  - No row means the generic default page (`home-page.defaults.ts`). The seed creates NextPower's page once (`update: {}`), so re-seeding never undoes staff edits.

### 7. Catalogue: done

- [x] Categories CRUD (`src/modules/category`, the owner's module reworked): a tree with cycle checks, slugs unique per store, product counts (shoppers count only ACTIVE products), delete only when empty.
- [x] Products (`src/modules/products`):
  - CRUD with images, options and values written in one go; on update, images and options are replaced only when sent;
  - duplicate SKU/slug → 409; at most 3 options, unique option names and value labels;
  - description HTML sanitised with the client's `xss` allowlist;
  - DRAFT and ARCHIVED are hidden from shoppers; a product that has been ordered can't be deleted (409, archive it instead);
  - `PATCH /products/bulk` for the bulk editor, all or nothing.
- [x] Storefront: list with category (subcategories included), search (title, brand, SKU), price range, in stock, tag, brand, popular/trending/latest, sort and page; staff also filter by status and low stock. Detail by id or slug. Money as strings, with `originalPrice` (the "was" price), `priceRange` and `costPrice` (staff only).
- [x] `pricing.ts`, shared with cart and checkout: `price` is what the buyer pays, plus option deltas; `discountPercent` only makes the "was" price (as in the client's `lib/products.ts`).
- [x] Image upload (2026-10-26): `POST /uploads` stores JPEG/PNG/WebP up to 2 MB in the database (`Upload`), served at `GET /api/v1/uploads/<id>`. Every image field (product images and option images, category, avatar, store logo, review photos) takes such an upload URL or an https link (`common/validators/is-image-url.decorator.ts`).
- [ ] Move uploads to S3-compatible storage when the database grows too big for them; this needs a storage provider and keys from the owner.
- [ ] Search with a `pg_trgm` index once ILIKE gets slow (it is fine for about 1k products per store).

### 8. Cart and wishlist: done

- [x] `src/modules/cart`: guests get a 32-byte guest token with their first cart or wishlist, returned in the body and the `X-Guest-Token` header and sent back the same way; signed-in users have one cart each.
- [x] Add (quantities add up, capped at stock; options checked and normalised), change, remove, clear. Every read reprices from today's products and flags `unavailable` / `out_of_stock` / `not_enough_stock` / `options_changed` lines, which are left out of the subtotal.
- [x] `POST /cart/merge` after sign-in moves the guest cart (quantities add up) and wishlist to the account.
- [x] Wishlist: save, which is idempotent, and remove; the same guest token works for both.
- [ ] Cleanup of abandoned guest carts and wishlists: step 13, with the session cleanup.

### 9. Checkout and orders: done

- [x] `POST /api/v1/checkout` (`src/modules/orders/checkout.service.ts`) needs an `Idempotency-Key` header; the same key returns the same order (200, `created: false`), and only to the same buyer.
  - **Guests** give name, phone and password. A new phone gets an account in the same transaction; a known phone needs the matching password, otherwise 409. The guest is signed in with the response, their address is saved as the default, and their guest wishlist moves to the account.
  - **Signed-in users** use a saved `addressId`, or a new address with optional `saveAddress`.
  - **One transaction:**
    1. reprice the cart; any problem line → 409 listing the lines;
    2. take stock with a conditional decrement, products sorted by id so two checkouts can't deadlock;
    3. count the coupon use (optimistic when the coupon has a limit);
    4. totals as the client works them out: VAT on (subtotal − discount), then shipping and installation added;
    5. create the user and address if needed, take the order number (`OrderCounter`, as late as possible), write the order, items (with cost snapshot), payment and first event;
    6. empty the cart.
  - Retried on P2034. A race on the same key returns the winner's order.
- [x] Customer: `GET /orders` (cursor), `GET /orders/:id`, `POST /orders/:id/cancel` (PENDING/PROCESSING and unpaid only).
- [x] Staff: `GET /admin/orders` (status, payment status, dates, search by order number/phone/name), `GET /admin/orders/:id` (with customer and unit costs), `PATCH /admin/orders/:id/status`.
  - `GET /admin/orders/summary` (2026-10-26): order counts by status and money by payment status over all orders, for the orders and payments pages.
  - `PATCH /admin/orders/:id/payment` with `PAID` (cash received, bank transfer) or `REFUNDED`; not twice, not for a cancelled order, and refunds only of paid orders.
  - Order summaries carry `previewImages` (first 4 item pictures) and `paidAt`.
  - Invoices (2026-10-29): `GET /admin/orders/invoices?ids=<id,id>` or `?status=PROCESSING` (at most 50, oldest first) returns the store once (name, logo, address, contact, website, `taxId`, `invoiceNote`) and each order with its delivery address, items, totals, amount paid and `amountDue` (nothing for paid, cancelled or returned orders). `Seller.taxId` (VAT registration, BIN) and `Seller.invoiceNote` are store settings. No costs are included. The client prints them as A4 sheets: a parcel label on the top half and the invoice on the bottom.
  - The rules are in `order-status.ts`; a change applies only if the status is still the expected one.
  - CANCELLED/RETURNED restock unless `restock: false`.
  - DELIVERED marks cash on delivery PAID; CANCELLED marks pending payments FAILED.
  - Every change adds an `OrderEvent`.
- [x] Built for checkout (also part of step 11): `src/modules/addresses` (address book, one default), `src/modules/shipping` (public active list, staff CRUD), `src/modules/coupons` (staff CRUD, public `POST /coupons/check`).
- [x] e2e `test/checkout.e2e-spec.ts` (two buyers racing for the last unit, totals, rollback, lifecycle, isolation) and `test/shop-setup.e2e-spec.ts`.

### 10. Payments

- [x] Cash on delivery: the `Payment` row starts `PENDING` and becomes `PAID` on delivery, or when staff mark the cash received (`PATCH /admin/orders/:id/payment`, which also records refunds).
- [ ] bKash, Nagad and SSLCommerz (cards):
  - create the payment and redirect;
  - verify the signature on the callback;
  - stay idempotent through the unique `(method, transactionId)`;
  - refunds.

### 11. Reviews, coupons and shipping rates: done

- [x] Reviews (`src/modules/reviews`):
  - only for a product from one of the user's DELIVERED orders, one per user and product;
  - edit and delete your own; staff delete any;
  - staff hide/show (`PATCH /admin/reviews/:id`); hidden reviews leave the rating;
  - every change recalculates `ratingAvg`/`ratingCount` in the same transaction;
  - public `GET /products/:id/reviews` with a star distribution; authors appear as "Tanvir H.";
  - `GET /reviews/mine` and `GET /reviews/to-review` for the client's account pages; reviews carry their `product` (title, slug, thumbnail).
  - up to 4 photos per review, and comment threads with one level of replies (`comments.service.ts`); staff can answer (shown as the store) and hide comments.
- [x] Coupon CRUD for admins, plus a validation endpoint for the cart (done in step 9). `isPublic` coupons are listed at `GET /coupons/public` (active, started, not ended, not used up) for the shop's coupons page and hero.
- [x] Shipping rate CRUD for admins (done in step 9).

### 12. Dashboards and notifications: dashboard done

- [x] `GET /admin/analytics?range=today|week|month|year` (`src/modules/analytics`), matching the client's dashboard ranges, in Dhaka time (`period.ts`):
  - totals compared with the previous period: revenue, orders, average order, units, profit (where a cost price exists), new customers;
  - a series by hour, day or month (revenue, orders, units, profit); status counts; top products; revenue and units by category and by tag (home/business);
  - a weekday × two-hour heatmap; low stock.
  - Cancelled and returned orders are left out. Raw SQL names `sellerId` explicitly and uses the (sellerId, createdAt) index.
- [x] Dashboard charts (2026-10-28): units sold over time, revenue and profit over time on one money axis, and units by category as a donut with a numbers / percent switch in the middle.
- [x] Sales report for the owner (2026-10-28): `GET /admin/reports/sales?period=day|week|month|year|all&date=YYYY-MM-DD` and the same as an A4 PDF at `/admin/reports/sales/pdf` (`sales-report.*.ts`, drawn with PDFKit). Calendar periods in Dhaka time (`report-period.ts`): a day by hour, a Monday-to-Sunday week and a month by day, a year by month, all time from the first order by month (by year past 24 months). Totals with how revenue adds up, paid and still to collect, statuses, per-period table, categories, top 20 products. `OWNER` only; the seller centre's dashboard has a "Download PDF" dialog. PDF amounts carry no ৳ (the standard PDF fonts lack it), and non-Latin product names would need an embedded font.
- [ ] The client's visit funnel needs visitor tracking (page views, add-to-cart events), which doesn't exist; the dashboard shows new customers and profit margin in its place.
- [ ] Precomputed daily summaries, when a store's year view gets slow (step 13).
- [ ] New order, low stock and weekly summary notifications by email or SMS, through a queue. Skipped for now at the owner's request (2026-10-26); this needs an email/SMS provider (and Redis for the queue). `Seller.notify*` already stores the choices, and the settings page says nothing is sent yet.
- [x] Messages to the store (2026-10-26, `src/modules/messages`): the contact page and the customer feedback page `POST /messages`; staff read, mark and delete them at `/admin/messages`.
- [x] Customer chat (2026-10-26, `src/modules/chat`): one conversation per customer with the store, `GET /chat`, `POST /chat/messages`, `POST /chat/read`; staff inbox `GET /admin/chats` and per conversation read and reply. Unread counters are kept on the conversation; clients poll (5 s with the chat open). A websocket push can replace polling later.

### 13. Scale and operations

- [ ] PgBouncer and pool sizing. Redis for the tenant cache, rate limits and queues (BullMQ).
- [ ] Load test with data at target scale (several sellers, 1M users each, 1,000 products each) and check the query plans (`EXPLAIN ANALYZE`).
- [ ] When tables reach tens of millions of rows: hash-partition `users`, `orders` and `order_items` by `sellerId`. This needs hand-written migration SQL.
- [ ] Postgres row-level security as a second line of defence.
- [ ] Backups, monitoring (real NestJS Observe keys), and a CI pipeline: lint, tests, schema check, `migrate deploy`.
- [ ] Structured logs (JSON) with request id and seller id. Moved here from step 2.
- [ ] Moved here from step 5:
  - lockout per phone number after repeated failed sign-ins (the IP limit alone doesn't stop attempts from many IPs; needs Redis or a table);
  - a scheduled job that deletes sessions that expired more than 30 days ago (`sessions.expiresAt` is indexed).
- [ ] **Known test-runner crash (Windows):** about 1 in 3 to 1 in 7 `npm run test:e2e` runs, a Vitest worker dies with exit code 0xC0000409 (Windows `abort()`/fast-fail), with nothing on stderr; the tests that ran all pass. Not the app's logic:
  - it happens with argon2 swapped for scrypt, with NestJS Observe switched off, and with forks or threads;
  - the API itself showed no crash (production build smoke test, unit tests).
  - Next: try Node 22 LTS, or Linux CI, to tell a Node 24 / Windows problem from ours; `DATABASE_POOL_SIZE` is already 1 under e2e (PGlite is a single session).
  - Seen once outside Vitest (2026-10-27): the API (`node dist/main.js`, against PGlite) stopped during a browser smoke test with nothing logged. Three more full runs passed. Git Bash reports exit code 127 for a kill as well as a crash, so this one is unconfirmed.
  - pg prints "Calling client.query() when the client is already executing a query is deprecated" once per run (e2e and the API on PGlite, first seen after the chat tests). Tests pass; find the concurrent query (likely inside a Prisma transaction) before moving to pg 9.
- [ ] With several API instances, the tenant cache clears only on the instance that made the change; others catch up within 60 s. Publish invalidations over Redis when that is too slow.

### 14. Frontends (separate per seller, in a monorepo)

- [x] One seller centre for every store (2026-10-29): `/admin/<store>/...` in `client/src/app/admin` and `client/src/components/admin`, moved out of `/next-power/admin` (old addresses redirect). The store comes from the address (its slug, or a domain of its own) and with it the API requests, a sign-in per store (one browser can manage several), the name and logo in the sidebar, sign-in page and browser tab, and the colours: `Seller.brandColor` (Settings → Brand colour) becomes the whole brand palette, light and dark, with white button text kept at 4.5:1. `/admin` lists the stores this browser has managed. Shared building blocks moved to `client/src/components/common`. CORS allows `admin.<PLATFORM_DOMAIN>`, so the seller centre can also run on its own domain. Checked in the browser with NextPower and a second store made through `/platform/sellers`.
- [ ] A workspace monorepo with Turborepo:
  - `apps/admin`: the shared seller centre (`client/src/app/admin` with `components/admin`, `components/common`, `components/invoice`);
  - `apps/next-power`: today's `../client` without the seller centre;
  - `packages/ui`: shadcn primitives from `client/src/components/ui`;
  - `packages/api-client`: a typed SDK generated from the OpenAPI spec, which sets `X-Seller-Host`;
  - `packages/config`: shared ESLint, tsconfig and Prettier settings.
- [ ] Inside its own app, NextPower can serve from `/`, so the `/next-power` route prefix in today's client can go.
- [x] Every page works on the API (2026-10-27), through React Query (`client/src/lib/query/`, one file of hooks per area; `lib/api/` has the fetch client, API types and mappers). Redux only keeps the checkout choices (delivery option, coupon, installation).
  - Storefront: catalogue, categories, product pages with reviews (photos, comments), cart, wishlist, coupons, checkout at `/next-power/checkout` (cash on delivery; a guest's order creates the account), chat, contact form.
  - Account: login (phone or username), profile with photo, address book, orders and cancelling, reviews and to-review, feedback, settings (password, sign out everywhere, close account). Pages for signed-in users and staff are guarded (`RequireAuth`).
  - Seller centre: dashboard (`/admin/analytics`), products, product form, bulk editor, orders and payments, customers and team, reviews, coupons, chats, messages, settings (store details and logo, checkout fees, alerts, delivery options, domains).
  - Checked with a browser walkthrough (Playwright with the PC's Edge) against a throwaway PGlite database: 31 steps from guest checkout to delivery, review, comment and chat, with no console or API errors.
- [x] Map field names between client and server (`lib/api/mappers.ts`; client ids are now strings).
- [ ] Payment gateways (bKash, Nagad, SSLCommerz) and email/SMS notifications are skipped for now at the owner's request; the UI offers cash on delivery only, and the store's copy says online payments are coming.

## Open questions

These have working defaults, so they don't block anything.

- **Platform admin** (approving and suspending sellers, billing): not yet. Onboarding is protected by a platform key. Add a `PlatformAdmin` model and subscription plans when billing starts.
- **Tenant header name:** `X-Seller-Host`.
- **One customer account across stores:** no, accounts are per seller.
- **Sign-in id:** phone; email is optional.
- **Platform domain:** the `PLATFORM_DOMAIN` env variable, `myplatform.com` until there is a real one.

## How to resume

1. Read this file and `CLAUDE.md`.
2. Start at the first unticked box.
3. After each step, run `npm run lint`, `npm test` and `npx tsc --noEmit`, plus `node scripts/schema-check.mjs` if the schema changed. Then tick the box.
