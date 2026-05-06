import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { DisableIncidentModeDto, EnableIncidentModeDto } from "./incident-mode.dto.js";
import { IncidentModeService } from "./incident-mode.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/incident-mode")
export class IncidentModeController {
  constructor(private readonly incidentModeService: IncidentModeService) {}

  @Post("enable")
  async enable(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: EnableIncidentModeDto) {
    return this.incidentModeService.enable(chatId, user, dto);
  }

  @Post("disable")
  async disable(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: DisableIncidentModeDto = {}) {
    return this.incidentModeService.disable(chatId, user, dto);
  }
}
