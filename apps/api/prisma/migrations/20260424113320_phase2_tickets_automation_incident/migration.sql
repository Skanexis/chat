-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'in_progress', 'waiting', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "AutomationTriggerType" AS ENUM ('message_created', 'member_joined', 'ticket_overdue', 'limit_hit');

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "assigneeId" TEXT,
    "slaDueAt" TIMESTAMP(3),
    "labels" TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" "AutomationTriggerType" NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "isEnabled" BOOLEAN NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentModeLog" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "enabledBy" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3) NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "policySnapshot" JSONB NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "IncidentModeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ticket_chatId_createdAt_idx" ON "Ticket"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_chatId_status_idx" ON "Ticket"("chatId", "status");

-- CreateIndex
CREATE INDEX "Ticket_chatId_assigneeId_idx" ON "Ticket"("chatId", "assigneeId");

-- CreateIndex
CREATE INDEX "AutomationRule_chatId_createdAt_idx" ON "AutomationRule"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationRule_chatId_triggerType_idx" ON "AutomationRule"("chatId", "triggerType");

-- CreateIndex
CREATE INDEX "IncidentModeLog_chatId_enabledAt_idx" ON "IncidentModeLog"("chatId", "enabledAt");

-- CreateIndex
CREATE INDEX "IncidentModeLog_chatId_disabledAt_idx" ON "IncidentModeLog"("chatId", "disabledAt");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentModeLog" ADD CONSTRAINT "IncidentModeLog_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
