CREATE TABLE "ReputationEvent" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReputationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReputationEvent_chatId_userId_createdAt_idx"
ON "ReputationEvent"("chatId", "userId", "createdAt");
CREATE INDEX "ReputationEvent_chatId_createdAt_idx"
ON "ReputationEvent"("chatId", "createdAt");

ALTER TABLE "ReputationEvent"
ADD CONSTRAINT "ReputationEvent_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReputationEvent"
ADD CONSTRAINT "ReputationEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
