-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SellerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('COD', 'CARD', 'BKASH', 'NAGAD', 'ROCKET', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "sellers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "SellerStatus" NOT NULL DEFAULT 'PENDING',
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "supportHours" TEXT,
    "logoUrl" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "installationFee" DECIMAL(12,2),
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "notifyNewOrder" BOOLEAN NOT NULL DEFAULT true,
    "notifyLowStock" BOOLEAN NOT NULL DEFAULT true,
    "notifyWeeklySummary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_domains" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_counters" (
    "sellerId" UUID NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "order_counters_pkey" PRIMARY KEY ("sellerId")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(12,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "weight" DECIMAL(10,3),
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "specs" JSONB NOT NULL DEFAULT '[]',
    "warrantyInfo" TEXT,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "trending" BOOLEAN NOT NULL DEFAULT false,
    "latest" BOOLEAN NOT NULL DEFAULT false,
    "ratingAvg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_options" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option_values" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "priceDelta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "swatch" TEXT,
    "imageUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_option_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "thana" TEXT NOT NULL,
    "villageOrWard" TEXT NOT NULL,
    "addressLine" TEXT,
    "postCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "userId" UUID,
    "guestToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlists" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "userId" UUID,
    "guestToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "sellerId" UUID NOT NULL,
    "wishlistId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("sellerId","wishlistId","productId")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DECIMAL(12,2) NOT NULL,
    "minOrderAmount" DECIMAL(12,2),
    "maxDiscountAmount" DECIMAL(12,2),
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_rates" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "estimate" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "userId" UUID NOT NULL,
    "couponId" UUID,
    "idempotencyKey" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'COD',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "installationFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "couponCode" TEXT,
    "shippingMethod" TEXT NOT NULL,
    "note" TEXT,
    "shipName" TEXT NOT NULL,
    "shipPhone" TEXT NOT NULL,
    "shipDistrict" TEXT NOT NULL,
    "shipThana" TEXT NOT NULL,
    "shipVillageOrWard" TEXT NOT NULL,
    "shipAddressLine" TEXT,
    "shipPostCode" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "variant" TEXT,
    "imageUrl" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "unitCost" DECIMAL(12,2),
    "quantity" INTEGER NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "transactionId" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "OrderStatus",
    "title" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sellers_slug_key" ON "sellers"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "seller_domains_hostname_key" ON "seller_domains"("hostname");

-- CreateIndex
CREATE INDEX "seller_domains_sellerId_idx" ON "seller_domains"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "seller_domains_one_primary" ON "seller_domains"("sellerId") WHERE ("isPrimary" = true);

-- CreateIndex
CREATE INDEX "users_sellerId_role_createdAt_idx" ON "users"("sellerId", "role", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_sellerId_id_key" ON "users"("sellerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_sellerId_phone_key" ON "users"("sellerId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_sellerId_email_key" ON "users"("sellerId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_one_owner_per_seller" ON "users"("sellerId") WHERE ("role" = 'OWNER');

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_sellerId_userId_idx" ON "sessions"("sellerId", "userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "categories_sellerId_parentId_idx" ON "categories"("sellerId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_sellerId_id_key" ON "categories"("sellerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_sellerId_slug_key" ON "categories"("sellerId", "slug");

-- CreateIndex
CREATE INDEX "products_sellerId_status_createdAt_idx" ON "products"("sellerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "products_sellerId_categoryId_status_idx" ON "products"("sellerId", "categoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_sellerId_id_key" ON "products"("sellerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "products_sellerId_sku_key" ON "products"("sellerId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_sellerId_slug_key" ON "products"("sellerId", "slug");

-- CreateIndex
CREATE INDEX "product_images_sellerId_productId_position_idx" ON "product_images"("sellerId", "productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "product_options_sellerId_id_key" ON "product_options"("sellerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_options_sellerId_productId_name_key" ON "product_options"("sellerId", "productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_option_values_sellerId_optionId_label_key" ON "product_option_values"("sellerId", "optionId", "label");

-- CreateIndex
CREATE INDEX "addresses_sellerId_userId_idx" ON "addresses"("sellerId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "addresses_one_default_per_user" ON "addresses"("sellerId", "userId") WHERE ("isDefault" = true);

-- CreateIndex
CREATE INDEX "carts_sellerId_updatedAt_idx" ON "carts"("sellerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "carts_sellerId_id_key" ON "carts"("sellerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_sellerId_userId_key" ON "carts"("sellerId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "carts_sellerId_guestToken_key" ON "carts"("sellerId", "guestToken");

-- CreateIndex
CREATE INDEX "cart_items_sellerId_productId_idx" ON "cart_items"("sellerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_sellerId_cartId_productId_variant_key" ON "cart_items"("sellerId", "cartId", "productId", "variant");

-- CreateIndex
CREATE INDEX "wishlists_sellerId_updatedAt_idx" ON "wishlists"("sellerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_sellerId_id_key" ON "wishlists"("sellerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_sellerId_userId_key" ON "wishlists"("sellerId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_sellerId_guestToken_key" ON "wishlists"("sellerId", "guestToken");

-- CreateIndex
CREATE INDEX "wishlist_items_sellerId_productId_idx" ON "wishlist_items"("sellerId", "productId");

-- CreateIndex
CREATE INDEX "reviews_sellerId_productId_createdAt_idx" ON "reviews"("sellerId", "productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_sellerId_userId_productId_key" ON "reviews"("sellerId", "userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_sellerId_id_key" ON "coupons"("sellerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_sellerId_code_key" ON "coupons"("sellerId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_rates_sellerId_name_key" ON "shipping_rates"("sellerId", "name");

-- CreateIndex
CREATE INDEX "orders_sellerId_createdAt_idx" ON "orders"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_sellerId_status_createdAt_idx" ON "orders"("sellerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_sellerId_userId_createdAt_idx" ON "orders"("sellerId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_sellerId_couponId_idx" ON "orders"("sellerId", "couponId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_sellerId_id_key" ON "orders"("sellerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_sellerId_orderNumber_key" ON "orders"("sellerId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "orders_sellerId_idempotencyKey_key" ON "orders"("sellerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "order_items_sellerId_orderId_idx" ON "order_items"("sellerId", "orderId");

-- CreateIndex
CREATE INDEX "order_items_sellerId_productId_idx" ON "order_items"("sellerId", "productId");

-- CreateIndex
CREATE INDEX "payments_sellerId_orderId_idx" ON "payments"("sellerId", "orderId");

-- CreateIndex
CREATE INDEX "payments_sellerId_status_createdAt_idx" ON "payments"("sellerId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_method_transactionId_key" ON "payments"("method", "transactionId");

-- CreateIndex
CREATE INDEX "order_events_sellerId_orderId_createdAt_idx" ON "order_events"("sellerId", "orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "seller_domains" ADD CONSTRAINT "seller_domains_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_counters" ADD CONSTRAINT "order_counters_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_sellerId_userId_fkey" FOREIGN KEY ("sellerId", "userId") REFERENCES "users"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_sellerId_parentId_fkey" FOREIGN KEY ("sellerId", "parentId") REFERENCES "categories"("sellerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_sellerId_categoryId_fkey" FOREIGN KEY ("sellerId", "categoryId") REFERENCES "categories"("sellerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_sellerId_productId_fkey" FOREIGN KEY ("sellerId", "productId") REFERENCES "products"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_sellerId_productId_fkey" FOREIGN KEY ("sellerId", "productId") REFERENCES "products"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_sellerId_optionId_fkey" FOREIGN KEY ("sellerId", "optionId") REFERENCES "product_options"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_sellerId_userId_fkey" FOREIGN KEY ("sellerId", "userId") REFERENCES "users"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_sellerId_userId_fkey" FOREIGN KEY ("sellerId", "userId") REFERENCES "users"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_sellerId_cartId_fkey" FOREIGN KEY ("sellerId", "cartId") REFERENCES "carts"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_sellerId_productId_fkey" FOREIGN KEY ("sellerId", "productId") REFERENCES "products"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_sellerId_userId_fkey" FOREIGN KEY ("sellerId", "userId") REFERENCES "users"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_sellerId_wishlistId_fkey" FOREIGN KEY ("sellerId", "wishlistId") REFERENCES "wishlists"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_sellerId_productId_fkey" FOREIGN KEY ("sellerId", "productId") REFERENCES "products"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_sellerId_productId_fkey" FOREIGN KEY ("sellerId", "productId") REFERENCES "products"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_sellerId_userId_fkey" FOREIGN KEY ("sellerId", "userId") REFERENCES "users"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sellerId_userId_fkey" FOREIGN KEY ("sellerId", "userId") REFERENCES "users"("sellerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sellerId_couponId_fkey" FOREIGN KEY ("sellerId", "couponId") REFERENCES "coupons"("sellerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_sellerId_orderId_fkey" FOREIGN KEY ("sellerId", "orderId") REFERENCES "orders"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_sellerId_productId_fkey" FOREIGN KEY ("sellerId", "productId") REFERENCES "products"("sellerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sellerId_orderId_fkey" FOREIGN KEY ("sellerId", "orderId") REFERENCES "orders"("sellerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_sellerId_orderId_fkey" FOREIGN KEY ("sellerId", "orderId") REFERENCES "orders"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

