import { Inject, Injectable, ForbiddenException } from "@nestjs/common";

import { DATABASE_SERVICE } from "./database.service.js";
import type { DatabaseService } from "./database.service.js";
import type { ChatMember } from "./types.js";

@Injectable()
export class PolicyService {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async getRolePermissions(chatId: string, member: ChatMember): Promise<Set<string>> {
    const role = await this.db.getRole(chatId, member.roleId);
    return new Set(role.permissions);
  }

  async hasPermission(chatId: string, member: ChatMember, permission: string): Promise<boolean> {
    const permissions = await this.getRolePermissions(chatId, member);
    return permissions.has("*") || permissions.has(permission);
  }

  async assertCan(chatId: string, member: ChatMember, permission: string): Promise<void> {
    if (!(await this.hasPermission(chatId, member, permission))) {
      throw new ForbiddenException(`Permission denied: ${permission}`);
    }
  }

  assertMemberCanAccess(member: ChatMember): void {
    if (member.status === "banned") {
      throw new ForbiddenException("Banned members cannot access this chat.");
    }
  }

  assertMemberCanOperate(member: ChatMember): void {
    this.assertMemberCanAccess(member);
    if (member.status !== "active") {
      throw new ForbiddenException("Only active members can perform this action.");
    }
  }

  async assertCanManageMember(chatId: string, actor: ChatMember, target: ChatMember): Promise<void> {
    if (actor.userId === target.userId) {
      return;
    }
    if (await this.isWildcardMember(chatId, actor)) {
      return;
    }

    const [actorRole, targetRole] = await Promise.all([this.db.getRole(chatId, actor.roleId), this.db.getRole(chatId, target.roleId)]);
    if (actorRole.priority <= targetRole.priority) {
      throw new ForbiddenException("Cannot manage member with equal or higher role priority.");
    }
  }

  async assertCanManageRole(chatId: string, actor: ChatMember, targetRoleId: string): Promise<void> {
    if (await this.isWildcardMember(chatId, actor)) {
      return;
    }

    const [actorRole, targetRole] = await Promise.all([this.db.getRole(chatId, actor.roleId), this.db.getRole(chatId, targetRoleId)]);
    if (actorRole.priority <= targetRole.priority) {
      throw new ForbiddenException("Cannot manage role with equal or higher priority.");
    }
  }

  async assertCanCreateRoleWithPriority(chatId: string, actor: ChatMember, rolePriority: number): Promise<void> {
    if (await this.isWildcardMember(chatId, actor)) {
      return;
    }

    const actorRole = await this.db.getRole(chatId, actor.roleId);
    if (actorRole.priority <= rolePriority) {
      throw new ForbiddenException("Cannot create role with equal or higher priority than your own.");
    }
  }

  private async isWildcardMember(chatId: string, member: ChatMember): Promise<boolean> {
    const permissions = await this.getRolePermissions(chatId, member);
    return permissions.has("*");
  }
}
