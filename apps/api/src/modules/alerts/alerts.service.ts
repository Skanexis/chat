import { BadRequestException, Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { KeywordAlert, Message, RequestUser } from "../../core/types.js";
import type { CreateKeywordAlertDto } from "./alerts.dto.js";

@Injectable()
export class AlertsService implements OnModuleDestroy {
  private readonly detachMessageCreated: () => void;

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly eventBus: EventBusService,
    private readonly configService: ConfigService
  ) {
    this.detachMessageCreated = this.eventBus.on("message.created", (message) => {
      void this.handleMessageCreated(message);
    });
  }

  onModuleDestroy(): void {
    this.detachMessageCreated();
  }

  async createKeywordAlert(chatId: string, requestUser: RequestUser, dto: CreateKeywordAlertDto): Promise<KeywordAlert> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "alert.keyword.create");

    const keyword = dto.keyword.trim();
    if (keyword.length === 0) {
      throw new BadRequestException("keyword must not be empty.");
    }

    const isRegex = dto.is_regex ?? false;
    const caseSensitive = dto.case_sensitive ?? false;
    if (isRegex) {
      this.assertRegex(keyword, caseSensitive);
    }

    const maxPerUser = this.parsePositiveInt(this.configService.get<string>("KEYWORD_ALERT_MAX_PER_USER"), 25);
    const existing = await this.db.listKeywordAlerts(chatId, requestUser.userId);
    if (existing.length >= maxPerUser) {
      throw new BadRequestException(`Maximum keyword alerts reached (${maxPerUser}).`);
    }

    const normalizedKeyword = this.normalizeKeyword(keyword, caseSensitive);
    const duplicate = existing.find(
      (alert) =>
        alert.normalizedKeyword === normalizedKeyword && alert.isRegex === isRegex && alert.caseSensitive === caseSensitive
    );
    if (duplicate) {
      throw new BadRequestException("Keyword alert already exists.");
    }

    const dedupWindowSeconds = dto.dedup_window_seconds ?? this.parsePositiveInt(this.configService.get<string>("KEYWORD_ALERT_DEDUP_SECONDS"), 300);
    const created = await this.db.createKeywordAlert({
      chatId,
      userId: requestUser.userId,
      keyword,
      normalizedKeyword,
      isRegex,
      caseSensitive,
      dedupWindowSeconds,
      isActive: true
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "alert.keyword.create",
      targetType: "keyword_alert",
      targetId: created.id,
      payload: {
        keyword: created.keyword,
        is_regex: created.isRegex,
        case_sensitive: created.caseSensitive,
        dedup_window_seconds: created.dedupWindowSeconds
      }
    });

    return created;
  }

  async listKeywordAlerts(chatId: string, requestUser: RequestUser): Promise<KeywordAlert[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "alert.keyword.create");

    return this.db.listKeywordAlerts(chatId, requestUser.userId);
  }

  async deleteKeywordAlert(chatId: string, alertId: string, requestUser: RequestUser): Promise<{ ok: true; alertId: string }> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "alert.keyword.delete");

    const alert = await this.db.getKeywordAlert(chatId, alertId);
    if (alert.userId !== requestUser.userId) {
      await this.policy.assertCan(chatId, member, "member.view_list");
    }

    await this.db.deleteKeywordAlert(chatId, alertId);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "alert.keyword.delete",
      targetType: "keyword_alert",
      targetId: alertId,
      payload: {}
    });

    return {
      ok: true,
      alertId
    };
  }

  private async handleMessageCreated(message: Message): Promise<void> {
    if (!message.text || message.text.trim().length === 0) {
      return;
    }

    const alerts = await this.db.listActiveKeywordAlertsForChat(message.chatId);
    if (alerts.length === 0) {
      return;
    }

    for (const alert of alerts) {
      if (alert.userId === message.authorId) {
        continue;
      }
      if (!this.matchesAlert(message.text, alert)) {
        continue;
      }
      if (!this.passesDedup(alert)) {
        continue;
      }

      const now = new Date().toISOString();
      await this.db.updateKeywordAlert(alert.chatId, alert.id, {
        lastTriggeredAt: now
      });

      await this.db.addAuditLog({
        chatId: message.chatId,
        actorId: message.actorUserId,
        action: "alert.keyword.trigger",
        targetType: "keyword_alert",
        targetId: alert.id,
        payload: {
          messageId: message.id,
          recipientUserId: alert.userId,
          keyword: alert.keyword,
          triggeredAt: now
        }
      });
    }
  }

  private matchesAlert(text: string, alert: KeywordAlert): boolean {
    if (!alert.isRegex) {
      if (alert.caseSensitive) {
        return text.includes(alert.keyword);
      }
      return text.toLowerCase().includes(alert.keyword.toLowerCase());
    }

    try {
      const regex = new RegExp(alert.keyword, alert.caseSensitive ? "u" : "iu");
      return regex.test(text);
    } catch {
      return false;
    }
  }

  private passesDedup(alert: KeywordAlert): boolean {
    if (!alert.lastTriggeredAt) {
      return true;
    }

    const lastTs = Date.parse(alert.lastTriggeredAt);
    if (!Number.isFinite(lastTs)) {
      return true;
    }

    return Date.now() - lastTs >= alert.dedupWindowSeconds * 1000;
  }

  private normalizeKeyword(keyword: string, caseSensitive: boolean): string {
    return caseSensitive ? keyword : keyword.toLowerCase();
  }

  private assertRegex(pattern: string, caseSensitive: boolean): void {
    try {
      void new RegExp(pattern, caseSensitive ? "u" : "iu");
    } catch {
      throw new BadRequestException("keyword regex is invalid.");
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
