import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { MemberTagsService } from "./member-tags.service.js";

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
  const memberTagsService = new MemberTagsService(db, policy);
  return { db, memberTagsService };
}

describe("MemberTagsService", () => {
  it("assigns new tag with create+assign permissions and is idempotent", async () => {
    const { db, memberTagsService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "member_tag_operator",
      priority: 1300,
      isDefault: false,
      permissions: ["member.tag.create", "member.tag.assign"]
    });
    const actor = await makeRequestUser(db, 991001, "tag_actor");
    const target = await makeRequestUser(db, 991002, "tag_target");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const first = await memberTagsService.assignTag("main", target.userId, actor, { tag: "VIP" });
    expect(first.created).toBe(true);
    expect(first.tag.tag).toBe("vip");
    expect(first.tags).toHaveLength(1);

    const second = await memberTagsService.assignTag("main", target.userId, actor, { tag: "vip" });
    expect(second.created).toBe(false);
    expect(second.tags).toHaveLength(1);

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("member.tag.create");
    expect(actions).toContain("member.tag.assign");
  });

  it("requires member.tag.create for first-time chat tag", async () => {
    const { db, memberTagsService } = createFixture();
    const assignOnlyRole = await db.createRole({
      chatId: "main",
      name: "member_tag_assign_only",
      priority: 1300,
      isDefault: false,
      permissions: ["member.tag.assign"]
    });

    const actor = await makeRequestUser(db, 991003, "assign_only_actor");
    const target = await makeRequestUser(db, 991004, "assign_only_target");
    await db.updateMemberRole("main", actor.userId, assignOnlyRole.id);

    await expect(memberTagsService.assignTag("main", target.userId, actor, { tag: "new-tag" })).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("allows assign-only role to assign already existing chat tag", async () => {
    const { db, memberTagsService } = createFixture();
    const creatorRole = await db.createRole({
      chatId: "main",
      name: "member_tag_creator",
      priority: 1300,
      isDefault: false,
      permissions: ["member.tag.create", "member.tag.assign"]
    });
    const assignOnlyRole = await db.createRole({
      chatId: "main",
      name: "member_tag_assign_only_2",
      priority: 1290,
      isDefault: false,
      permissions: ["member.tag.assign"]
    });

    const creator = await makeRequestUser(db, 991005, "creator");
    const actor = await makeRequestUser(db, 991006, "assign_only_actor_2");
    const targetA = await makeRequestUser(db, 991007, "target_a");
    const targetB = await makeRequestUser(db, 991008, "target_b");
    await db.updateMemberRole("main", creator.userId, creatorRole.id);
    await db.updateMemberRole("main", actor.userId, assignOnlyRole.id);

    await memberTagsService.assignTag("main", targetA.userId, creator, { tag: "partner" });
    const assigned = await memberTagsService.assignTag("main", targetB.userId, actor, { tag: "partner" });
    expect(assigned.created).toBe(true);
    expect(assigned.tag.tag).toBe("partner");
  });

  it("returns not found for missing target member", async () => {
    const { db, memberTagsService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "member_tag_operator_not_found",
      priority: 1300,
      isDefault: false,
      permissions: ["member.tag.create", "member.tag.assign"]
    });
    const actor = await makeRequestUser(db, 991009, "tag_actor_not_found");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    await expect(memberTagsService.assignTag("main", "missing-member", actor, { tag: "vip" })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
