import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { ChatAntiAbuseService } from "./chat-anti-abuse.service.js";
import { ChatService } from "./chat.service.js";
import { ScheduledMessagesService } from "./scheduled-messages.service.js";

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
  const antiAbuse = new ChatAntiAbuseService(config);
  const chatService = new ChatService(db, policy, eventBus, antiAbuse, config);
  const scheduled = new ScheduledMessagesService(db, policy, chatService, config);
  return { db, chatService, scheduled };
}

describe("ScheduledMessagesService", () => {
  it("executes scheduled message and marks it as sent", async () => {
    const { db, chatService, scheduled } = createFixture();
    const user = await makeRequestUser(db, 601001, "scheduler_user");

    const created = await scheduled.scheduleMessage("main", user, {
      at: new Date(Date.now() + 50).toISOString(),
      payload: {
        sender_mode: "as_user",
        text: "scheduled hello"
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 120));
    const after = await db.getScheduledMessage("main", created.id);
    expect(after.status).toBe("sent");
    expect(after.sentMessageId).toBeTruthy();

    const messages = await chatService.listMessages("main", user);
    expect(messages.some((message) => message.text === "scheduled hello")).toBe(true);
  });

  it("cancels scheduled message before execution", async () => {
    const { db, chatService, scheduled } = createFixture();
    const user = await makeRequestUser(db, 601002, "scheduler_cancel_user");

    const created = await scheduled.scheduleMessage("main", user, {
      at: new Date(Date.now() + 250).toISOString(),
      payload: {
        sender_mode: "as_user",
        text: "to be canceled"
      }
    });

    const canceled = await scheduled.cancelScheduledMessage("main", created.id, user);
    expect(canceled.status).toBe("canceled");

    await new Promise((resolve) => setTimeout(resolve, 300));
    const messages = await chatService.listMessages("main", user);
    expect(messages.some((message) => message.text === "to be canceled")).toBe(false);
  });
});
