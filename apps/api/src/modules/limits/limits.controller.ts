import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { LimitsService } from "./limits.service.js";
import {
  BanMemberDto,
  ClearTimeoutMemberDto,
  KickMemberDto,
  MuteMemberDto,
  TimeoutMemberDto,
  UnbanMemberDto,
  UnmuteMemberDto,
  UpdateRoleLimitsDto
} from "./limits.dto.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId")
export class LimitsController {
  constructor(private readonly limitsService: LimitsService) {}

  @Get("limits")
  async listLimits(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.limitsService.listLimits(chatId, user);
  }

  @Patch("limits/roles/:roleId")
  async updateRoleLimits(
    @Param("chatId") chatId: string,
    @Param("roleId") roleId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateRoleLimitsDto
  ) {
    return this.limitsService.updateRoleLimits(chatId, roleId, user, dto);
  }

  @Post("members/:userId/mute")
  async muteMember(
    @Param("chatId") chatId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: MuteMemberDto
  ) {
    return this.limitsService.muteMember(chatId, userId, user, dto);
  }

  @Post("members/:userId/timeout")
  async timeoutMember(
    @Param("chatId") chatId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: TimeoutMemberDto
  ) {
    return this.limitsService.timeoutMember(chatId, userId, user, dto);
  }

  @Post("members/:userId/timeout/clear")
  async clearMemberTimeout(
    @Param("chatId") chatId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ClearTimeoutMemberDto
  ) {
    return this.limitsService.clearMemberTimeout(chatId, userId, user, dto);
  }

  @Get("members")
  async listMembers(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.limitsService.listMembers(chatId, user);
  }

  @Post("members/:userId/unmute")
  async unmuteMember(
    @Param("chatId") chatId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UnmuteMemberDto
  ) {
    return this.limitsService.unmuteMember(chatId, userId, user, dto);
  }

  @Post("members/:userId/ban")
  async banMember(
    @Param("chatId") chatId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: BanMemberDto
  ) {
    return this.limitsService.banMember(chatId, userId, user, dto);
  }

  @Post("members/:userId/kick")
  async kickMember(
    @Param("chatId") chatId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: KickMemberDto
  ) {
    return this.limitsService.kickMember(chatId, userId, user, dto);
  }

  @Post("members/:userId/unban")
  async unbanMember(
    @Param("chatId") chatId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UnbanMemberDto
  ) {
    return this.limitsService.unbanMember(chatId, userId, user, dto);
  }
}
