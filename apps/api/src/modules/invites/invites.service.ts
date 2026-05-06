import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { ChatMember, Invite, JoinApprovalMode, RequestUser } from "../../core/types.js";
import type {
  CreateInviteDto,
  CreateJoinRequestDto,
  ListJoinRequestsQueryDto,
  RejectJoinRequestDto,
  RotateInviteCodeDto,
  UpdateInviteDto,
  UpdateJoinPolicyDto,
  UseInviteDto
} from "./invites.dto.js";

@Injectable()
export class InvitesService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly eventBus: EventBusService
  ) {}

  async listInvites(chatId: string, requestUser: RequestUser) {
    const actor = await this.requireOperator(chatId, requestUser.userId, "chat.invite.create");
    const invites = await this.db.listInvites(chatId);
    return {
      ok: true,
      invites,
      requestedBy: actor.userId
    };
  }

  async createInvite(chatId: string, requestUser: RequestUser, dto: CreateInviteDto) {
    const actor = await this.requireOperator(chatId, requestUser.userId, "chat.invite.create");
    const maxUses = this.normalizeMaxUses(dto.max_uses);
    if (maxUses === null) {
      await this.policy.assertCan(chatId, actor, "chat.invite.use_unlimited");
    }
    const approvalMode = await this.resolveJoinApprovalMode(chatId, dto.approval_mode);
    const targetRoleId = await this.resolveTargetRoleId(chatId, dto.target_role_id ?? null, actor);
    const expiresAt = this.normalizeFutureIso(dto.expires_at, "expires_at");
    const code = await this.generateUniqueInviteCode(chatId);

    const invite = await this.db.createInvite({
      chatId,
      code,
      createdBy: requestUser.userId,
      approvalMode,
      targetRoleId,
      maxUses,
      usesCount: 0,
      expiresAt,
      revokedAt: null
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "chat.invite.create",
      targetType: "invite",
      targetId: invite.id,
      payload: {
        code: invite.code,
        approval_mode: invite.approvalMode,
        target_role_id: invite.targetRoleId ?? null,
        max_uses: invite.maxUses,
        expires_at: invite.expiresAt
      }
    });

    return {
      ok: true,
      invite
    };
  }

  async updateInvite(chatId: string, inviteId: string, requestUser: RequestUser, dto: UpdateInviteDto) {
    const actor = await this.requireOperator(chatId, requestUser.userId, "chat.invite.create");
    const current = await this.db.getInvite(chatId, inviteId);
    const hasPatch =
      dto.approval_mode !== undefined ||
      dto.target_role_id !== undefined ||
      dto.max_uses !== undefined ||
      dto.expires_at !== undefined;
    if (!hasPatch) {
      throw new BadRequestException("Invite update requires at least one field.");
    }

    const nextApprovalMode = dto.approval_mode ?? current.approvalMode;
    let nextTargetRoleId = current.targetRoleId ?? null;
    if (dto.target_role_id !== undefined) {
      nextTargetRoleId = await this.resolveTargetRoleId(chatId, dto.target_role_id, actor);
    }

    let nextMaxUses = current.maxUses ?? null;
    if (dto.max_uses !== undefined) {
      nextMaxUses = this.normalizeMaxUses(dto.max_uses);
      if (nextMaxUses === null) {
        await this.policy.assertCan(chatId, actor, "chat.invite.use_unlimited");
      }
      if (nextMaxUses !== null && nextMaxUses < current.usesCount) {
        throw new BadRequestException("max_uses cannot be less than current uses_count.");
      }
    }

    const nextExpiresAt = dto.expires_at !== undefined ? this.normalizeFutureIso(dto.expires_at, "expires_at") : current.expiresAt;

    const updated = await this.db.updateInvite(chatId, inviteId, {
      approvalMode: nextApprovalMode,
      targetRoleId: nextTargetRoleId,
      maxUses: nextMaxUses,
      expiresAt: nextExpiresAt
    });

    await this.db.addAuditLog({
      chatId,
      actorId: actor.userId,
      action: "chat.invite.update",
      targetType: "invite",
      targetId: updated.id,
      payload: {
        approval_mode: updated.approvalMode,
        target_role_id: updated.targetRoleId ?? null,
        max_uses: updated.maxUses,
        expires_at: updated.expiresAt
      }
    });

    return {
      ok: true,
      invite: updated
    };
  }

  async rotateInviteCode(chatId: string, inviteId: string, requestUser: RequestUser, dto: RotateInviteCodeDto) {
    const actor = await this.requireOperator(chatId, requestUser.userId, "chat.invite.create");
    const current = await this.db.getInvite(chatId, inviteId);
    if (current.revokedAt) {
      throw new BadRequestException("Cannot rotate code for revoked invite.");
    }

    const nextCode = dto.code
      ? await this.ensureInviteCodeAvailable(chatId, this.normalizeCustomInviteCode(dto.code), current.id)
      : await this.generateUniqueInviteCode(chatId, current.id);

    if (nextCode === current.code) {
      return {
        ok: true,
        rotated: false,
        invite: current
      };
    }

    const updated = await this.db.updateInvite(chatId, current.id, {
      code: nextCode
    });
    await this.db.addAuditLog({
      chatId,
      actorId: actor.userId,
      action: "chat.invite.rotate_code",
      targetType: "invite",
      targetId: updated.id,
      payload: {
        previous_code: current.code,
        next_code: updated.code
      }
    });

    return {
      ok: true,
      rotated: true,
      invite: updated
    };
  }

  async revokeInvite(chatId: string, inviteId: string, requestUser: RequestUser) {
    const actor = await this.requireOperator(chatId, requestUser.userId, "chat.invite.revoke");
    const current = await this.db.getInvite(chatId, inviteId);
    if (current.revokedAt) {
      return {
        ok: true,
        already_revoked: true,
        invite: current
      };
    }

    const revokedAt = new Date().toISOString();
    const invite = await this.db.updateInvite(chatId, inviteId, { revokedAt });

    await this.db.addAuditLog({
      chatId,
      actorId: actor.userId,
      action: "chat.invite.revoke",
      targetType: "invite",
      targetId: invite.id,
      payload: {
        revoked_at: revokedAt
      }
    });

    return {
      ok: true,
      already_revoked: false,
      invite
    };
  }

  async useInvite(chatId: string, requestUser: RequestUser, dto: UseInviteDto) {
    await this.db.getChat(chatId);
    const userId = requestUser.userId;
    const member = await this.db.getMember(chatId, userId);
    if (member) {
      if (member.status === "banned") {
        throw new ForbiddenException("Banned members cannot use invites.");
      }
      return {
        ok: true,
        created: false,
        reason: "already_member",
        member
      };
    }

    const pending = await this.db.getPendingJoinRequestByUser(chatId, userId);
    if (pending) {
      return {
        ok: true,
        created: false,
        reason: "pending_exists",
        request: pending
      };
    }

    const invite = await this.requireValidInvite(chatId, dto.invite_code);
    if (invite.approvalMode === "auto") {
      return this.autoApproveJoin(chatId, userId, dto.note ?? null, invite, "chat.invite.use");
    }

    return this.createPendingJoinRequest(chatId, userId, dto.note ?? null, invite.code, "chat.invite.use");
  }

  async createJoinRequest(chatId: string, requestUser: RequestUser, dto: CreateJoinRequestDto) {
    await this.db.getChat(chatId);
    const userId = requestUser.userId;
    const member = await this.db.getMember(chatId, userId);
    if (member) {
      if (member.status === "banned") {
        throw new ForbiddenException("Banned members cannot create join requests.");
      }
      return {
        ok: true,
        created: false,
        reason: "already_member",
        member
      };
    }

    const pending = await this.db.getPendingJoinRequestByUser(chatId, userId);
    if (pending) {
      return {
        ok: true,
        created: false,
        reason: "pending_exists",
        request: pending
      };
    }

    let inviteCode: string | null = null;
    let invite: Invite | null = null;
    if (dto.invite_code) {
      invite = await this.requireValidInvite(chatId, dto.invite_code);
      inviteCode = invite.code;
    }

    const approvalMode = invite?.approvalMode ?? (await this.resolveJoinApprovalMode(chatId));
    if (approvalMode === "auto") {
      return this.autoApproveJoin(chatId, userId, dto.note ?? null, invite, "member.join_request.create");
    }

    return this.createPendingJoinRequest(chatId, userId, dto.note ?? null, inviteCode, "member.join_request.create");
  }

  async listJoinRequests(chatId: string, requestUser: RequestUser, query: ListJoinRequestsQueryDto) {
    const actor = await this.requireOperator(chatId, requestUser.userId, "member.approve_join");
    const requests = await this.db.listJoinRequests(chatId, query.status);
    return {
      ok: true,
      requests,
      requestedBy: actor.userId,
      filter: {
        status: query.status ?? null
      }
    };
  }

  async approveJoinRequest(chatId: string, requestId: string, requestUser: RequestUser) {
    const actor = await this.requireOperator(chatId, requestUser.userId, "member.approve_join");
    const request = await this.db.getJoinRequest(chatId, requestId);
    if (request.status !== "pending") {
      throw new BadRequestException("Only pending join requests can be approved.");
    }

    let usedInvite: Invite | null = null;
    let targetRoleId: string | null = await this.resolveDefaultTargetRoleId(chatId);
    if (request.inviteCode) {
      usedInvite = await this.requireValidInvite(chatId, request.inviteCode);
      targetRoleId = await this.resolveTargetRoleId(chatId, usedInvite.targetRoleId ?? targetRoleId, actor);
    } else {
      targetRoleId = await this.resolveTargetRoleId(chatId, targetRoleId, actor);
    }

    const existingMember = await this.db.getMember(chatId, request.userId);
    if (existingMember?.status === "banned") {
      throw new ForbiddenException("Cannot approve join request for banned user.");
    }

    const nowIso = new Date().toISOString();
    const reviewed = await this.db.updateJoinRequest(chatId, requestId, {
      status: "approved",
      reviewedBy: requestUser.userId,
      reviewedAt: nowIso,
      rejectReason: null
    });

    let member: ChatMember;
    if (!existingMember) {
      member = await this.db.ensureMember(chatId, request.userId);
    } else if (existingMember.status !== "active") {
      member = await this.db.updateMemberStatus(chatId, request.userId, "active", null);
    } else {
      member = existingMember;
    }

    if (targetRoleId && member.roleId !== targetRoleId) {
      member = await this.db.updateMemberRole(chatId, request.userId, targetRoleId);
    }

    if (usedInvite) {
      await this.db.updateInvite(chatId, usedInvite.id, {
        usesCount: usedInvite.usesCount + 1
      });
    }

    await this.db.addAuditLog({
      chatId,
      actorId: actor.userId,
      action: "member.approve_join",
      targetType: "join_request",
      targetId: reviewed.id,
      payload: {
        user_id: reviewed.userId,
        invite_code: reviewed.inviteCode ?? null,
        target_role_id: targetRoleId
      }
    });

    this.eventBus.emit("member.updated", member);

    return {
      ok: true,
      request: reviewed,
      member
    };
  }

  async rejectJoinRequest(chatId: string, requestId: string, requestUser: RequestUser, dto: RejectJoinRequestDto) {
    const actor = await this.requireOperator(chatId, requestUser.userId, "member.reject_join");
    const request = await this.db.getJoinRequest(chatId, requestId);
    if (request.status !== "pending") {
      throw new BadRequestException("Only pending join requests can be rejected.");
    }

    const reviewedAt = new Date().toISOString();
    const reviewed = await this.db.updateJoinRequest(chatId, requestId, {
      status: "rejected",
      reviewedBy: actor.userId,
      reviewedAt,
      rejectReason: dto.reason ?? null
    });

    await this.db.addAuditLog({
      chatId,
      actorId: actor.userId,
      action: "member.reject_join",
      targetType: "join_request",
      targetId: reviewed.id,
      payload: {
        user_id: reviewed.userId,
        reason: reviewed.rejectReason ?? null
      }
    });

    return {
      ok: true,
      request: reviewed
    };
  }

  async getJoinPolicy(chatId: string, requestUser: RequestUser) {
    const actor = await this.requireOperator(chatId, requestUser.userId, "member.approve_join");
    const stored = await this.db.getJoinPolicy(chatId);
    const fromEnv = this.resolveJoinApprovalModeFromEnv();
    const effectiveMode = stored?.defaultApprovalMode ?? fromEnv;

    return {
      ok: true,
      policy: {
        chatId,
        default_approval_mode: effectiveMode,
        default_target_role_id: stored?.defaultTargetRoleId ?? null,
        source: stored ? "chat" : "env",
        updated_by: stored?.updatedBy ?? null,
        updated_at: stored?.updatedAt ?? null
      },
      requestedBy: actor.userId
    };
  }

  async updateJoinPolicy(chatId: string, requestUser: RequestUser, dto: UpdateJoinPolicyDto) {
    const actor = await this.requireOperator(chatId, requestUser.userId, "member.approve_join");
    const hasPatch = dto.default_approval_mode !== undefined || dto.default_target_role_id !== undefined;
    if (!hasPatch) {
      throw new BadRequestException("Join policy update requires at least one field.");
    }

    const targetRoleId =
      dto.default_target_role_id !== undefined
        ? await this.resolveTargetRoleId(chatId, dto.default_target_role_id, actor)
        : undefined;

    const updated = await this.db.upsertJoinPolicy(chatId, {
      defaultApprovalMode: dto.default_approval_mode,
      defaultTargetRoleId: targetRoleId,
      updatedBy: actor.userId
    });

    await this.db.addAuditLog({
      chatId,
      actorId: actor.userId,
      action: "member.join_policy.update",
      targetType: "chat",
      targetId: chatId,
      payload: {
        default_approval_mode: updated.defaultApprovalMode,
        default_target_role_id: updated.defaultTargetRoleId ?? null
      }
    });

    return {
      ok: true,
      policy: {
        chatId,
        default_approval_mode: updated.defaultApprovalMode,
        default_target_role_id: updated.defaultTargetRoleId ?? null,
        source: "chat",
        updated_by: updated.updatedBy,
        updated_at: updated.updatedAt
      }
    };
  }

  private async createPendingJoinRequest(
    chatId: string,
    userId: string,
    note: string | null,
    inviteCode: string | null,
    action: string
  ) {
    const request = await this.db.createJoinRequest({
      chatId,
      userId,
      inviteCode,
      note,
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      rejectReason: null
    });

    await this.db.addAuditLog({
      chatId,
      actorId: userId,
      action,
      targetType: "join_request",
      targetId: request.id,
      payload: {
        invite_code: inviteCode
      }
    });

    return {
      ok: true,
      created: true,
      auto_approved: false,
      request
    };
  }

  private async autoApproveJoin(
    chatId: string,
    userId: string,
    note: string | null,
    invite: Invite | null,
    sourceAction: string
  ) {
    const nowIso = new Date().toISOString();
    const defaultTargetRoleId = await this.resolveDefaultTargetRoleId(chatId);
    const targetRoleId = await this.resolveTargetRoleId(chatId, invite?.targetRoleId ?? defaultTargetRoleId, null);
    const request = await this.db.createJoinRequest({
      chatId,
      userId,
      inviteCode: invite?.code ?? null,
      note,
      status: "approved",
      reviewedBy: "system",
      reviewedAt: nowIso,
      rejectReason: null
    });

    let member = await this.db.ensureMember(chatId, userId);
    if (member.status !== "active") {
      member = await this.db.updateMemberStatus(chatId, userId, "active", null);
    }
    if (targetRoleId && member.roleId !== targetRoleId) {
      member = await this.db.updateMemberRole(chatId, userId, targetRoleId);
    }

    if (invite) {
      await this.db.updateInvite(chatId, invite.id, {
        usesCount: invite.usesCount + 1
      });
    }

    await this.db.addAuditLog({
      chatId,
      actorId: userId,
      action: sourceAction,
      targetType: "join_request",
      targetId: request.id,
      payload: {
        invite_code: invite?.code ?? null,
        auto_approved: true
      }
    });
    await this.db.addAuditLog({
      chatId,
      actorId: "system",
      action: "member.join_request.auto_approved",
      targetType: "join_request",
      targetId: request.id,
      payload: {
        user_id: userId,
        invite_code: invite?.code ?? null,
        target_role_id: targetRoleId
      }
    });

    this.eventBus.emit("member.updated", member);

    return {
      ok: true,
      created: true,
      auto_approved: true,
      request,
      member
    };
  }

  private async requireOperator(chatId: string, userId: string, permission: string): Promise<ChatMember> {
    const actor = await this.db.ensureMember(chatId, userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, permission);
    return actor;
  }

  private async requireValidInvite(chatId: string, codeRaw: string): Promise<Invite> {
    const code = codeRaw.trim();
    if (!code) {
      throw new BadRequestException("invite_code cannot be empty.");
    }
    const invite = await this.db.getInviteByCode(chatId, code);
    if (!invite) {
      throw new BadRequestException("Invite is invalid.");
    }
    if (invite.revokedAt) {
      throw new BadRequestException("Invite is revoked.");
    }

    const nowTs = Date.now();
    if (invite.expiresAt && Date.parse(invite.expiresAt) <= nowTs) {
      throw new BadRequestException("Invite is expired.");
    }
    if (invite.maxUses !== null && invite.maxUses !== undefined && invite.usesCount >= invite.maxUses) {
      throw new BadRequestException("Invite usage limit reached.");
    }
    return invite;
  }

  private async generateUniqueInviteCode(chatId: string, ignoreInviteId?: string): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = randomBytes(7).toString("base64url");
      const existing = await this.db.getInviteByCode(chatId, code);
      if (!existing || existing.id === ignoreInviteId) {
        return code;
      }
    }
    throw new BadRequestException("Failed to generate unique invite code.");
  }

  private async ensureInviteCodeAvailable(chatId: string, code: string, ignoreInviteId?: string): Promise<string> {
    const existing = await this.db.getInviteByCode(chatId, code);
    if (!existing || existing.id === ignoreInviteId) {
      return code;
    }
    throw new BadRequestException("Invite code is already in use.");
  }

  private normalizeCustomInviteCode(raw: string): string {
    const code = raw.trim();
    if (!code) {
      throw new BadRequestException("code cannot be empty.");
    }
    return code;
  }

  private async resolveJoinApprovalMode(chatId: string, mode?: JoinApprovalMode): Promise<JoinApprovalMode> {
    if (mode) {
      return mode;
    }
    const stored = await this.db.getJoinPolicy(chatId);
    if (stored) {
      return stored.defaultApprovalMode;
    }
    return this.resolveJoinApprovalModeFromEnv();
  }

  private resolveJoinApprovalModeFromEnv(): JoinApprovalMode {
    const fromEnv = (process.env.JOIN_APPROVAL_DEFAULT_MODE ?? "manual").toLowerCase();
    if (fromEnv === "auto") {
      return "auto";
    }
    return "manual";
  }

  private async resolveDefaultTargetRoleId(chatId: string): Promise<string | null> {
    const stored = await this.db.getJoinPolicy(chatId);
    return stored?.defaultTargetRoleId ?? null;
  }

  private async resolveTargetRoleId(
    chatId: string,
    targetRoleId: string | null,
    actor: ChatMember | null
  ): Promise<string | null> {
    if (!targetRoleId) {
      return null;
    }
    const role = await this.db.getRole(chatId, targetRoleId);
    if (actor) {
      await this.policy.assertCanManageRole(chatId, actor, role.id);
    }
    return role.id;
  }

  private normalizeFutureIso(value: string | null | undefined, fieldName: string): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException(`${fieldName} must be a valid ISO datetime.`);
    }
    const iso = new Date(parsed).toISOString();
    if (Date.parse(iso) <= Date.now()) {
      throw new BadRequestException(`${fieldName} must be in the future.`);
    }
    return iso;
  }

  private normalizeMaxUses(maxUses: number | null | undefined): number | null {
    if (maxUses === undefined || maxUses === null) {
      return null;
    }
    if (!Number.isInteger(maxUses) || maxUses <= 0) {
      throw new BadRequestException("max_uses must be a positive integer.");
    }
    return maxUses;
  }
}
