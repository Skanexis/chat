import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { ChatService } from "./chat.service.js";
import {
  ChatBootstrapQueryDto,
  CreateIdentityDto,
  ListMessagesQueryDto,
  CreateMessageDto,
  CreateSavedMessageViewDto,
  ScheduleMessageDto,
  SearchMessagesQueryDto,
  SetMessageReactionDto,
  UpdateIdentityDto,
  UpdateMessageDto
} from "./chat.dto.js";
import { ScheduledMessagesService } from "./scheduled-messages.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId")
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly scheduledMessagesService: ScheduledMessagesService
  ) {}

  @Get()
  async getChat(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.chatService.getChat(chatId, user);
  }

  @Get("bootstrap")
  async getBootstrap(
    @Param("chatId") chatId: string,
    @CurrentUser() user: RequestUser,
    @Query() query: ChatBootstrapQueryDto = {}
  ) {
    return this.chatService.getBootstrap(chatId, user, query);
  }

  @Get("messages")
  async listMessages(
    @Param("chatId") chatId: string,
    @CurrentUser() user: RequestUser,
    @Query() query: ListMessagesQueryDto = {}
  ) {
    return this.chatService.listMessages(chatId, user, query);
  }

  @Get("messages/search")
  async searchMessages(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Query() query: SearchMessagesQueryDto) {
    return this.chatService.searchMessages(chatId, user, query);
  }

  @Get("messages/pinned")
  async listPinnedMessages(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.chatService.listPinnedMessages(chatId, user);
  }

  @Get("messages/saved-views")
  async listSavedViews(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.chatService.listSavedViews(chatId, user);
  }

  @Post("messages")
  async createMessage(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateMessageDto) {
    return this.chatService.createMessage(chatId, user, dto);
  }

  @Patch("messages/:messageId")
  async updateMessage(
    @Param("chatId") chatId: string,
    @Param("messageId") messageId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateMessageDto
  ) {
    return this.chatService.updateMessage(chatId, messageId, user, dto);
  }

  @Delete("messages/:messageId")
  async deleteMessage(@Param("chatId") chatId: string, @Param("messageId") messageId: string, @CurrentUser() user: RequestUser) {
    return this.chatService.deleteMessage(chatId, messageId, user);
  }

  @Post("messages/:messageId/pin")
  async pinMessage(@Param("chatId") chatId: string, @Param("messageId") messageId: string, @CurrentUser() user: RequestUser) {
    return this.chatService.pinMessage(chatId, messageId, user);
  }

  @Post("messages/:messageId/unpin")
  async unpinMessage(@Param("chatId") chatId: string, @Param("messageId") messageId: string, @CurrentUser() user: RequestUser) {
    return this.chatService.unpinMessage(chatId, messageId, user);
  }

  @Get("messages/:messageId/reactions")
  async listMessageReactions(@Param("chatId") chatId: string, @Param("messageId") messageId: string, @CurrentUser() user: RequestUser) {
    return this.chatService.listMessageReactions(chatId, messageId, user);
  }

  @Post("messages/:messageId/reactions")
  async setMessageReaction(
    @Param("chatId") chatId: string,
    @Param("messageId") messageId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SetMessageReactionDto
  ) {
    return this.chatService.setMessageReaction(chatId, messageId, user, dto);
  }

  @Delete("messages/:messageId/reactions")
  async removeMessageReaction(@Param("chatId") chatId: string, @Param("messageId") messageId: string, @CurrentUser() user: RequestUser) {
    return this.chatService.removeMessageReaction(chatId, messageId, user);
  }

  @Get("messages/scheduled")
  async listScheduledMessages(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.scheduledMessagesService.listScheduledMessages(chatId, user);
  }

  @Post("messages/scheduled")
  async scheduleMessage(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: ScheduleMessageDto) {
    return this.scheduledMessagesService.scheduleMessage(chatId, user, dto);
  }

  @Post("messages/scheduled/:scheduledMessageId/cancel")
  async cancelScheduledMessage(
    @Param("chatId") chatId: string,
    @Param("scheduledMessageId") scheduledMessageId: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.scheduledMessagesService.cancelScheduledMessage(chatId, scheduledMessageId, user);
  }

  @Get("drafts")
  async listDrafts(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.scheduledMessagesService.listScheduledMessages(chatId, user);
  }

  @Post("drafts")
  async createDraft(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: ScheduleMessageDto) {
    return this.scheduledMessagesService.scheduleMessage(chatId, user, dto);
  }

  @Delete("drafts/:draftId")
  async deleteDraft(@Param("chatId") chatId: string, @Param("draftId") draftId: string, @CurrentUser() user: RequestUser) {
    return this.scheduledMessagesService.cancelScheduledMessage(chatId, draftId, user);
  }

  @Post("messages/saved-views")
  async createSavedView(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateSavedMessageViewDto) {
    return this.chatService.createSavedView(chatId, user, dto);
  }

  @Delete("messages/saved-views/:viewId")
  async deleteSavedView(@Param("chatId") chatId: string, @Param("viewId") viewId: string, @CurrentUser() user: RequestUser) {
    return this.chatService.deleteSavedView(chatId, viewId, user);
  }

  @Get("identities")
  async listIdentities(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.chatService.listIdentities(chatId, user);
  }

  @Post("identities")
  async createIdentity(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateIdentityDto) {
    return this.chatService.createIdentity(chatId, user, dto);
  }

  @Patch("identities/:identityId")
  async updateIdentity(
    @Param("chatId") chatId: string,
    @Param("identityId") identityId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateIdentityDto
  ) {
    return this.chatService.updateIdentity(chatId, identityId, user, dto);
  }
}
