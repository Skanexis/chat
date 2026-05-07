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
  ModerationHistoryQueryDto,
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
      shortUserId: string;
      telegramId: number | null;
      telegramUsername: string | null;
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
    const uniqueUserIds = Array.from(new Set(members.map((member) => member.userId)));
    const usersById = new Map(
      await Promise.all(uniqueUserIds.map(async (userId) => [userId, await this.db.getUserById(userId)] as const))
    );

    return {
      chatId,
      members: members.map((member) => {
        const role = roleById.get(member.roleId);
        const user = usersById.get(member.userId);
        return {
          id: member.id,
          userId: member.userId,
          shortUserId: member.userId.length <= 8 ? member.userId : member.userId.slice(0, 8),
          telegramId: user?.telegramId ?? null,
          telegramUsername: user?.username ?? null,
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

  async listModerationHistory(
    chatId: string,
    requestUser: RequestUser,
    query: ModerationHistoryQueryDto
  ): Promise<{
    chatId: string;
    events: Array<{
      id: string;
      action:
        | "member.mute"
        | "member.unmute"
        | "member.timeout"
        | "member.timeout.clear"
        | "member.kick"
        | "member.ban"
        | "member.unban"
        | "message.delete";
      targetType: "member" | "message";
      actorId: string;
      targetId: string;
      reason: string | null;
      createdAt: string;
      messageId: string | null;
      deletedMessageText: string | null;
    }>;
  }> {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "member.view_list");

    const targetFilter = query.target_user_id?.trim() ?? "";
    const limit = query.limit ?? 120;
    const moderationActions = new Set([
      "member.mute",
      "member.unmute",
      "member.timeout",
      "member.timeout.clear",
      "member.kick",
      "member.ban",
      "member.unban"
    ]);
    const all = await this.db.listAudit(chatId);
    const events = all
      .filter((entry) => {
        if (entry.targetType === "member" && moderationActions.has(entry.action)) {
          return true;
        }
        if (entry.targetType === "message" && entry.action === "message.delete") {
          return true;
        }
        return false;
      })
      .filter((entry) => {
        if (!targetFilter) {
          return true;
        }
        if (entry.targetType === "member") {
          return entry.targetId.includes(targetFilter);
        }
        const payload = entry.payload as Record<string, unknown>;
        const deletedAuthorId = typeof payload.deletedAuthorId === "string" ? payload.deletedAuthorId : "";
        const deletedDisplayAuthorId = typeof payload.deletedDisplayAuthorId === "string" ? payload.deletedDisplayAuthorId : "";
        return deletedAuthorId.includes(targetFilter) || deletedDisplayAuthorId.includes(targetFilter);
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit)
      .map((entry) => {
        if (entry.targetType === "member") {
          return {
            id: entry.id,
            action: entry.action as
              | "member.mute"
              | "member.unmute"
              | "member.timeout"
              | "member.timeout.clear"
              | "member.kick"
              | "member.ban"
              | "member.unban",
            targetType: "member" as const,
            actorId: entry.actorId,
            targetId: entry.targetId,
            reason: this.extractAuditReason(entry.payload),
            createdAt: entry.createdAt,
            messageId: null,
            deletedMessageText: null
          };
        }

        const payload = entry.payload as Record<string, unknown>;
        const deletedAuthorId =
          (typeof payload.deletedAuthorId === "string" && payload.deletedAuthorId) ||
          (typeof payload.deletedDisplayAuthorId === "string" && payload.deletedDisplayAuthorId) ||
          entry.targetId;
        return {
          id: entry.id,
          action: "message.delete" as const,
          targetType: "message" as const,
          actorId: entry.actorId,
          targetId: deletedAuthorId,
          reason: this.extractAuditReason(entry.payload),
          createdAt: entry.createdAt,
          messageId: entry.targetId,
          deletedMessageText: this.extractDeletedMessageText(entry.payload)
        };
      });

    return {
      chatId,
      events
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

  private extractAuditReason(payload: Record<string, unknown>): string | null {
    const raw = payload.reason;
    if (typeof raw !== "string") {
      return null;
    }
    const normalized = raw.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private extractDeletedMessageText(payload: Record<string, unknown>): string | null {
    const text = typeof payload.deletedText === "string" ? payload.deletedText.trim() : "";
    if (text.length > 0) {
      return text.length > 240 ? `${text.slice(0, 240)}...` : text;
    }
    const mediaType = typeof payload.deletedMediaType === "string" ? payload.deletedMediaType.trim() : "";
    const mediaUrl = typeof payload.deletedMediaUrl === "string" ? payload.deletedMediaUrl.trim() : "";
    if (!mediaType && !mediaUrl) {
      return null;
    }
    if (mediaType && mediaUrl) {
      return `[${mediaType}] ${mediaUrl}`;
    }
    if (mediaType) {
      return `[${mediaType}]`;
    }
    return mediaUrl || null;
  }
}
