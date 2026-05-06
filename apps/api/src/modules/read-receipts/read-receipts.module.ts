import { Module } from "@nestjs/common";

import { ReadReceiptsController } from "./read-receipts.controller.js";
import { ReadReceiptsService } from "./read-receipts.service.js";

@Module({
  controllers: [ReadReceiptsController],
  providers: [ReadReceiptsService]
})
export class ReadReceiptsModule {}
