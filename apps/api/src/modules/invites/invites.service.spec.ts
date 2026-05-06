import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { InvitesService } from "./invites.service.js";

async function makeUser(db: InMemoryDatabase, telegramId: number, username: string, ensureMembership: boolean): Promise<RequestUser> {
  const user = await db.upsertTelegramUser({ telegramId, username });
  if (ensureMembership) {
    await db.ensureMember("main", user.id);
  }
  return {
    userId: user.id,
    telegramId: user.telegramId
  };
}

async function makeOperator(
  db: InMemoryDatabase,
  telegramId: number,
  username: string,
  permissions: string[]
): Promise<RequestUser> {
  const operatorRole = await db.createRole({
    chatId: "main",
    name: `operator_${username}`,
    priority: 2500,
    isDefault: false,
    permissions
  });
  const user = await makeUser(db, telegramId, username, true);
  await db.updateMemberRole("main", user.userId, operatorRole.id);
  return user;
}

function createFixture() {
  const db = new InMemoryDatabase();
  const policy = new PolicyService(db);
  const eventBus = new EventBusService();
  const invitesService = new InvitesService(db, policy, eventBus);
  return { db, eventBus, invitesService };
}

afterEach(() => {
  delete process.env.JOIN_APPROVAL_DEFAULT_MODE;
});

describe("InvitesService", () => {
  it("creates invite, opens pending join request through invite, approves request and increments invite usage", async () => {
    const { db, eventBus, invitesService } = createFixture();
    const operator = await makeOperator(db, 950001, "join_operator", [
      "chat.invite.create",
      "chat.invite.use_unlimited",
      "member.approve_join",
      "member.reject_join"
    ]);
    const outsider = await makeUser(db, 950002, "pending_user", false);

    const inviteCreated = await invitesService.createInvite("main", operator, {
      max_uses: 2
    });
    const invite = inviteCreated.invite;

    const opened = await invitesService.useInvite("main", outsider, {
      invite_code: invite.code,
      note: "please approve"
    });
    expect(opened.created).toBe(true);
    expect(opened.request?.status).toBe("pending");

    const updates: string[] = [];
    const off = eventBus.on("member.updated", (payload) => updates.push(payload.userId));
    const approved = await invitesService.approveJoinRequest("main", opened.request!.id, operator);
    off();

    expect(approved.ok).toBe(true);
    expect(approved.request.status).toBe("approved");
    expect(approved.member.userId).toBe(outsider.userId);
    expect(updates).toContain(outsider.userId);

    const updatedInvite = await db.getInvite("main", invite.id);
    expect(updatedInvite.usesCount).toBe(1);

    const actions = (await db.listAudit("main")).map((entry) => entry.action);
    expect(actions).toContain("chat.invite.create");
    expect(actions).toContain("chat.invite.use");
    expect(actions).toContain("member.approve_join");
  });

  it("creates and rejects pending join request without creating chat member", async () => {
    const { db, invitesService } = createFixture();
    const operator = await makeOperator(db, 950003, "reject_operator", ["member.reject_join"]);
    const outsider = await makeUser(db, 950004, "reject_outsider", false);

    const request = await invitesService.createJoinRequest("main", outsider, {
      note: "let me in"
    });
    expect(request.created).toBe(true);

    const rejected = await invitesService.rejectJoinRequest("main", request.request!.id, operator, {
      reason: "manual reject"
    });
    expect(rejected.request.status).toBe("rejected");
    expect(rejected.request.rejectReason).toBe("manual reject");

    const member = await db.getMember("main", outsider.userId);
    expect(member).toBeUndefined();
  });

  it("blocks revoked invites and keeps invite usage idempotent for repeated pending use", async () => {
    const { db, invitesService } = createFixture();
    const operator = await makeOperator(db, 950005, "invite_admin", [
      "chat.invite.create",
      "chat.invite.revoke",
      "chat.invite.use_unlimited"
    ]);
    const outsider = await makeUser(db, 950006, "invite_user", false);

    const revokedInvite = (await invitesService.createInvite("main", operator, {})).invite;
    await invitesService.revokeInvite("main", revokedInvite.id, operator);

    await expect(
      invitesService.useInvite("main", outsider, {
        invite_code: revokedInvite.code
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    const activeInvite = (await invitesService.createInvite("main", operator, { max_uses: 1 })).invite;
    const firstUse = await invitesService.useInvite("main", outsider, { invite_code: activeInvite.code });
    const secondUse = await invitesService.useInvite("main", outsider, { invite_code: activeInvite.code });

    expect(firstUse.created).toBe(true);
    expect(secondUse.created).toBe(false);
    expect(secondUse.reason).toBe("pending_exists");
  });

  it("requires chat.invite.use_unlimited to create invite without max_uses", async () => {
    const { db, invitesService } = createFixture();
    const operator = await makeOperator(db, 950007, "finite_invite_operator", ["chat.invite.create"]);

    await expect(
      invitesService.createInvite("main", operator, {
        max_uses: null
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("auto-approves invite usage and assigns target role from invite policy", async () => {
    const { db, invitesService } = createFixture();
    const operator = await makeOperator(db, 950008, "auto_invite_operator", [
      "chat.invite.create",
      "chat.invite.use_unlimited"
    ]);
    const targetRole = await db.createRole({
      chatId: "main",
      name: "invited_vip",
      priority: 100,
      isDefault: false,
      permissions: ["chat.view", "chat.join", "message.send.text"]
    });
    const outsider = await makeUser(db, 950009, "auto_invite_user", false);

    const invite = (
      await invitesService.createInvite("main", operator, {
        approval_mode: "auto",
        target_role_id: targetRole.id,
        max_uses: 1
      })
    ).invite;

    const result = await invitesService.useInvite("main", outsider, {
      invite_code: invite.code
    });

    expect(result.created).toBe(true);
    expect(result.auto_approved).toBe(true);
    expect(result.request?.status).toBe("approved");
    expect(result.member?.roleId).toBe(targetRole.id);

    const updatedInvite = await db.getInvite("main", invite.id);
    expect(updatedInvite.usesCount).toBe(1);

    const anotherUser = await makeUser(db, 950010, "auto_invite_user_2", false);
    await expect(
      invitesService.useInvite("main", anotherUser, {
        invite_code: invite.code
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("supports global auto-approve mode for direct join requests", async () => {
    process.env.JOIN_APPROVAL_DEFAULT_MODE = "auto";

    const { db, invitesService } = createFixture();
    const outsider = await makeUser(db, 950011, "global_auto_user", false);

    const result = await invitesService.createJoinRequest("main", outsider, {
      note: "join me"
    });
    expect(result.created).toBe(true);
    expect(result.auto_approved).toBe(true);
    expect(result.request?.status).toBe("approved");
    expect(result.member?.status).toBe("active");
  });

  it("supports per-chat join policy override over env fallback", async () => {
    process.env.JOIN_APPROVAL_DEFAULT_MODE = "auto";
    const { db, invitesService } = createFixture();
    const operator = await makeOperator(db, 950012, "join_policy_operator", ["member.approve_join"]);
    const targetRole = await db.createRole({
      chatId: "main",
      name: "join_policy_target",
      priority: 100,
      isDefault: false,
      permissions: ["chat.view", "chat.join", "message.send.text"]
    });
    const outsider = await makeUser(db, 950013, "join_policy_user", false);

    const effectiveBefore = await invitesService.getJoinPolicy("main", operator);
    expect(effectiveBefore.policy.source).toBe("env");
    expect(effectiveBefore.policy.default_approval_mode).toBe("auto");

    await invitesService.updateJoinPolicy("main", operator, {
      default_approval_mode: "manual",
      default_target_role_id: targetRole.id
    });

    const effectiveAfter = await invitesService.getJoinPolicy("main", operator);
    expect(effectiveAfter.policy.source).toBe("chat");
    expect(effectiveAfter.policy.default_approval_mode).toBe("manual");
    expect(effectiveAfter.policy.default_target_role_id).toBe(targetRole.id);

    const result = await invitesService.createJoinRequest("main", outsider, {});
    expect(result.auto_approved).toBe(false);
    expect(result.request?.status).toBe("pending");
  });

  it("updates invite policy fields and validates max_uses against current usage", async () => {
    const { db, invitesService } = createFixture();
    const operator = await makeOperator(db, 950014, "invite_update_operator", [
      "chat.invite.create",
      "chat.invite.use_unlimited",
      "member.approve_join"
    ]);
    const targetRole = await db.createRole({
      chatId: "main",
      name: "invite_update_target",
      priority: 100,
      isDefault: false,
      permissions: ["chat.view", "chat.join", "message.send.text"]
    });
    const userA = await makeUser(db, 950015, "invite_update_user_a", false);
    const userB = await makeUser(db, 950016, "invite_update_user_b", false);

    const invite = (
      await invitesService.createInvite("main", operator, {
        approval_mode: "manual",
        max_uses: 2
      })
    ).invite;

    const requestA = await invitesService.useInvite("main", userA, { invite_code: invite.code });
    const requestB = await invitesService.useInvite("main", userB, { invite_code: invite.code });
    await invitesService.approveJoinRequest("main", requestA.request!.id, operator);
    await invitesService.approveJoinRequest("main", requestB.request!.id, operator);

    await expect(
      invitesService.updateInvite("main", invite.id, operator, {
        max_uses: 1
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    const updated = await invitesService.updateInvite("main", invite.id, operator, {
      approval_mode: "auto",
      target_role_id: targetRole.id,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });

    expect(updated.invite.approvalMode).toBe("auto");
    expect(updated.invite.targetRoleId).toBe(targetRole.id);
  });

  it("rotates invite code and prevents duplicate code usage", async () => {
    const { db, invitesService } = createFixture();
    const operator = await makeOperator(db, 950017, "rotate_operator", ["chat.invite.create", "chat.invite.revoke"]);

    const first = (await invitesService.createInvite("main", operator, { max_uses: 3 })).invite;
    const second = (await invitesService.createInvite("main", operator, { max_uses: 3 })).invite;

    const rotated = await invitesService.rotateInviteCode("main", first.id, operator, { code: "custom-join-code" });
    expect(rotated.rotated).toBe(true);
    expect(rotated.invite.code).toBe("custom-join-code");

    const noChange = await invitesService.rotateInviteCode("main", first.id, operator, { code: "custom-join-code" });
    expect(noChange.rotated).toBe(false);

    await expect(
      invitesService.rotateInviteCode("main", second.id, operator, { code: "custom-join-code" })
    ).rejects.toBeInstanceOf(BadRequestException);

    await invitesService.revokeInvite("main", second.id, operator);
    await expect(invitesService.rotateInviteCode("main", second.id, operator, {})).rejects.toBeInstanceOf(BadRequestException);
  });
});
