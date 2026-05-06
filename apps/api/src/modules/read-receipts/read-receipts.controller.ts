import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { MarkReadReceiptDto, UpdateReadReceiptPrivacyDto } from "./read-receipts.dto.js";
import { ReadReceiptsService } from "./read-receipts.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/read-receipts")
export class ReadReceiptsController {
  constructor(private readonly readReceiptsService: ReadReceiptsService) {}

  @Get("privacy")
  async getPrivacy(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.readReceiptsService.getPrivacy(chatId, user);
  }

  @Patch("privacy")
  async updatePrivacy(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: UpdateReadReceiptPrivacyDto) {
    return this.readReceiptsService.updatePrivacy(chatId, user, dto);
  }

  @Post(":messageId/mark")
  async markRead(
    @Param("chatId") chatId: string,
    @Param("messageId") messageId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: MarkReadReceiptDto = {}
  ) {
    return this.readReceiptsService.markRead(chatId, messageId, user, dto);
  }

  @Get(":messageId")
  async getReadReceipts(@Param("chatId") chatId: string, @Param("messageId") messageId: string, @CurrentUser() user: RequestUser) {
    return this.readReceiptsService.getReadReceipts(chatId, messageId, user);
  }
}
