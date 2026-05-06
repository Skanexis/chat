import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { Message, RequestUser } from "../../core/types.js";
import type { GetUnreadSummaryQueryDto } from "./unread-summary.dto.js";

@Injectable()
export class UnreadSummaryService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService
  ) {}

  async getSummary(chatId: string, requestUser: RequestUser, query: GetUnreadSummaryQueryDto) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "summary.unread.generate");

    const user = await this.db.getUserById(requestUser.userId);
    const allMessages = await this.db.listMessages(chatId);
    const sinceIso = this.parseSince(query.since);
    const initial = sinceIso ? allMessages.filter((message) => message.createdAt > sinceIso) : allMessages.slice(-200);

    const mentionsOnly = query.mentions_only === "true";
    const moderationOnly = query.moderation_only === "true";
    const announcementsOnly = query.announcements_only === "true";

    const filtered = initial.filter((message) => {
      if (mentionsOnly && !this.isMentionForUser(message, requestUser.userId, user?.username)) {
        return false;
      }
      if (moderationOnly && !this.isModerationMessage(message)) {
        return false;
      }
      if (announcementsOnly && !this.isAnnouncementMessage(message)) {
        return false;
      }
      return true;
    });

    const recent = filtered.slice(-12);
    const summaryLines = recent.map((message) => `- ${this.formatMessagePreview(message)}`);

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "summary.unread.generate",
      targetType: "chat",
      targetId: chatId,
      payload: {
        filters: {
          mentions_only: mentionsOnly,
          moderation_only: moderationOnly,
          announcements_only: announcementsOnly,
          since: sinceIso
        },
        matched: filtered.length
      }
    });

    return {
      ok: true,
      matchedCount: filtered.length,
      filters: {
        mentions_only: mentionsOnly,
        moderation_only: moderationOnly,
        announcements_only: announcementsOnly,
        since: sinceIso
      },
      summary: summaryLines.join("\n"),
      items: recent.map((message) => ({
        messageId: message.id,
        createdAt: message.createdAt,
        preview: this.formatMessagePreview(message)
      }))
    };
  }

  private parseSince(since?: string): string | null {
    if (!since) {
      return null;
    }
    if (Number.isNaN(Date.parse(since))) {
      throw new BadRequestException("since must be a valid ISO datetime.");
    }
    return new Date(since).toISOString();
  }

  private isMentionForUser(message: Message, userId: string, username?: string): boolean {
    const text = (message.text ?? "").toLowerCase();
    if (!text) {
      return false;
    }
    if (username && text.includes(`@${username.toLowerCase()}`)) {
      return true;
    }
    return text.includes(userId.toLowerCase());
  }

  private isModerationMessage(message: Message): boolean {
    const text = (message.text ?? "").toLowerCase();
    return /\b(mute|ban|kick|warn|timeout|unban|unmute|moderation)\b/.test(text);
  }

  private isAnnouncementMessage(message: Message): boolean {
    if (message.senderMode !== "as_user") {
      return true;
    }
    const text = (message.text ?? "").toLowerCase();
    return text.startsWith("[ann]") || text.startsWith("[announcement]");
  }

  private formatMessagePreview(message: Message): string {
    const text = message.text?.trim();
    if (text && text.length > 0) {
      return text.length > 140 ? `${text.slice(0, 137)}...` : text;
    }
    if (message.media) {
      return `[${message.media.type}] ${message.media.url}`;
    }
    return "(empty)";
  }
}
