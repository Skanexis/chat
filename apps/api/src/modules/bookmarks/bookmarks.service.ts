import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { Bookmark, RequestUser } from "../../core/types.js";
import type { CreateBookmarkDto } from "./bookmarks.dto.js";

@Injectable()
export class BookmarksService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService
  ) {}

  async createBookmark(chatId: string, requestUser: RequestUser, dto: CreateBookmarkDto): Promise<Bookmark> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "bookmark.create");

    const collection = this.normalizeCollection(dto.collection);
    const tags = this.normalizeTags(dto.tags);
    const note = this.normalizeNote(dto.note);
    const isShared = dto.is_shared ?? false;
    if (isShared) {
      await this.policy.assertCan(chatId, member, "bookmark.collection.manage");
    }

    const message = await this.db.getMessage(chatId, dto.message_id);
    if (message.isDeleted) {
      throw new BadRequestException("Cannot bookmark deleted message.");
    }

    const existing = (await this.db.listBookmarks(chatId, requestUser.userId)).find(
      (bookmark) =>
        bookmark.userId === requestUser.userId &&
        bookmark.messageId === dto.message_id &&
        bookmark.collection === collection &&
        bookmark.isShared === isShared
    );

    if (existing) {
      const updated = await this.db.updateBookmark(chatId, existing.id, {
        tags,
        note
      });
      await this.db.addAuditLog({
        chatId,
        actorId: requestUser.userId,
        action: "bookmark.update",
        targetType: "bookmark",
        targetId: updated.id,
        payload: {
          messageId: updated.messageId,
          collection: updated.collection,
          is_shared: updated.isShared
        }
      });
      return updated;
    }

    const created = await this.db.createBookmark({
      chatId,
      userId: requestUser.userId,
      messageId: dto.message_id,
      collection,
      tags,
      note,
      isShared
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "bookmark.create",
      targetType: "bookmark",
      targetId: created.id,
      payload: {
        messageId: created.messageId,
        collection: created.collection,
        is_shared: created.isShared,
        tags: created.tags
      }
    });

    return created;
  }

  async listBookmarks(chatId: string, requestUser: RequestUser): Promise<Bookmark[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "bookmark.create");
    return this.db.listBookmarks(chatId, requestUser.userId);
  }

  async deleteBookmark(chatId: string, bookmarkId: string, requestUser: RequestUser): Promise<{ ok: true; bookmarkId: string }> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "bookmark.create");

    const bookmark = await this.db.getBookmark(chatId, bookmarkId);
    if (bookmark.userId !== requestUser.userId) {
      await this.policy.assertCan(chatId, member, "bookmark.collection.manage");
    }

    await this.db.deleteBookmark(chatId, bookmarkId);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "bookmark.delete",
      targetType: "bookmark",
      targetId: bookmarkId,
      payload: {
        ownerId: bookmark.userId,
        collection: bookmark.collection,
        is_shared: bookmark.isShared
      }
    });

    return {
      ok: true,
      bookmarkId
    };
  }

  private normalizeCollection(raw: string | undefined): string {
    const value = raw?.trim();
    if (!value) {
      return "default";
    }
    return value;
  }

  private normalizeTags(raw: string[] | undefined): string[] {
    if (!raw || raw.length === 0) {
      return [];
    }
    const unique = new Set<string>();
    for (const value of raw) {
      const tag = value.trim();
      if (!tag) {
        continue;
      }
      unique.add(tag);
    }
    return Array.from(unique);
  }

  private normalizeNote(raw: string | undefined): string | null {
    const value = raw?.trim();
    if (!value) {
      return null;
    }
    return value;
  }
}

