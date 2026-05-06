import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { BroadcastsService } from "./broadcasts.service.js";
import { CreateBroadcastDto, PublishNowDto, ScheduleBroadcastDto, UpdateBroadcastDto } from "./broadcasts.dto.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/broadcasts")
export class BroadcastsController {
  constructor(private readonly broadcastsService: BroadcastsService) {}

  @Get()
  async listCampaigns(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.broadcastsService.listCampaigns(chatId, user);
  }

  @Post()
  async createCampaign(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateBroadcastDto) {
    return this.broadcastsService.createCampaign(chatId, user, dto);
  }

  @Patch(":campaignId")
  async updateCampaign(
    @Param("chatId") chatId: string,
    @Param("campaignId") campaignId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateBroadcastDto
  ) {
    return this.broadcastsService.updateCampaign(chatId, campaignId, user, dto);
  }

  @Post(":campaignId/approve")
  async approveCampaign(@Param("chatId") chatId: string, @Param("campaignId") campaignId: string, @CurrentUser() user: RequestUser) {
    return this.broadcastsService.approveCampaign(chatId, campaignId, user);
  }

  @Post(":campaignId/schedule")
  async scheduleCampaign(
    @Param("chatId") chatId: string,
    @Param("campaignId") campaignId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ScheduleBroadcastDto
  ) {
    return this.broadcastsService.scheduleCampaign(chatId, campaignId, user, dto);
  }

  @Post(":campaignId/publish-now")
  async publishNow(
    @Param("chatId") chatId: string,
    @Param("campaignId") campaignId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: PublishNowDto = {}
  ) {
    return this.broadcastsService.publishNow(chatId, campaignId, user, dto);
  }

  @Post(":campaignId/pause")
  async pauseCampaign(@Param("chatId") chatId: string, @Param("campaignId") campaignId: string, @CurrentUser() user: RequestUser) {
    return this.broadcastsService.pauseCampaign(chatId, campaignId, user);
  }

  @Post(":campaignId/resume")
  async resumeCampaign(@Param("chatId") chatId: string, @Param("campaignId") campaignId: string, @CurrentUser() user: RequestUser) {
    return this.broadcastsService.resumeCampaign(chatId, campaignId, user);
  }

  @Post(":campaignId/cancel")
  async cancelCampaign(@Param("chatId") chatId: string, @Param("campaignId") campaignId: string, @CurrentUser() user: RequestUser) {
    return this.broadcastsService.cancelCampaign(chatId, campaignId, user);
  }

  @Get(":campaignId/stats")
  async getStats(@Param("chatId") chatId: string, @Param("campaignId") campaignId: string, @CurrentUser() user: RequestUser) {
    return this.broadcastsService.getCampaignStats(chatId, campaignId, user);
  }
}
