import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { UnreadSummaryService } from "./unread-summary.service.js";

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
  const policy = new PolicyService(db);
  const unreadSummaryService = new UnreadSummaryService(db, policy);
  return { db, unreadSummaryService };
}

describe("UnreadSummaryService", () => {
  it("builds summary with mentions-only filter", async () => {
    const { db, unreadSummaryService } = createFixture();
    const user = await makeRequestUser(db, 990001, "summary_user");

    await db.createMessage({
      chatId: "main",
      authorId: user.userId,
      actorUserId: user.userId,
      displayAuthorType: "user",
      displayAuthorId: user.userId,
      senderMode: "as_user",
      text: "hello world",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });
    await db.createMessage({
      chatId: "main",
      authorId: user.userId,
      actorUserId: user.userId,
      displayAuthorType: "user",
      displayAuthorId: user.userId,
      senderMode: "as_user",
      text: "@summary_user please check this",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const summary = await unreadSummaryService.getSummary("main", user, {
      mentions_only: "true"
    });
    expect(summary.matchedCount).toBe(1);
    expect(summary.summary.toLowerCase()).toContain("@summary_user");
  });

  it("denies unread summary for role without summary.unread.generate", async () => {
    const { db, unreadSummaryService } = createFixture();
    const memberRole = await db.createRole({
      chatId: "main",
      name: "member_without_summary",
      priority: 120,
      isDefault: false,
      permissions: ["chat.view"]
    });
    const user = await makeRequestUser(db, 990002, "summary_denied");
    await db.updateMemberRole("main", user.userId, memberRole.id);

    await expect(unreadSummaryService.getSummary("main", user, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});
