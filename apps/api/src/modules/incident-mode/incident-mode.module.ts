import { Module } from "@nestjs/common";

import { IncidentModeController } from "./incident-mode.controller.js";
import { IncidentModeAutoRollbackService } from "./incident-mode-auto-rollback.service.js";
import { IncidentModeService } from "./incident-mode.service.js";

@Module({
  controllers: [IncidentModeController],
  providers: [IncidentModeService, IncidentModeAutoRollbackService]
})
export class IncidentModeModule {}
