import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { BookmarksService } from "./bookmarks.service.js";

async function makeRequestUser(db: InMemoryDatabase, telegramId: number, username: string): Promise<RequestUser> {
  const user = await db.upsertTelegramUser({ telegramId, username });
  await db.ensureMember("main", user.id);
  return {
    userId: user.id,
    telegramId: user.telegramId
  };
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

function createFixture() {
  const db = new InMemoryDatabase();
  const policy = new PolicyService(db);
  const bookmarksService = new BookmarksService(db, policy);
  return { db, bookmarksService };
}

describe("BookmarksService", () => {
  it("creates, lists and deletes bookmark", async () => {
    const { db, bookmarksService } = createFixture();
    const user = await makeRequestUser(db, 995001, "bookmark_user");
    const message = await createMessage(db, user.userId, "bookmark me");

    const created = await bookmarksService.createBookmark("main", user, {
      message_id: message.id,
      collection: "inbox",
      tags: ["important", "todo"],
      note: "follow up"
    });
    expect(created.collection).toBe("inbox");
    expect(created.tags).toEqual(["important", "todo"]);

    const listed = await bookmarksService.listBookmarks("main", user);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);

    const deleted = await bookmarksService.deleteBookmark("main", created.id, user);
    expect(deleted.ok).toBe(true);

    const afterDelete = await bookmarksService.listBookmarks("main", user);
    expect(afterDelete).toHaveLength(0);
  });

  it("upserts duplicate bookmark key by updating note and tags", async () => {
    const { db, bookmarksService } = createFixture();
    const user = await makeRequestUser(db, 995002, "bookmark_upsert_user");
    const message = await createMessage(db, user.userId, "same key message");

    const first = await bookmarksService.createBookmark("main", user, {
      message_id: message.id,
      collection: "default",
      tags: ["v1"],
      note: "first"
    });
    const second = await bookmarksService.createBookmark("main", user, {
      message_id: message.id,
      collection: "default",
      tags: ["v2"],
      note: "updated"
    });

    expect(second.id).toBe(first.id);
    expect(second.tags).toEqual(["v2"]);
    expect(second.note).toBe("updated");

    const listed = await bookmarksService.listBookmarks("main", user);
    expect(listed).toHaveLength(1);
  });

  it("requires bookmark.collection.manage for shared bookmarks", async () => {
    const { db, bookmarksService } = createFixture();
    const user = await makeRequestUser(db, 995003, "bookmark_shared_member");
    const message = await createMessage(db, user.userId, "shared bookmark target");

    await expect(
      bookmarksService.createBookmark("main", user, {
        message_id: message.id,
        is_shared: true
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows privileged member to delete another user bookmark", async () => {
    const { db, bookmarksService } = createFixture();
    const owner = await makeRequestUser(db, 995004, "bookmark_owner");
    const moderator = await makeRequestUser(db, 995005, "bookmark_moderator");
    const moderatorRole = await db.createRole({
      chatId: "main",
      name: "bookmark_moderator_role",
      priority: 600,
      isDefault: false,
      permissions: ["chat.view", "bookmark.create", "bookmark.collection.manage"]
    });
    await db.updateMemberRole("main", moderator.userId, moderatorRole.id);

    const message = await createMessage(db, owner.userId, "owner message");
    const bookmark = await bookmarksService.createBookmark("main", owner, {
      message_id: message.id
    });

    const deleted = await bookmarksService.deleteBookmark("main", bookmark.id, moderator);
    expect(deleted.ok).toBe(true);
  });
});
