import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { CreateKeywordAlertDto } from "./alerts.dto.js";
import { AlertsService } from "./alerts.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/alerts/keywords")
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  async createKeywordAlert(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateKeywordAlertDto) {
    return this.alertsService.createKeywordAlert(chatId, user, dto);
  }

  @Get()
  async listKeywordAlerts(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.alertsService.listKeywordAlerts(chatId, user);
  }

  @Delete(":alertId")
  async deleteKeywordAlert(@Param("chatId") chatId: string, @Param("alertId") alertId: string, @CurrentUser() user: RequestUser) {
    return this.alertsService.deleteKeywordAlert(chatId, alertId, user);
  }
}
