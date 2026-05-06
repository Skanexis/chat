import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomUUID } from "node:crypto";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import type { IntegrationWebhook, WebhookEvent } from "../../core/types.js";
import { WEBHOOK_SUPPORTED_EVENTS } from "./webhook-events.js";

@Injectable()
export class WebhookDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatcherService.name);
  private readonly detachListeners: Array<() => void> = [];

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly eventBus: EventBusService,
    private readonly configService: ConfigService
  ) {}

  onModuleInit(): void {
    for (const event of WEBHOOK_SUPPORTED_EVENTS) {
      this.detachListeners.push(
        this.eventBus.on(event, (payload) => {
          void this.dispatch(event, payload as Record<string, unknown>);
        })
      );
    }
  }

  onModuleDestroy(): void {
    for (const detach of this.detachListeners) {
      detach();
    }
    this.detachListeners.length = 0;
  }

  private async dispatch(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
    const chatId = this.resolveChatId(payload);
    if (!chatId) {
      return;
    }

    try {
      const webhooks = await this.db.listIntegrationWebhooks(chatId);
      const targets = webhooks.filter((webhook) => webhook.enabled && webhook.events.includes(event));
      await Promise.allSettled(targets.map((webhook) => this.deliverWebhook(webhook, event, payload)));
    } catch (error) {
      this.logger.warn(`Webhook dispatch skipped for event ${event}: ${(error as Error).message}`);
    }
  }

  private resolveChatId(payload: Record<string, unknown>): string | null {
    const raw = payload.chatId;
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  }

  private async deliverWebhook(webhook: IntegrationWebhook, event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
    const timestamp = new Date().toISOString();
    const deliveryId = randomUUID();
    const body = JSON.stringify({
      event,
      delivery_id: deliveryId,
      occurred_at: timestamp,
      data
    });
    const signature = `sha256=${createHmac("sha256", webhook.secret).update(body).digest("hex")}`;

    const maxAttempts = this.parsePositiveInt(this.configService.get<string>("WEBHOOK_DELIVERY_MAX_ATTEMPTS"), 3);
    const timeoutMs = this.parsePositiveInt(this.configService.get<string>("WEBHOOK_DELIVERY_TIMEOUT_MS"), 5000);
    const backoffMs = this.parsePositiveInt(this.configService.get<string>("WEBHOOK_DELIVERY_BACKOFF_MS"), 250);
    let lastError = "Unknown webhook delivery error.";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await this.sendOnce({
        url: webhook.url,
        event,
        deliveryId,
        timestamp,
        signature,
        body,
        timeoutMs
      });

      if (result.ok) {
        await this.db.updateIntegrationWebhook(webhook.chatId, webhook.id, {
          updatedBy: "system",
          lastDeliveredAt: new Date().toISOString(),
          lastError: null
        });
        await this.db.addAuditLog({
          chatId: webhook.chatId,
          actorId: "system",
          action: "integration.webhook.delivery.ok",
          targetType: "integration_webhook",
          targetId: webhook.id,
          payload: {
            event,
            deliveryId,
            attempts: attempt,
            status: result.status
          }
        });
        return;
      }

      lastError = result.error;
      if (attempt < maxAttempts) {
        await this.sleep(backoffMs * attempt);
      }
    }

    await this.db.updateIntegrationWebhook(webhook.chatId, webhook.id, {
      updatedBy: "system",
      lastError: lastError.slice(0, 512)
    });
    await this.db.addAuditLog({
      chatId: webhook.chatId,
      actorId: "system",
      action: "integration.webhook.delivery.failed",
      targetType: "integration_webhook",
      targetId: webhook.id,
      payload: {
        event,
        deliveryId,
        error: lastError
      }
    });
  }

  private async sendOnce(input: {
    url: string;
    event: WebhookEvent;
    deliveryId: string;
    timestamp: string;
    signature: string;
    body: string;
    timeoutMs: number;
  }): Promise<{ ok: true; status: number } | { ok: false; error: string }> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), input.timeoutMs);
    try {
      const response = await fetch(input.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pl-event": input.event,
          "x-pl-delivery-id": input.deliveryId,
          "x-pl-idempotency-key": input.deliveryId,
          "x-pl-timestamp": input.timestamp,
          "x-pl-signature": input.signature
        },
        body: input.body,
        signal: abort.signal
      });
      if (!response.ok) {
        return {
          ok: false,
          error: `Webhook responded with HTTP ${response.status}.`
        };
      }
      return {
        ok: true,
        status: response.status
      };
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message || "Network error."
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
