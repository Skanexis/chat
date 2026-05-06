import { Module } from "@nestjs/common";

import { MemberProfileFieldsController } from "./member-profile-fields.controller.js";
import { MemberProfileFieldsService } from "./member-profile-fields.service.js";

@Module({
  controllers: [MemberProfileFieldsController],
  providers: [MemberProfileFieldsService],
  exports: [MemberProfileFieldsService]
})
export class MemberProfileFieldsModule {}
