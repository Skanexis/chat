import { HttpException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { AuthRateLimitGuard } from "./auth-rate-limit.guard.js";

function makeExecutionContext(ip: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        ip,
        headers: {},
        socket: {
          remoteAddress: ip
        }
      })
    })
  } as never;
}

describe("AuthRateLimitGuard", () => {
  it("allows requests under limit and blocks when limit exceeded", () => {
    const guard = new AuthRateLimitGuard(
      new ConfigService({
        AUTH_RATE_LIMIT_WINDOW_SECONDS: "60",
        AUTH_RATE_LIMIT_MAX_ATTEMPTS: "2"
      })
    );
    const context = makeExecutionContext("127.0.0.1");

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
  });

  it("tracks limits independently per ip", () => {
    const guard = new AuthRateLimitGuard(
      new ConfigService({
        AUTH_RATE_LIMIT_WINDOW_SECONDS: "60",
        AUTH_RATE_LIMIT_MAX_ATTEMPTS: "1"
      })
    );
    const firstIp = makeExecutionContext("127.0.0.1");
    const secondIp = makeExecutionContext("127.0.0.2");

    expect(guard.canActivate(firstIp)).toBe(true);
    expect(guard.canActivate(secondIp)).toBe(true);
    expect(() => guard.canActivate(firstIp)).toThrow(HttpException);
  });

  it("evicts oldest buckets when max bucket cap is reached", () => {
    const guard = new AuthRateLimitGuard(
      new ConfigService({
        AUTH_RATE_LIMIT_WINDOW_SECONDS: "60",
        AUTH_RATE_LIMIT_MAX_ATTEMPTS: "1",
        AUTH_RATE_LIMIT_MAX_BUCKETS: "2"
      })
    );

    expect(guard.canActivate(makeExecutionContext("10.0.0.1"))).toBe(true);
    expect(guard.canActivate(makeExecutionContext("10.0.0.2"))).toBe(true);
    expect(guard.canActivate(makeExecutionContext("10.0.0.3"))).toBe(true);

    expect(guard.canActivate(makeExecutionContext("10.0.0.1"))).toBe(true);
  });
});
