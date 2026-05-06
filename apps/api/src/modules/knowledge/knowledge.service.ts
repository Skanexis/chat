import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { ChatMember, KnowledgeArticleStatus, RequestUser } from "../../core/types.js";
import type { CreateKnowledgeArticleDto, UpdateKnowledgeArticleDto } from "./knowledge.dto.js";

const ARTICLE_STATUS_TRANSITIONS: Record<KnowledgeArticleStatus, KnowledgeArticleStatus[]> = {
  draft: ["review", "published", "archived"],
  review: ["draft", "published", "archived"],
  published: ["archived"],
  archived: []
};

@Injectable()
export class KnowledgeService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService
  ) {}

  async createArticle(chatId: string, requestUser: RequestUser, dto: CreateKnowledgeArticleDto) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "knowledge.article.create");

    const status = dto.status ?? "draft";
    await this.assertStatusPermission(chatId, member, status);
    const now = new Date().toISOString();
    const created = await this.db.createKnowledgeArticle({
      chatId,
      title: dto.title.trim(),
      content: dto.content,
      status,
      category: dto.category ?? null,
      tags: dto.tags ?? [],
      version: 1,
      createdBy: requestUser.userId,
      updatedBy: requestUser.userId,
      publishedAt: status === "published" ? now : null,
      archivedAt: status === "archived" ? now : null
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "knowledge.article.create",
      targetType: "knowledge_article",
      targetId: created.id,
      payload: dto as unknown as Record<string, unknown>
    });
    return created;
  }

  async updateArticle(chatId: string, articleId: string, requestUser: RequestUser, dto: UpdateKnowledgeArticleDto) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    const current = await this.db.getKnowledgeArticle(chatId, articleId);
    this.assertHasPatch(dto);

    const hasContentPatch = dto.title !== undefined || dto.content !== undefined || dto.category !== undefined || dto.tags !== undefined;
    if (hasContentPatch) {
      await this.policy.assertCan(chatId, member, "knowledge.article.update");
    }

    const nextStatus = dto.status ?? current.status;
    if (dto.status !== undefined && dto.status !== current.status) {
      this.assertStatusTransition(current.status, dto.status);
      await this.assertStatusPermission(chatId, member, dto.status);
    }

    const now = new Date().toISOString();
    const nextVersion = hasContentPatch ? current.version + 1 : current.version;
    const publishedAt =
      nextStatus === "published"
        ? current.publishedAt ?? now
        : dto.status !== undefined
          ? null
          : current.publishedAt ?? null;
    const archivedAt =
      nextStatus === "archived"
        ? now
        : dto.status !== undefined
          ? null
          : current.archivedAt ?? null;

    const updated = await this.db.updateKnowledgeArticle(chatId, articleId, {
      title: dto.title?.trim(),
      content: dto.content,
      status: nextStatus,
      category: dto.category,
      tags: dto.tags,
      version: nextVersion,
      updatedBy: requestUser.userId,
      publishedAt,
      archivedAt
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "knowledge.article.update",
      targetType: "knowledge_article",
      targetId: updated.id,
      payload: {
        before: {
          status: current.status,
          version: current.version
        },
        patch: dto
      }
    });
    return updated;
  }

  private async assertStatusPermission(chatId: string, member: ChatMember, status: KnowledgeArticleStatus) {
    if (status === "published") {
      await this.policy.assertCan(chatId, member, "knowledge.article.publish");
    }
    if (status === "archived") {
      await this.policy.assertCan(chatId, member, "knowledge.article.archive");
    }
  }

  private assertStatusTransition(from: KnowledgeArticleStatus, to: KnowledgeArticleStatus): void {
    const allowed = ARTICLE_STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(`Invalid knowledge article status transition: ${from} -> ${to}`);
    }
  }

  private assertHasPatch(dto: UpdateKnowledgeArticleDto): void {
    const hasPatch =
      dto.title !== undefined ||
      dto.content !== undefined ||
      dto.category !== undefined ||
      dto.tags !== undefined ||
      dto.status !== undefined;
    if (!hasPatch) {
      throw new BadRequestException("Knowledge article update requires at least one field.");
    }
  }
}
