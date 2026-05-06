import { Module } from "@nestjs/common";

import { LimitsController } from "./limits.controller.js";
import { LimitsService } from "./limits.service.js";

@Module({
  controllers: [LimitsController],
  providers: [LimitsService]
})
export class LimitsModule {}
