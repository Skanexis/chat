import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Message } from "../../core/types.js";

export type AntiAbuseViolationCode =
  | "max_length_exceeded"
  | "blocked_keyword"
  | "blocked_regex"
  | "media_type_blocked"
  | "media_extension_blocked"
  | "domain_blocked"
  | "domain_not_allowed"
  | "flood_detected"
  | "duplicate_detected";

export class AntiAbuseViolationError extends Error {
  constructor(
    public readonly code: AntiAbuseViolationCode,
    message: string,
    public readonly statusCode: number = HttpStatus.FORBIDDEN
  ) {
    super(message);
  }
}

@Injectable()
export class ChatAntiAbuseService {
  private readonly maxTextLengthByRole: Record<string, number>;
  private readonly maxTextLengthDefault: number;
  private readonly blockedKeywords: string[];
  private readonly blockedRegexPatterns: RegExp[];
  private readonly allowedMediaTypes: Set<string>;
  private readonly allowedMediaExtensionsByType: Record<string, Set<string>>;
  private readonly allowlistedDomains: string[];
  private readonly denylistedDomains: string[];
  private readonly floodWindowSeconds: number;
  private readonly floodMaxMessages: number;
  private readonly duplicateWindowSeconds: number;
  private readonly duplicateThreshold: number;

  constructor(private readonly configService: ConfigService) {
    this.maxTextLengthByRole = this.parseRoleLengthMap(this.configService.get<string>("CHAT_MAX_TEXT_LENGTH_BY_ROLE_JSON"));
    this.maxTextLengthDefault = this.parsePositiveInt(this.configService.get<string>("CHAT_MAX_TEXT_LENGTH_DEFAULT"), 4000);
    this.blockedKeywords = this.parseKeywordList(this.configService.get<string>("CHAT_BLOCKED_KEYWORDS"));
    this.blockedRegexPatterns = this.parsePatternList(this.configService.get<string>("CHAT_BLOCKED_REGEX_PATTERNS"));
    this.allowedMediaTypes = new Set(this.parseKeywordList(this.configService.get<string>("CHAT_MEDIA_ALLOWED_TYPES")));
    this.allowedMediaExtensionsByType = this.parseExtensionRules(
      this.configService.get<string>("CHAT_MEDIA_ALLOWED_EXTENSIONS_JSON")
    );
    this.allowlistedDomains = this.parseDomainList(this.configService.get<string>("CHAT_LINK_ALLOWLIST"));
    this.denylistedDomains = this.parseDomainList(this.configService.get<string>("CHAT_LINK_DENYLIST"));
    this.floodWindowSeconds = this.parsePositiveInt(this.configService.get<string>("CHAT_FLOOD_WINDOW_SECONDS"), 10);
    this.floodMaxMessages = this.parsePositiveInt(this.configService.get<string>("CHAT_FLOOD_MAX_MESSAGES"), 12);
    this.duplicateWindowSeconds = this.parsePositiveInt(this.configService.get<string>("CHAT_DUPLICATE_WINDOW_SECONDS"), 120);
    this.duplicateThreshold = this.parsePositiveInt(this.configService.get<string>("CHAT_DUPLICATE_THRESHOLD"), 3);
  }

  assertMaxLengthByRole(text: string | undefined, roleName: string): void {
    if (!text) {
      return;
    }

    const limit = this.maxTextLengthByRole[roleName] ?? this.maxTextLengthDefault;
    if (text.length > limit) {
      throw new AntiAbuseViolationError(
        "max_length_exceeded",
        `Message exceeds max length for role "${roleName}" (${limit}).`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  assertBlockedContentPolicy(text?: string): void {
    if (!text) {
      return;
    }

    const normalized = text.toLowerCase();
    for (const keyword of this.blockedKeywords) {
      if (normalized.includes(keyword)) {
        throw new AntiAbuseViolationError("blocked_keyword", `Message contains blocked keyword: ${keyword}`);
      }
    }

    for (const pattern of this.blockedRegexPatterns) {
      if (pattern.test(text)) {
        throw new AntiAbuseViolationError("blocked_regex", `Message matches blocked regex pattern: ${pattern.source}`);
      }
    }
  }

  assertMediaPolicy(media: Message["media"]): void {
    if (!media) {
      return;
    }

    if (this.allowedMediaTypes.size > 0 && !this.allowedMediaTypes.has(media.type)) {
      throw new AntiAbuseViolationError("media_type_blocked", `Media type is blocked by policy: ${media.type}`);
    }

    const allowedExtensions = this.allowedMediaExtensionsByType[media.type];
    if (!allowedExtensions || allowedExtensions.size === 0) {
      return;
    }

    const ext = this.extractExtension(media.url);
    if (!ext || !allowedExtensions.has(ext)) {
      throw new AntiAbuseViolationError(
        "media_extension_blocked",
        `Media extension is blocked by policy for type "${media.type}".`
      );
    }
  }

  assertTextDomainPolicy(text?: string): void {
    if (!text) {
      return;
    }

    const urls = this.extractUrls(text);
    if (urls.length === 0) {
      return;
    }

    for (const rawUrl of urls) {
      const domain = this.extractDomain(rawUrl);
      if (!domain) {
        continue;
      }

      if (this.domainMatchesAny(domain, this.denylistedDomains)) {
        throw new AntiAbuseViolationError("domain_blocked", `Domain is blocked by policy: ${domain}`);
      }
      if (this.allowlistedDomains.length > 0 && !this.domainMatchesAny(domain, this.allowlistedDomains)) {
        throw new AntiAbuseViolationError("domain_not_allowed", `Domain is not allowed by policy: ${domain}`);
      }
    }
  }

  assertDuplicateAndFlood(
    userId: string,
    text: string | undefined,
    messages: Message[],
    options?: { encryptedFingerprint?: string }
  ): void {
    const nowMs = Date.now();
    const floodWindowStartIso = new Date(nowMs - this.floodWindowSeconds * 1000).toISOString();
    const duplicateWindowStartIso = new Date(nowMs - this.duplicateWindowSeconds * 1000).toISOString();

    const normalized = this.normalizeText(text);
    const encryptedFingerprint = this.normalizeEncryptedFingerprint(options?.encryptedFingerprint);
    const shouldCheckDuplicate = Boolean(normalized || encryptedFingerprint);
    let floodCount = 0;
    let duplicateCount = 0;

    for (const message of messages) {
      if (message.authorId !== userId) {
        continue;
      }

      if (message.createdAt >= floodWindowStartIso) {
        floodCount += 1;
        if (floodCount >= this.floodMaxMessages) {
          throw new AntiAbuseViolationError("flood_detected", "Flood protection triggered. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
        }
      }
      if (!shouldCheckDuplicate || message.createdAt < duplicateWindowStartIso) {
        continue;
      }

      if (normalized && this.normalizeText(message.text) === normalized) {
        duplicateCount += 1;
      } else if (encryptedFingerprint && this.extractEncryptedFingerprint(message) === encryptedFingerprint) {
        duplicateCount += 1;
      }

      if (duplicateCount >= this.duplicateThreshold - 1) {
        throw new AntiAbuseViolationError("duplicate_detected", "Duplicate message protection triggered.", HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  private extractUrls(text: string): string[] {
    const matches = text.match(/\bhttps?:\/\/[^\s]+/gi);
    return matches ?? [];
  }

  private extractDomain(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private parseDomainList(raw: string | undefined): string[] {
    if (!raw) {
      return [];
    }
    return raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
  }

  private parseKeywordList(raw: string | undefined): string[] {
    if (!raw) {
      return [];
    }
    return raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
  }

  private parsePatternList(raw: string | undefined): RegExp[] {
    if (!raw) {
      return [];
    }
    const sourcePatterns = raw
      .split(";;")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const patterns: RegExp[] = [];
    for (const source of sourcePatterns) {
      try {
        patterns.push(new RegExp(source, "iu"));
      } catch {
        // ignore malformed admin-provided regex patterns
      }
    }
    return patterns;
  }

  private parseRoleLengthMap(raw: string | undefined): Record<string, number> {
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const result: Record<string, number> = {};
      for (const [role, value] of Object.entries(parsed)) {
        const numberValue = Number(value);
        if (Number.isFinite(numberValue) && numberValue > 0) {
          result[role] = Math.floor(numberValue);
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  private parseExtensionRules(raw: string | undefined): Record<string, Set<string>> {
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const result: Record<string, Set<string>> = {};
      for (const [mediaType, values] of Object.entries(parsed)) {
        if (!Array.isArray(values)) {
          continue;
        }
        const normalized = values
          .map((value) => String(value).trim().toLowerCase())
          .filter((value) => value.startsWith("."));
        result[mediaType] = new Set(normalized);
      }
      return result;
    } catch {
      return {};
    }
  }

  private extractExtension(url: string): string | null {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.toLowerCase();
      const dotIndex = pathname.lastIndexOf(".");
      if (dotIndex <= 0 || dotIndex === pathname.length - 1) {
        return null;
      }
      return pathname.slice(dotIndex);
    } catch {
      return null;
    }
  }

  private domainMatchesAny(domain: string, entries: string[]): boolean {
    return entries.some((entry) => domain === entry || domain.endsWith(`.${entry}`));
  }

  private normalizeText(text?: string): string {
    return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  private normalizeEncryptedFingerprint(fingerprint?: string): string {
    return (fingerprint ?? "").trim();
  }

  private extractEncryptedFingerprint(message: Message): string {
    if (!message.isEncrypted || !message.encryptedPayload) {
      return "";
    }
    const payload = message.encryptedPayload;
    return [payload.version, payload.algorithm, payload.keyId ?? "", payload.nonce, payload.ciphertext].join("|");
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return Math.floor(value);
  }
}
