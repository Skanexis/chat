import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { ChatMember, RequestUser, Role } from "../../core/types.js";
import { CreateRoleDto, PermissionsPatchDto, PermissionSimulationDto, RoleMemberPatchDto, UpdateRoleDto } from "./roles.dto.js";

@Injectable()
export class RolesService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly eventBus: EventBusService
  ) {}

  async listRoles(chatId: string, requestUser: RequestUser): Promise<Role[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "member.view_list");
    return this.db.listRoles(chatId);
  }

  async createRole(chatId: string, requestUser: RequestUser, dto: CreateRoleDto): Promise<Role> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "role.create");
    await this.policy.assertCanCreateRoleWithPriority(chatId, member, dto.priority);

    const created = await this.db.createRole({
      chatId,
      name: dto.name,
      priority: dto.priority,
      permissions: dto.permissions,
      isDefault: dto.isDefault
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "role.create",
      targetType: "role",
      targetId: created.id,
      payload: dto as unknown as Record<string, unknown>
    });
    return created;
  }

  async updateRole(chatId: string, roleId: string, requestUser: RequestUser, dto: UpdateRoleDto): Promise<Role> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "role.update");
    await this.policy.assertCanManageRole(chatId, member, roleId);
    if (dto.priority !== undefined) {
      await this.policy.assertCanCreateRoleWithPriority(chatId, member, dto.priority);
    }

    const updated = await this.db.updateRole(chatId, roleId, dto);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "role.update",
      targetType: "role",
      targetId: roleId,
      payload: dto as unknown as Record<string, unknown>
    });
    return updated;
  }

  async grantPermissions(chatId: string, roleId: string, requestUser: RequestUser, dto: PermissionsPatchDto): Promise<Role> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "permission.grant");

    const role = await this.db.getRole(chatId, roleId);
    const nextPermissions = Array.from(new Set([...role.permissions, ...dto.permissions]));
    return this.updateRole(chatId, roleId, requestUser, { permissions: nextPermissions });
  }

  async revokePermissions(chatId: string, roleId: string, requestUser: RequestUser, dto: PermissionsPatchDto): Promise<Role> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "permission.revoke");

    const role = await this.db.getRole(chatId, roleId);
    const revoked = new Set(dto.permissions);
    const nextPermissions = role.permissions.filter((permission) => !revoked.has(permission));
    return this.updateRole(chatId, roleId, requestUser, { permissions: nextPermissions });
  }

  async assignRole(chatId: string, roleId: string, requestUser: RequestUser, dto: RoleMemberPatchDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "role.assign");
    const role = await this.db.getRole(chatId, roleId);
    const targetMember = await this.getExistingMember(chatId, dto.userId);
    await this.policy.assertCanManageMember(chatId, actor, targetMember);
    await this.policy.assertCanManageRole(chatId, actor, role.id);

    const updated = await this.db.updateMemberRole(chatId, dto.userId, roleId);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "role.assign",
      targetType: "member",
      targetId: dto.userId,
      payload: {
        roleId,
        roleName: role.name,
        previousRoleId: targetMember.roleId
      }
    });
    this.eventBus.emit("member.updated", updated);
    return {
      ok: true,
      member: updated
    };
  }

  async unassignRole(chatId: string, roleId: string, requestUser: RequestUser, dto: RoleMemberPatchDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    if (!(await this.policy.hasPermission(chatId, actor, "role.unassign"))) {
      await this.policy.assertCan(chatId, actor, "role.assign");
    }

    const role = await this.db.getRole(chatId, roleId);
    const targetMember = await this.getExistingMember(chatId, dto.userId);
    await this.policy.assertCanManageMember(chatId, actor, targetMember);
    await this.policy.assertCanManageRole(chatId, actor, role.id);
    if (targetMember.roleId !== roleId) {
      throw new BadRequestException("Target member is not assigned to this role.");
    }

    const chat = await this.db.getChat(chatId);
    const updated = await this.db.updateMemberRole(chatId, dto.userId, chat.defaultRoleId);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "role.unassign",
      targetType: "member",
      targetId: dto.userId,
      payload: {
        roleId,
        roleName: role.name,
        fallbackRoleId: chat.defaultRoleId,
        previousRoleId: targetMember.roleId
      }
    });
    this.eventBus.emit("member.updated", updated);
    return {
      ok: true,
      member: updated
    };
  }

  async simulatePermissions(chatId: string, requestUser: RequestUser, dto: PermissionSimulationDto) {
    const requestor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(requestor);
    await this.policy.assertCan(chatId, requestor, "audit.view");

    const actorUserId = dto.actor_user_id ?? requestUser.userId;
    const simulatedActor = actorUserId === requestUser.userId ? requestor : await this.getExistingMember(chatId, actorUserId);

    const permissions = Array.from(new Set(dto.permissions ?? []));
    const permissionChecks = await Promise.all(
      permissions.map(async (permission) => ({
        permission,
        allowed: await this.policy.hasPermission(chatId, simulatedActor, permission)
      }))
    );

    const targetMember = dto.target_user_id ? await this.db.getMember(chatId, dto.target_user_id) : undefined;
    const targetRole = dto.target_role_id ? await this.db.getRole(chatId, dto.target_role_id).catch(() => undefined) : undefined;
    const joinTargetRole = dto.join_target_role_id ? await this.db.getRole(chatId, dto.join_target_role_id).catch(() => undefined) : undefined;

    const result = {
      ok: true,
      actor: {
        user_id: simulatedActor.userId,
        role_id: simulatedActor.roleId,
        status: simulatedActor.status
      },
      permissions: permissionChecks,
      role_checks: {
        target_user_id: dto.target_user_id ?? null,
        target_user_exists: dto.target_user_id ? Boolean(targetMember) : null,
        can_manage_target_user:
          dto.target_user_id && targetMember ? await this.canManageMemberSafe(chatId, simulatedActor, targetMember) : null,
        target_role_id: dto.target_role_id ?? null,
        target_role_exists: dto.target_role_id ? Boolean(targetRole) : null,
        can_manage_target_role:
          dto.target_role_id && targetRole ? await this.canManageRoleSafe(chatId, simulatedActor, targetRole.id) : null
      },
      join_policy_checks: {
        can_approve_join: await this.policy.hasPermission(chatId, simulatedActor, "member.approve_join"),
        can_reject_join: await this.policy.hasPermission(chatId, simulatedActor, "member.reject_join"),
        can_create_invite: await this.policy.hasPermission(chatId, simulatedActor, "chat.invite.create"),
        can_revoke_invite: await this.policy.hasPermission(chatId, simulatedActor, "chat.invite.revoke"),
        can_create_unlimited_invite: await this.policy.hasPermission(chatId, simulatedActor, "chat.invite.use_unlimited"),
        join_target_role_id: dto.join_target_role_id ?? null,
        join_target_role_exists: dto.join_target_role_id ? Boolean(joinTargetRole) : null,
        can_set_join_target_role:
          dto.join_target_role_id && joinTargetRole ? await this.canManageRoleSafe(chatId, simulatedActor, joinTargetRole.id) : null
      }
    };

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "permission.simulate",
      targetType: "member",
      targetId: simulatedActor.userId,
      payload: {
        actor_user_id: simulatedActor.userId,
        target_user_id: dto.target_user_id ?? null,
        target_role_id: dto.target_role_id ?? null,
        join_target_role_id: dto.join_target_role_id ?? null,
        permissions
      }
    });

    return result;
  }

  private async getExistingMember(chatId: string, userId: string) {
    const member = await this.db.getMember(chatId, userId);
    if (!member) {
      throw new NotFoundException(`Member ${userId} is not in chat ${chatId}.`);
    }
    return member;
  }

  private async canManageMemberSafe(chatId: string, actor: ChatMember, target: ChatMember): Promise<boolean> {
    try {
      await this.policy.assertCanManageMember(chatId, actor, target);
      return true;
    } catch {
      return false;
    }
  }

  private async canManageRoleSafe(chatId: string, actor: ChatMember, roleId: string): Promise<boolean> {
    try {
      await this.policy.assertCanManageRole(chatId, actor, roleId);
      return true;
    } catch {
      return false;
    }
  }
}
