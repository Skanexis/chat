import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { MemberProfileFieldsService } from "./member-profile-fields.service.js";

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
  const memberProfileFieldsService = new MemberProfileFieldsService(db, policy);
  return { db, memberProfileFieldsService };
}

describe("MemberProfileFieldsService", () => {
  it("creates, updates and deletes member profile field", async () => {
    const { db, memberProfileFieldsService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "member_profile_operator",
      priority: 1300,
      isDefault: false,
      permissions: ["member.profile_fields.manage"]
    });
    const actor = await makeRequestUser(db, 992001, "profile_actor");
    const target = await makeRequestUser(db, 992002, "profile_target");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const first = await memberProfileFieldsService.upsertField("main", target.userId, actor, {
      key: " Department ",
      value: "  Product  "
    });
    expect(first.created).toBe(true);
    expect(first.field.key).toBe("department");
    expect(first.field.value).toBe("Product");

    const second = await memberProfileFieldsService.upsertField("main", target.userId, actor, {
      key: "department",
      value: "Engineering"
    });
    expect(second.created).toBe(false);
    expect(second.field.value).toBe("Engineering");

    const listed = await memberProfileFieldsService.listFields("main", target.userId, actor);
    expect(listed.fields).toHaveLength(1);

    const deleted = await memberProfileFieldsService.deleteField("main", target.userId, "department", actor);
    expect(deleted.deleted).toBe(true);
    expect(deleted.fields).toHaveLength(0);

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("member.profile_field.upsert");
    expect(actions).toContain("member.profile_field.delete");
  });

  it("requires member.profile_fields.manage permission", async () => {
    const { db, memberProfileFieldsService } = createFixture();
    const actor = await makeRequestUser(db, 992003, "profile_actor_no_perm");
    const target = await makeRequestUser(db, 992004, "profile_target_no_perm");

    await expect(
      memberProfileFieldsService.upsertField("main", target.userId, actor, { key: "city", value: "Rome" })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns not found for missing target member", async () => {
    const { db, memberProfileFieldsService } = createFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "member_profile_operator_not_found",
      priority: 1300,
      isDefault: false,
      permissions: ["member.profile_fields.manage"]
    });
    const actor = await makeRequestUser(db, 992005, "profile_actor_not_found");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    await expect(
      memberProfileFieldsService.listFields("main", "missing-member", actor)
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
