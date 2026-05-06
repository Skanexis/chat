import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { LimitsService } from "./limits.service.js";

async function makeRequestUser(db: InMemoryDatabase, telegramId: number, username: string): Promise<RequestUser> {
  const user = await db.upsertTelegramUser({ telegramId, username });
  await db.ensureMember("main", user.id);
  return {
    userId: user.id,
    telegramId: user.telegramId
  };
}

function createLimitsFixture() {
  const db = new InMemoryDatabase();
  const policy = new PolicyService(db);
  const eventBus = new EventBusService();
  const limitsService = new LimitsService(db, policy, eventBus);
  return { db, eventBus, limitsService };
}

describe("LimitsService moderation/member management", () => {
  it("denies list members for default member role", async () => {
    const { db, limitsService } = createLimitsFixture();
    const user = await makeRequestUser(db, 730001, "plain_member");

    await expect(limitsService.listMembers("main", user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("supports list + mute/unmute/timeout/timeout.clear/kick/ban/unban with audit and events", async () => {
    const { db, eventBus, limitsService } = createLimitsFixture();
    const moderationRole = await db.createRole({
      chatId: "main",
      name: "moderation_operator",
      priority: 9999,
      isDefault: false,
      permissions: ["member.view_list", "member.mute", "member.unmute", "member.timeout.set", "member.kick", "member.ban", "member.unban"]
    });

    const actor = await makeRequestUser(db, 730002, "moderator");
    const target = await makeRequestUser(db, 730003, "target");
    await db.updateMemberRole("main", actor.userId, moderationRole.id);

    const updatedEvents: string[] = [];
    const bannedEvents: string[] = [];
    const offUpdated = eventBus.on("member.updated", (payload) => updatedEvents.push(payload.userId));
    const offBanned = eventBus.on("member.banned", (payload) => bannedEvents.push(payload.userId));

    const list = await limitsService.listMembers("main", actor);
    expect(list.members.some((member) => member.userId === target.userId)).toBe(true);
    expect(list.members.every((member) => member.roleName.length > 0)).toBe(true);

    const muted = await limitsService.muteMember("main", target.userId, actor, { reason: "rule violation" });
    expect(muted.member.status).toBe("muted");
    expect(muted.member.mutedUntil).toBeNull();

    const unmuted = await limitsService.unmuteMember("main", target.userId, actor, { reason: "manual release" });
    expect(unmuted.member.status).toBe("active");
    expect(unmuted.member.mutedUntil).toBeNull();

    const timeout = await limitsService.timeoutMember("main", target.userId, actor, { seconds: 60, reason: "cooldown" });
    expect(timeout.member.status).toBe("muted");
    expect(timeout.member.mutedUntil).not.toBeNull();

    const clearedTimeout = await limitsService.clearMemberTimeout("main", target.userId, actor, {
      reason: "cooldown ended"
    });
    expect(clearedTimeout.member.status).toBe("active");
    expect(clearedTimeout.member.mutedUntil).toBeNull();

    const readonlyRole = (await db.listRoles("main")).find((role) => role.name === "readonly");
    expect(readonlyRole).toBeDefined();
    const kicked = await limitsService.kickMember("main", target.userId, actor, { reason: "off-topic flood" });
    expect(kicked.member.status).toBe("readonly");
    expect(kicked.member.roleId).toBe(readonlyRole!.id);

    const banned = await limitsService.banMember("main", target.userId, actor, { reason: "escalation" });
    expect(banned.member.status).toBe("banned");

    const unbanned = await limitsService.unbanMember("main", target.userId, actor, { reason: "appeal accepted" });
    expect(unbanned.member.status).toBe("active");

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("member.mute");
    expect(actions).toContain("member.unmute");
    expect(actions).toContain("member.timeout");
    expect(actions).toContain("member.timeout.clear");
    expect(actions).toContain("member.kick");
    expect(actions).toContain("member.ban");
    expect(actions).toContain("member.unban");

    expect(updatedEvents.length).toBeGreaterThanOrEqual(7);
    expect(bannedEvents).toContain(target.userId);

    offUpdated();
    offBanned();
  });

  it("rejects self-ban and unknown target operations", async () => {
    const { db, limitsService } = createLimitsFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "ban_operator_default",
      priority: 9999,
      isDefault: false,
      permissions: ["member.ban", "member.unban", "member.kick", "member.mute", "member.unmute", "member.view_list", "member.timeout.set"]
    });
    const actor = await makeRequestUser(db, 730004, "ban_operator");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);

    await expect(limitsService.banMember("main", actor.userId, actor, { reason: "self" })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(limitsService.kickMember("main", actor.userId, actor, { reason: "self" })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(limitsService.muteMember("main", "missing-user-id", actor, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it("denies moderation actions when actor is not active", async () => {
    const { db, limitsService } = createLimitsFixture();
    const operatorRole = await db.createRole({
      chatId: "main",
      name: "operator_nonactive_guard",
      priority: 9900,
      isDefault: false,
      permissions: ["member.ban", "member.kick", "member.mute", "member.unmute", "member.timeout.set", "member.view_list"]
    });
    const actor = await makeRequestUser(db, 730007, "actor_nonactive");
    const target = await makeRequestUser(db, 730008, "target_nonactive");
    await db.updateMemberRole("main", actor.userId, operatorRole.id);
    await db.updateMemberStatus("main", actor.userId, "readonly", null);

    await expect(limitsService.banMember("main", target.userId, actor, { reason: "blocked" })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(limitsService.kickMember("main", target.userId, actor, { reason: "blocked" })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(limitsService.listMembers("main", actor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("denies moderation actions on member with equal or higher role priority", async () => {
    const { db, limitsService } = createLimitsFixture();
    const moderatorRole = await db.createRole({
      chatId: "main",
      name: "moderator_priority_900",
      priority: 900,
      isDefault: false,
      permissions: ["member.mute", "member.kick", "member.ban", "member.unban", "member.timeout.set", "member.unmute"]
    });
    const seniorRole = await db.createRole({
      chatId: "main",
      name: "senior_priority_950",
      priority: 950,
      isDefault: false,
      permissions: ["chat.view"]
    });

    const actor = await makeRequestUser(db, 730005, "moderator_low");
    const target = await makeRequestUser(db, 730006, "senior_target");
    await db.updateMemberRole("main", actor.userId, moderatorRole.id);
    await db.updateMemberRole("main", target.userId, seniorRole.id);

    await expect(limitsService.muteMember("main", target.userId, actor, { reason: "nope" })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(limitsService.kickMember("main", target.userId, actor, { reason: "nope" })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(limitsService.banMember("main", target.userId, actor, { reason: "nope" })).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
});
