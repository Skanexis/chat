import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { AssignMemberTagDto } from "./member-tags.dto.js";
import { MemberTagsService } from "./member-tags.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/members/:userId/tags")
export class MemberTagsController {
  constructor(private readonly memberTagsService: MemberTagsService) {}

  @Post()
  async assignTag(
    @Param("chatId") chatId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AssignMemberTagDto
  ) {
    return this.memberTagsService.assignTag(chatId, userId, user, dto);
  }
}
