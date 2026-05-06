import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import type { AssignMemberTagDto } from "./member-tags.dto.js";

@Injectable()
export class MemberTagsService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService
  ) {}

  async assignTag(chatId: string, userId: string, requestUser: RequestUser, dto: AssignMemberTagDto) {
    const actor = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(actor);
    await this.policy.assertCan(chatId, actor, "member.tag.assign");

    const target = await this.db.getMember(chatId, userId);
    if (!target) {
      throw new NotFoundException(`Member ${userId} is not in chat ${chatId}.`);
    }

    const normalizedTag = this.normalizeTag(dto.tag);
    const tagsInChat = await this.db.listMemberTagsForChat(chatId);
    const tagExistsInChat = tagsInChat.some((entry) => entry.tag === normalizedTag);
    if (!tagExistsInChat) {
      await this.policy.assertCan(chatId, actor, "member.tag.create");
      await this.db.addAuditLog({
        chatId,
        actorId: requestUser.userId,
        action: "member.tag.create",
        targetType: "member_tag",
        targetId: normalizedTag,
        payload: {
          tag: normalizedTag
        }
      });
    }

    const existing = await this.db.getMemberTagByKey(chatId, target.userId, normalizedTag);
    if (existing) {
      await this.db.addAuditLog({
        chatId,
        actorId: requestUser.userId,
        action: "member.tag.assign",
        targetType: "member",
        targetId: target.userId,
        payload: {
          tag: normalizedTag,
          alreadyAssigned: true
        }
      });
      return {
        ok: true,
        created: false,
        tag: existing,
        tags: await this.db.listMemberTags(chatId, target.userId)
      };
    }

    const created = await this.db.createMemberTag({
      chatId,
      userId: target.userId,
      tag: normalizedTag,
      createdBy: requestUser.userId
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "member.tag.assign",
      targetType: "member",
      targetId: target.userId,
      payload: {
        tag: normalizedTag,
        alreadyAssigned: false
      }
    });

    return {
      ok: true,
      created: true,
      tag: created,
      tags: await this.db.listMemberTags(chatId, target.userId)
    };
  }

  private normalizeTag(raw: string): string {
    const value = raw.trim().toLowerCase();
    if (!value) {
      throw new BadRequestException("tag cannot be empty.");
    }
    return value;
  }
}
