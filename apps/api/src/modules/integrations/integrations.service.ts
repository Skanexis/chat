import { Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { IntegrationWebhook, RequestUser } from "../../core/types.js";
import type {
  CreateIntegrationWebhookDto,
  RotateIntegrationWebhookSecretDto,
  UpdateIntegrationWebhookDto
} from "./integrations.dto.js";

@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService
  ) {}

  async listWebhooks(chatId: string, requestUser: RequestUser): Promise<Array<Record<string, unknown>>> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "integration.webhook.create");
    const webhooks = await this.db.listIntegrationWebhooks(chatId);
    return webhooks.map((webhook) => this.toWebhookResponse(webhook, false));
  }

  async createWebhook(chatId: string, requestUser: RequestUser, dto: CreateIntegrationWebhookDto): Promise<Record<string, unknown>> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "integration.webhook.create");

    const secret = this.generateSecret();
    const created = await this.db.createIntegrationWebhook({
      chatId,
      name: dto.name,
      url: dto.url,
      secret,
      events: this.normalizeEvents(dto.events),
      enabled: dto.enabled ?? true,
      createdBy: requestUser.userId,
      updatedBy: requestUser.userId
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "integration.webhook.create",
      targetType: "integration_webhook",
      targetId: created.id,
      payload: {
        name: created.name,
        url: created.url,
        events: created.events,
        enabled: created.enabled
      }
    });

    return this.toWebhookResponse(created, true);
  }

  async updateWebhook(
    chatId: string,
    webhookId: string,
    requestUser: RequestUser,
    dto: UpdateIntegrationWebhookDto
  ): Promise<Record<string, unknown>> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "integration.webhook.create");

    const updated = await this.db.updateIntegrationWebhook(chatId, webhookId, {
      name: dto.name,
      url: dto.url,
      events: dto.events ? this.normalizeEvents(dto.events) : undefined,
      enabled: dto.enabled,
      updatedBy: requestUser.userId
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "integration.webhook.update",
      targetType: "integration_webhook",
      targetId: webhookId,
      payload: {
        fields: Object.keys(dto)
      }
    });

    return this.toWebhookResponse(updated, false);
  }

  async rotateSecret(
    chatId: string,
    webhookId: string,
    requestUser: RequestUser,
    dto: RotateIntegrationWebhookSecretDto
  ): Promise<Record<string, unknown>> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "integration.webhook.rotate_secret");

    const secret = dto.secret ?? this.generateSecret();
    const updated = await this.db.updateIntegrationWebhook(chatId, webhookId, {
      secret,
      updatedBy: requestUser.userId
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "integration.webhook.rotate_secret",
      targetType: "integration_webhook",
      targetId: webhookId,
      payload: {}
    });

    return {
      webhook: this.toWebhookResponse(updated, false),
      secret
    };
  }

  async disableWebhook(chatId: string, webhookId: string, requestUser: RequestUser): Promise<Record<string, unknown>> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "integration.webhook.disable");

    const updated = await this.db.updateIntegrationWebhook(chatId, webhookId, {
      enabled: false,
      updatedBy: requestUser.userId
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "integration.webhook.disable",
      targetType: "integration_webhook",
      targetId: webhookId,
      payload: {}
    });

    return this.toWebhookResponse(updated, false);
  }

  private toWebhookResponse(webhook: IntegrationWebhook, includeSecret: boolean): Record<string, unknown> {
    const response: Record<string, unknown> = {
      id: webhook.id,
      chatId: webhook.chatId,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      enabled: webhook.enabled,
      createdBy: webhook.createdBy,
      updatedBy: webhook.updatedBy,
      lastDeliveredAt: webhook.lastDeliveredAt ?? null,
      lastError: webhook.lastError ?? null,
      secretLast4: this.maskSecretTail(webhook.secret),
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt
    };
    if (includeSecret) {
      response.secret = webhook.secret;
    }
    return response;
  }

  private maskSecretTail(secret: string): string {
    return secret.length >= 4 ? secret.slice(-4) : secret;
  }

  private generateSecret(): string {
    return randomBytes(24).toString("base64url");
  }

  private normalizeEvents(events: string[]): IntegrationWebhook["events"] {
    return Array.from(new Set(events)) as IntegrationWebhook["events"];
  }
}
