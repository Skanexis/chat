CREATE TYPE "JoinRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "maxUses" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JoinRequest" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inviteCode" TEXT,
    "note" TEXT,
    "status" "JoinRequestStatus" NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invite_chatId_code_key" ON "Invite"("chatId", "code");
CREATE INDEX "Invite_chatId_createdAt_idx" ON "Invite"("chatId", "createdAt");
CREATE INDEX "Invite_chatId_revokedAt_idx" ON "Invite"("chatId", "revokedAt");
CREATE INDEX "JoinRequest_chatId_status_createdAt_idx" ON "JoinRequest"("chatId", "status", "createdAt");
CREATE INDEX "JoinRequest_chatId_userId_createdAt_idx" ON "JoinRequest"("chatId", "userId", "createdAt");

ALTER TABLE "Invite"
ADD CONSTRAINT "Invite_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JoinRequest"
ADD CONSTRAINT "JoinRequest_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JoinRequest"
ADD CONSTRAINT "JoinRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;