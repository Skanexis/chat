import { Module } from "@nestjs/common";

import { BroadcastExecutionService } from "./broadcast-execution.service.js";
import { BroadcastQueueService } from "./broadcast-queue.service.js";
import { BroadcastsController } from "./broadcasts.controller.js";
import { BroadcastsService } from "./broadcasts.service.js";

@Module({
  controllers: [BroadcastsController],
  providers: [BroadcastsService, BroadcastExecutionService, BroadcastQueueService]
})
export class BroadcastsModule {}
