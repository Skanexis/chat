import { Module } from "@nestjs/common";

import { TempRoomAutoArchiveService } from "./temp-room-auto-archive.service.js";
import { TempRoomsController } from "./temp-rooms.controller.js";
import { TempRoomsService } from "./temp-rooms.service.js";

@Module({
  controllers: [TempRoomsController],
  providers: [TempRoomsService, TempRoomAutoArchiveService],
  exports: [TempRoomsService]
})
export class TempRoomsModule {}
