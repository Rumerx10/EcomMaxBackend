// Checks the database rules in prisma/schema.prisma without a real database: turns the schema
// into SQL with `prisma migrate diff`, loads it into an in-memory Postgres (PGlite) and tries
// tenant isolation, the one-owner and one-default rules, guest checkout, delete rules,
// uniqueness and the checkout-style conditional updates.
//
// Setup (once): npm i -D @electric-sql/pglite@0.5.8
// Run from server/: node scripts/schema-check.mjs
import { execSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';

const sql = execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const db = new PGlite();
await db.exec(sql);
console.log('schema loaded into Postgres', (await db.query('show server_version')).rows[0].server_version);

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const uuid = () => crypto.randomUUID();
let failures = 0;
const expectOk = async (label, fn) => {
  try {
    await fn();
    console.log('ok      ', label);
  } catch (e) {
    failures++;
    console.log('FAILED  ', label, '->', e.message);
  }
};
const expectError = async (label, fn) => {
  try {
    await fn();
    failures++;
    console.log('FAILED  ', label, '-> no error');
  } catch (e) {
    console.log('blocked ', label, '->', e.message.split('\n')[0]);
  }
};

const addUser = async (s, role, phone) =>
  (await one(
    `insert into users (id, "sellerId", role, name, phone, "passwordHash", "updatedAt") values ($1, $2, $3, 'Tanvir Hasan', $4, 'hash', now()) returning id`,
    [uuid(), s, role, phone],
  )).id;
const addAddress = (s, u, isDefault) =>
  db.query(
    `insert into addresses (id, "sellerId", "userId", name, phone, district, thana, "villageOrWard", "isDefault", "updatedAt")
     values ($1, $2, $3, 'Tanvir Hasan', '+8801712345678', 'Dhaka', 'Mirpur', 'Ward 6', $4, now())`,
    [uuid(), s, u, isDefault],
  );
const addOrder = (s, u, number, extra = {}) =>
  one(
    `insert into orders (id, "sellerId", "orderNumber", "userId", "couponId", "idempotencyKey", subtotal, "totalAmount", "shippingMethod",
       "shipName", "shipPhone", "shipDistrict", "shipThana", "shipVillageOrWard", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, 19500, 20475, 'Inside Dhaka', 'Tanvir Hasan', '+8801712345678', 'Dhaka', 'Mirpur', 'Ward 6', now())
     returning id, "paymentMethod"`,
    [uuid(), s, number, u, extra.coupon ?? null, extra.key ?? null],
  );

// One seller with a bit of everything; `withOrder` adds an order with an item and payment.
const seed = async (slug, withOrder) => {
  const s = uuid();
  await db.query(`insert into sellers (id, name, slug, email, phone, "updatedAt") values ($1, $2, $2, $2 || '@x.com', '1', now())`, [s, slug]);
  await db.query(`insert into order_counters ("sellerId") values ($1)`, [s]);
  await db.query(
    `insert into seller_domains (id, "sellerId", hostname, "isPrimary", "verificationToken", "updatedAt") values ($1, $2, $3, true, 'tok', now())`,
    [uuid(), s, `shop.${slug}.com`],
  );
  const owner = await addUser(s, 'OWNER', '+8801700000000');
  const customer = await addUser(s, 'CUSTOMER', '+8801712345678');
  await db.query(
    `insert into sessions (id, "sellerId", "userId", "tokenHash", "expiresAt") values ($1, $2, $3, $4, now() + interval '30 days')`,
    [uuid(), s, customer, `hash-${slug}`],
  );
  const parent = uuid();
  const child = uuid();
  await db.query(`insert into categories (id, "sellerId", name, slug, "updatedAt") values ($1, $2, 'Solar', 'solar', now())`, [parent, s]);
  await db.query(`insert into categories (id, "sellerId", "parentId", name, slug, "updatedAt") values ($1, $2, $3, 'Panels', 'solar-panels', now())`, [child, s, parent]);
  const p = uuid();
  await db.query(
    `insert into products (id, "sellerId", "categoryId", title, slug, sku, price, stock, "updatedAt") values ($1, $2, $3, 'Panel', 'panel', 'GALAXY-570', 19500, 3, now())`,
    [p, s, child],
  );
  await db.query(`insert into product_images (id, "sellerId", "productId", url) values ($1, $2, $3, 'a.png')`, [uuid(), s, p]);
  const opt = uuid();
  await db.query(`insert into product_options (id, "sellerId", "productId", name) values ($1, $2, $3, 'Color')`, [opt, s, p]);
  await db.query(`insert into product_option_values (id, "sellerId", "optionId", label) values ($1, $2, $3, 'Black')`, [uuid(), s, opt]);
  await addAddress(s, customer, true);
  const guestCart = uuid();
  await db.query(`insert into carts (id, "sellerId", "guestToken", "updatedAt") values ($1, $2, 'guest-1', now())`, [guestCart, s]);
  await db.query(`insert into cart_items (id, "sellerId", "cartId", "productId", "updatedAt") values ($1, $2, $3, $4, now())`, [uuid(), s, guestCart, p]);
  const guestWishlist = uuid();
  await db.query(`insert into wishlists (id, "sellerId", "guestToken", "updatedAt") values ($1, $2, 'guest-1', now())`, [guestWishlist, s]);
  await db.query(`insert into wishlist_items ("sellerId", "wishlistId", "productId") values ($1, $2, $3)`, [s, guestWishlist, p]);
  await db.query(`insert into carts (id, "sellerId", "userId", "updatedAt") values ($1, $2, $3, now())`, [uuid(), s, customer]);
  await db.query(`insert into reviews (id, "sellerId", "productId", "userId", rating, comment, "updatedAt") values ($1, $2, $3, $4, 5, 'Great', now())`, [uuid(), s, p, customer]);
  const coupon = uuid();
  await db.query(`insert into coupons (id, "sellerId", code, "discountValue", "usageLimit", "updatedAt") values ($1, $2, 'SAVE10', 10, 1, now())`, [coupon, s]);
  await db.query(`insert into shipping_rates (id, "sellerId", name, price, "updatedAt") values ($1, $2, 'Inside Dhaka', 80, now())`, [uuid(), s]);
  let o = null;
  if (withOrder) {
    o = (await addOrder(s, customer, 1001, { coupon, key: 'checkout-1' })).id;
    await db.query(
      `insert into order_items (id, "sellerId", "orderId", "productId", title, sku, "unitPrice", quantity, "totalPrice") values ($1, $2, $3, $4, 'Panel', 'GALAXY-570', 19500, 1, 19500)`,
      [uuid(), s, o, p],
    );
    await db.query(`insert into payments (id, "sellerId", "orderId", method, amount, "transactionId", "updatedAt") values ($1, $2, $3, 'BKASH', 20475, 'TRX1', now())`, [uuid(), s, o]);
    await db.query(`insert into order_events (id, "sellerId", "orderId", status, title) values ($1, $2, $3, 'PENDING', 'Order placed')`, [uuid(), s, o]);
  }
  return { s, owner, customer, parent, child, p, coupon, o, guestCart, guestWishlist };
};

let A, B;
await expectOk('seed seller A (with an order) and seller B (no sales); same SKU, phone, coupon code and guest token in both', async () => {
  A = await seed('next-power', true);
  B = await seed('other-store', false);
});

console.log('\n-- sellers and domains');
await expectError('a second seller with the same slug (subdomain)', () =>
  db.query(`insert into sellers (id, name, slug, email, phone, "updatedAt") values ($1, 'x', 'next-power', 'x', '1', now())`, [uuid()]),
);
await expectError("seller B claiming seller A's hostname", () =>
  db.query(`insert into seller_domains (id, "sellerId", hostname, "verificationToken", "updatedAt") values ($1, $2, 'shop.next-power.com', 't', now())`, [uuid(), B.s]),
);
await expectError('a second primary domain for seller A', () =>
  db.query(`insert into seller_domains (id, "sellerId", hostname, "isPrimary", "verificationToken", "updatedAt") values ($1, $2, 'np.com.bd', true, 't', now())`, [uuid(), A.s]),
);
await expectOk('a second, non-primary domain for seller A', () =>
  db.query(`insert into seller_domains (id, "sellerId", hostname, "verificationToken", "updatedAt") values ($1, $2, 'np.com.bd', 't', now())`, [uuid(), A.s]),
);
await expectOk('resolve a hostname to its seller', async () => {
  const row = await one(`select "sellerId" from seller_domains where hostname = 'np.com.bd'`);
  if (row.sellerId !== A.s) throw new Error('wrong seller');
});

console.log('\n-- roles');
await expectError('a second OWNER for seller A', () => addUser(A.s, 'OWNER', '+8801711111111'));
await expectOk('managers and customers alongside the owner', async () => {
  await addUser(A.s, 'MANAGER', '+8801722222222');
  await addUser(A.s, 'MANAGER', '+8801733333333');
});
await expectError('a second account with the same phone in one seller', () => addUser(A.s, 'CUSTOMER', '+8801712345678'));
await expectError("A's session for B's user", () =>
  db.query(`insert into sessions (id, "sellerId", "userId", "tokenHash", "expiresAt") values ($1, $2, $3, 'h2', now())`, [uuid(), A.s, B.customer]),
);

console.log('\n-- guest checkout');
await expectOk('checkout as a guest: create the customer, save the address, move the cart and wishlist, take a number, place the order', async () => {
  await db.transaction(async (tx) => {
    const u = (await tx.query(
      `insert into users (id, "sellerId", name, phone, "passwordHash", "updatedAt") values ($1, $2, 'Rahim', '+8801899999999', 'hash', now()) returning id, role`,
      [uuid(), A.s],
    )).rows[0];
    if (u.role !== 'CUSTOMER') throw new Error(`new user got role ${u.role}`);
    await tx.query(
      `insert into addresses (id, "sellerId", "userId", name, phone, district, thana, "villageOrWard", "isDefault", "updatedAt")
       values ($1, $2, $3, 'Rahim', '+8801899999999', 'Gazipur', 'Kaliakair', 'Mouchak', true, now())`,
      [uuid(), A.s, u.id],
    );
    await tx.query(`update carts set "userId" = $1, "guestToken" = null where id = $2`, [u.id, A.guestCart]);
    await tx.query(`update wishlists set "userId" = $1, "guestToken" = null where id = $2`, [u.id, A.guestWishlist]);
    const { lastNumber } = (await tx.query(`update order_counters set "lastNumber" = "lastNumber" + 1 where "sellerId" = $1 returning "lastNumber"`, [A.s])).rows[0];
    if (lastNumber !== 1001) throw new Error(`took number ${lastNumber}`);
    await tx.query(
      `insert into orders (id, "sellerId", "orderNumber", "userId", subtotal, "totalAmount", "shippingMethod",
         "shipName", "shipPhone", "shipDistrict", "shipThana", "shipVillageOrWard", "updatedAt")
       values ($1, $2, 1002, $3, 19500, 20555, 'Outside Dhaka', 'Rahim', '+8801899999999', 'Gazipur', 'Kaliakair', 'Mouchak', now())`,
      [uuid(), A.s, u.id],
    );
  });
  const { n } = await one(`select count(*)::int as n from cart_items where "cartId" = $1`, [A.guestCart]);
  if (n !== 1) throw new Error('cart items lost when the cart moved to the user');
  const { method } = await one(`select "paymentMethod" as method from orders where "orderNumber" = 1002 and "sellerId" = $1`, [A.s]);
  if (method !== 'COD') throw new Error(`default payment method is ${method}`);
});
await expectError('the same checkout submitted twice (same idempotency key)', () => addOrder(A.s, A.customer, 1003, { key: 'checkout-1' }));
await expectError('a second cart for one user', () =>
  db.query(`insert into carts (id, "sellerId", "userId", "updatedAt") values ($1, $2, $3, now())`, [uuid(), A.s, A.customer]),
);
await expectError('two guest carts with the same token in one seller', () =>
  db.query(`insert into carts (id, "sellerId", "guestToken", "updatedAt") values ($1, $2, 'guest-1', now())`, [uuid(), B.s]),
);
await expectError('a second default address for one user', () => addAddress(A.s, A.customer, true));
await expectOk('more non-default addresses for that user', async () => {
  await addAddress(A.s, A.customer, false);
  await addAddress(A.s, A.customer, false);
});

console.log('\n-- tenant isolation');
await expectError("an item in A's cart pointing at B's product", () =>
  db.query(`insert into cart_items (id, "sellerId", "cartId", "productId", "updatedAt") values ($1, $2, $3, $4, now())`, [uuid(), A.s, A.guestCart, B.p]),
);
await expectError("A's order for B's customer", () => addOrder(A.s, B.customer, 1004));
await expectError("A's order item pointing at B's product", () =>
  db.query(
    `insert into order_items (id, "sellerId", "orderId", "productId", title, sku, "unitPrice", quantity, "totalPrice") values ($1, $2, $3, $4, 'x', 'x', 1, 1, 1)`,
    [uuid(), A.s, A.o, B.p],
  ),
);
await expectError("A's product in B's category", () => db.query(`update products set "categoryId" = $1 where id = $2`, [B.child, A.p]));
await expectError("A's order using B's coupon", () => db.query(`update orders set "couponId" = $1 where id = $2`, [B.coupon, A.o]));
await expectError("B's guest cart moved to A's customer", () => db.query(`update carts set "userId" = $1 where id = $2`, [A.customer, B.guestCart]));
await expectError("a review on A's product by B's customer", () =>
  db.query(`insert into reviews (id, "sellerId", "productId", "userId", rating, comment, "updatedAt") values ($1, $2, $3, $4, 1, 'x', now())`, [uuid(), A.s, A.p, B.customer]),
);

console.log('\n-- uniqueness');
await expectError('the same order number twice in one seller', () => addOrder(A.s, A.customer, 1001));
await expectError('the same bKash transaction recorded twice', () =>
  db.query(`insert into payments (id, "sellerId", "orderId", method, amount, "transactionId", "updatedAt") values ($1, $2, $3, 'BKASH', 1, 'TRX1', now())`, [uuid(), A.s, A.o]),
);

console.log('\n-- delete rules');
await expectError('delete a product that has been ordered', () => db.query(`delete from products where id = $1`, [A.p]));
await expectError('delete a category that still has products', () => db.query(`delete from categories where id = $1`, [A.child]));
await expectError('delete a parent category with subcategories', () => db.query(`delete from categories where id = $1`, [A.parent]));
await expectError('delete a customer who has orders', () => db.query(`delete from users where id = $1`, [A.customer]));
await expectError('delete an order that has payments', () => db.query(`delete from orders where id = $1`, [A.o]));
await expectError('delete seller A, which has sales', () => db.query(`delete from sellers where id = $1`, [A.s]));
await expectOk('delete seller B: its domains, users, sessions, catalogue, carts and wishlists go with it', async () => {
  await db.query(`delete from sellers where id = $1`, [B.s]);
  const tables = ['seller_domains', 'order_counters', 'users', 'sessions', 'categories', 'products', 'product_images', 'product_options', 'product_option_values', 'addresses', 'carts', 'cart_items', 'wishlists', 'wishlist_items', 'reviews', 'coupons', 'shipping_rates'];
  for (const t of tables) {
    const { n } = await one(`select count(*)::int as n from ${t} where "sellerId" = $1`, [B.s]);
    if (n) throw new Error(`${n} rows left in ${t}`);
  }
});
await expectOk("seller A's rows are untouched", async () => {
  const { n } = await one(`select count(*)::int as n from products where "sellerId" = $1`, [A.s]);
  if (n !== 1) throw new Error(`expected 1 product, found ${n}`);
});

console.log('\n-- checkout-style transaction');
await expectOk('stock 3: taking 2 succeeds, then taking 2 more is refused and the whole transaction rolls back', async () => {
  await db.transaction(async (tx) => {
    const r = await tx.query(`update products set stock = stock - 2 where id = $1 and stock >= 2`, [A.p]);
    if (r.affectedRows !== 1) throw new Error('first take failed');
  });
  await db
    .transaction(async (tx) => {
      await tx.query(`update order_counters set "lastNumber" = "lastNumber" + 1 where "sellerId" = $1`, [A.s]);
      const r = await tx.query(`update products set stock = stock - 2 where id = $1 and stock >= 2`, [A.p]);
      if (r.affectedRows !== 1) throw new Error('out of stock');
    })
    .catch((e) => {
      if (e.message !== 'out of stock') throw e;
    });
  const { stock } = await one(`select stock from products where id = $1`, [A.p]);
  const { n } = await one(`select "lastNumber" as n from order_counters where "sellerId" = $1`, [A.s]);
  if (stock !== 1 || n !== 1001) throw new Error(`stock ${stock}, lastNumber ${n}`);
});
await expectOk('coupon with usageLimit 1: the second use is refused', async () => {
  const take = `update coupons set "usedCount" = "usedCount" + 1 where id = $1 and ("usageLimit" is null or "usedCount" < "usageLimit")`;
  const first = await db.query(take, [A.coupon]);
  const second = await db.query(take, [A.coupon]);
  if (first.affectedRows !== 1 || second.affectedRows !== 0) throw new Error('limit not enforced');
});

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
