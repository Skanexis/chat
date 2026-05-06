import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { ThreadSubscriptionsService } from "./thread-subscriptions.service.js";

async function makeRequestUser(db: InMemoryDatabase, telegramId: number, username: string): Promise<RequestUser> {
  const user = await db.upsertTelegramUser({ telegramId, username });
  await db.ensureMember("main", user.id);
  return {
    userId: user.id,
    telegramId: user.telegramId
  };
}

async function createMessage(db: InMemoryDatabase, authorId: string, text: string, replyToId?: string) {
  return db.createMessage({
    chatId: "main",
    authorId,
    actorUserId: authorId,
    displayAuthorType: "user",
    displayAuthorId: authorId,
    senderMode: "as_user",
    text,
    media: null,
    signatureMode: undefined,
    customSignature: null,
    replyToId: replyToId ?? null
  });
}

function createFixture(configValues?: Record<string, string>) {
  const db = new InMemoryDatabase();
  const policy = new PolicyService(db);
  const eventBus = new EventBusService();
  const config = new ConfigService(configValues ?? {});
  const threadSubscriptionsService = new ThreadSubscriptionsService(db, policy, eventBus, config);
  return { db, eventBus, threadSubscriptionsService };
}

describe("ThreadSubscriptionsService", () => {
  it("creates, lists and deletes thread subscription", async () => {
    const { db, threadSubscriptionsService } = createFixture();
    const user = await makeRequestUser(db, 996001, "thread_subscriber");
    const source = await createMessage(db, user.userId, "root message");

    const created = await threadSubscriptionsService.createThreadSubscription("main", user, {
      message_id: source.id
    });
    expect(created.subscriptionType).toBe("thread");

    const listed = await threadSubscriptionsService.listThreadSubscriptions("main", user);
    expect(listed).toHaveLength(1);

    const deleted = await threadSubscriptionsService.deleteThreadSubscription("main", created.id, user);
    expect(deleted.ok).toBe(true);
  });

  it("triggers subscription on reply and emits event", async () => {
    const { db, eventBus, threadSubscriptionsService } = createFixture();
    const watcher = await makeRequestUser(db, 996002, "thread_watcher");
    const sender = await makeRequestUser(db, 996003, "thread_sender");
    const source = await createMessage(db, watcher.userId, "watch me");

    const subscription = await threadSubscriptionsService.createThreadSubscription("main", watcher, {
      message_id: source.id,
      dedup_window_seconds: 60
    });

    const triggered: Array<{ subscriptionId: string; triggerMessageId: string }> = [];
    const off = eventBus.on("thread.subscription.triggered", (payload) => {
      triggered.push({
        subscriptionId: payload.subscriptionId,
        triggerMessageId: payload.triggerMessageId
      });
    });

    const reply = await createMessage(db, sender.userId, "reply 1", source.id);
    eventBus.emit("message.created", reply);
    await new Promise((resolve) => setTimeout(resolve, 30));

    const updated = await db.getThreadSubscription("main", subscription.id);
    expect(updated.lastTriggeredAt).toBeTruthy();
    expect(triggered).toEqual([
      {
        subscriptionId: subscription.id,
        triggerMessageId: reply.id
      }
    ]);

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("thread.subscription.trigger");

    off();
  });

  it("applies dedup window to repeated replies", async () => {
    const { db, eventBus, threadSubscriptionsService } = createFixture();
    const watcher = await makeRequestUser(db, 996004, "dedup_watcher");
    const sender = await makeRequestUser(db, 996005, "dedup_sender");
    const source = await createMessage(db, watcher.userId, "dedup root");

    await threadSubscriptionsService.createThreadSubscription("main", watcher, {
      message_id: source.id,
      dedup_window_seconds: 3600
    });

    const firstReply = await createMessage(db, sender.userId, "first", source.id);
    const secondReply = await createMessage(db, sender.userId, "second", source.id);
    eventBus.emit("message.created", firstReply);
    eventBus.emit("message.created", secondReply);
    await new Promise((resolve) => setTimeout(resolve, 30));

    const triggerAudits = (await db.listAudit("main")).filter((entry) => entry.action === "thread.subscription.trigger");
    expect(triggerAudits).toHaveLength(1);
  });

  it("denies deleting another user subscription without member.view_list", async () => {
    const { db, threadSubscriptionsService } = createFixture();
    const owner = await makeRequestUser(db, 996006, "subscription_owner");
    const outsider = await makeRequestUser(db, 996007, "subscription_outsider");
    const source = await createMessage(db, owner.userId, "owner root");
    const created = await threadSubscriptionsService.createThreadSubscription("main", owner, {
      message_id: source.id
    });

    await expect(
      threadSubscriptionsService.deleteThreadSubscription("main", created.id, outsider)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

