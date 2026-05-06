import { Inject, Injectable } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { buildMessagePreview, renderChannelNotifyTemplate } from "./channel-notify-renderer.js";
import { TestChannelNotifyDto, UpdateChannelNotifyConfigDto } from "./notifications.dto.js";
import { TelegramBotService } from "./telegram-bot.service.js";

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly botService: TelegramBotService
  ) {}

  async updateChannelNotifyConfig(chatId: string, requestUser: RequestUser, dto: UpdateChannelNotifyConfigDto) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);

    if (dto.enabled === true) {
      await this.policy.assertCan(chatId, member, "channel.notify.enable");
    }
    if (dto.enabled === false) {
      await this.policy.assertCan(chatId, member, "channel.notify.disable");
    }
    if (dto.template !== undefined) {
      await this.policy.assertCan(chatId, member, "channel.notify.template.edit");
    }
    if (dto.digestIntervalMinutes !== undefined) {
      await this.policy.assertCan(chatId, member, "channel.notify.frequency.edit");
    }
    if (dto.mode !== undefined) {
      await this.policy.assertCan(chatId, member, "channel.notify.frequency.edit");
    }

    const updated = await this.db.updateChannelNotifyConfig(chatId, requestUser.userId, dto);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "channel_notify.config.update",
      targetType: "channel_notification",
      targetId: chatId,
      payload: dto as unknown as Record<string, unknown>
    });
    return updated;
  }

  async testChannelNotify(chatId: string, requestUser: RequestUser, dto: TestChannelNotifyDto) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "channel.notify.enable");

    const config = await this.db.getChannelNotifyConfig(chatId);
    const chat = await this.db.getChat(chatId);
    const rendered = renderChannelNotifyTemplate({
      template: config.template,
      chatName: chat.name,
      authorName: requestUser.userId,
      messagePreview: buildMessagePreview({ text: dto.messagePreview ?? "Test notification", media: null }),
      timestamp: new Date().toISOString()
    });

    let delivery: {
      requested: boolean;
      ok: boolean;
      skipped: boolean;
      reason?: string;
      attempts?: number;
    } | null = null;

    if (dto.deliver === true) {
      const result = await this.botService.sendChannelMessage(rendered);
      delivery = {
        requested: true,
        ok: result.ok,
        skipped: result.skipped,
        reason: result.reason,
        attempts: result.attempts
      };
    }

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "channel_notify.test",
      targetType: "channel_notification",
      targetId: chatId,
      payload: {
        rendered,
        delivery
      }
    });

    return {
      ok: true,
      config,
      dryRun: {
        rendered
      },
      delivery
    };
  }
}
