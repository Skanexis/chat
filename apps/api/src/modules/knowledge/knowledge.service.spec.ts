import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { KnowledgeService } from "./knowledge.service.js";

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
  const knowledgeService = new KnowledgeService(db, policy);
  return { db, knowledgeService };
}

describe("KnowledgeService", () => {
  it("creates and updates knowledge article with permissions and versioning", async () => {
    const { db, knowledgeService } = createFixture();
    const editorRole = await db.createRole({
      chatId: "main",
      name: "knowledge_editor",
      priority: 1400,
      isDefault: false,
      permissions: ["knowledge.article.create", "knowledge.article.update", "knowledge.article.publish", "knowledge.article.archive"]
    });
    const actor = await makeRequestUser(db, 970001, "knowledge_actor");
    await db.updateMemberRole("main", actor.userId, editorRole.id);

    const created = await knowledgeService.createArticle("main", actor, {
      title: "Runbook",
      content: "Initial draft"
    });
    expect(created.status).toBe("draft");
    expect(created.version).toBe(1);

    const published = await knowledgeService.updateArticle("main", created.id, actor, {
      content: "Published content",
      status: "published"
    });
    expect(published.status).toBe("published");
    expect(published.version).toBe(2);
    expect(published.publishedAt).toBeTruthy();
  });

  it("denies create without knowledge.article.create", async () => {
    const { db, knowledgeService } = createFixture();
    const member = await makeRequestUser(db, 970002, "plain_member");

    await expect(
      knowledgeService.createArticle("main", member, {
        title: "Denied",
        content: "Denied"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects invalid status transition from archived to published", async () => {
    const { db, knowledgeService } = createFixture();
    const editorRole = await db.createRole({
      chatId: "main",
      name: "knowledge_editor_transition",
      priority: 1400,
      isDefault: false,
      permissions: ["knowledge.article.create", "knowledge.article.update", "knowledge.article.publish", "knowledge.article.archive"]
    });
    const actor = await makeRequestUser(db, 970003, "knowledge_transition_actor");
    await db.updateMemberRole("main", actor.userId, editorRole.id);

    const created = await knowledgeService.createArticle("main", actor, {
      title: "Archive flow",
      content: "Archive me"
    });
    const archived = await knowledgeService.updateArticle("main", created.id, actor, {
      status: "archived"
    });
    expect(archived.status).toBe("archived");

    await expect(
      knowledgeService.updateArticle("main", created.id, actor, {
        status: "published"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
