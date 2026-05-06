import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@prisma/client";

import { AppModule } from "../src/app.module.js";

type AuthResponse = {
  accessToken: string;
  user: {
    id: string;
    telegramId: number;
  };
};

type HttpResult = {
  status: number;
  bodyText: string;
  json: unknown;
};

function parsePort(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return Math.floor(parsed);
}

function buildInsecureInitData(telegramId: number, username: string): string {
  return new URLSearchParams({
    user: JSON.stringify({
      id: telegramId,
      username
    })
  }).toString();
}

async function requestJson(baseUrl: string, path: string, options: RequestInit = {}): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}${path}`, options);
  const bodyText = await response.text();
  let json: unknown = null;
  if (bodyText.trim().length > 0) {
    try {
      json = JSON.parse(bodyText);
    } catch {
      json = null;
    }
  }
  return {
    status: response.status,
    bodyText,
    json
  };
}

function assertStatus(result: HttpResult, expected: number | number[], label: string): void {
  const expectedList = Array.isArray(expected) ? expected : [expected];
  if (!expectedList.includes(result.status)) {
    throw new Error(
      `[${label}] unexpected status ${result.status}, expected ${expectedList.join(", ")}.\nResponse: ${result.bodyText}`
    );
  }
}

async function auth(baseUrl: string, telegramId: number, username: string): Promise<AuthResponse> {
  const initData = buildInsecureInitData(telegramId, username);
  const result = await requestJson(baseUrl, "/auth/telegram", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      initData
    })
  });
  assertStatus(result, 201, `auth:${username}`);
  if (!result.json || typeof result.json !== "object") {
    throw new Error(`[auth:${username}] invalid JSON response.`);
  }

  const typed = result.json as Partial<AuthResponse>;
  if (!typed.accessToken || !typed.user?.id) {
    throw new Error(`[auth:${username}] response missing accessToken/user.`);
  }
  return typed as AuthResponse;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    // eslint-disable-next-line no-console
    console.log(`Postgres smoke runner

Usage:
  pnpm --filter @phantom-lab/api smoke:postgres

Required env:
  DATABASE_URL=postgresql://...

Optional env:
  SMOKE_PORT=3110
  STORAGE_DRIVER=postgres (defaulted by script)
  ALLOW_INSECURE_INITDATA=true (defaulted by script)
`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for postgres smoke script.");
  }

  process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER ?? "postgres";
  process.env.ALLOW_INSECURE_INITDATA = process.env.ALLOW_INSECURE_INITDATA ?? "true";

  const port = parsePort(process.env.SMOKE_PORT, 3110);
  const baseUrl = `http://127.0.0.1:${port}/v1`;

  const prisma = new PrismaClient();
  let app: NestFastifyApplication | null = null;

  try {
    await prisma.$connect();

    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
    app.setGlobalPrefix("v1");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true }
      })
    );
    await app.listen(port, "127.0.0.1");

    // eslint-disable-next-line no-console
    console.log(`[smoke] API started on ${baseUrl}`);

    const member = await auth(baseUrl, 770001, "postgres_smoke_member");
    const ownerCandidate = await auth(baseUrl, 770002, "postgres_smoke_owner");

    const memberHeaders = {
      authorization: `Bearer ${member.accessToken}`,
      "content-type": "application/json"
    };

    const ownerHeaders = {
      authorization: `Bearer ${ownerCandidate.accessToken}`,
      "content-type": "application/json"
    };

    const memberChat = await requestJson(baseUrl, "/chats/main", {
      method: "GET",
      headers: memberHeaders
    });
    assertStatus(memberChat, 200, "member:get_chat");

    const memberMessage = await requestJson(baseUrl, "/chats/main/messages", {
      method: "POST",
      headers: memberHeaders,
      body: JSON.stringify({
        sender_mode: "as_user",
        text: "postgres smoke message"
      })
    });
    assertStatus(memberMessage, 201, "member:create_message");

    const memberRoles = await requestJson(baseUrl, "/chats/main/roles", {
      method: "GET",
      headers: memberHeaders
    });
    assertStatus(memberRoles, 403, "member:list_roles_forbidden");

    const memberNotifyPatch = await requestJson(baseUrl, "/chats/main/channel-notify/config", {
      method: "PATCH",
      headers: memberHeaders,
      body: JSON.stringify({
        mode: "off"
      })
    });
    assertStatus(memberNotifyPatch, 403, "member:channel_notify_forbidden");

    const ownerRole = await prisma.role.findFirst({
      where: {
        chatId: "main",
        name: "owner"
      }
    });
    if (!ownerRole) {
      throw new Error("Owner role not found in seeded data.");
    }

    await prisma.chatMember.update({
      where: {
        chatId_userId: {
          chatId: "main",
          userId: ownerCandidate.user.id
        }
      },
      data: {
        roleId: ownerRole.id
      }
    });

    const ownerRoles = await requestJson(baseUrl, "/chats/main/roles", {
      method: "GET",
      headers: ownerHeaders
    });
    assertStatus(ownerRoles, 200, "owner:list_roles");

    const roleName = `smoke_role_${Date.now()}`;
    const ownerCreateRole = await requestJson(baseUrl, "/chats/main/roles", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        name: roleName,
        priority: 150,
        permissions: ["chat.view"]
      })
    });
    assertStatus(ownerCreateRole, 201, "owner:create_role");

    const ownerNotifyPatch = await requestJson(baseUrl, "/chats/main/channel-notify/config", {
      method: "PATCH",
      headers: ownerHeaders,
      body: JSON.stringify({
        enabled: true,
        mode: "digest",
        digestIntervalMinutes: 10
      })
    });
    assertStatus(ownerNotifyPatch, 200, "owner:channel_notify_patch");

    const ownerNotifyTest = await requestJson(baseUrl, "/chats/main/channel-notify/test", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        messagePreview: "postgres smoke notify test",
        deliver: false
      })
    });
    assertStatus(ownerNotifyTest, 201, "owner:channel_notify_test");

    // eslint-disable-next-line no-console
    console.log("[smoke] OK: auth -> chat -> message, member 403 checks, owner role + channel-notify flow");
  } finally {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`[smoke] FAILED\n${message}`);
  process.exitCode = 1;
});

