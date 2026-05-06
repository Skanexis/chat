import { Module } from "@nestjs/common";

import { UnreadSummaryController } from "./unread-summary.controller.js";
import { UnreadSummaryService } from "./unread-summary.service.js";

@Module({
  controllers: [UnreadSummaryController],
  providers: [UnreadSummaryService]
})
export class UnreadSummaryModule {}
