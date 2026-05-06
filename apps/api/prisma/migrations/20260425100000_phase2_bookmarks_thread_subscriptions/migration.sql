CREATE TYPE "ThreadSubscriptionType" AS ENUM ('thread', 'message');

CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ThreadSubscription" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "subscriptionType" "ThreadSubscriptionType" NOT NULL,
    "telegramNotify" BOOLEAN NOT NULL DEFAULT false,
    "dedupWindowSeconds" INTEGER NOT NULL DEFAULT 300,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ThreadSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bookmark_chatId_userId_messageId_collection_isShared_key"
ON "Bookmark"("chatId", "userId", "messageId", "collection", "isShared");
CREATE INDEX "Bookmark_chatId_userId_createdAt_idx" ON "Bookmark"("chatId", "userId", "createdAt");
CREATE INDEX "Bookmark_chatId_messageId_idx" ON "Bookmark"("chatId", "messageId");

CREATE UNIQUE INDEX "ThreadSubscription_chatId_userId_messageId_subscriptionType_key"
ON "ThreadSubscription"("chatId", "userId", "messageId", "subscriptionType");
CREATE INDEX "ThreadSubscription_chatId_userId_createdAt_idx" ON "ThreadSubscription"("chatId", "userId", "createdAt");
CREATE INDEX "ThreadSubscription_chatId_isActive_idx" ON "ThreadSubscription"("chatId", "isActive");

ALTER TABLE "Bookmark"
ADD CONSTRAINT "Bookmark_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Bookmark"
ADD CONSTRAINT "Bookmark_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ThreadSubscription"
ADD CONSTRAINT "ThreadSubscription_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ThreadSubscription"
ADD CONSTRAINT "ThreadSubscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

