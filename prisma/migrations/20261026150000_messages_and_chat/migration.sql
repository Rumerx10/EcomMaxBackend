-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('CONTACT', 'FEEDBACK');

-- CreateTable
CREATE TABLE "store_messages" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "userId" UUID,
    "kind" "MessageKind" NOT NULL,
    "topic" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "wantsReply" BOOLEAN NOT NULL DEFAULT false,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastMessage" TEXT NOT NULL DEFAULT '',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerUnread" INTEGER NOT NULL DEFAULT 0,
    "storeUnread" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "fromStore" BOOLEAN NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_messages_sellerId_createdAt_idx" ON "store_messages"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "store_messages_sellerId_isRead_createdAt_idx" ON "store_messages"("sellerId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "conversations_sellerId_lastMessageAt_idx" ON "conversations"("sellerId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_sellerId_id_key" ON "conversations"("sellerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_sellerId_userId_key" ON "conversations"("sellerId", "userId");

-- CreateIndex
CREATE INDEX "chat_messages_sellerId_conversationId_createdAt_idx" ON "chat_messages"("sellerId", "conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "store_messages" ADD CONSTRAINT "store_messages_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_messages" ADD CONSTRAINT "store_messages_sellerId_userId_fkey" FOREIGN KEY ("sellerId", "userId") REFERENCES "users"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_sellerId_userId_fkey" FOREIGN KEY ("sellerId", "userId") REFERENCES "users"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sellerId_conversationId_fkey" FOREIGN KEY ("sellerId", "conversationId") REFERENCES "conversations"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sellerId_senderId_fkey" FOREIGN KEY ("sellerId", "senderId") REFERENCES "users"("sellerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

