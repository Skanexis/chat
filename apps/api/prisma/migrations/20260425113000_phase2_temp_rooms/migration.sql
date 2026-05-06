CREATE TYPE "TempRoomStatus" AS ENUM ('active', 'archived');

CREATE TABLE "TempRoom" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" "TempRoomStatus" NOT NULL,
    "inheritPermissions" BOOLEAN NOT NULL,
    "permissionOverrides" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TempRoom_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TempRoom_chatId_createdAt_idx" ON "TempRoom"("chatId", "createdAt");
CREATE INDEX "TempRoom_chatId_status_idx" ON "TempRoom"("chatId", "status");

ALTER TABLE "TempRoom"
ADD CONSTRAINT "TempRoom_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
