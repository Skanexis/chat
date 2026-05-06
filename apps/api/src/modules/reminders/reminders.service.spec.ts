import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { RemindersService } from "./reminders.service.js";

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
  const remindersService = new RemindersService(db, policy, config);
  return { db, remindersService };
}

describe("RemindersService", () => {
  it("creates reminder and marks it as sent on schedule", async () => {
    const { db, remindersService } = createFixture();
    const user = await makeRequestUser(db, 990001, "reminder_user");

    const message = await db.createMessage({
      chatId: "main",
      authorId: user.userId,
      actorUserId: user.userId,
      displayAuthorType: "user",
      displayAuthorId: user.userId,
      senderMode: "as_user",
      text: "message for reminder",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const created = await remindersService.createReminder("main", user, {
      message_id: message.id,
      remind_at: new Date(Date.now() + 40).toISOString(),
      reminder_type: "personal"
    });

    await new Promise((resolve) => setTimeout(resolve, 120));

    const after = await db.getReminder("main", created.id);
    expect(after.status).toBe("sent");

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("reminder.trigger");
  });

  it("cancels scheduled reminder", async () => {
    const { db, remindersService } = createFixture();
    const user = await makeRequestUser(db, 990002, "reminder_cancel_user");

    const message = await db.createMessage({
      chatId: "main",
      authorId: user.userId,
      actorUserId: user.userId,
      displayAuthorType: "user",
      displayAuthorId: user.userId,
      senderMode: "as_user",
      text: "cancel reminder message",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const created = await remindersService.createReminder("main", user, {
      message_id: message.id,
      remind_at: new Date(Date.now() + 180).toISOString(),
      reminder_type: "personal"
    });

    const canceled = await remindersService.cancelReminder("main", created.id, user);
    expect(canceled.status).toBe("canceled");

    await new Promise((resolve) => setTimeout(resolve, 240));
    const after = await db.getReminder("main", created.id);
    expect(after.status).toBe("canceled");
  });

  it("denies reminder creation without reminder.create permission", async () => {
    const { db, remindersService } = createFixture();
    const noReminderRole = await db.createRole({
      chatId: "main",
      name: "no_reminder_role",
      priority: 150,
      isDefault: false,
      permissions: ["chat.view"]
    });

    const user = await makeRequestUser(db, 990003, "reminder_denied_user");
    await db.updateMemberRole("main", user.userId, noReminderRole.id);

    const message = await db.createMessage({
      chatId: "main",
      authorId: user.userId,
      actorUserId: user.userId,
      displayAuthorType: "user",
      displayAuthorId: user.userId,
      senderMode: "as_user",
      text: "denied reminder message",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    await expect(
      remindersService.createReminder("main", user, {
        message_id: message.id,
        remind_at: new Date(Date.now() + 300).toISOString()
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
