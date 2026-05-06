import { Controller, Delete, Get, Param, Post, Body, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { UpsertMemberProfileFieldDto } from "./member-profile-fields.dto.js";
import { MemberProfileFieldsService } from "./member-profile-fields.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/members/:userId/profile-fields")
export class MemberProfileFieldsController {
  constructor(private readonly memberProfileFieldsService: MemberProfileFieldsService) {}

  @Get()
  async listFields(@Param("chatId") chatId: string, @Param("userId") userId: string, @CurrentUser() user: RequestUser) {
    return this.memberProfileFieldsService.listFields(chatId, userId, user);
  }

  @Post()
  async upsertField(
    @Param("chatId") chatId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpsertMemberProfileFieldDto
  ) {
    return this.memberProfileFieldsService.upsertField(chatId, userId, user, dto);
  }

  @Delete(":fieldKey")
  async deleteField(
    @Param("chatId") chatId: string,
    @Param("userId") userId: string,
    @Param("fieldKey") fieldKey: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.memberProfileFieldsService.deleteField(chatId, userId, fieldKey, user);
  }
}
