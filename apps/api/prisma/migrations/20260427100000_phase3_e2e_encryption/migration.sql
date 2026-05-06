-- Alter Message for E2E ciphertext envelope storage
ALTER TABLE "Message"
ADD COLUMN "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "encryptedPayload" JSONB;

-- E2E device key bundles (public material only)
CREATE TABLE "E2EDevice" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "signedPreKey" TEXT NOT NULL,
    "oneTimePreKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "fallbackKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastPreKeyRotationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "E2EDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "E2EDevice_chatId_userId_deviceId_key" ON "E2EDevice"("chatId", "userId", "deviceId");
CREATE INDEX "E2EDevice_chatId_userId_isActive_idx" ON "E2EDevice"("chatId", "userId", "isActive");
CREATE INDEX "E2EDevice_chatId_isActive_updatedAt_idx" ON "E2EDevice"("chatId", "isActive", "updatedAt");
CREATE INDEX "Message_chatId_authorId_createdAt_idx" ON "Message"("chatId", "authorId", "createdAt");

ALTER TABLE "E2EDevice"
ADD CONSTRAINT "E2EDevice_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "E2EDevice"
ADD CONSTRAINT "E2EDevice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
