CREATE TYPE "JoinApprovalMode" AS ENUM ('auto', 'manual');

ALTER TABLE "Invite"
ADD COLUMN "approvalMode" "JoinApprovalMode" NOT NULL DEFAULT 'manual',
ADD COLUMN "targetRoleId" TEXT;

CREATE INDEX "Invite_chatId_approvalMode_idx" ON "Invite"("chatId", "approvalMode");
