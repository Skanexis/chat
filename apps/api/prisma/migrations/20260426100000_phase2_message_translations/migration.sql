CREATE TABLE "MessageTranslation" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "translatedText" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessageTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageTranslation_chatId_messageId_targetLanguage_key" ON "MessageTranslation"("chatId", "messageId", "targetLanguage");
CREATE INDEX "MessageTranslation_chatId_messageId_createdAt_idx" ON "MessageTranslation"("chatId", "messageId", "createdAt");
CREATE INDEX "MessageTranslation_chatId_targetLanguage_idx" ON "MessageTranslation"("chatId", "targetLanguage");

ALTER TABLE "MessageTranslation"
ADD CONSTRAINT "MessageTranslation_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageTranslation"
ADD CONSTRAINT "MessageTranslation_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id")
ON DELETE CASCADE ON UPDATE CASCADE;