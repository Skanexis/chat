import { Body, Controller, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { CreateKnowledgeArticleDto, UpdateKnowledgeArticleDto } from "./knowledge.dto.js";
import { KnowledgeService } from "./knowledge.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/knowledge/articles")
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post()
  async createArticle(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateKnowledgeArticleDto) {
    return this.knowledgeService.createArticle(chatId, user, dto);
  }

  @Patch(":articleId")
  async updateArticle(
    @Param("chatId") chatId: string,
    @Param("articleId") articleId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateKnowledgeArticleDto
  ) {
    return this.knowledgeService.updateArticle(chatId, articleId, user, dto);
  }
}
