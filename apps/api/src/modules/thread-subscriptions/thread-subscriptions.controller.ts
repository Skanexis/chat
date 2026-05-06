import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { CreateThreadSubscriptionDto } from "./thread-subscriptions.dto.js";
import { ThreadSubscriptionsService } from "./thread-subscriptions.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/thread-subscriptions")
export class ThreadSubscriptionsController {
  constructor(private readonly threadSubscriptionsService: ThreadSubscriptionsService) {}

  @Post()
  async createSubscription(
    @Param("chatId") chatId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateThreadSubscriptionDto
  ) {
    return this.threadSubscriptionsService.createThreadSubscription(chatId, user, dto);
  }

  @Get()
  async listSubscriptions(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.threadSubscriptionsService.listThreadSubscriptions(chatId, user);
  }

  @Delete(":subscriptionId")
  async deleteSubscription(
    @Param("chatId") chatId: string,
    @Param("subscriptionId") subscriptionId: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.threadSubscriptionsService.deleteThreadSubscription(chatId, subscriptionId, user);
  }
}

