import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { AlertsService } from "./alerts.service.js";

async function makeRequestUser(db: InMemoryDatabase, telegramId: number, username: string): Promise<RequestUser> {
  const user = await db.upsertTelegramUser({ telegramId, username });
  await db.ensureMember("main", user.id);
  return {
    userId: user.id,
    telegramId: user.telegramId
  };
}

function createFixture() {
  const db = new InMemoryDatabase();
  const config = new ConfigService();
  const policy = new PolicyService(db);
  const eventBus = new EventBusService();
  const alertsService = new AlertsService(db, policy, eventBus, config);
  return { db, eventBus, alertsService };
}

describe("AlertsService", () => {
  it("creates, lists and deletes keyword alert", async () => {
    const { alertsService, db } = createFixture();
    const user = await makeRequestUser(db, 991001, "keyword_user");

    const created = await alertsService.createKeywordAlert("main", user, {
      keyword: "incident"
    });
    expect(created.keyword).toBe("incident");

    const listed = await alertsService.listKeywordAlerts("main", user);
    expect(listed).toHaveLength(1);

    const deleted = await alertsService.deleteKeywordAlert("main", created.id, user);
    expect(deleted.ok).toBe(true);

    const afterDelete = await alertsService.listKeywordAlerts("main", user);
    expect(afterDelete).toHaveLength(0);
  });

  it("updates lastTriggeredAt when matching message arrives", async () => {
    const { db, eventBus, alertsService } = createFixture();
    const watcher = await makeRequestUser(db, 991002, "watcher_user");
    const sender = await makeRequestUser(db, 991003, "sender_user");

    const created = await alertsService.createKeywordAlert("main", watcher, {
      keyword: "outage"
    });

    const message = await db.createMessage({
      chatId: "main",
      authorId: sender.userId,
      actorUserId: sender.userId,
      displayAuthorType: "user",
      displayAuthorId: sender.userId,
      senderMode: "as_user",
      text: "We have outage in cluster",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    eventBus.emit("message.created", message);
    await new Promise((resolve) => setTimeout(resolve, 30));

    const updated = await db.getKeywordAlert("main", created.id);
    expect(updated.lastTriggeredAt).toBeTruthy();

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("alert.keyword.trigger");
  });

  it("denies creation without alert.keyword.create permission", async () => {
    const { db, alertsService } = createFixture();
    const noAlertRole = await db.createRole({
      chatId: "main",
      name: "no_alert_role",
      priority: 170,
      isDefault: false,
      permissions: ["chat.view"]
    });

    const user = await makeRequestUser(db, 991004, "no_alert_user");
    await db.updateMemberRole("main", user.userId, noAlertRole.id);

    await expect(
      alertsService.createKeywordAlert("main", user, {
        keyword: "test"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
