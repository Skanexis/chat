import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser, RoleLimits } from "../../core/types.js";
import {
  BanMemberDto,
  ClearTimeoutMemberDto,
  KickMemberDto,
  MuteMemberDto,
  TimeoutMemberDto,
  UnbanMemberDto,
  UnmuteMemberDto,
  UpdateRoleLimitsDto
} from "./limits.dto.js";

@Injectable()
export class LimitsService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly eventBus: EventBusService
  ) {}

  async listLimits(chatId: string, requestUser: RequestUser): Promise<{
    chatId: string;
    roles: Array<{
      roleId: string;
      roleName: string;
      rolePriority: number;
      limits: RoleLimits;
    }>;
  }> {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "limit.view");

    const [roles, roleLimits] = await Promise.all([this.db.listRoles(chatId), this.db.listRoleLimits(chatId)]);
    const limitsByRole = new Map(roleLimits.map((entry) => [entry.roleId, entry]));

    return {
      chatId,
      roles: roles.map((role) => ({
        roleId: role.id,
        roleName: role.name,
        rolePriority: role.priority,
        limits: limitsByRole.get(role.id)!
      }))
    };
  }

  async updateRoleLimits(chatId: string, roleId: string, requestUser: RequestUser, dto: UpdateRoleLimitsDto): Promise<RoleLimits> {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    const hasSlowmodePatch = dto.slowmodeSeconds !== undefined;
    const hasGeneralPatch = Object.keys(dto).some((key) => key !== "slowmodeSeconds");

    if (hasGeneralPatch) {
      await this.policy.assertCan(chatId, actor, "limit.update.role");
    }
    if (hasSlowmodePatch) {
      await this.policy.assertCan(chatId, actor, "slowmode.update");
    }

    const updated = await this.db.upsertRoleLimits(chatId, roleId, dto);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "limits.role.update",
      targetType: "role_limits",
      targetId: roleId,
      payload: dto as unknown as Record<string, unknown>
    });
    return updated;
  }

  async muteMember(chatId: string, userId: string, requestUser: RequestUser, dto: MuteMemberDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "member.mute");
    const target = await this.getExistingMember(chatId, userId);
    await this.policy.assertCanManageMember(chatId, actor, target);

    const updated = await this.db.updateMemberStatus(chatId, userId, "muted", null);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "member.mute",
      targetType: "member",
      targetId: userId,
      payload: {
        reason: dto.reason ?? null
      }
    });
    this.eventBus.emit("member.updated", updated);
    return {
      ok: true,
      member: updated
    };
  }

  async timeoutMember(chatId: string, userId: string, requestUser: RequestUser, dto: TimeoutMemberDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    if (!(await this.policy.hasPermission(chatId, actor, "member.timeout.set"))) {
      await this.policy.assertCan(chatId, actor, "member.mute");
    }
    const target = await this.getExistingMember(chatId, userId);
    await this.policy.assertCanManageMember(chatId, actor, target);

    const mutedUntil = new Date(Date.now() + dto.seconds * 1000).toISOString();
    const updated = await this.db.updateMemberStatus(chatId, userId, "muted", mutedUntil);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "member.timeout",
      targetType: "member",
      targetId: userId,
      payload: {
        reason: dto.reason ?? null,
        seconds: dto.seconds,
        mutedUntil
      }
    });
    this.eventBus.emit("member.updated", updated);
    return {
      ok: true,
      member: updated
    };
  }

  async clearMemberTimeout(chatId: string, userId: string, requestUser: RequestUser, dto: ClearTimeoutMemberDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    if (!(await this.policy.hasPermission(chatId, actor, "member.timeout.clear"))) {
      await this.policy.assertCan(chatId, actor, "member.unmute");
    }
    const current = await this.getExistingMember(chatId, userId);
    await this.policy.assertCanManageMember(chatId, actor, current);

    const nextStatus = current.status === "muted" ? "active" : current.status;
    const updated = await this.db.updateMemberStatus(chatId, userId, nextStatus, null);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "member.timeout.clear",
      targetType: "member",
      targetId: userId,
      payload: {
        reason: dto.reason ?? null,
        previousStatus: current.status,
        previousMutedUntil: current.mutedUntil
      }
    });
    this.eventBus.emit("member.updated", updated);
    return {
      ok: true,
      member: updated
    };
  }

  async listMembers(chatId: string, requestUser: RequestUser): Promise<{
    chatId: string;
    members: Array<{
      id: string;
      userId: string;
      roleId: string;
      roleName: string;
      rolePriority: number;
      status: "active" | "readonly" | "muted" | "banned";
      mutedUntil: string | null;
      bannedUntil: string | null;
      joinedAt: string;
    }>;
  }> {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "member.view_list");

    const [members, roles] = await Promise.all([this.db.listMembers(chatId), this.db.listRoles(chatId)]);
    const roleById = new Map(roles.map((role) => [role.id, role]));

    return {
      chatId,
      members: members.map((member) => {
        const role = roleById.get(member.roleId);
        return {
          id: member.id,
          userId: member.userId,
          roleId: member.roleId,
          roleName: role?.name ?? "unknown",
          rolePriority: role?.priority ?? 0,
          status: member.status,
          mutedUntil: member.mutedUntil ?? null,
          bannedUntil: member.bannedUntil ?? null,
          joinedAt: member.joinedAt
        };
      })
    };
  }

  async unmuteMember(chatId: string, userId: string, requestUser: RequestUser, dto: UnmuteMemberDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    if (!(await this.policy.hasPermission(chatId, actor, "member.unmute"))) {
      await this.policy.assertCan(chatId, actor, "member.timeout.clear");
    }
    const current = await this.getExistingMember(chatId, userId);
    await this.policy.assertCanManageMember(chatId, actor, current);

    const updated = await this.db.updateMemberStatus(chatId, userId, "active", null);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "member.unmute",
      targetType: "member",
      targetId: userId,
      payload: {
        reason: dto.reason ?? null,
        previousStatus: current.status,
        previousMutedUntil: current.mutedUntil
      }
    });
    this.eventBus.emit("member.updated", updated);
    return {
      ok: true,
      member: updated
    };
  }

  async banMember(chatId: string, userId: string, requestUser: RequestUser, dto: BanMemberDto) {
    if (requestUser.userId === userId) {
      throw new ForbiddenException("You cannot ban yourself.");
    }

    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "member.ban");
    const current = await this.getExistingMember(chatId, userId);
    await this.policy.assertCanManageMember(chatId, actor, current);

    const updated = await this.db.updateMemberStatus(chatId, userId, "banned", null);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "member.ban",
      targetType: "member",
      targetId: userId,
      payload: {
        reason: dto.reason ?? null,
        previousStatus: current.status
      }
    });
    this.eventBus.emit("member.updated", updated);
    this.eventBus.emit("member.banned", updated);
    return {
      ok: true,
      member: updated
    };
  }

  async kickMember(chatId: string, userId: string, requestUser: RequestUser, dto: KickMemberDto) {
    if (requestUser.userId === userId) {
      throw new ForbiddenException("You cannot kick yourself.");
    }

    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "member.kick");
    const current = await this.getExistingMember(chatId, userId);
    await this.policy.assertCanManageMember(chatId, actor, current);

    const roles = await this.db.listRoles(chatId);
    const readonlyRole = roles.find((role) => role.name === "readonly");
    if (readonlyRole) {
      await this.db.updateMemberRole(chatId, userId, readonlyRole.id);
    }
    const updated = await this.db.updateMemberStatus(chatId, userId, "readonly", null);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "member.kick",
      targetType: "member",
      targetId: userId,
      payload: {
        reason: dto.reason ?? null,
        previousStatus: current.status,
        previousRoleId: current.roleId,
        appliedReadonlyRoleId: readonlyRole?.id ?? null
      }
    });
    this.eventBus.emit("member.updated", updated);
    return {
      ok: true,
      member: updated
    };
  }

  async unbanMember(chatId: string, userId: string, requestUser: RequestUser, dto: UnbanMemberDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "member.unban");
    const current = await this.getExistingMember(chatId, userId);
    await this.policy.assertCanManageMember(chatId, actor, current);

    const updated = await this.db.updateMemberStatus(chatId, userId, "active", null);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "member.unban",
      targetType: "member",
      targetId: userId,
      payload: {
        reason: dto.reason ?? null,
        previousStatus: current.status
      }
    });
    this.eventBus.emit("member.updated", updated);
    return {
      ok: true,
      member: updated
    };
  }

  private async getExistingMember(chatId: string, userId: string) {
    const member = await this.db.getMember(chatId, userId);
    if (!member) {
      throw new NotFoundException(`Member ${userId} is not in chat ${chatId}.`);
    }
    return member;
  }
}
