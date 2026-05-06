import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { TranslationsService } from "./translations.service.js";

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

function createFixture(env: Record<string, string> = {}) {
  const db = new InMemoryDatabase();
  const policy = new PolicyService(db);
  const config = new ConfigService({ TRANSLATION_CACHE_TTL_SECONDS: "3600", ...env });
  const translationsService = new TranslationsService(db, policy, config);
  return { db, translationsService };
}

describe("TranslationsService", () => {
  it("translates text message and returns cached value on next request", async () => {
    const { db, translationsService } = createFixture();
    const useRole = await db.createRole({
      chatId: "main",
      name: "translation_user",
      priority: 1300,
      isDefault: false,
      permissions: ["translation.use"]
    });
    const actor = await makeRequestUser(db, 993001, "translation_actor");
    await db.updateMemberRole("main", actor.userId, useRole.id);
    const message = await createMessage(db, actor.userId, "hello world");

    const first = await translationsService.translateMessage("main", message.id, actor, { target_language: "it" });
    expect(first.cacheHit).toBe(false);
    expect(first.translation.text).toBe("[it] hello world");

    const second = await translationsService.translateMessage("main", message.id, actor, { target_language: "it" });
    expect(second.cacheHit).toBe(true);
    expect(second.translation.id).toBe(first.translation.id);

    const listed = await translationsService.listTranslations("main", message.id, actor);
    expect(listed.items).toHaveLength(1);
  });

  it("requires translation.use permission", async () => {
    const { db, translationsService } = createFixture();
    const noTranslationRole = await db.createRole({
      chatId: "main",
      name: "translation_denied_role",
      priority: 1300,
      isDefault: false,
      permissions: ["chat.view"]
    });
    const actor = await makeRequestUser(db, 993002, "translation_no_permission");
    await db.updateMemberRole("main", actor.userId, noTranslationRole.id);
    const message = await createMessage(db, actor.userId, "hello");

    await expect(
      translationsService.translateMessage("main", message.id, actor, { target_language: "es" })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("requires translation.manage for force refresh", async () => {
    const { db, translationsService } = createFixture();
    const useRole = await db.createRole({
      chatId: "main",
      name: "translation_force_use_only",
      priority: 1300,
      isDefault: false,
      permissions: ["translation.use"]
    });
    const actor = await makeRequestUser(db, 993003, "translation_force_actor");
    await db.updateMemberRole("main", actor.userId, useRole.id);
    const message = await createMessage(db, actor.userId, "hello");

    await expect(
      translationsService.translateMessage("main", message.id, actor, { target_language: "de", force_refresh: true })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("deletes cached translation with translation.manage and supports idempotent delete", async () => {
    const { db, translationsService } = createFixture();
    const managerRole = await db.createRole({
      chatId: "main",
      name: "translation_manager",
      priority: 1300,
      isDefault: false,
      permissions: ["translation.use", "translation.manage"]
    });
    const actor = await makeRequestUser(db, 993004, "translation_manager_actor");
    await db.updateMemberRole("main", actor.userId, managerRole.id);
    const message = await createMessage(db, actor.userId, "hello manager");

    await translationsService.translateMessage("main", message.id, actor, { target_language: "fr" });

    const deleted = await translationsService.deleteTranslation("main", message.id, "fr", actor);
    expect(deleted.deleted).toBe(true);

    const deletedAgain = await translationsService.deleteTranslation("main", message.id, "fr", actor);
    expect(deletedAgain.deleted).toBe(false);
  });
});
