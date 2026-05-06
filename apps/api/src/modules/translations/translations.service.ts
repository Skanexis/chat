import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { MessageTranslation, RequestUser } from "../../core/types.js";
import type { TranslateMessageDto } from "./translations.dto.js";

@Injectable()
export class TranslationsService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly configService: ConfigService
  ) {}

  async translateMessage(chatId: string, messageId: string, requestUser: RequestUser, dto: TranslateMessageDto) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "translation.use");

    if (dto.force_refresh) {
      await this.policy.assertCan(chatId, member, "translation.manage");
    }

    const message = await this.db.getMessage(chatId, messageId);
    const sourceText = this.getSourceText(message.text);
    const targetLanguage = this.normalizeTargetLanguage(dto.target_language);
    const sourceLanguage = this.normalizeSourceLanguage(dto.source_language);
    const cached = await this.db.getMessageTranslation(chatId, messageId, targetLanguage);

    const cacheHit = Boolean(!dto.force_refresh && cached && this.isCacheFresh(cached, sourceText));
    const provider = this.configService.get<string>("TRANSLATION_PROVIDER", "mock-local");

    const translation =
      cacheHit && cached
        ? cached
        : await this.db.upsertMessageTranslation({
            chatId,
            messageId,
            targetLanguage,
            sourceLanguage,
            sourceText,
            translatedText: this.translateText(sourceText, sourceLanguage, targetLanguage),
            provider,
            createdBy: cached?.createdBy ?? requestUser.userId,
            updatedBy: requestUser.userId
          });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.translate",
      targetType: "message",
      targetId: messageId,
      payload: {
        targetLanguage,
        sourceLanguage,
        cacheHit,
        forceRefresh: Boolean(dto.force_refresh),
        provider
      }
    });

    return {
      ok: true,
      cacheHit,
      translation: this.toTranslationView(translation)
    };
  }

  async listTranslations(chatId: string, messageId: string, requestUser: RequestUser) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "translation.use");
    await this.db.getMessage(chatId, messageId);

    const translations = await this.db.listMessageTranslations(chatId, messageId);
    return {
      ok: true,
      items: translations.map((entry) => this.toTranslationView(entry))
    };
  }

  async deleteTranslation(chatId: string, messageId: string, targetLanguageRaw: string, requestUser: RequestUser) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "translation.manage");

    await this.db.getMessage(chatId, messageId);
    const targetLanguage = this.normalizeTargetLanguage(targetLanguageRaw);
    const existing = await this.db.getMessageTranslation(chatId, messageId, targetLanguage);
    if (!existing) {
      return {
        ok: true,
        deleted: false,
        targetLanguage
      };
    }

    await this.db.deleteMessageTranslation(chatId, messageId, targetLanguage);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.translation.delete",
      targetType: "message",
      targetId: messageId,
      payload: {
        targetLanguage
      }
    });

    return {
      ok: true,
      deleted: true,
      targetLanguage
    };
  }

  private normalizeTargetLanguage(raw: string): string {
    const language = raw.trim().toLowerCase();
    if (!this.isLanguageCode(language)) {
      throw new BadRequestException("target_language must be a valid language code (example: en, it, pt-br).");
    }
    return language;
  }

  private normalizeSourceLanguage(raw?: string): string {
    if (!raw) {
      return "auto";
    }
    const language = raw.trim().toLowerCase();
    if (language === "auto") {
      return language;
    }
    if (!this.isLanguageCode(language)) {
      throw new BadRequestException("source_language must be a valid language code or auto.");
    }
    return language;
  }

  private isLanguageCode(value: string): boolean {
    return /^[a-z]{2,3}(-[a-z]{2})?$/.test(value);
  }

  private getSourceText(text?: string): string {
    const sourceText = text?.trim();
    if (!sourceText) {
      throw new BadRequestException("Translation is available only for text messages.");
    }
    return sourceText;
  }

  private translateText(text: string, sourceLanguage: string, targetLanguage: string): string {
    if (targetLanguage === sourceLanguage) {
      return text;
    }
    return `[${targetLanguage}] ${text}`;
  }

  private isCacheFresh(entry: MessageTranslation, sourceText: string): boolean {
    if (entry.sourceText !== sourceText) {
      return false;
    }
    const ttlSeconds = this.getCacheTtlSeconds();
    if (ttlSeconds <= 0) {
      return false;
    }
    const updatedAt = Date.parse(entry.updatedAt);
    if (Number.isNaN(updatedAt)) {
      return false;
    }
    return Date.now() - updatedAt <= ttlSeconds * 1000;
  }

  private getCacheTtlSeconds(): number {
    const raw = this.configService.get<string>("TRANSLATION_CACHE_TTL_SECONDS", "86400");
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 86400;
    }
    return Math.floor(parsed);
  }

  private toTranslationView(entry: MessageTranslation) {
    return {
      id: entry.id,
      messageId: entry.messageId,
      targetLanguage: entry.targetLanguage,
      sourceLanguage: entry.sourceLanguage,
      text: entry.translatedText,
      provider: entry.provider,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    };
  }
}
