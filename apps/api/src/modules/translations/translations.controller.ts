import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { TranslateMessageDto } from "./translations.dto.js";
import { TranslationsService } from "./translations.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/messages/:messageId")
export class TranslationsController {
  constructor(private readonly translationsService: TranslationsService) {}

  @Post("translate")
  async translate(
    @Param("chatId") chatId: string,
    @Param("messageId") messageId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: TranslateMessageDto
  ) {
    return this.translationsService.translateMessage(chatId, messageId, user, dto);
  }

  @Get("translations")
  async list(
    @Param("chatId") chatId: string,
    @Param("messageId") messageId: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.translationsService.listTranslations(chatId, messageId, user);
  }

  @Delete("translations/:targetLanguage")
  async delete(
    @Param("chatId") chatId: string,
    @Param("messageId") messageId: string,
    @Param("targetLanguage") targetLanguage: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.translationsService.deleteTranslation(chatId, messageId, targetLanguage, user);
  }
}
