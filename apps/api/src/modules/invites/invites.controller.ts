import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import {
  CreateInviteDto,
  CreateJoinRequestDto,
  ListJoinRequestsQueryDto,
  RejectJoinRequestDto,
  RotateInviteCodeDto,
  UpdateInviteDto,
  UpdateJoinPolicyDto,
  UseInviteDto
} from "./invites.dto.js";
import { InvitesService } from "./invites.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId")
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Get("invites")
  async listInvites(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.invitesService.listInvites(chatId, user);
  }

  @Post("invites")
  async createInvite(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateInviteDto) {
    return this.invitesService.createInvite(chatId, user, dto);
  }

  @Post("invites/:inviteId/revoke")
  async revokeInvite(@Param("chatId") chatId: string, @Param("inviteId") inviteId: string, @CurrentUser() user: RequestUser) {
    return this.invitesService.revokeInvite(chatId, inviteId, user);
  }

  @Patch("invites/:inviteId")
  async updateInvite(
    @Param("chatId") chatId: string,
    @Param("inviteId") inviteId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateInviteDto
  ) {
    return this.invitesService.updateInvite(chatId, inviteId, user, dto);
  }

  @Post("invites/:inviteId/rotate-code")
  async rotateInviteCode(
    @Param("chatId") chatId: string,
    @Param("inviteId") inviteId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RotateInviteCodeDto
  ) {
    return this.invitesService.rotateInviteCode(chatId, inviteId, user, dto);
  }

  @Post("invites/use")
  async useInvite(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: UseInviteDto) {
    return this.invitesService.useInvite(chatId, user, dto);
  }

  @Get("join-requests")
  async listJoinRequests(
    @Param("chatId") chatId: string,
    @CurrentUser() user: RequestUser,
    @Query() query: ListJoinRequestsQueryDto
  ) {
    return this.invitesService.listJoinRequests(chatId, user, query);
  }

  @Post("join-requests")
  async createJoinRequest(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateJoinRequestDto) {
    return this.invitesService.createJoinRequest(chatId, user, dto);
  }

  @Post("join-requests/:requestId/approve")
  async approveJoinRequest(@Param("chatId") chatId: string, @Param("requestId") requestId: string, @CurrentUser() user: RequestUser) {
    return this.invitesService.approveJoinRequest(chatId, requestId, user);
  }

  @Post("join-requests/:requestId/reject")
  async rejectJoinRequest(
    @Param("chatId") chatId: string,
    @Param("requestId") requestId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RejectJoinRequestDto
  ) {
    return this.invitesService.rejectJoinRequest(chatId, requestId, user, dto);
  }

  @Get("join-policy")
  async getJoinPolicy(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.invitesService.getJoinPolicy(chatId, user);
  }

  @Patch("join-policy")
  async updateJoinPolicy(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: UpdateJoinPolicyDto) {
    return this.invitesService.updateJoinPolicy(chatId, user, dto);
  }
}
