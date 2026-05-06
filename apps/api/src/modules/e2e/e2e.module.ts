import { Module } from "@nestjs/common";

import { E2EController } from "./e2e.controller.js";
import { E2EService } from "./e2e.service.js";

@Module({
  controllers: [E2EController],
  providers: [E2EService],
  exports: [E2EService]
})
export class E2EModule {}
