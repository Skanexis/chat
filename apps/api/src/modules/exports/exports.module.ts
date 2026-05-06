import { Module } from "@nestjs/common";

import { ExportsController } from "./exports.controller.js";
import { ExportsService } from "./exports.service.js";
import { TempRoomExportsController } from "./temp-room-exports.controller.js";

@Module({
  controllers: [ExportsController, TempRoomExportsController],
  providers: [ExportsService]
})
export class ExportsModule {}
