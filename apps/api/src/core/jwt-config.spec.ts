import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import {
  resolveJwtAllowedAlgorithms,
  resolveJwtClaimOptions,
  resolveJwtSignAlgorithm,
  resolveJwtTokenMaxChars,
  resolveJwtVerifyOptions
} from "./jwt-config.js";

describe("jwt-config", () => {
  it("returns only normalized string claim options", () => {
    const config = new ConfigService({
      JWT_ISSUER: { bad: true },
      JWT_AUDIENCE: " audience "
    });

    expect(resolveJwtClaimOptions(config)).toEqual({
      audience: "audience"
    });
  });

  it("parses jwt max token chars with fallback", () => {
    const validConfig = new ConfigService({
      JWT_MAX_TOKEN_CHARS: "8192"
    });
    expect(resolveJwtTokenMaxChars(validConfig)).toBe(8192);

    const invalidConfig = new ConfigService({
      JWT_MAX_TOKEN_CHARS: "0"
    });
    expect(resolveJwtTokenMaxChars(invalidConfig)).toBe(4096);
  });

  it("parses allowed algorithms with fallback to HS256", () => {
    const config = new ConfigService({
      JWT_ALLOWED_ALGORITHMS: " HS512, bad, hs256 "
    });
    expect(resolveJwtAllowedAlgorithms(config)).toEqual(["HS512", "HS256"]);
    expect(resolveJwtSignAlgorithm(config)).toBe("HS512");

    const invalid = new ConfigService({
      JWT_ALLOWED_ALGORITHMS: "RS256"
    });
    expect(resolveJwtAllowedAlgorithms(invalid)).toEqual(["HS256"]);
  });

  it("builds verify options with claim and algorithm constraints", () => {
    const config = new ConfigService({
      JWT_ISSUER: "api",
      JWT_ALLOWED_ALGORITHMS: "HS384"
    });

    expect(resolveJwtVerifyOptions(config)).toEqual({
      issuer: "api",
      algorithms: ["HS384"]
    });
  });
});
