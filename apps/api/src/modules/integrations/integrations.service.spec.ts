import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { IntegrationsService } from "./integrations.service.js";
import { WebhookDispatcherService } from "./webhook-dispatcher.service.js";

async function createUserWithPermissions(
  db: InMemoryDatabase,
  telegramId: number,
  username: string,
  permissions: string[]
): Promise<RequestUser> {
  await db.createRole({
    chatId: "main",
    name: `role_${username}`,
    priority: 5000,
    permissions,
    isDefault: true
  });
  const user = await db.upsertTelegramUser({ telegramId, username });
  await db.ensureMember("main", user.id);
  return {
    userId: user.id,
    telegramId: user.telegramId
  };
}

function createFixture() {
  const db = new InMemoryDatabase();
  const policy = new PolicyService(db);
  const integrationsService = new IntegrationsService(db, policy);
  return {
    db,
    integrationsService
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WEBHOOK_DELIVERY_MAX_ATTEMPTS;
  delete process.env.WEBHOOK_DELIVERY_TIMEOUT_MS;
  delete process.env.WEBHOOK_DELIVERY_BACKOFF_MS;
});

describe("IntegrationsService webhooks", () => {
  it("creates webhook and masks secret in list response", async () => {
    const { db, integrationsService } = createFixture();
    const user = await createUserWithPermissions(db, 820001, "webhook_admin", [
      "integration.webhook.create",
      "integration.webhook.rotate_secret",
      "integration.webhook.disable"
    ]);

    const created = await integrationsService.createWebhook("main", user, {
      name: "CRM sink",
      url: "https://example.com/hook",
      events: ["message.created"],
      enabled: true
    });
    expect(typeof created.secret).toBe("string");

    const listed = await integrationsService.listWebhooks("main", user);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("secret");
    expect(typeof listed[0]?.secretLast4).toBe("string");
  });

  it("requires rotate permission for webhook secret rotation", async () => {
    const { db, integrationsService } = createFixture();
    const user = await createUserWithPermissions(db, 820002, "webhook_editor", ["integration.webhook.create"]);

    const created = await integrationsService.createWebhook("main", user, {
      name: "BI sink",
      url: "https://example.com/bi",
      events: ["message.created"],
      enabled: true
    });

    await expect(
      integrationsService.rotateSecret("main", String(created.id), user, {
        secret: "this_secret_value_is_long_enough_123"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("dispatches message.created event to enabled webhook", async () => {
    process.env.WEBHOOK_DELIVERY_MAX_ATTEMPTS = "1";
    process.env.WEBHOOK_DELIVERY_TIMEOUT_MS = "2000";
    process.env.WEBHOOK_DELIVERY_BACKOFF_MS = "1";

    const { db, integrationsService } = createFixture();
    const eventBus = new EventBusService();
    const dispatcher = new WebhookDispatcherService(db, eventBus, new ConfigService());
    const user = await createUserWithPermissions(db, 820003, "webhook_sender", ["integration.webhook.create"]);

    await integrationsService.createWebhook("main", user, {
      name: "Webhook Delivery",
      url: "https://example.com/delivery",
      events: ["message.created"],
      enabled: true
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          ok: true,
          status: 200
        } as any;
      })
    );

    dispatcher.onModuleInit();
    eventBus.emit("message.created", {
      id: "m1",
      chatId: "main",
      authorId: user.userId,
      actorUserId: user.userId,
      displayAuthorType: "user",
      displayAuthorId: user.userId,
      senderMode: "as_user",
      text: "hello",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    dispatcher.onModuleDestroy();

    const [webhook] = await db.listIntegrationWebhooks("main");
    expect(webhook?.lastDeliveredAt).toBeTruthy();
    expect(webhook?.lastError).toBeNull();
  });
});
