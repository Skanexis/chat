import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { AutomationService } from "./automation.service.js";
import {
  CreateAutomationRuleDto,
  ExecuteAutomationRuleDto,
  ListAutomationExecutionsQueryDto,
  UpdateAutomationRuleDto
} from "./automation.dto.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/automation/rules")
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Post()
  async createRule(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateAutomationRuleDto) {
    return this.automationService.createRule(chatId, user, dto);
  }

  @Patch(":ruleId")
  async updateRule(
    @Param("chatId") chatId: string,
    @Param("ruleId") ruleId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAutomationRuleDto
  ) {
    return this.automationService.updateRule(chatId, ruleId, user, dto);
  }

  @Post(":ruleId/execute")
  async executeRule(
    @Param("chatId") chatId: string,
    @Param("ruleId") ruleId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ExecuteAutomationRuleDto = {}
  ) {
    return this.automationService.executeRule(chatId, ruleId, user, dto);
  }

  @Get(":ruleId/executions")
  async listExecutions(
    @Param("chatId") chatId: string,
    @Param("ruleId") ruleId: string,
    @CurrentUser() user: RequestUser,
    @Query() query: ListAutomationExecutionsQueryDto
  ) {
    return this.automationService.listExecutions(chatId, ruleId, user, query);
  }
}
