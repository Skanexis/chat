import { Module } from "@nestjs/common";

import { TicketsController } from "./tickets.controller.js";
import { TicketsSlaWorkerService } from "./tickets-sla-worker.service.js";
import { TicketsService } from "./tickets.service.js";

@Module({
  controllers: [TicketsController],
  providers: [TicketsService, TicketsSlaWorkerService],
  exports: [TicketsService]
})
export class TicketsModule {}
