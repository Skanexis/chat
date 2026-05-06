import { ConfigService } from "@nestjs/config";
import type { JwtSignOptions, JwtVerifyOptions } from "@nestjs/jwt";

type JwtClaimOptions = {
  issuer?: string;
  audience?: string;
};

type JwtAlgorithm = NonNullable<JwtSignOptions["algorithm"]>;

const SUPPORTED_HMAC_ALGORITHMS: readonly JwtAlgorithm[] = ["HS256", "HS384", "HS512"];

function isSupportedHmacAlgorithm(value: string): value is JwtAlgorithm {
  return (SUPPORTED_HMAC_ALGORITHMS as readonly string[]).includes(value);
}

function getOptionalString(configService: ConfigService, key: string): string | undefined {
  const raw = configService.get<unknown>(key);
  if (typeof raw !== "string") {
    return undefined;
  }

  const normalized = raw.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  return normalized;
}

function parsePositiveInt(raw: unknown, fallback: number): number {
  let parsed: number;
  if (typeof raw === "number") {
    parsed = raw;
  } else if (typeof raw === "string" && raw.trim().length > 0) {
    parsed = Number(raw);
  } else {
    return fallback;
  }

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function resolveJwtClaimOptions(configService: ConfigService): JwtClaimOptions {
  const issuer = getOptionalString(configService, "JWT_ISSUER");
  const audience = getOptionalString(configService, "JWT_AUDIENCE");

  const options: JwtClaimOptions = {};
  if (issuer) {
    options.issuer = issuer;
  }
  if (audience) {
    options.audience = audience;
  }
  return options;
}

export function resolveJwtAllowedAlgorithms(configService: ConfigService): NonNullable<JwtVerifyOptions["algorithms"]> {
  const raw = getOptionalString(configService, "JWT_ALLOWED_ALGORITHMS");
  if (!raw) {
    return ["HS256"];
  }

  const allowed = raw
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry): entry is JwtAlgorithm => isSupportedHmacAlgorithm(entry));

  return allowed.length > 0 ? allowed : ["HS256"];
}

export function resolveJwtSignAlgorithm(configService: ConfigService): JwtAlgorithm {
  const [algorithm] = resolveJwtAllowedAlgorithms(configService);
  return algorithm ?? "HS256";
}

export function resolveJwtVerifyOptions(configService: ConfigService): JwtClaimOptions & Pick<JwtVerifyOptions, "algorithms"> {
  return {
    ...resolveJwtClaimOptions(configService),
    algorithms: resolveJwtAllowedAlgorithms(configService)
  };
}

export function resolveJwtTokenMaxChars(configService: ConfigService, fallback = 4096): number {
  return parsePositiveInt(configService.get<unknown>("JWT_MAX_TOKEN_CHARS"), fallback);
}
