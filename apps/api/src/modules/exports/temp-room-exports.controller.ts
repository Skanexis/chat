import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { ExportHistoryQueryDto } from "./exports.dto.js";
import { ExportsService } from "./exports.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/temp-rooms/:tempRoomId/export")
export class TempRoomExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get("history")
  async exportHistory(
    @Param("chatId") chatId: string,
    @Param("tempRoomId") tempRoomId: string,
    @CurrentUser() user: RequestUser,
    @Query() query: ExportHistoryQueryDto
  ) {
    return this.exportsService.exportTempRoomHistory(chatId, tempRoomId, user, query);
  }
}
