import { Module } from "@nestjs/common";

import { MemberTagsController } from "./member-tags.controller.js";
import { MemberTagsService } from "./member-tags.service.js";

@Module({
  controllers: [MemberTagsController],
  providers: [MemberTagsService],
  exports: [MemberTagsService]
})
export class MemberTagsModule {}
