import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { CreateTicketDto, GetTicketSlaStatsQueryDto, UpdateTicketDto } from "./tickets.dto.js";
import { TicketsService } from "./tickets.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/tickets")
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get("sla/stats")
  async getSlaStats(
    @Param("chatId") chatId: string,
    @CurrentUser() user: RequestUser,
    @Query() query: GetTicketSlaStatsQueryDto
  ) {
    return this.ticketsService.getSlaStats(chatId, user, query);
  }

  @Post()
  async createTicket(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateTicketDto) {
    return this.ticketsService.createTicket(chatId, user, dto);
  }

  @Patch(":ticketId")
  async updateTicket(
    @Param("chatId") chatId: string,
    @Param("ticketId") ticketId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateTicketDto
  ) {
    return this.ticketsService.updateTicket(chatId, ticketId, user, dto);
  }
}
