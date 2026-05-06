ALTER TABLE "Ticket"
ADD COLUMN "slaBreachedAt" TIMESTAMP(3);

CREATE INDEX "Ticket_chatId_slaDueAt_idx" ON "Ticket"("chatId", "slaDueAt");
CREATE INDEX "Ticket_slaBreachedAt_idx" ON "Ticket"("slaBreachedAt");