import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { ReadReceiptsService } from "./read-receipts.service.js";

async function makeRequestUser(db: InMemoryDatabase, telegramId: number, username: string): Promise<RequestUser> {
  const user = await db.upsertTelegramUser({ telegramId, username });
  await db.ensureMember("main", user.id);
  return {
    userId: user.id,
    telegramId: user.telegramId
  };
}

function createFixture(configValues?: Record<string, string>) {
  const db = new InMemoryDatabase();
  const config = new ConfigService(configValues ?? {});
  const policy = new PolicyService(db);
  const readReceiptsService = new ReadReceiptsService(db, policy, config);
  return { db, readReceiptsService };
}

async function createMessage(db: InMemoryDatabase, authorId: string, text: string) {
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
    replyToId: null
  });
}

describe("ReadReceiptsService", () => {
  it("does not store receipt when mode is off", async () => {
    const { db, readReceiptsService } = createFixture({ READ_RECEIPTS_MODE_DEFAULT: "off" });
    const user = await makeRequestUser(db, 992001, "receipt_off_user");
    const message = await createMessage(db, user.userId, "message to read");

    const result = await readReceiptsService.markRead("main", message.id, user, {});
    expect(result.stored).toBe(false);

    const receipts = await db.listReadReceipts("main", message.id);
    expect(receipts).toHaveLength(0);
  });

  it("returns only own receipt for user without view.any", async () => {
    const { db, readReceiptsService } = createFixture();
    const member = await makeRequestUser(db, 992002, "receipt_member");
    const another = await makeRequestUser(db, 992003, "receipt_another");
    const message = await createMessage(db, another.userId, "hello receipts");

    await readReceiptsService.markRead("main", message.id, member, {});
    const summary = await readReceiptsService.getReadReceipts("main", message.id, member);

    expect(summary.totals.readers).toBe(1);
    expect(summary.totals.visible_readers).toBe(1);
    expect(summary.readers).toHaveLength(1);
    expect(summary.readers[0]?.userId).toBe(member.userId);
  });

  it("respects cross-role visibility policy for read_receipt.view.any", async () => {
    const { db, readReceiptsService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "receipt_operator",
      priority: 700,
      isDefault: false,
      permissions: ["chat.view", "read_receipt.view.own", "read_receipt.view.any", "read_receipt.privacy.manage"]
    });

    const operator = await makeRequestUser(db, 992004, "receipt_operator_user");
    await db.updateMemberRole("main", operator.userId, operatorRole.id);

    const member = await makeRequestUser(db, 992005, "receipt_target_member");
    const message = await createMessage(db, member.userId, "policy visibility message");

    await readReceiptsService.updatePrivacy("main", member, {
      mode: "global"
    });
    await readReceiptsService.markRead("main", message.id, member, {});

    const visibleBefore = await readReceiptsService.getReadReceipts("main", message.id, operator);
    expect(visibleBefore.totals.visible_readers).toBe(1);

    await readReceiptsService.updatePrivacy("main", operator, {
      allow_cross_role_view: false
    });

    const visibleAfter = await readReceiptsService.getReadReceipts("main", message.id, operator);
    expect(visibleAfter.totals.visible_readers).toBe(0);
    expect(visibleAfter.totals.hidden_readers).toBe(1);
  });
});
