CREATE TABLE "MemberTag" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberTag_chatId_userId_tag_key" ON "MemberTag"("chatId", "userId", "tag");
CREATE INDEX "MemberTag_chatId_tag_idx" ON "MemberTag"("chatId", "tag");
CREATE INDEX "MemberTag_chatId_userId_createdAt_idx" ON "MemberTag"("chatId", "userId", "createdAt");

ALTER TABLE "MemberTag"
ADD CONSTRAINT "MemberTag_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberTag"
ADD CONSTRAINT "MemberTag_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
