-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('personal', 'team', 'moderator');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('scheduled', 'sent', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "ReadReceiptMode" AS ENUM ('off', 'private', 'role_visible', 'global');

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reminderType" "ReminderType" NOT NULL,
    "targetRoleId" TEXT,
    "note" TEXT,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "telegramNotify" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReminderStatus" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeywordAlert" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "isRegex" BOOLEAN NOT NULL,
    "caseSensitive" BOOLEAN NOT NULL,
    "dedupWindowSeconds" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadReceipt" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadReceiptPreference" (
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "ReadReceiptMode" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadReceiptPreference_pkey" PRIMARY KEY ("chatId","userId")
);

-- CreateTable
CREATE TABLE "ReadReceiptPolicy" (
    "chatId" TEXT NOT NULL,
    "allowCrossRoleView" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadReceiptPolicy_pkey" PRIMARY KEY ("chatId")
);

-- CreateIndex
CREATE INDEX "Reminder_chatId_userId_remindAt_idx" ON "Reminder"("chatId", "userId", "remindAt");

-- CreateIndex
CREATE INDEX "Reminder_status_remindAt_idx" ON "Reminder"("status", "remindAt");

-- CreateIndex
CREATE INDEX "KeywordAlert_chatId_userId_createdAt_idx" ON "KeywordAlert"("chatId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "KeywordAlert_chatId_isActive_idx" ON "KeywordAlert"("chatId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "KeywordAlert_chatId_userId_normalizedKeyword_isRegex_caseSe_key" ON "KeywordAlert"("chatId", "userId", "normalizedKeyword", "isRegex", "caseSensitive");

-- CreateIndex
CREATE INDEX "ReadReceipt_chatId_messageId_readAt_idx" ON "ReadReceipt"("chatId", "messageId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReadReceipt_messageId_userId_key" ON "ReadReceipt"("messageId", "userId");

-- CreateIndex
CREATE INDEX "ReadReceiptPreference_chatId_userId_idx" ON "ReadReceiptPreference"("chatId", "userId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeywordAlert" ADD CONSTRAINT "KeywordAlert_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeywordAlert" ADD CONSTRAINT "KeywordAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadReceipt" ADD CONSTRAINT "ReadReceipt_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadReceipt" ADD CONSTRAINT "ReadReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadReceipt" ADD CONSTRAINT "ReadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadReceiptPreference" ADD CONSTRAINT "ReadReceiptPreference_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadReceiptPreference" ADD CONSTRAINT "ReadReceiptPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadReceiptPolicy" ADD CONSTRAINT "ReadReceiptPolicy_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
