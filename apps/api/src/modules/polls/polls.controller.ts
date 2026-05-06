import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { ClosePollDto, CreatePollDto, VotePollDto } from "./polls.dto.js";
import { PollsService } from "./polls.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/polls")
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  @Post()
  async createPoll(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreatePollDto) {
    return this.pollsService.createPoll(chatId, user, dto);
  }

  @Post(":pollId/vote")
  async vote(
    @Param("chatId") chatId: string,
    @Param("pollId") pollId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: VotePollDto
  ) {
    return this.pollsService.vote(chatId, pollId, user, dto);
  }

  @Post(":pollId/close")
  async close(
    @Param("chatId") chatId: string,
    @Param("pollId") pollId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ClosePollDto = {}
  ) {
    return this.pollsService.close(chatId, pollId, user, dto);
  }

  @Get(":pollId/results")
  async results(@Param("chatId") chatId: string, @Param("pollId") pollId: string, @CurrentUser() user: RequestUser) {
    return this.pollsService.results(chatId, pollId, user);
  }
}
