CREATE TYPE "AutomationExecutionStatus" AS ENUM ('success', 'failed', 'skipped');

CREATE TABLE "AutomationExecution" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "triggerType" "AutomationTriggerType" NOT NULL,
    "inputPayload" JSONB NOT NULL,
    "status" "AutomationExecutionStatus" NOT NULL,
    "actionsCount" INTEGER NOT NULL,
    "error" TEXT,
    "executedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationExecution_chatId_ruleId_createdAt_idx" ON "AutomationExecution"("chatId", "ruleId", "createdAt");
CREATE INDEX "AutomationExecution_chatId_triggerType_createdAt_idx" ON "AutomationExecution"("chatId", "triggerType", "createdAt");

ALTER TABLE "AutomationExecution"
ADD CONSTRAINT "AutomationExecution_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationExecution"
ADD CONSTRAINT "AutomationExecution_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id")
ON DELETE CASCADE ON UPDATE CASCADE;