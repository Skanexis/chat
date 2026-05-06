CREATE TABLE "MemberProfileField" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberProfileField_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberProfileField_chatId_userId_key_key" ON "MemberProfileField"("chatId", "userId", "key");
CREATE INDEX "MemberProfileField_chatId_userId_createdAt_idx" ON "MemberProfileField"("chatId", "userId", "createdAt");
CREATE INDEX "MemberProfileField_chatId_key_idx" ON "MemberProfileField"("chatId", "key");

ALTER TABLE "MemberProfileField"
ADD CONSTRAINT "MemberProfileField_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberProfileField"
ADD CONSTRAINT "MemberProfileField_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;