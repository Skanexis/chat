import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import type { UpsertMemberProfileFieldDto } from "./member-profile-fields.dto.js";

@Injectable()
export class MemberProfileFieldsService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService
  ) {}

  async listFields(chatId: string, userId: string, requestUser: RequestUser) {
    await this.getActorAndTarget(chatId, userId, requestUser);
    return {
      ok: true,
      fields: await this.db.listMemberProfileFields(chatId, userId)
    };
  }

  async upsertField(chatId: string, userId: string, requestUser: RequestUser, dto: UpsertMemberProfileFieldDto) {
    const { target } = await this.getActorAndTarget(chatId, userId, requestUser);
    const key = this.normalizeKey(dto.key);
    const value = this.normalizeValue(dto.value);

    const existing = await this.db.getMemberProfileFieldByKey(chatId, target.userId, key);
    const entry = await this.db.upsertMemberProfileField({
      chatId,
      userId: target.userId,
      key,
      value,
      createdBy: existing?.createdBy ?? requestUser.userId,
      updatedBy: requestUser.userId
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "member.profile_field.upsert",
      targetType: "member",
      targetId: target.userId,
      payload: {
        key,
        updated: Boolean(existing)
      }
    });

    return {
      ok: true,
      created: !existing,
      field: entry,
      fields: await this.db.listMemberProfileFields(chatId, target.userId)
    };
  }

  async deleteField(chatId: string, userId: string, fieldKey: string, requestUser: RequestUser) {
    const { target } = await this.getActorAndTarget(chatId, userId, requestUser);
    const key = this.normalizeKey(fieldKey);
    const existing = await this.db.getMemberProfileFieldByKey(chatId, target.userId, key);
    if (!existing) {
      return {
        ok: true,
        deleted: false,
        key,
        fields: await this.db.listMemberProfileFields(chatId, target.userId)
      };
    }

    await this.db.deleteMemberProfileField(chatId, target.userId, key);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "member.profile_field.delete",
      targetType: "member",
      targetId: target.userId,
      payload: { key }
    });

    return {
      ok: true,
      deleted: true,
      key,
      fields: await this.db.listMemberProfileFields(chatId, target.userId)
    };
  }

  private async getActorAndTarget(chatId: string, userId: string, requestUser: RequestUser) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "member.profile_fields.manage");

    const target = await this.db.getMember(chatId, userId);
    if (!target) {
      throw new NotFoundException(`Member ${userId} is not in chat ${chatId}.`);
    }

    return { actor, target };
  }

  private normalizeKey(raw: string): string {
    const value = raw.trim().toLowerCase();
    if (!value) {
      throw new BadRequestException("key cannot be empty.");
    }
    return value;
  }

  private normalizeValue(raw: string): string {
    const value = raw.trim();
    if (!value) {
      throw new BadRequestException("value cannot be empty.");
    }
    return value;
  }
}
