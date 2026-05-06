import { Module } from "@nestjs/common";

import { PollsController } from "./polls.controller.js";
import { PollsService } from "./polls.service.js";

@Module({
  controllers: [PollsController],
  providers: [PollsService]
})
export class PollsModule {}
