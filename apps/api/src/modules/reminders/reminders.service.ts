import { BadRequestException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { Reminder, RequestUser } from "../../core/types.js";
import type { CancelReminderDto, CreateReminderDto, ListRemindersQueryDto } from "./reminders.dto.js";

@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly configService: ConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    const reminders = await this.db.listPendingReminders();
    for (const reminder of reminders) {
      this.registerTimer(reminder);
    }
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  async createReminder(chatId: string, requestUser: RequestUser, dto: CreateReminderDto): Promise<Reminder> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "reminder.create");

    await this.db.getMessage(chatId, dto.message_id);

    const reminderType = dto.reminder_type ?? "personal";
    if (reminderType !== "personal") {
      await this.policy.assertCan(chatId, member, "member.view_list");
    }

    if (reminderType === "team" && !dto.target_role_id) {
      throw new BadRequestException("target_role_id is required for team reminders.");
    }

    if (dto.target_role_id) {
      await this.db.getRole(chatId, dto.target_role_id);
    }

    const remindAt = this.parseFutureDatetime(dto.remind_at);
    const maxDelayHours = this.parsePositiveInt(this.configService.get<string>("REMINDER_MAX_DELAY_HOURS"), 24 * 30);
    if (Date.parse(remindAt) > Date.now() + maxDelayHours * 60 * 60 * 1000) {
      throw new BadRequestException(`Reminder datetime exceeds max horizon (${maxDelayHours}h).`);
    }

    const pendingLimit = this.parsePositiveInt(this.configService.get<string>("REMINDER_PENDING_LIMIT"), 100);
    const ownReminders = await this.db.listReminders(chatId, requestUser.userId);
    const ownPending = ownReminders.filter((item) => item.status === "scheduled").length;
    if (ownPending >= pendingLimit) {
      throw new BadRequestException(`Too many pending reminders. Limit is ${pendingLimit}.`);
    }

    const created = await this.db.createReminder({
      chatId,
      userId: requestUser.userId,
      messageId: dto.message_id,
      reminderType,
      targetRoleId: dto.target_role_id ?? null,
      note: dto.note?.trim() || null,
      remindAt,
      telegramNotify: dto.telegram_notify ?? false,
      status: "scheduled"
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "reminder.create",
      targetType: "reminder",
      targetId: created.id,
      payload: {
        reminder_type: reminderType,
        remind_at: created.remindAt,
        telegram_notify: created.telegramNotify,
        target_role_id: created.targetRoleId,
        message_id: created.messageId
      }
    });

    this.registerTimer(created);
    return created;
  }

  async listReminders(chatId: string, requestUser: RequestUser, query: ListRemindersQueryDto): Promise<Reminder[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "reminder.manage.own");

    const reminders = await this.db.listReminders(chatId, requestUser.userId);
    if (!query.status) {
      return reminders;
    }
    return reminders.filter((item) => item.status === query.status);
  }

  async cancelReminder(chatId: string, reminderId: string, requestUser: RequestUser, dto: CancelReminderDto = {}): Promise<Reminder> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "reminder.manage.own");

    const existing = await this.db.getReminder(chatId, reminderId);
    if (existing.userId !== requestUser.userId) {
      await this.policy.assertCan(chatId, member, "member.view_list");
    }

    if (existing.status !== "scheduled") {
      throw new BadRequestException(`Reminder in status \"${existing.status}\" cannot be canceled.`);
    }

    this.clearTimer(reminderId);
    const canceled = await this.db.updateReminder(chatId, reminderId, {
      status: "canceled",
      canceledAt: new Date().toISOString(),
      error: null
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "reminder.cancel",
      targetType: "reminder",
      targetId: reminderId,
      payload: {
        reason: dto.reason ?? null
      }
    });

    return canceled;
  }

  private registerTimer(reminder: Reminder): void {
    this.clearTimer(reminder.id);
    if (reminder.status !== "scheduled") {
      return;
    }

    const runAt = Date.parse(reminder.remindAt);
    if (!Number.isFinite(runAt)) {
      void this.markFailed(reminder.chatId, reminder.id, "Invalid reminder datetime.");
      return;
    }

    const delay = Math.max(0, runAt - Date.now());
    const timer = setTimeout(() => {
      this.timers.delete(reminder.id);
      void this.executeReminder(reminder.chatId, reminder.id);
    }, delay);
    this.timers.set(reminder.id, timer);
  }

  private clearTimer(reminderId: string): void {
    const timer = this.timers.get(reminderId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.timers.delete(reminderId);
  }

  private async executeReminder(chatId: string, reminderId: string): Promise<void> {
    const current = await this.db.getReminder(chatId, reminderId);
    if (current.status !== "scheduled") {
      return;
    }

    const owner = await this.db.getUserById(current.userId);
    if (!owner) {
      await this.markFailed(chatId, reminderId, "Reminder owner not found.");
      return;
    }

    const sentAt = new Date().toISOString();
    await this.db.updateReminder(chatId, reminderId, {
      status: "sent",
      sentAt,
      error: null
    });

    await this.db.addAuditLog({
      chatId,
      actorId: "system",
      action: "reminder.trigger",
      targetType: "reminder",
      targetId: reminderId,
      payload: {
        userId: owner.id,
        telegram_notify: current.telegramNotify,
        reminder_type: current.reminderType,
        message_id: current.messageId,
        sent_at: sentAt
      }
    });
  }

  private async markFailed(chatId: string, reminderId: string, errorMessage: string): Promise<void> {
    const error = errorMessage.slice(0, 500);
    await this.db.updateReminder(chatId, reminderId, {
      status: "failed",
      error
    });
    await this.db.addAuditLog({
      chatId,
      actorId: "system",
      action: "reminder.failed",
      targetType: "reminder",
      targetId: reminderId,
      payload: {
        error
      }
    });
  }

  private parseFutureDatetime(value: string): string {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException("remind_at must be a valid ISO datetime.");
    }
    if (parsed <= Date.now()) {
      throw new BadRequestException("remind_at must be in the future.");
    }
    return new Date(parsed).toISOString();
  }

  private parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}
