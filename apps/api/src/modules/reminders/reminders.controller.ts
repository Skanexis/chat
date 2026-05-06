import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { CancelReminderDto, CreateReminderDto, ListRemindersQueryDto } from "./reminders.dto.js";
import { RemindersService } from "./reminders.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/reminders")
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  async createReminder(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateReminderDto) {
    return this.remindersService.createReminder(chatId, user, dto);
  }

  @Get()
  async listReminders(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Query() query: ListRemindersQueryDto) {
    return this.remindersService.listReminders(chatId, user, query);
  }

  @Post(":reminderId/cancel")
  async cancelReminder(
    @Param("chatId") chatId: string,
    @Param("reminderId") reminderId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CancelReminderDto = {}
  ) {
    return this.remindersService.cancelReminder(chatId, reminderId, user, dto);
  }
}
