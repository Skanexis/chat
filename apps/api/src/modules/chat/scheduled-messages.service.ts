import { BadRequestException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { ChatMember, RequestUser, ScheduledMessage } from "../../core/types.js";
import type { CreateMessageDto, ScheduleMessageDto } from "./chat.dto.js";
import { ChatService } from "./chat.service.js";

@Injectable()
export class ScheduledMessagesService implements OnModuleInit, OnModuleDestroy {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly chatService: ChatService,
    private readonly configService: ConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    const scheduled = await this.db.listPendingScheduledMessages();
    for (const entry of scheduled) {
      this.registerTimer(entry);
    }
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  async listScheduledMessages(chatId: string, requestUser: RequestUser): Promise<ScheduledMessage[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "chat.view");
    await this.policy.assertCan(chatId, member, "draft.create");
    return this.db.listScheduledMessages(chatId, requestUser.userId);
  }

  async scheduleMessage(chatId: string, requestUser: RequestUser, dto: ScheduleMessageDto): Promise<ScheduledMessage> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "chat.view");
    await this.policy.assertCan(chatId, member, "draft.create");
    await this.policy.assertCan(chatId, member, "draft.schedule_send");
    await this.assertCanSchedulePayload(chatId, member, dto.payload);

    const scheduledAtTs = Date.parse(dto.at);
    if (!Number.isFinite(scheduledAtTs)) {
      throw new BadRequestException("Invalid scheduled datetime.");
    }
    if (scheduledAtTs <= Date.now()) {
      throw new BadRequestException("Scheduled datetime must be in the future.");
    }

    const maxDelayHours = this.parsePositiveInt(
      this.configService.get<string>("DRAFT_SEND_MAX_DELAY_HOURS") ?? this.configService.get<string>("SCHEDULED_MESSAGE_MAX_DELAY_HOURS"),
      24 * 30
    );
    const maxScheduledAt = Date.now() + maxDelayHours * 60 * 60 * 1000;
    if (scheduledAtTs > maxScheduledAt) {
      throw new BadRequestException(`Scheduled datetime exceeds max horizon (${maxDelayHours}h).`);
    }

    const pendingLimit = this.parsePositiveInt(this.configService.get<string>("DRAFT_PENDING_LIMIT"), 100);
    const ownScheduled = await this.db.listScheduledMessages(chatId, requestUser.userId);
    const pendingCount = ownScheduled.filter((entry) => entry.status === "scheduled").length;
    if (pendingCount >= pendingLimit) {
      throw new BadRequestException(`Too many pending drafts. Limit is ${pendingLimit}.`);
    }

    const created = await this.db.createScheduledMessage({
      chatId,
      userId: requestUser.userId,
      payload: dto.payload,
      scheduledAt: new Date(scheduledAtTs).toISOString(),
      status: "scheduled"
    });
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.schedule.create",
      targetType: "scheduled_message",
      targetId: created.id,
      payload: {
        scheduledAt: created.scheduledAt
      }
    });

    this.registerTimer(created);
    return created;
  }

  async cancelScheduledMessage(chatId: string, scheduledMessageId: string, requestUser: RequestUser): Promise<ScheduledMessage> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "draft.delete");

    const existing = await this.db.getScheduledMessage(chatId, scheduledMessageId);
    if (existing.userId !== requestUser.userId) {
      await this.policy.assertCan(chatId, member, "message.delete.any");
    }
    if (existing.status !== "scheduled") {
      throw new BadRequestException(`Scheduled message in status "${existing.status}" cannot be canceled.`);
    }

    this.clearTimer(scheduledMessageId);
    const canceled = await this.db.updateScheduledMessage(chatId, scheduledMessageId, {
      status: "canceled",
      canceledAt: new Date().toISOString(),
      error: null
    });
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.schedule.cancel",
      targetType: "scheduled_message",
      targetId: scheduledMessageId,
      payload: {}
    });
    return canceled;
  }

  private registerTimer(entry: ScheduledMessage): void {
    this.clearTimer(entry.id);
    if (entry.status !== "scheduled") {
      return;
    }

    const runAt = Date.parse(entry.scheduledAt);
    if (!Number.isFinite(runAt)) {
      void this.markFailed(entry.chatId, entry.id, "Invalid scheduled datetime.");
      return;
    }

    const delay = Math.max(0, runAt - Date.now());
    const timer = setTimeout(() => {
      this.timers.delete(entry.id);
      void this.executeScheduledMessage(entry.chatId, entry.id);
    }, delay);
    this.timers.set(entry.id, timer);
  }

  private clearTimer(scheduledMessageId: string): void {
    const timer = this.timers.get(scheduledMessageId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.timers.delete(scheduledMessageId);
  }

  private async executeScheduledMessage(chatId: string, scheduledMessageId: string): Promise<void> {
    const current = await this.db.getScheduledMessage(chatId, scheduledMessageId);
    if (current.status !== "scheduled") {
      return;
    }

    const user = await this.db.getUserById(current.userId);
    if (!user) {
      await this.markFailed(chatId, scheduledMessageId, "Scheduled message owner not found.");
      return;
    }

    try {
      const created = await this.chatService.createMessage(chatId, { userId: user.id, telegramId: user.telegramId }, current.payload as CreateMessageDto);
      await this.db.updateScheduledMessage(chatId, scheduledMessageId, {
        status: "sent",
        sentMessageId: created.id,
        sentAt: new Date().toISOString(),
        error: null
      });
      await this.db.addAuditLog({
        chatId,
        actorId: user.id,
        action: "message.schedule.execute",
        targetType: "scheduled_message",
        targetId: scheduledMessageId,
        payload: {
          messageId: created.id
        }
      });
    } catch (error) {
      await this.markFailed(chatId, scheduledMessageId, (error as Error).message || "Scheduled message execution failed.");
    }
  }

  private async markFailed(chatId: string, scheduledMessageId: string, errorMessage: string): Promise<void> {
    const failed = errorMessage.slice(0, 500);
    await this.db.updateScheduledMessage(chatId, scheduledMessageId, {
      status: "failed",
      error: failed
    });
    await this.db.addAuditLog({
      chatId,
      actorId: "system",
      action: "message.schedule.failed",
      targetType: "scheduled_message",
      targetId: scheduledMessageId,
      payload: {
        error: failed
      }
    });
  }

  private async assertCanSchedulePayload(chatId: string, member: ChatMember, payload: ScheduleMessageDto["payload"]): Promise<void> {
    if (!payload.text && !payload.media) {
      throw new BadRequestException("Scheduled message must contain text or media.");
    }

    if (payload.text) {
      await this.policy.assertCan(chatId, member, "message.send.text");
    }
    if (payload.media) {
      await this.policy.assertCan(chatId, member, `message.send.media.${payload.media.type}`);
    }
    if (payload.reply_to_id) {
      await this.db.getMessage(chatId, payload.reply_to_id);
      await this.policy.assertCan(chatId, member, "message.send.reply");
    }
    if (payload.sender_mode !== "as_user") {
      await this.policy.assertCan(chatId, member, "message.send.as_group");
    }
  }

  private parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}
