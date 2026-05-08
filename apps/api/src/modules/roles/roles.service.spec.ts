import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { RolesService } from "./roles.service.js";

async function makeRequestUser(db: InMemoryDatabase, telegramId: number, username: string): Promise<RequestUser> {
  const user = await db.upsertTelegramUser({ telegramId, username });
  await db.ensureMember("main", user.id);
  return {
    userId: user.id,
    telegramId: user.telegramId
  };
}

function createRolesFixture() {
  const db = new InMemoryDatabase();
  const policy = new PolicyService(db);
  const eventBus = new EventBusService();
  const rolesService = new RolesService(db, policy, eventBus);
  return { db, eventBus, rolesService };
}

describe("RolesService member role assignment", () => {
  it("denies role assignment without role.assign permission", async () => {
    const { db, rolesService } = createRolesFixture();
    const actor = await makeRequestUser(db, 740001, "actor_no_assign");
    const target = await makeRequestUser(db, 740002, "target_no_assign");
    const readonlyRole = (await db.listRoles("main")).find((role) => role.name === "readonly");
    expect(readonlyRole).toBeDefined();

    await expect(rolesService.assignRole("main", readonlyRole!.id, actor, { userId: target.userId })).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("assigns and unassigns role with audit trail and member.updated events", async () => {
    const { db, eventBus, rolesService } = createRolesFixture();
    const actor = await makeRequestUser(db, 740101, "actor_assign");
    const target = await makeRequestUser(db, 740102, "target_assign");

    const operatorRole = await db.createRole({
      chatId: "main",
      name: "role_operator",
      priority: 7000,
      permissions: ["role.assign", "role.unassign"]
    });
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const readonlyRole = (await db.listRoles("main")).find((role) => role.name === "readonly");
    expect(readonlyRole).toBeDefined();
    const defaultRoleId = (await db.getChat("main")).defaultRoleId;

    const updatedEvents: string[] = [];
    const off = eventBus.on("member.updated", (payload) => updatedEvents.push(payload.userId));

    const assigned = await rolesService.assignRole("main", readonlyRole!.id, actor, { userId: target.userId });
    expect(assigned.member.roleId).toBe(readonlyRole!.id);

    const unassigned = await rolesService.unassignRole("main", readonlyRole!.id, actor, { userId: target.userId });
    expect(unassigned.member.roleId).toBe(defaultRoleId);

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("role.assign");
    expect(actions).toContain("role.unassign");
    expect(updatedEvents).toEqual([target.userId, target.userId]);

    off();
  });

  it("rejects unassign when target is not bound to role path and rejects unknown member", async () => {
    const { db, rolesService } = createRolesFixture();
    const actor = await makeRequestUser(db, 740201, "actor_unassign");
    const target = await makeRequestUser(db, 740202, "target_unassign");

    const operatorRole = await db.createRole({
      chatId: "main",
      name: "role_operator_unassign",
      priority: 7001,
      permissions: ["role.assign", "role.unassign"]
    });
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    const readonlyRole = (await db.listRoles("main")).find((role) => role.name === "readonly");
    expect(readonlyRole).toBeDefined();

    await expect(rolesService.unassignRole("main", readonlyRole!.id, actor, { userId: target.userId })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(rolesService.assignRole("main", readonlyRole!.id, actor, { userId: "missing-user-id" })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("prevents downgrading wildcard developer members by assign or unassign", async () => {
    const { db, rolesService } = createRolesFixture();
    const actor = await makeRequestUser(db, 740203, "role_actor_against_dev");
    const developer = await makeRequestUser(db, 740204, "role_protected_developer");

    const operatorRole = await db.createRole({
      chatId: "main",
      name: "role_operator_against_dev",
      priority: 9999,
      permissions: ["role.assign", "role.unassign"]
    });
    const developerRole = await db.createRole({
      chatId: "main",
      name: "developer",
      priority: 9500,
      permissions: ["*"]
    });
    await db.updateMemberRole("main", actor.userId, operatorRole.id);
    await db.updateMemberRole("main", developer.userId, developerRole.id);

    const readonlyRole = (await db.listRoles("main")).find((role) => role.name === "readonly");
    expect(readonlyRole).toBeDefined();

    await expect(rolesService.assignRole("main", readonlyRole!.id, actor, { userId: developer.userId })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(rolesService.unassignRole("main", developerRole.id, actor, { userId: developer.userId })).rejects.toBeInstanceOf(
      ForbiddenException
    );

    const protectedMember = await db.ensureMember("main", developer.userId);
    expect(protectedMember.roleId).toBe(developerRole.id);
  });

  it("enforces role hierarchy for create/update/assign operations", async () => {
    const { db, rolesService } = createRolesFixture();
    const actor = await makeRequestUser(db, 740301, "actor_hierarchy");
    const target = await makeRequestUser(db, 740302, "target_hierarchy");
    const lowTarget = await makeRequestUser(db, 740303, "target_low");

    const managerRole = await db.createRole({
      chatId: "main",
      name: "manager_priority_600",
      priority: 600,
      permissions: ["role.assign", "role.unassign", "role.create", "role.update"]
    });
    await db.updateMemberRole("main", actor.userId, managerRole.id);

    const highRole = await db.createRole({
      chatId: "main",
      name: "senior_priority_800",
      priority: 800,
      permissions: ["chat.view"]
    });
    await db.updateMemberRole("main", target.userId, highRole.id);

    const readonlyRole = (await db.listRoles("main")).find((role) => role.name === "readonly");
    expect(readonlyRole).toBeDefined();

    await expect(rolesService.assignRole("main", readonlyRole!.id, actor, { userId: target.userId })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(rolesService.assignRole("main", highRole.id, actor, { userId: lowTarget.userId })).rejects.toBeInstanceOf(
      ForbiddenException
    );

    await expect(
      rolesService.createRole("main", actor, {
        name: "equal_priority_role",
        priority: 600,
        permissions: ["chat.view"]
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      rolesService.updateRole("main", highRole.id, actor, {
        name: "cannot_update_high"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("denies role management when actor is not active", async () => {
    const { db, rolesService } = createRolesFixture();
    const actor = await makeRequestUser(db, 740401, "actor_not_active");
    const target = await makeRequestUser(db, 740402, "target_not_active");

    const operatorRole = await db.createRole({
      chatId: "main",
      name: "role_operator_nonactive",
      priority: 7100,
      permissions: ["role.assign", "role.unassign", "member.view_list", "role.update", "role.create"]
    });
    await db.updateMemberRole("main", actor.userId, operatorRole.id);
    await db.updateMemberStatus("main", actor.userId, "readonly", null);

    const readonlyRole = (await db.listRoles("main")).find((role) => role.name === "readonly");
    expect(readonlyRole).toBeDefined();

    await expect(rolesService.listRoles("main", actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(rolesService.assignRole("main", readonlyRole!.id, actor, { userId: target.userId })).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("simulates permission and join/role policy checks for selected actor", async () => {
    const { db, rolesService } = createRolesFixture();
    const requester = await makeRequestUser(db, 740501, "sim_requester");
    const simulated = await makeRequestUser(db, 740502, "sim_actor");
    const targetMember = await makeRequestUser(db, 740503, "sim_target");

    const operatorRole = await db.createRole({
      chatId: "main",
      name: "role_sim_operator",
      priority: 7500,
      permissions: ["audit.view", "role.assign", "member.approve_join", "chat.invite.create"]
    });
    await db.updateMemberRole("main", requester.userId, operatorRole.id);
    await db.updateMemberRole("main", simulated.userId, operatorRole.id);

    const readonlyRole = (await db.listRoles("main")).find((role) => role.name === "readonly");
    expect(readonlyRole).toBeDefined();

    const result = await rolesService.simulatePermissions("main", requester, {
      actor_user_id: simulated.userId,
      target_user_id: targetMember.userId,
      target_role_id: readonlyRole!.id,
      join_target_role_id: readonlyRole!.id,
      permissions: ["member.approve_join", "member.reject_join", "chat.invite.create"]
    });

    expect(result.actor.user_id).toBe(simulated.userId);
    expect(result.permissions.find((entry) => entry.permission === "member.approve_join")?.allowed).toBe(true);
    expect(result.permissions.find((entry) => entry.permission === "member.reject_join")?.allowed).toBe(false);
    expect(result.join_policy_checks.can_create_invite).toBe(true);
    expect(result.role_checks.can_manage_target_role).toBe(true);
    expect(result.join_policy_checks.can_set_join_target_role).toBe(true);
  });

  it("denies simulation without audit.view permission", async () => {
    const { db, rolesService } = createRolesFixture();
    const actor = await makeRequestUser(db, 740504, "sim_denied_actor");

    await expect(
      rolesService.simulatePermissions("main", actor, {
        permissions: ["chat.view"]
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
