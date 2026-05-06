import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { ExportHistoryQueryDto } from "./exports.dto.js";
import { ExportsService } from "./exports.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/export")
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get("history")
  async exportHistory(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Query() query: ExportHistoryQueryDto) {
    return this.exportsService.exportHistory(chatId, user, query);
  }
}
