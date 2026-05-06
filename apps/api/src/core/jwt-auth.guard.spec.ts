import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { JwtAuthGuard } from "./jwt-auth.guard.js";

function makeExecutionContext(authorization?: string) {
  const request: { headers: Record<string, string | undefined>; user?: { userId: string; telegramId: number } } = {
    headers: {
      authorization
    }
  };
  return {
    request,
    context: {
      switchToHttp: () => ({
        getRequest: () => request
      })
    } as never
  };
}

describe("JwtAuthGuard", () => {
  it("attaches user for valid access token", () => {
    const jwtService = {
      verify: vi.fn(() => ({
        sub: "user-1",
        telegramId: 1001,
        type: "access"
      }))
    };
    const guard = new JwtAuthGuard(
      jwtService as never,
      new ConfigService({
        JWT_ISSUER: " issuer ",
        JWT_AUDIENCE: " audience "
      })
    );
    const { request, context } = makeExecutionContext("Bearer token");

    expect(guard.canActivate(context)).toBe(true);
    expect(jwtService.verify).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        issuer: "issuer",
        audience: "audience",
        algorithms: expect.arrayContaining(["HS256"])
      })
    );
    expect(request.user).toEqual({
      userId: "user-1",
      telegramId: 1001
    });
  });

  it("rejects refresh token in bearer auth", () => {
    const jwtService = {
      verify: vi.fn(() => ({
        sub: "user-1",
        telegramId: 1001,
        type: "refresh"
      }))
    };
    const guard = new JwtAuthGuard(jwtService as never, new ConfigService());
    const { context } = makeExecutionContext("Bearer token");

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects token with missing access type", () => {
    const jwtService = {
      verify: vi.fn(() => ({
        sub: "user-1",
        telegramId: 1001
      }))
    };
    const guard = new JwtAuthGuard(jwtService as never, new ConfigService());
    const { context } = makeExecutionContext("Bearer token");

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects overlong bearer token before jwt verification", () => {
    const jwtService = {
      verify: vi.fn()
    };
    const guard = new JwtAuthGuard(jwtService as never, new ConfigService({ JWT_MAX_TOKEN_CHARS: "3" }));
    const { context } = makeExecutionContext("Bearer token");

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(jwtService.verify).not.toHaveBeenCalled();
  });
});
