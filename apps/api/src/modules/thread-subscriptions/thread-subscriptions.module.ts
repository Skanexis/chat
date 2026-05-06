import { Module } from "@nestjs/common";

import { ThreadSubscriptionsController } from "./thread-subscriptions.controller.js";
import { ThreadSubscriptionsService } from "./thread-subscriptions.service.js";

@Module({
  controllers: [ThreadSubscriptionsController],
  providers: [ThreadSubscriptionsService]
})
export class ThreadSubscriptionsModule {}

