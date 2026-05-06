import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import {
  CreateIntegrationWebhookDto,
  RotateIntegrationWebhookSecretDto,
  UpdateIntegrationWebhookDto
} from "./integrations.dto.js";
import { IntegrationsService } from "./integrations.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/webhooks")
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  async listWebhooks(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.integrationsService.listWebhooks(chatId, user);
  }

  @Post()
  async createWebhook(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateIntegrationWebhookDto) {
    return this.integrationsService.createWebhook(chatId, user, dto);
  }

  @Patch(":webhookId")
  async updateWebhook(
    @Param("chatId") chatId: string,
    @Param("webhookId") webhookId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateIntegrationWebhookDto
  ) {
    return this.integrationsService.updateWebhook(chatId, webhookId, user, dto);
  }

  @Post(":webhookId/rotate-secret")
  async rotateSecret(
    @Param("chatId") chatId: string,
    @Param("webhookId") webhookId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RotateIntegrationWebhookSecretDto = {}
  ) {
    return this.integrationsService.rotateSecret(chatId, webhookId, user, dto);
  }

  @Post(":webhookId/disable")
  async disableWebhook(@Param("chatId") chatId: string, @Param("webhookId") webhookId: string, @CurrentUser() user: RequestUser) {
    return this.integrationsService.disableWebhook(chatId, webhookId, user);
  }
}
