import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";

function parseCorsOrigins(raw: string | undefined): string[] | boolean {
  const value = (raw ?? "*").trim();
  if (value === "*") {
    return true;
  }
  const list = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return list.length > 0 ? list : true;
}

function normalizeCorpPolicy(raw: string | undefined): "same-origin" | "same-site" | "cross-origin" {
  const normalized = (raw ?? "cross-origin").trim().toLowerCase();
  if (normalized === "same-origin" || normalized === "same-site" || normalized === "cross-origin") {
    return normalized;
  }
  return "cross-origin";
}

function isProductionLike(): boolean {
  const env = (process.env.NODE_ENV ?? "development").trim().toLowerCase();
  return env === "production" || env === "staging";
}

function validateRuntimeSecurityConfig(): void {
  if (!isProductionLike()) {
    return;
  }

  const allowInsecureInitData = (process.env.ALLOW_INSECURE_INITDATA ?? "false").trim().toLowerCase() === "true";
  if (allowInsecureInitData) {
    throw new Error("ALLOW_INSECURE_INITDATA must be false in production/staging.");
  }

  const apiCors = (process.env.API_CORS_ORIGINS ?? "*").trim();
  if (!apiCors || apiCors === "*") {
    throw new Error("API_CORS_ORIGINS must be an explicit origin allowlist in production/staging.");
  }

  const wsCors = (process.env.WS_CORS_ORIGINS ?? "*").trim();
  if (!wsCors || wsCors === "*") {
    throw new Error("WS_CORS_ORIGINS must be an explicit origin allowlist in production/staging.");
  }

  const hstsEnabled = (process.env.ENABLE_HSTS ?? "false").trim().toLowerCase() === "true";
  if (!hstsEnabled) {
    throw new Error("ENABLE_HSTS must be true in production/staging.");
  }
}

async function bootstrap(): Promise<void> {
  validateRuntimeSecurityConfig();

  const bodyLimitBytes = (() => {
    const parsed = Number(process.env.API_BODY_LIMIT_BYTES ?? 1_048_576);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1_048_576;
    }
    return Math.floor(parsed);
  })();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: bodyLimitBytes
    })
  );

  app.setGlobalPrefix("v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      validationError: {
        target: false,
        value: false
      }
    })
  );
  const corsCredentials = (process.env.API_CORS_CREDENTIALS ?? "false").toLowerCase() === "true";
  app.enableCors({
    origin: parseCorsOrigins(process.env.API_CORS_ORIGINS),
    credentials: corsCredentials,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With"]
  });

  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onSend", (request: { protocol?: string }, reply: { header: (name: string, value: string) => void }, payload: unknown, done: (error: Error | null, payload: unknown) => void) => {
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("X-Frame-Options", "DENY");
      reply.header("Referrer-Policy", "no-referrer");
      reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      reply.header("Cross-Origin-Opener-Policy", "same-origin");
      reply.header("Cross-Origin-Resource-Policy", normalizeCorpPolicy(process.env.API_CROSS_ORIGIN_RESOURCE_POLICY));
      reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      const hstsEnabled = (process.env.ENABLE_HSTS ?? "false").toLowerCase() === "true";
      if (hstsEnabled && request.protocol === "https") {
        reply.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
      }
      done(null, payload);
    });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  if ((process.env.PRINT_ROUTES ?? "false").toLowerCase() === "true") {
    // Fastify helper to print mounted routes while bootstrapping.
    // eslint-disable-next-line no-console
    console.log(app.getHttpAdapter().getInstance().printRoutes());
  }
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
}

void bootstrap();
