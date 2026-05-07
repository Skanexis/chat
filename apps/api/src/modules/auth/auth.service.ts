import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { resolveJwtTokenMaxChars, resolveJwtVerifyOptions } from "../../core/jwt-config.js";
import type { Chat, ChatMember, RequestUser, Role, User } from "../../core/types.js";
import { AuthReplayStoreService } from "./auth-replay-store.service.js";
import type { RefreshSessionDto, TelegramAuthDto } from "./auth.dto.js";

type TelegramInitUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramGetChatMemberResponse = {
  ok: boolean;
  description?: string;
  result?: {
    status?: string;
  };
};

type InitDataValidationResult = {
  strictMode: boolean;
  replayToken: string | null;
  authDate: number | null;
  replayTtlSeconds: number;
};

type AccessChatMembershipResult = {
  status: string;
  isAdmin: boolean;
};

type AuthSessionResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
  memberships: Chat[];
};

type RefreshTokenPayload = {
  sub: string;
  telegramId: number;
  type?: string;
  jti?: string;
  exp?: number;
};

@Injectable()
export class AuthService {
  private readonly jwtVerifyOptions: ReturnType<typeof resolveJwtVerifyOptions>;
  private readonly maxTokenChars: number;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(AuthReplayStoreService) private readonly replayStore: AuthReplayStoreService,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService
  ) {
    this.jwtVerifyOptions = resolveJwtVerifyOptions(this.configService);
    this.maxTokenChars = resolveJwtTokenMaxChars(this.configService);
  }

  async authWithTelegram(dto: TelegramAuthDto): Promise<AuthSessionResponse> {
    const params = new URLSearchParams(dto.initData);
    const validation = this.validateInitData(params, dto.initData);

    const tgUser = this.parseTelegramUser(params);
    const membership = await this.assertTelegramAccessChatMembership(tgUser.id);
    if (validation.strictMode && validation.replayToken && validation.authDate !== null) {
      await this.assertInitDataNotReplayed(validation.replayToken, tgUser.id, validation.authDate, validation.replayTtlSeconds);
    }

    const user = await this.db.upsertTelegramUser({
      telegramId: tgUser.id,
      username: tgUser.username,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name
    });

    const targetChatId = dto.chatId ?? "main";
    let member = await this.db.ensureMember(targetChatId, user.id);
    if (membership?.isAdmin) {
      member = await this.promoteTelegramAdminToLegit(targetChatId, member);
    }
    await this.assertMaintenanceAccessPolicy(targetChatId, member.roleId);

    const requestUser: RequestUser = {
      userId: user.id,
      telegramId: user.telegramId
    };
    const tokens = this.issueTokens(requestUser);

    return {
      ...tokens,
      user,
      memberships: await this.db.listChatsForUser(user.id)
    };
  }

  private async assertTelegramAccessChatMembership(telegramUserId: number): Promise<AccessChatMembershipResult | null> {
    const accessChatId = this.configService.get<string>("TELEGRAM_ACCESS_CHAT_ID")?.trim();
    if (!accessChatId) {
      const nodeEnv = (this.configService.get<string>("NODE_ENV") ?? "").trim().toLowerCase();
      if (nodeEnv === "production") {
        throw new ForbiddenException("Mini App access is disabled: TELEGRAM_ACCESS_CHAT_ID is not configured.");
      }
      return null;
    }

    const botToken = this.configService.get<string>("TELEGRAM_BOT_TOKEN")?.trim();
    if (!botToken) {
      throw new UnauthorizedException("TELEGRAM_BOT_TOKEN is not configured for membership verification.");
    }

    let payload: TelegramGetChatMemberResponse | null = null;
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          chat_id: accessChatId,
          user_id: telegramUserId
        })
      });

      if (!response.ok) {
        throw new ForbiddenException("Telegram membership verification request failed.");
      }

      payload = (await response.json()) as TelegramGetChatMemberResponse;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException("Telegram membership verification is unavailable.");
    }

    if (!payload?.ok) {
      throw new ForbiddenException(
        payload?.description?.trim().length ? `Telegram membership verification failed: ${payload.description}` : "Telegram membership verification failed."
      );
    }

    const status = payload.result?.status;
    const allowedStatuses = new Set(["creator", "administrator", "member", "restricted"]);
    if (!status || !allowedStatuses.has(status)) {
      throw new ForbiddenException("Mini App access denied: user is not a member of the required Telegram chat.");
    }
    return {
      status,
      isAdmin: status === "creator" || status === "administrator"
    };
  }

  private async promoteTelegramAdminToLegit(chatId: string, member: ChatMember): Promise<ChatMember> {
    const roles = await this.db.listRoles(chatId);
    const legitRole = this.resolveLegitRole(roles);
    if (!legitRole || member.roleId === legitRole.id) {
      return member;
    }

    const currentRole = roles.find((role) => role.id === member.roleId) ?? (await this.db.getRole(chatId, member.roleId));
    if (currentRole.priority >= legitRole.priority) {
      return member;
    }

    return this.db.updateMemberRole(chatId, member.userId, legitRole.id);
  }

  private resolveLegitRole(roles: Role[]): Role | undefined {
    const bySystemId = roles.find((role) => role.id === "role_main_legit");
    if (bySystemId) {
      return bySystemId;
    }

    return roles.find((role) => {
      const permissionSet = new Set(role.permissions);
      return (
        !permissionSet.has("*") &&
        permissionSet.has("message.send.text") &&
        permissionSet.has("message.send.reply") &&
        permissionSet.has("message.edit.own") &&
        permissionSet.has("message.delete.own") &&
        permissionSet.has("message.react")
      );
    });
  }

  async refreshSession(dto: RefreshSessionDto): Promise<AuthSessionResponse> {
    const refreshToken = dto.refreshToken.trim();
    if (refreshToken.length === 0 || refreshToken.length > this.maxTokenChars) {
      throw new UnauthorizedException("Refresh token length is invalid.");
    }

    const payload = this.verifyRefreshToken(refreshToken);
    await this.assertRefreshTokenNotReplayed(payload.jti, payload.exp);

    const user = await this.db.getUserById(payload.sub);
    if (!user || user.telegramId !== payload.telegramId) {
      throw new UnauthorizedException("Refresh token subject is invalid.");
    }
    const membership = await this.assertTelegramAccessChatMembership(user.telegramId);
    if (membership?.isAdmin) {
      const refreshedMember = await this.db.ensureMember("main", user.id);
      await this.promoteTelegramAdminToLegit("main", refreshedMember);
    }

    const tokens = this.issueTokens({
      userId: user.id,
      telegramId: user.telegramId
    });

    return {
      ...tokens,
      user,
      memberships: await this.db.listChatsForUser(user.id)
    };
  }

  private validateInitData(params: URLSearchParams, rawInitData: string): InitDataValidationResult {
    const botToken = this.configService.get<string>("TELEGRAM_BOT_TOKEN");
    const allowInsecure =
      (this.configService.get<string>("ALLOW_INSECURE_INITDATA", "false") ?? "false").toLowerCase() === "true";

    if (!botToken) {
      if (allowInsecure) {
        return {
          strictMode: false,
          replayToken: null,
          authDate: null,
          replayTtlSeconds: 0
        };
      }
      throw new UnauthorizedException("TELEGRAM_BOT_TOKEN is not configured.");
    }

    const hash = params.get("hash");
    if (!hash) {
      throw new UnauthorizedException("Telegram initData hash is missing.");
    }

    const authDate = Number(params.get("auth_date"));
    if (!Number.isFinite(authDate)) {
      throw new UnauthorizedException("Telegram initData auth_date is missing.");
    }
    const maxAge = this.parsePositiveIntEnv("TELEGRAM_INITDATA_MAX_AGE_SECONDS", 300);
    const futureSkewSeconds = this.parsePositiveIntEnv("TELEGRAM_INITDATA_FUTURE_SKEW_SECONDS", 30);
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (ageSeconds > maxAge) {
      throw new ForbiddenException("Telegram initData has expired.");
    }
    if (ageSeconds < -futureSkewSeconds) {
      throw new ForbiddenException("Telegram initData auth_date is too far in the future.");
    }

    const checkParams = new URLSearchParams(rawInitData);
    checkParams.delete("hash");
    const dataCheckString = Array.from(checkParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
    const digest = createHmac("sha256", secret).update(dataCheckString).digest("hex");

    const hashBuffer = Buffer.from(hash, "hex");
    const digestBuffer = Buffer.from(digest, "hex");
    if (hashBuffer.length !== digestBuffer.length || !timingSafeEqual(hashBuffer, digestBuffer)) {
      throw new UnauthorizedException("Telegram initData signature is invalid.");
    }

    const queryId = params.get("query_id");
    return {
      strictMode: true,
      replayToken: queryId && queryId.trim().length > 0 ? `query_id:${queryId}` : `hash:${hash}`,
      authDate,
      replayTtlSeconds: maxAge + futureSkewSeconds + 5
    };
  }

  private parseTelegramUser(params: URLSearchParams): TelegramInitUser {
    const rawUser = params.get("user");
    if (!rawUser) {
      throw new UnauthorizedException("Telegram initData user payload is missing.");
    }

    try {
      const parsed = JSON.parse(rawUser) as TelegramInitUser;
      if (!parsed.id || typeof parsed.id !== "number") {
        throw new Error("id is missing");
      }
      return parsed;
    } catch {
      throw new UnauthorizedException("Telegram initData user payload is invalid.");
    }
  }

  private async assertInitDataNotReplayed(
    replayToken: string,
    telegramUserId: number,
    authDate: number,
    ttlSeconds: number
  ): Promise<void> {
    const replayKey = `${replayToken}|user:${telegramUserId}|auth:${authDate}`;
    const firstUse = await this.replayStore.markIfFirstUse(`init:${replayKey}`, Math.max(1, Math.floor(ttlSeconds)));
    if (!firstUse) {
      throw new UnauthorizedException("Telegram initData replay detected.");
    }
  }

  private parsePositiveIntEnv(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    if (!raw || raw.trim().length === 0) {
      return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.floor(parsed);
  }

  private issueTokens(user: RequestUser): { accessToken: string; refreshToken: string } {
    const sessionId = randomUUID();
    return {
      accessToken: this.jwtService.sign({
        sub: user.userId,
        telegramId: user.telegramId,
        type: "access",
        sid: sessionId
      }),
      refreshToken: this.jwtService.sign(
        {
          sub: user.userId,
          telegramId: user.telegramId,
          type: "refresh",
          sid: sessionId,
          jti: randomUUID()
        },
        { expiresIn: "7d" }
      )
    };
  }

  private verifyRefreshToken(token: string): Required<Pick<RefreshTokenPayload, "sub" | "telegramId" | "jti">> & Pick<RefreshTokenPayload, "exp"> {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(token, this.jwtVerifyOptions);
      if (payload.type !== "refresh") {
        throw new UnauthorizedException("Refresh token type is invalid.");
      }
      if (!payload.sub || !Number.isFinite(payload.telegramId) || !payload.jti || payload.jti.trim().length === 0) {
        throw new UnauthorizedException("Refresh token payload is invalid.");
      }
      return {
        sub: payload.sub,
        telegramId: payload.telegramId,
        jti: payload.jti,
        exp: payload.exp
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid refresh token.");
    }
  }

  private async assertRefreshTokenNotReplayed(jti: string, exp?: number): Promise<void> {
    const nowMs = Date.now();
    const replayKey = `refresh:jti:${jti}`;
    const firstUse = await this.replayStore.markIfFirstUse(replayKey, this.resolveRefreshReplayTtlSeconds(exp, nowMs));
    if (!firstUse) {
      throw new UnauthorizedException("Refresh token replay detected.");
    }
  }

  private resolveRefreshReplayTtlSeconds(exp: number | undefined, nowMs: number): number {
    if (typeof exp === "number" && Number.isFinite(exp)) {
      const remaining = exp * 1000 - nowMs;
      if (remaining > 0) {
        return Math.max(1, Math.floor(remaining / 1000));
      }
    }

    const fallbackSeconds = this.parsePositiveIntEnv("JWT_REFRESH_REPLAY_FALLBACK_TTL_SECONDS", 7 * 24 * 60 * 60);
    return fallbackSeconds;
  }

  private async assertMaintenanceAccessPolicy(chatId: string, roleId: string): Promise<void> {
    const active = await this.db.getActiveIncidentMode(chatId);
    if (!active) {
      return;
    }

    const role = await this.db.getRole(chatId, roleId);
    const permissionSet = new Set(role.permissions);
    const isBypassRole =
      permissionSet.has("*") ||
      (permissionSet.has("incident_mode.enable") && permissionSet.has("incident_mode.disable"));
    if (!isBypassRole) {
      throw new ForbiddenException(
        "Maintenance mode is active. Access is temporarily limited to roles with maintenance permissions."
      );
    }
  }
}
