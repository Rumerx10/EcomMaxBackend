-- AlterTable
ALTER TABLE "users" ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "review_comments" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "parentId" UUID,
    "body" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_comments_sellerId_reviewId_createdAt_idx" ON "review_comments"("sellerId", "reviewId", "createdAt");

-- CreateIndex
CREATE INDEX "review_comments_sellerId_parentId_createdAt_idx" ON "review_comments"("sellerId", "parentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_comments_sellerId_id_key" ON "review_comments"("sellerId", "id");

-- CreateIndex
CREATE INDEX "uploads_sellerId_createdAt_idx" ON "uploads"("sellerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_sellerId_username_key" ON "users"("sellerId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_sellerId_id_key" ON "reviews"("sellerId", "id");

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_sellerId_reviewId_fkey" FOREIGN KEY ("sellerId", "reviewId") REFERENCES "reviews"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_sellerId_userId_fkey" FOREIGN KEY ("sellerId", "userId") REFERENCES "users"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_sellerId_parentId_fkey" FOREIGN KEY ("sellerId", "parentId") REFERENCES "review_comments"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

