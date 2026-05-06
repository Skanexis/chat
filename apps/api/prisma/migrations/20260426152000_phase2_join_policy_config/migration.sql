CREATE TABLE "JoinPolicy" (
    "chatId" TEXT NOT NULL,
    "defaultApprovalMode" "JoinApprovalMode" NOT NULL,
    "defaultTargetRoleId" TEXT,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JoinPolicy_pkey" PRIMARY KEY ("chatId")
);

ALTER TABLE "JoinPolicy"
ADD CONSTRAINT "JoinPolicy_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
