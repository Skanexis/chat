import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "./in-memory-database.service.js";
import { PolicyService } from "./policy.service.js";
import type { ChatMember } from "./types.js";

function buildMember(roleId: string, userId = "user-test"): ChatMember {
  return {
    id: "member-test",
    chatId: "main",
    userId,
    roleId,
    status: "active",
    joinedAt: new Date().toISOString()
  };
}

describe("PolicyService", () => {
  it("resolves exact permission for member role", async () => {
    const db = new InMemoryDatabase();
    const policy = new PolicyService(db);
    const roles = await db.listRoles("main");
    const memberRole = roles.find((role) => role.name === "member");
    expect(memberRole).toBeDefined();

    const member = buildMember(memberRole!.id);
    await expect(policy.hasPermission("main", member, "message.send.text")).resolves.toBe(true);
    await expect(policy.hasPermission("main", member, "message.delete.any")).resolves.toBe(false);
  });

  it("resolves wildcard permission for owner role", async () => {
    const db = new InMemoryDatabase();
    const policy = new PolicyService(db);
    const roles = await db.listRoles("main");
    const ownerRole = roles.find((role) => role.name === "owner");
    expect(ownerRole).toBeDefined();

    const ownerLikeMember = buildMember(ownerRole!.id);
    await expect(policy.hasPermission("main", ownerLikeMember, "broadcast.cancel")).resolves.toBe(true);
    await expect(policy.hasPermission("main", ownerLikeMember, "message.send.media.video")).resolves.toBe(true);
  });

  it("throws ForbiddenException on denied permission", async () => {
    const db = new InMemoryDatabase();
    const policy = new PolicyService(db);
    const roles = await db.listRoles("main");
    const readonlyRole = roles.find((role) => role.name === "readonly");
    expect(readonlyRole).toBeDefined();

    const readonlyMember = buildMember(readonlyRole!.id);
    await expect(policy.assertCan("main", readonlyMember, "message.send.text")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("enforces role-priority management for members and roles", async () => {
    const db = new InMemoryDatabase();
    const policy = new PolicyService(db);

    const managerRole = await db.createRole({
      chatId: "main",
      name: "manager_priority_600",
      priority: 600,
      permissions: ["member.ban", "role.assign", "role.update"]
    });
    const seniorRole = await db.createRole({
      chatId: "main",
      name: "senior_priority_700",
      priority: 700,
      permissions: ["chat.view"]
    });
    const juniorRole = await db.createRole({
      chatId: "main",
      name: "junior_priority_500",
      priority: 500,
      permissions: ["chat.view"]
    });

    const actor = buildMember(managerRole.id, "actor-user");
    const targetSenior = buildMember(seniorRole.id, "target-senior-user");
    const targetJunior = buildMember(juniorRole.id, "target-junior-user");

    await expect(policy.assertCanManageMember("main", actor, targetSenior)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(policy.assertCanManageMember("main", actor, targetJunior)).resolves.toBeUndefined();
    await expect(policy.assertCanManageRole("main", actor, seniorRole.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(policy.assertCanManageRole("main", actor, juniorRole.id)).resolves.toBeUndefined();
    await expect(policy.assertCanCreateRoleWithPriority("main", actor, 600)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(policy.assertCanCreateRoleWithPriority("main", actor, 300)).resolves.toBeUndefined();
  });

  it("blocks banned members from access and non-active members from operational actions", async () => {
    const db = new InMemoryDatabase();
    const policy = new PolicyService(db);
    const roles = await db.listRoles("main");
    const memberRole = roles.find((role) => role.name === "member");
    expect(memberRole).toBeDefined();

    const bannedMember: ChatMember = {
      ...buildMember(memberRole!.id, "banned-user"),
      status: "banned"
    };
    const readonlyMember: ChatMember = {
      ...buildMember(memberRole!.id, "readonly-user"),
      status: "readonly"
    };

    expect(() => policy.assertMemberCanAccess(bannedMember)).toThrow(ForbiddenException);
    expect(() => policy.assertMemberCanOperate(readonlyMember)).toThrow(ForbiddenException);
  });
});
