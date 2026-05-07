import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { NotificationsService } from "./notifications.service.js";
import { TestChannelNotifyDto, UpdateChannelNotifyConfigDto } from "./notifications.dto.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/channel-notify")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("config")
  async getConfig(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.notificationsService.getChannelNotifyConfig(chatId, user);
  }

  @Patch("config")
  async updateConfig(
    @Param("chatId") chatId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateChannelNotifyConfigDto
  ) {
    return this.notificationsService.updateChannelNotifyConfig(chatId, user, dto);
  }

  @Post("test")
  async sendTest(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: TestChannelNotifyDto) {
    return this.notificationsService.testChannelNotify(chatId, user, dto);
  }
}
