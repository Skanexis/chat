import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { ChatAntiAbuseService } from "./chat-anti-abuse.service.js";
import { ChatService } from "./chat.service.js";

async function makeRequestUser(db: InMemoryDatabase, telegramId: number, username: string): Promise<RequestUser> {
  const user = await db.upsertTelegramUser({ telegramId, username });
  await db.ensureMember("main", user.id);
  return {
    userId: user.id,
    telegramId: user.telegramId
  };
}

function createChatServiceFixture() {
  const db = new InMemoryDatabase();
  const policy = new PolicyService(db);
  const eventBus = new EventBusService();
  const antiAbuse = new ChatAntiAbuseService(new ConfigService());
  const chatService = new ChatService(db, policy, eventBus, antiAbuse, new ConfigService());
  return { db, chatService };
}

describe("ChatService message permission matrix", () => {
  it("denies banned member from chat access operations", async () => {
    const { db, chatService } = createChatServiceFixture();
    const user = await makeRequestUser(db, 500901, "banned_viewer");
    await db.updateMemberStatus("main", user.userId, "banned", null);

    await expect(chatService.getChat("main", user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(chatService.listMessages("main", user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(chatService.searchMessages("main", user, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows own edit/delete but denies edit/delete any for default member role", async () => {
    const { db, chatService } = createChatServiceFixture();
    const userA = await makeRequestUser(db, 501001, "member_a");
    const userB = await makeRequestUser(db, 501002, "member_b");

    const created = await chatService.createMessage("main", userA, {
      sender_mode: "as_user",
      text: "hello"
    });

    await expect(
      chatService.updateMessage("main", created.id, userA, {
        text: "updated by owner"
      })
    ).resolves.toBeDefined();

    await expect(
      chatService.updateMessage("main", created.id, userB, {
        text: "attempt to edit foreign message"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(chatService.deleteMessage("main", created.id, userB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(chatService.deleteMessage("main", created.id, userA)).resolves.toMatchObject({ isDeleted: true });
  });

  it("allows admin with message.delete.any to purge chat via /purge command alias", async () => {
    const { db, chatService } = createChatServiceFixture();
    const regularA = await makeRequestUser(db, 501003, "regular_a");
    const regularB = await makeRequestUser(db, 501004, "regular_b");
    const admin = await makeRequestUser(db, 501005, "admin_purger");
    const senderRole = await db.createRole({
      chatId: "main",
      name: "sender_role_for_purge_test",
      priority: 7000,
      permissions: ["chat.view", "message.send.text"],
      isDefault: false
    });
    await db.updateMemberRole("main", regularA.userId, senderRole.id);
    await db.updateMemberRole("main", regularB.userId, senderRole.id);

    await chatService.createMessage("main", regularA, {
      sender_mode: "as_user",
      text: "first message"
    });
    await chatService.createMessage("main", regularB, {
      sender_mode: "as_user",
      text: "second message"
    });

    const adminRole = await db.createRole({
      chatId: "main",
      name: "admin_purge_role",
      priority: 9500,
      permissions: ["chat.view", "message.send.text", "message.delete.any"],
      isDefault: false
    });
    await db.updateMemberRole("main", admin.userId, adminRole.id);

    const result = await chatService.createMessage("main", admin, {
      sender_mode: "as_user",
      text: "/pure"
    });
    expect(result.text).toContain("Chat purged:");

    const all = await db.listMessages("main", { includeDeleted: true });
    const active = all.filter((message) => !message.isDeleted);
    const deleted = all.filter((message) => message.isDeleted);

    expect(active.length).toBe(1);
    expect(active[0]?.id).toBe(result.id);
    expect(deleted.length).toBe(2);
  });

  it("denies /purge for role without message.delete.any", async () => {
    const { db, chatService } = createChatServiceFixture();
    const member = await makeRequestUser(db, 501006, "member_no_purge");
    const another = await makeRequestUser(db, 501007, "another_member");
    const senderRole = await db.createRole({
      chatId: "main",
      name: "sender_role_without_purge",
      priority: 7100,
      permissions: ["chat.view", "message.send.text"],
      isDefault: false
    });
    await db.updateMemberRole("main", member.userId, senderRole.id);
    await db.updateMemberRole("main", another.userId, senderRole.id);

    await chatService.createMessage("main", another, {
      sender_mode: "as_user",
      text: "seed message"
    });

    await expect(
      chatService.createMessage("main", member, {
        sender_mode: "as_user",
        text: "/purge *"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);

    const all = await db.listMessages("main", { includeDeleted: true });
    expect(all.filter((message) => !message.isDeleted).length).toBe(1);
  });

  it("denies media and as_group for default member role", async () => {
    const { db, chatService } = createChatServiceFixture();
    const user = await makeRequestUser(db, 501101, "member_media");

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        media: { type: "image", url: "https://example.com/image.png" }
      })
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_group",
        text: "group post"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows privileged wildcard role to post as_group with media and edit any", async () => {
    const { db, chatService } = createChatServiceFixture();
    const regularUser = await makeRequestUser(db, 501201, "regular");

    const wildcardRole = await db.createRole({
      chatId: "main",
      name: "wildcard_role",
      priority: 5000,
      permissions: ["*"],
      isDefault: true
    });
    expect(wildcardRole.permissions).toContain("*");

    const privilegedUser = await makeRequestUser(db, 501202, "privileged");
    const identities = await db.listIdentities("main");
    expect(identities.length).toBeGreaterThan(0);

    const regularMessage = await chatService.createMessage("main", regularUser, {
      sender_mode: "as_user",
      text: "regular message"
    });

    await expect(
      chatService.createMessage("main", privilegedUser, {
        sender_mode: "as_group",
        identity_id: identities[0]!.id,
        signature_mode: "custom",
        custom_signature: "Signed by team",
        media: { type: "video", url: "https://example.com/video.mp4" }
      })
    ).resolves.toBeDefined();

    await expect(
      chatService.updateMessage("main", regularMessage.id, privilegedUser, {
        text: "edited by privileged"
      })
    ).resolves.toMatchObject({ text: "edited by privileged" });
  });

  it("blocks duplicate spam by threshold within window", async () => {
    process.env.CHAT_DUPLICATE_THRESHOLD = "2";
    process.env.CHAT_DUPLICATE_WINDOW_SECONDS = "300";

    const { db, chatService } = createChatServiceFixture();
    const user = await makeRequestUser(db, 501301, "dup_user");

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        text: "same duplicate text"
      })
    ).resolves.toBeDefined();

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        text: "same duplicate text"
      })
    ).rejects.toBeInstanceOf(HttpException);

    delete process.env.CHAT_DUPLICATE_THRESHOLD;
    delete process.env.CHAT_DUPLICATE_WINDOW_SECONDS;
  });

  it("blocks denylisted URL domains", async () => {
    process.env.CHAT_LINK_DENYLIST = "spam.test,bad.example";
    process.env.CHAT_AUTOSANCTION_ENABLED = "false";

    const { db, chatService } = createChatServiceFixture();
    const user = await makeRequestUser(db, 501401, "deny_domain_user");

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        text: "check this https://spam.test/win"
      })
    ).rejects.toBeInstanceOf(HttpException);

    delete process.env.CHAT_LINK_DENYLIST;
    delete process.env.CHAT_AUTOSANCTION_ENABLED;
  });

  it("enforces max text length by role", async () => {
    process.env.CHAT_MAX_TEXT_LENGTH_DEFAULT = "5";

    const { db, chatService } = createChatServiceFixture();
    const user = await makeRequestUser(db, 501501, "len_user");

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        text: "123456"
      })
    ).rejects.toBeInstanceOf(HttpException);

    delete process.env.CHAT_MAX_TEXT_LENGTH_DEFAULT;
  });

  it("blocks keywords/regex and media extension by policy", async () => {
    process.env.CHAT_BLOCKED_KEYWORDS = "forbidden,secretword";
    process.env.CHAT_BLOCKED_REGEX_PATTERNS = "credit\\s*card\\s*\\d{4}";
    process.env.CHAT_MEDIA_ALLOWED_EXTENSIONS_JSON = "{\"image\":[\".png\"]}";
    process.env.CHAT_AUTOSANCTION_ENABLED = "false";

    const { db, chatService } = createChatServiceFixture();
    const user = await makeRequestUser(db, 501601, "blocked_user");

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        text: "this contains secretword"
      })
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        text: "credit card 1234 should match"
      })
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        media: { type: "image", url: "https://example.com/file.jpg" }
      })
    ).rejects.toBeInstanceOf(HttpException);

    delete process.env.CHAT_BLOCKED_KEYWORDS;
    delete process.env.CHAT_BLOCKED_REGEX_PATTERNS;
    delete process.env.CHAT_MEDIA_ALLOWED_EXTENSIONS_JSON;
    delete process.env.CHAT_AUTOSANCTION_ENABLED;
  });

  it("escalates sanctions: warn -> short mute -> long mute -> ban", async () => {
    process.env.CHAT_BLOCKED_KEYWORDS = "strikeword";
    process.env.CHAT_AUTOSANCTION_ENABLED = "true";
    process.env.CHAT_AUTOSANCTION_WINDOW_HOURS = "24";
    process.env.CHAT_AUTOSANCTION_STEP1 = "warn";
    process.env.CHAT_AUTOSANCTION_STEP2 = "short_mute";
    process.env.CHAT_AUTOSANCTION_STEP3 = "long_mute";
    process.env.CHAT_AUTOSANCTION_STEP4 = "ban";
    process.env.CHAT_AUTOSANCTION_SHORT_MUTE_SECONDS = "60";
    process.env.CHAT_AUTOSANCTION_LONG_MUTE_SECONDS = "120";

    const { db, chatService } = createChatServiceFixture();
    const user = await makeRequestUser(db, 501701, "autosanction_user");

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        text: "contains strikeword 1"
      })
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        text: "contains strikeword 2"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    let member = await db.getMember("main", user.userId);
    expect(member?.status).toBe("muted");

    await db.updateMemberStatus("main", user.userId, "active", null);
    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        text: "contains strikeword 3"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    member = await db.getMember("main", user.userId);
    expect(member?.status).toBe("muted");

    await db.updateMemberStatus("main", user.userId, "active", null);
    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        text: "contains strikeword 4"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    member = await db.getMember("main", user.userId);
    expect(member?.status).toBe("banned");

    const audits = await db.listAudit("main");
    const sanctionAudits = audits.filter((audit) => audit.action === "anti_abuse.violation" && audit.targetId === user.userId);
    expect(sanctionAudits.length).toBe(4);

    delete process.env.CHAT_BLOCKED_KEYWORDS;
    delete process.env.CHAT_AUTOSANCTION_ENABLED;
    delete process.env.CHAT_AUTOSANCTION_WINDOW_HOURS;
    delete process.env.CHAT_AUTOSANCTION_STEP1;
    delete process.env.CHAT_AUTOSANCTION_STEP2;
    delete process.env.CHAT_AUTOSANCTION_STEP3;
    delete process.env.CHAT_AUTOSANCTION_STEP4;
    delete process.env.CHAT_AUTOSANCTION_SHORT_MUTE_SECONDS;
    delete process.env.CHAT_AUTOSANCTION_LONG_MUTE_SECONDS;
  });

  it("searches messages by text, content type, and media type filters", async () => {
    const { db, chatService } = createChatServiceFixture();
    const viewer = await makeRequestUser(db, 501801, "viewer_search");
    const authorA = await makeRequestUser(db, 501802, "author_a_search");
    const authorB = await makeRequestUser(db, 501803, "author_b_search");

    await db.createMessage({
      chatId: "main",
      authorId: authorA.userId,
      actorUserId: authorA.userId,
      displayAuthorType: "user",
      displayAuthorId: authorA.userId,
      senderMode: "as_user",
      text: "alpha text",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });
    await db.createMessage({
      chatId: "main",
      authorId: authorB.userId,
      actorUserId: authorB.userId,
      displayAuthorType: "user",
      displayAuthorId: authorB.userId,
      senderMode: "as_user",
      text: "beta text",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });
    await db.createMessage({
      chatId: "main",
      authorId: authorA.userId,
      actorUserId: authorA.userId,
      displayAuthorType: "user",
      displayAuthorId: authorA.userId,
      senderMode: "as_user",
      text: "alpha with media",
      media: { type: "image", url: "https://example.com/img.png" },
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const textMatches = await chatService.searchMessages("main", viewer, {
      q: "alpha",
      content_type: "text"
    });
    expect(textMatches.length).toBe(2);

    const mediaMatches = await chatService.searchMessages("main", viewer, {
      content_type: "media",
      media_type: "image",
      author_id: authorA.userId
    });
    expect(mediaMatches.length).toBe(1);
    expect(mediaMatches[0]?.media?.type).toBe("image");
  });

  it("supports message pagination by before/limit for lower network load", async () => {
    const { db, chatService } = createChatServiceFixture();
    const viewer = await makeRequestUser(db, 501804, "viewer_pagination");
    const author = await makeRequestUser(db, 501805, "author_pagination");
    const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const first = await db.createMessage({
      chatId: "main",
      authorId: author.userId,
      actorUserId: author.userId,
      displayAuthorType: "user",
      displayAuthorId: author.userId,
      senderMode: "as_user",
      text: "msg-1",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });
    await sleep(2);
    const second = await db.createMessage({
      chatId: "main",
      authorId: author.userId,
      actorUserId: author.userId,
      displayAuthorType: "user",
      displayAuthorId: author.userId,
      senderMode: "as_user",
      text: "msg-2",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });
    await sleep(2);
    const third = await db.createMessage({
      chatId: "main",
      authorId: author.userId,
      actorUserId: author.userId,
      displayAuthorType: "user",
      displayAuthorId: author.userId,
      senderMode: "as_user",
      text: "msg-3",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const tail = await chatService.listMessages("main", viewer, { limit: 2 });
    expect(tail.map((item) => item.id)).toEqual([second.id, third.id]);

    const beforeLast = await chatService.listMessages("main", viewer, { before: third.createdAt, limit: 10 });
    expect(beforeLast.map((item) => item.id)).toContain(first.id);
    expect(beforeLast.map((item) => item.id)).not.toContain(third.id);
  });

  it("returns frontend bootstrap payload with chat/messages/identities and pagination cursor", async () => {
    const { db, chatService } = createChatServiceFixture();
    const viewer = await makeRequestUser(db, 501806, "viewer_bootstrap");
    const author = await makeRequestUser(db, 501807, "author_bootstrap");
    const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    await db.createMessage({
      chatId: "main",
      authorId: author.userId,
      actorUserId: author.userId,
      displayAuthorType: "user",
      displayAuthorId: author.userId,
      senderMode: "as_user",
      text: "bootstrap-msg-1",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });
    await sleep(2);
    const second = await db.createMessage({
      chatId: "main",
      authorId: author.userId,
      actorUserId: author.userId,
      displayAuthorType: "user",
      displayAuthorId: author.userId,
      senderMode: "as_user",
      text: "bootstrap-msg-2",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });
    await sleep(2);
    const third = await db.createMessage({
      chatId: "main",
      authorId: author.userId,
      actorUserId: author.userId,
      displayAuthorType: "user",
      displayAuthorId: author.userId,
      senderMode: "as_user",
      text: "bootstrap-msg-3",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const bootstrap = await chatService.getBootstrap("main", viewer, { messages_limit: 2 });
    expect(bootstrap.chat.id).toBe("main");
    expect(bootstrap.messages.map((item) => item.id)).toEqual([second.id, third.id]);
    expect(bootstrap.identities.length).toBeGreaterThan(0);
    expect(bootstrap.pagination.limit).toBe(2);
    expect(bootstrap.pagination.before).toBe(second.createdAt);
    expect(bootstrap.ws.namespace).toBe("/ws");
    expect(typeof bootstrap.serverTime).toBe("string");
  });

  it("denies message search without chat.view permission", async () => {
    const { db, chatService } = createChatServiceFixture();
    await db.createRole({
      chatId: "main",
      name: "no_view_role",
      priority: 7777,
      permissions: [],
      isDefault: true
    });
    const noViewUser = await makeRequestUser(db, 501901, "no_view_user");

    await expect(chatService.searchMessages("main", noViewUser, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects invalid search date filters", async () => {
    const { db, chatService } = createChatServiceFixture();
    const viewer = await makeRequestUser(db, 502001, "viewer_invalid_date");

    await expect(
      chatService.searchMessages("main", viewer, {
        from: "not-a-date"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("supports pin/unpin flow via audit-backed pinned state", async () => {
    const { db, chatService } = createChatServiceFixture();
    await db.createRole({
      chatId: "main",
      name: "pin_admin_role",
      priority: 9000,
      permissions: ["chat.view", "message.pin", "message.unpin"],
      isDefault: true
    });

    const pinAdmin = await makeRequestUser(db, 502101, "pin_admin");
    const author = await makeRequestUser(db, 502102, "pin_author");
    const message = await db.createMessage({
      chatId: "main",
      authorId: author.userId,
      actorUserId: author.userId,
      displayAuthorType: "user",
      displayAuthorId: author.userId,
      senderMode: "as_user",
      text: "pin me",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    await expect(chatService.pinMessage("main", message.id, pinAdmin)).resolves.toMatchObject({
      ok: true,
      messageId: message.id
    });

    const pinned = await chatService.listPinnedMessages("main", pinAdmin);
    expect(pinned.length).toBe(1);
    expect(pinned[0]?.message.id).toBe(message.id);

    await expect(chatService.unpinMessage("main", message.id, pinAdmin)).resolves.toMatchObject({
      ok: true,
      messageId: message.id
    });
    const afterUnpin = await chatService.listPinnedMessages("main", pinAdmin);
    expect(afterUnpin.length).toBe(0);
  });

  it("denies pin without message.pin permission", async () => {
    const { db, chatService } = createChatServiceFixture();
    const memberUser = await makeRequestUser(db, 502201, "member_no_pin");
    const message = await db.createMessage({
      chatId: "main",
      authorId: memberUser.userId,
      actorUserId: memberUser.userId,
      displayAuthorType: "user",
      displayAuthorId: memberUser.userId,
      senderMode: "as_user",
      text: "cannot pin",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    await expect(chatService.pinMessage("main", message.id, memberUser)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("supports saved views per user and enforces owner-only delete", async () => {
    const { db, chatService } = createChatServiceFixture();
    const userA = await makeRequestUser(db, 502301, "saved_view_a");
    const userB = await makeRequestUser(db, 502302, "saved_view_b");

    const created = await chatService.createSavedView("main", userA, {
      name: "Only media from me",
      filters: {
        author_id: userA.userId,
        content_type: "media"
      }
    });

    const aViews = await chatService.listSavedViews("main", userA);
    const bViews = await chatService.listSavedViews("main", userB);
    expect(aViews.length).toBe(1);
    expect(aViews[0]?.id).toBe(created.id);
    expect(bViews.length).toBe(0);

    await expect(chatService.deleteSavedView("main", created.id, userB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(chatService.deleteSavedView("main", created.id, userA)).resolves.toMatchObject({
      ok: true,
      viewId: created.id
    });

    const afterDelete = await chatService.listSavedViews("main", userA);
    expect(afterDelete.length).toBe(0);
  });

  it("sets, replaces, and removes own message reaction", async () => {
    const { db, chatService } = createChatServiceFixture();
    const actor = await makeRequestUser(db, 502401, "react_actor");
    const message = await db.createMessage({
      chatId: "main",
      authorId: actor.userId,
      actorUserId: actor.userId,
      displayAuthorType: "user",
      displayAuthorId: actor.userId,
      senderMode: "as_user",
      text: "reactable",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    const set1 = await chatService.setMessageReaction("main", message.id, actor, { reaction: "👍" });
    expect(set1.summary).toEqual([{ reaction: "👍", count: 1 }]);

    const set2 = await chatService.setMessageReaction("main", message.id, actor, { reaction: "🔥" });
    expect(set2.summary).toEqual([{ reaction: "🔥", count: 1 }]);

    const listed = await chatService.listMessageReactions("main", message.id, actor);
    expect(listed.summary).toEqual([{ reaction: "🔥", count: 1 }]);

    const removed = await chatService.removeMessageReaction("main", message.id, actor);
    expect(removed.summary).toEqual([]);
  });

  it("denies reaction without message.react permission", async () => {
    const { db, chatService } = createChatServiceFixture();
    await db.createRole({
      chatId: "main",
      name: "no_react_role",
      priority: 9999,
      permissions: ["chat.view"],
      isDefault: true
    });
    const user = await makeRequestUser(db, 502402, "no_react_user");
    const message = await db.createMessage({
      chatId: "main",
      authorId: user.userId,
      actorUserId: user.userId,
      displayAuthorType: "user",
      displayAuthorId: user.userId,
      senderMode: "as_user",
      text: "cannot react",
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    await expect(chatService.setMessageReaction("main", message.id, user, { reaction: "👍" })).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("accepts encrypted message payload and stores only ciphertext envelope", async () => {
    const { db, chatService } = createChatServiceFixture();
    const user = await makeRequestUser(db, 502501, "e2e_sender");

    const created = await chatService.createMessage("main", user, {
      sender_mode: "as_user",
      encrypted_payload: {
        version: "1",
        algorithm: "xchacha20-poly1305",
        ciphertext: "YWJjMTIzX2NpcGhlcnRleHQ",
        nonce: "bm9uY2UxMjM0NTY",
        key_id: "kid-1",
        recipient_key_ids: ["rk-1"]
      }
    });

    expect(created.isEncrypted).toBe(true);
    expect(created.text).toBeUndefined();
    expect(created.media).toBeNull();
    expect(created.encryptedPayload).toMatchObject({
      algorithm: "xchacha20-poly1305",
      ciphertext: "YWJjMTIzX2NpcGhlcnRleHQ",
      nonce: "bm9uY2UxMjM0NTY"
    });
  });

  it("rejects mixing plaintext and encrypted payload in one message", async () => {
    const { db, chatService } = createChatServiceFixture();
    const user = await makeRequestUser(db, 502502, "e2e_mix");

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        text: "should fail",
        encrypted_payload: {
          version: "1",
          algorithm: "xchacha20-poly1305",
          ciphertext: "YWJj",
          nonce: "bm9uY2U"
        }
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects editing encrypted messages", async () => {
    const { db, chatService } = createChatServiceFixture();
    const user = await makeRequestUser(db, 502503, "e2e_edit");
    const encrypted = await chatService.createMessage("main", user, {
      sender_mode: "as_user",
      encrypted_payload: {
        version: "1",
        algorithm: "xchacha20-poly1305",
        ciphertext: "YWJjMTIz",
        nonce: "bm9uY2UxMjM"
      }
    });

    await expect(
      chatService.updateMessage("main", encrypted.id, user, {
        text: "cannot edit"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("enforces encrypted-only mode when CHAT_REQUIRE_ENCRYPTED_MESSAGES=true", async () => {
    process.env.CHAT_REQUIRE_ENCRYPTED_MESSAGES = "true";

    const { db, chatService } = createChatServiceFixture();
    const user = await makeRequestUser(db, 502505, "e2e_only_mode");
    const senderRole = await db.createRole({
      chatId: "main",
      name: "e2e_only_sender",
      priority: 7200,
      permissions: ["chat.view", "message.send.text"],
      isDefault: false
    });
    await db.updateMemberRole("main", user.userId, senderRole.id);

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        text: "plaintext should fail"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        encrypted_payload: {
          version: "1",
          algorithm: "xchacha20-poly1305",
          ciphertext: "YWJjMTIzX2NpcGhlcnRleHQ",
          nonce: "bm9uY2UxMjM0NTY"
        }
      })
    ).resolves.toMatchObject({
      isEncrypted: true
    });

    delete process.env.CHAT_REQUIRE_ENCRYPTED_MESSAGES;
  });

  it("blocks duplicate encrypted payload replay within duplicate window", async () => {
    process.env.CHAT_DUPLICATE_THRESHOLD = "2";
    process.env.CHAT_DUPLICATE_WINDOW_SECONDS = "300";
    process.env.CHAT_AUTOSANCTION_ENABLED = "false";

    const { db, chatService } = createChatServiceFixture();
    const user = await makeRequestUser(db, 502504, "e2e_dup");
    const payload = {
      version: "1",
      algorithm: "xchacha20-poly1305",
      ciphertext: "Y2lwaGVydGV4dF9yZXBsYXk",
      nonce: "bm9uY2VfcmVwbGF5",
      key_id: "kid-replay"
    } as const;

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        encrypted_payload: payload
      })
    ).resolves.toBeDefined();

    await expect(
      chatService.createMessage("main", user, {
        sender_mode: "as_user",
        encrypted_payload: payload
      })
    ).rejects.toBeInstanceOf(HttpException);

    delete process.env.CHAT_DUPLICATE_THRESHOLD;
    delete process.env.CHAT_DUPLICATE_WINDOW_SECONDS;
    delete process.env.CHAT_AUTOSANCTION_ENABLED;
  });
});
