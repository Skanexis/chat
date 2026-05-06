import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { GetUnreadSummaryQueryDto } from "./unread-summary.dto.js";
import { UnreadSummaryService } from "./unread-summary.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/unread-summary")
export class UnreadSummaryController {
  constructor(private readonly unreadSummaryService: UnreadSummaryService) {}

  @Get()
  async getSummary(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Query() query: GetUnreadSummaryQueryDto) {
    return this.unreadSummaryService.getSummary(chatId, user, query);
  }
}
