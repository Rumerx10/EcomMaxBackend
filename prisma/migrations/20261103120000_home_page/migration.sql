-- CreateTable
CREATE TABLE "home_pages" (
    "sellerId" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_pages_pkey" PRIMARY KEY ("sellerId")
);

-- AddForeignKey
ALTER TABLE "home_pages" ADD CONSTRAINT "home_pages_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

