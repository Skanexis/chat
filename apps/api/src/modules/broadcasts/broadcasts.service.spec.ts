import { BadRequestException, HttpException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import type { BroadcastQueueService } from "./broadcast-queue.service.js";
import { BroadcastsService } from "./broadcasts.service.js";

type QueueMock = {
  enqueueNow: ReturnType<typeof vi.fn>;
  enqueueScheduled: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
};

function createFixture() {
  const db = new InMemoryDatabase();
  const policy = new PolicyService(db);
  const eventBus = new EventBusService();
  const queue: QueueMock = {
    enqueueNow: vi.fn(async () => {}),
    enqueueScheduled: vi.fn(async () => {}),
    cancel: vi.fn(async () => {})
  };
  const service = new BroadcastsService(
    db,
    policy,
    eventBus,
    queue as unknown as BroadcastQueueService,
    new ConfigService()
  );
  return { db, service, queue };
}

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

afterEach(() => {
  delete process.env.BROADCAST_ALLOWED_PLACEHOLDERS;
  delete process.env.BROADCAST_CREATE_COOLDOWN_SECONDS;
  delete process.env.BROADCAST_IDEMPOTENCY_TTL_SECONDS;
});

describe("BroadcastsService validations", () => {
  it("rejects unsafe placeholder in broadcast text", async () => {
    const { db, service } = createFixture();
    const user = await createUserWithPermissions(db, 710001, "bcast_user", ["broadcast.create"]);

    await expect(
      service.createCampaign("main", user, {
        name: "Unsafe placeholders",
        broadcast_type: "scheduled",
        audience: {},
        content: { text: "Hello {not_allowed}" },
        schedule: { at: new Date(Date.now() + 60_000).toISOString(), timezone: "UTC" },
        sender_mode: "as_user"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects invalid audience role", async () => {
    const { db, service } = createFixture();
    const user = await createUserWithPermissions(db, 710002, "aud_user", ["broadcast.create"]);

    await expect(
      service.createCampaign("main", user, {
        name: "Audience role check",
        broadcast_type: "scheduled",
        audience: { roles: ["role_missing"] },
        content: { text: "Hello" },
        schedule: { at: new Date(Date.now() + 60_000).toISOString(), timezone: "UTC" },
        sender_mode: "as_user"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("applies campaign-per-chat create cooldown", async () => {
    process.env.BROADCAST_CREATE_COOLDOWN_SECONDS = "300";

    const { db, service } = createFixture();
    const user = await createUserWithPermissions(db, 710003, "cool_user", ["broadcast.create"]);

    await expect(
      service.createCampaign("main", user, {
        name: "First campaign",
        broadcast_type: "scheduled",
        audience: {},
        content: { text: "Hello first" },
        schedule: { at: new Date(Date.now() + 60_000).toISOString(), timezone: "UTC" },
        sender_mode: "as_user"
      })
    ).resolves.toBeDefined();

    await expect(
      service.createCampaign("main", user, {
        name: "Second campaign",
        broadcast_type: "scheduled",
        audience: {},
        content: { text: "Hello second" },
        schedule: { at: new Date(Date.now() + 120_000).toISOString(), timezone: "UTC" },
        sender_mode: "as_user"
      })
    ).rejects.toBeInstanceOf(HttpException);
  });

  it("deduplicates publish-now by idempotency key", async () => {
    process.env.BROADCAST_IDEMPOTENCY_TTL_SECONDS = "3600";

    const { db, service, queue } = createFixture();
    const user = await createUserWithPermissions(db, 710004, "idem_user", ["broadcast.create", "broadcast.publish.now"]);

    const created = await service.createCampaign("main", user, {
      name: "Idem campaign",
      broadcast_type: "scheduled",
      audience: {},
      content: { text: "Hello" },
      schedule: { at: new Date(Date.now() + 60_000).toISOString(), timezone: "UTC" },
      sender_mode: "as_user"
    });

    await expect(
      service.publishNow("main", created.id, user, {
        idempotency_key: "idem-key-1"
      })
    ).resolves.toBeDefined();

    await expect(
      service.publishNow("main", created.id, user, {
        idempotency_key: "idem-key-1"
      })
    ).resolves.toBeDefined();

    expect(queue.enqueueNow).toHaveBeenCalledTimes(1);
  });
});
