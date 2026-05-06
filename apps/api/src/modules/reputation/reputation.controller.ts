import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { AdjustReputationDto } from "./reputation.dto.js";
import { ReputationService } from "./reputation.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/reputation")
export class ReputationController {
  constructor(private readonly reputationService: ReputationService) {}

  @Post("adjust")
  async adjust(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: AdjustReputationDto) {
    return this.reputationService.adjust(chatId, user, dto);
  }
}
