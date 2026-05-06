import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { AuthReplayStoreService } from "./auth-replay-store.service.js";
import { AuthService } from "./auth.service.js";

function createAuthFixture(configOverrides: Record<string, string> = {}) {
  const config = new ConfigService({
    JWT_SECRET: "test-jwt-secret",
    TELEGRAM_BOT_TOKEN: "test-bot-token",
    TELEGRAM_INITDATA_MAX_AGE_SECONDS: "300",
    TELEGRAM_INITDATA_FUTURE_SKEW_SECONDS: "30",
    ...configOverrides
  });
  const jwt = new JwtService({ secret: "test-jwt-secret" });
  const db = new InMemoryDatabase();
  const replayStore = new AuthReplayStoreService(config);
  const authService = new AuthService(config, jwt, replayStore, db);
  return { authService };
}

function buildTelegramInitData(input: {
  botToken: string;
  authDate: number;
  queryId?: string;
  user: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  extra?: Record<string, string>;
}): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(input.authDate));
  params.set("user", JSON.stringify(input.user));
  if (input.queryId) {
    params.set("query_id", input.queryId);
  }
  if (input.extra) {
    for (const [key, value] of Object.entries(input.extra)) {
      params.set(key, value);
    }
  }

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(input.botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("AuthService Telegram initData validation", () => {
  it("authenticates with valid signed initData", async () => {
    const { authService } = createAuthFixture();
    const initData = buildTelegramInitData({
      botToken: "test-bot-token",
      authDate: Math.floor(Date.now() / 1000),
      queryId: "query-valid-1",
      user: {
        id: 700001,
        username: "valid_user"
      }
    });

    const result = await authService.authWithTelegram({ initData });
    expect(result.user.telegramId).toBe(700001);
    expect(result.accessToken.length).toBeGreaterThan(10);
    expect(result.memberships.some((chat) => chat.id === "main")).toBe(true);
  });

  it("issues explicit access token type claim", async () => {
    const { authService } = createAuthFixture();
    const initData = buildTelegramInitData({
      botToken: "test-bot-token",
      authDate: Math.floor(Date.now() / 1000),
      queryId: "query-access-type-1",
      user: {
        id: 700010,
        username: "access_type_user"
      }
    });

    const result = await authService.authWithTelegram({ initData });
    const payload = new JwtService({ secret: "test-jwt-secret" }).verify<{ type?: string }>(result.accessToken);
    expect(payload.type).toBe("access");
  });

  it("rejects replayed initData payload", async () => {
    const { authService } = createAuthFixture();
    const initData = buildTelegramInitData({
      botToken: "test-bot-token",
      authDate: Math.floor(Date.now() / 1000),
      queryId: "query-replay-1",
      user: {
        id: 700002,
        username: "replay_user"
      }
    });

    await expect(authService.authWithTelegram({ initData })).resolves.toBeDefined();
    await expect(authService.authWithTelegram({ initData })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects initData with auth_date too far in the future", async () => {
    const { authService } = createAuthFixture({
      TELEGRAM_INITDATA_FUTURE_SKEW_SECONDS: "15"
    });
    const initData = buildTelegramInitData({
      botToken: "test-bot-token",
      authDate: Math.floor(Date.now() / 1000) + 120,
      queryId: "query-future-1",
      user: {
        id: 700003,
        username: "future_user"
      }
    });

    await expect(authService.authWithTelegram({ initData })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows insecure mode without bot token for local dev", async () => {
    const { authService } = createAuthFixture({
      TELEGRAM_BOT_TOKEN: "",
      ALLOW_INSECURE_INITDATA: "true"
    });
    const initData = new URLSearchParams({
      user: JSON.stringify({
        id: 700004,
        username: "insecure_dev"
      })
    }).toString();

    const result = await authService.authWithTelegram({ initData });
    expect(result.user.telegramId).toBe(700004);
  });

  it("rotates refresh tokens and blocks replay", async () => {
    const { authService } = createAuthFixture();
    const initData = buildTelegramInitData({
      botToken: "test-bot-token",
      authDate: Math.floor(Date.now() / 1000),
      queryId: "query-refresh-rotation-1",
      user: {
        id: 700005,
        username: "refresh_rotation"
      }
    });

    const firstSession = await authService.authWithTelegram({ initData });
    const secondSession = await authService.refreshSession({ refreshToken: firstSession.refreshToken });

    expect(secondSession.accessToken).not.toBe(firstSession.accessToken);
    expect(secondSession.refreshToken).not.toBe(firstSession.refreshToken);

    await expect(authService.refreshSession({ refreshToken: firstSession.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it("rejects access token in refresh endpoint", async () => {
    const { authService } = createAuthFixture();
    const initData = buildTelegramInitData({
      botToken: "test-bot-token",
      authDate: Math.floor(Date.now() / 1000),
      queryId: "query-refresh-wrong-type-1",
      user: {
        id: 700006,
        username: "refresh_wrong_type"
      }
    });

    const session = await authService.authWithTelegram({ initData });
    await expect(authService.refreshSession({ refreshToken: session.accessToken })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
