import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import type { Message } from "../../core/types.js";
import { buildInstantChannelNotifyText, buildMessagePreview, renderChannelNotifyTemplate } from "./channel-notify-renderer.js";
import { TelegramBotService } from "./telegram-bot.service.js";

@Injectable()
export class ChannelNotifyPipelineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChannelNotifyPipelineService.name);
  private detachMessageListener?: () => void;
  private readonly digestBuffers = new Map<string, Message[]>();
  private readonly digestTimers = new Map<string, NodeJS.Timeout>();
  private readonly redactMessageContentInNotify: boolean;

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly eventBus: EventBusService,
    private readonly botService: TelegramBotService,
    private readonly configService: ConfigService
  ) {
    this.redactMessageContentInNotify =
      (this.configService.get<string>("CHANNEL_NOTIFY_REDACT_MESSAGE_CONTENT", "true") ?? "true").toLowerCase() === "true";
  }

  onModuleInit(): void {
    this.detachMessageListener = this.eventBus.on("message.created", (message) => {
      void this.handleMessageCreated(message);
    });
  }

  onModuleDestroy(): void {
    this.detachMessageListener?.();
    for (const timer of this.digestTimers.values()) {
      clearTimeout(timer);
    }
    this.digestTimers.clear();
    this.digestBuffers.clear();
  }

  private async handleMessageCreated(message: Message): Promise<void> {
    try {
      const config = await this.db.getChannelNotifyConfig(message.chatId);
      if (!config.enabled || config.mode === "off") {
        return;
      }

      if (config.mode === "instant" && !this.isQuietHoursNow()) {
        await this.deliverInstant(message);
        return;
      }

      this.enqueueDigest(message, config.digestIntervalMinutes);
    } catch (error) {
      this.logger.warn(`Channel notify pipeline skipped: ${(error as Error).message}`);
    }
  }

  private enqueueDigest(message: Message, digestIntervalMinutes: number): void {
    const current = this.digestBuffers.get(message.chatId) ?? [];
    current.push(message);
    this.digestBuffers.set(message.chatId, current);

    if (this.digestTimers.has(message.chatId)) {
      return;
    }

    const delay = Math.max(1, digestIntervalMinutes) * 60 * 1000;
    const timer = setTimeout(() => {
      void this.flushDigest(message.chatId);
    }, delay);
    this.digestTimers.set(message.chatId, timer);
  }

  private async flushDigest(chatId: string): Promise<void> {
    const timer = this.digestTimers.get(chatId);
    if (timer) {
      clearTimeout(timer);
      this.digestTimers.delete(chatId);
    }

    const messages = this.digestBuffers.get(chatId) ?? [];
    if (messages.length === 0) {
      return;
    }

    if (this.isQuietHoursNow()) {
      const delayMs = this.msUntilQuietHoursEnd();
      const retryTimer = setTimeout(() => {
        void this.flushDigest(chatId);
      }, delayMs);
      this.digestTimers.set(chatId, retryTimer);
      return;
    }

    const config = await this.db.getChannelNotifyConfig(chatId);
    if (!config.enabled || config.mode !== "digest") {
      this.digestBuffers.delete(chatId);
      return;
    }

    const chat = await this.db.getChat(chatId);
    const limited = messages.slice(-20);
    const lines = await Promise.all(
      limited.map(async (message) => {
        const author = await this.resolveAuthorName(message);
        return `- ${author}: ${this.buildNotifyMessageSummary(message)}`;
      })
    );

    const body = `Digest (${messages.length})\n${lines.join("\n")}`;
    const rendered = renderChannelNotifyTemplate({
      template: config.template,
      chatName: chat.name,
      authorName: "digest",
      messagePreview: body,
      timestamp: new Date().toISOString()
    });

    const result = await this.botService.sendChannelMessage(rendered, { chatId });
    await this.db.addAuditLog({
      chatId,
      actorId: "system",
      action: "channel_notify.digest.dispatch",
      targetType: "channel_notification",
      targetId: chatId,
      payload: {
        bufferedCount: messages.length,
        ok: result.ok,
        skipped: result.skipped,
        reason: result.reason ?? null
      }
    });
    this.digestBuffers.delete(chatId);
  }

  private async deliverInstant(message: Message): Promise<void> {
    const author = await this.resolveAuthorName(message);
    const rendered = buildInstantChannelNotifyText(author);

    const result = await this.botService.sendChannelMessage(rendered, { chatId: message.chatId });
    await this.db.addAuditLog({
      chatId: message.chatId,
      actorId: message.actorUserId,
      action: "channel_notify.instant.dispatch",
      targetType: "channel_notification",
      targetId: message.chatId,
      payload: {
        messageId: message.id,
        ok: result.ok,
        skipped: result.skipped,
        reason: result.reason ?? null
      }
    });
  }

  private async resolveAuthorName(message: Message): Promise<string> {
    if (message.displayAuthorType === "group" || message.displayAuthorType === "role_profile") {
      try {
        const identity = await this.db.getIdentity(message.chatId, message.displayAuthorId);
        return identity.name;
      } catch {
        return message.displayAuthorId;
      }
    }

    try {
      const user = await this.db.getUserById(message.authorId);
      if (!user) {
        return message.authorId;
      }
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
      if (user.username && user.username.trim().length > 0) {
        const normalized = user.username.replace(/^@+/, "").trim();
        return normalized.length > 0 ? `@${normalized}` : (fullName || message.authorId);
      }
      return fullName || message.authorId;
    } catch {
      return message.authorId;
    }
  }

  private buildNotifyMessageSummary(message: Message): string {
    if (this.redactMessageContentInNotify) {
      if (message.isEncrypted) {
        return "[encrypted message]";
      }
      if (message.media) {
        return "[media message]";
      }
      return "[message content hidden]";
    }
    return buildMessagePreview(message, 100);
  }

  private isQuietHoursNow(): boolean {
    const quietEnabled = (this.configService.get<string>("CHANNEL_NOTIFY_QUIET_HOURS_ENABLED", "false") ?? "false").toLowerCase() === "true";
    if (!quietEnabled) {
      return false;
    }

    const start = this.parseHm(this.configService.get<string>("CHANNEL_NOTIFY_QUIET_HOURS_START", "23:00") ?? "23:00");
    const end = this.parseHm(this.configService.get<string>("CHANNEL_NOTIFY_QUIET_HOURS_END", "07:00") ?? "07:00");
    const timezone = this.configService.get<string>("CHANNEL_NOTIFY_TIMEZONE", "UTC") ?? "UTC";
    const currentMinute = this.currentMinuteInTimezone(timezone);

    if (start === end) {
      return true;
    }
    if (start < end) {
      return currentMinute >= start && currentMinute < end;
    }
    return currentMinute >= start || currentMinute < end;
  }

  private msUntilQuietHoursEnd(): number {
    const timezone = this.configService.get<string>("CHANNEL_NOTIFY_TIMEZONE", "UTC") ?? "UTC";
    const end = this.parseHm(this.configService.get<string>("CHANNEL_NOTIFY_QUIET_HOURS_END", "07:00") ?? "07:00");
    const nowMinute = this.currentMinuteInTimezone(timezone);
    const minutesUntil = nowMinute < end ? end - nowMinute : 24 * 60 - nowMinute + end;
    return Math.max(1, minutesUntil) * 60 * 1000;
  }

  private parseHm(raw: string): number {
    const parts = raw.split(":");
    if (parts.length !== 2) {
      return 0;
    }
    const hour = Number(parts[0]);
    const minute = Number(parts[1]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return 0;
    }
    return Math.max(0, Math.min(23, Math.floor(hour))) * 60 + Math.max(0, Math.min(59, Math.floor(minute)));
  }

  private currentMinuteInTimezone(timezone: string): number {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    const parts = formatter.formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
  }
}
