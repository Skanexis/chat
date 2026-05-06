import { Module } from "@nestjs/common";

import { IntegrationsController } from "./integrations.controller.js";
import { IntegrationsService } from "./integrations.service.js";
import { WebhookDispatcherService } from "./webhook-dispatcher.service.js";

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, WebhookDispatcherService]
})
export class IntegrationsModule {}
