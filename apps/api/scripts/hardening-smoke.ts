import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import type { DatabaseService } from "../src/core/database.service.js";

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
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

type RuntimeModules = {
  AppModule: object;
  DATABASE_SERVICE: symbol;
};

function parsePort(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return Math.floor(parsed);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

async function loadRuntimeModules(): Promise<RuntimeModules> {
  try {
    const [{ AppModule }, { DATABASE_SERVICE }] = await Promise.all([
      import("../dist/app.module.js"),
      import("../dist/core/database.service.js")
    ]);
    return {
      AppModule,
      DATABASE_SERVICE
    };
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load compiled app modules from dist. Run "pnpm --filter @phantom-lab/api build" first.\n${details}`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function assertCondition(condition: boolean, label: string, details: string): void {
  if (!condition) {
    throw new Error(`[${label}] ${details}`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`[${label}] expected JSON object.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`[${label}] expected JSON array.`);
  }
  return value;
}

function getString(record: Record<string, unknown>, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`[${label}] field "${field}" is missing or not a string.`);
  }
  return value;
}

async function auth(baseUrl: string, telegramId: number, username: string, chatId = "main"): Promise<AuthResponse> {
  const initData = buildInsecureInitData(telegramId, username);
  const result = await requestJson(baseUrl, "/auth/telegram", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      initData,
      chatId
    })
  });
  assertStatus(result, 201, `auth:${username}`);

  const payload = asRecord(result.json, `auth:${username}`);
  const accessToken = getString(payload, "accessToken", `auth:${username}`);
  const refreshToken = getString(payload, "refreshToken", `auth:${username}`);
  const user = asRecord(payload.user, `auth:${username}:user`);
  const userId = getString(user, "id", `auth:${username}:user`);
  const telegramIdRaw = user.telegramId;
  if (typeof telegramIdRaw !== "number" || !Number.isFinite(telegramIdRaw)) {
    throw new Error(`[auth:${username}] user.telegramId is missing or invalid.`);
  }

  return {
    accessToken,
    refreshToken,
    user: {
      id: userId,
      telegramId: telegramIdRaw
    }
  };
}

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  };
}

async function elevateUserToRole(db: DatabaseService, chatId: string, userId: string, roleName: string): Promise<string> {
  const member = await db.ensureMember(chatId, userId);
  const roles = await db.listRoles(chatId);
  const targetRole = roles.find((role) => role.name === roleName);
  if (!targetRole) {
    throw new Error(`Role "${roleName}" not found in chat "${chatId}".`);
  }
  if (member.roleId === targetRole.id) {
    return targetRole.id;
  }
  await db.updateMemberRole(chatId, userId, targetRole.id);
  return targetRole.id;
}

async function getFirstIdentityId(baseUrl: string, chatId: string, ownerHeaders: Record<string, string>): Promise<string> {
  const result = await requestJson(baseUrl, `/chats/${chatId}/identities`, {
    method: "GET",
    headers: ownerHeaders
  });
  assertStatus(result, 200, "owner:list_identities");
  const identities = asArray(result.json, "owner:list_identities");
  assertCondition(identities.length > 0, "owner:list_identities", "No identities available in chat.");
  const first = asRecord(identities[0], "owner:list_identities:first");
  return getString(first, "id", "owner:list_identities:first");
}

async function waitForScheduledMessageSent(
  baseUrl: string,
  chatId: string,
  scheduledMessageId: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await requestJson(baseUrl, `/chats/${chatId}/messages/scheduled`, {
      method: "GET",
      headers
    });
    assertStatus(result, 200, "scheduled:list");
    const entries = asArray(result.json, "scheduled:list");
    const entry = entries
      .map((item, index) => asRecord(item, `scheduled:list:${index}`))
      .find((item) => item.id === scheduledMessageId);

    if (entry) {
      const status = typeof entry.status === "string" ? entry.status : "";
      if (status === "sent") {
        return;
      }
      if (status === "failed") {
        throw new Error(`[scheduled:wait] Scheduled message failed: ${JSON.stringify(entry.error ?? null)}`);
      }
    }

    await sleep(500);
  }

  throw new Error(`[scheduled:wait] Timed out waiting for scheduled message ${scheduledMessageId} to be sent.`);
}

async function runLoadSmoke(
  baseUrl: string,
  chatId: string,
  loadHeaders: Array<Record<string, string>>,
  totalMessages: number
): Promise<void> {
  const startedAt = Date.now();
  const tasks = Array.from({ length: totalMessages }, (_, index) => {
    const headers = loadHeaders[index % loadHeaders.length];
    return requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sender_mode: "as_user",
        text: `hardening-load-${startedAt}-${index}-${Math.random().toString(16).slice(2)}`
      })
    }).then((result) => ({
      index,
      status: result.status,
      bodyText: result.bodyText
    }));
  });

  const results = await Promise.all(tasks);
  const failed = results.filter((entry) => entry.status !== 201);
  if (failed.length > 0) {
    const details = failed
      .slice(0, 5)
      .map((entry) => `#${entry.index}: status=${entry.status} body=${entry.bodyText}`)
      .join("\n");
    throw new Error(`[load] ${failed.length}/${totalMessages} requests failed.\n${details}`);
  }
}

async function refreshSession(baseUrl: string, refreshToken: string): Promise<AuthResponse> {
  const result = await requestJson(baseUrl, "/auth/refresh", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      refreshToken
    })
  });
  assertStatus(result, 201, "auth:refresh");

  const payload = asRecord(result.json, "auth:refresh");
  const accessToken = getString(payload, "accessToken", "auth:refresh");
  const nextRefreshToken = getString(payload, "refreshToken", "auth:refresh");
  const user = asRecord(payload.user, "auth:refresh:user");
  const userId = getString(user, "id", "auth:refresh:user");
  const telegramIdRaw = user.telegramId;
  if (typeof telegramIdRaw !== "number" || !Number.isFinite(telegramIdRaw)) {
    throw new Error("[auth:refresh] user.telegramId is missing or invalid.");
  }

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    user: {
      id: userId,
      telegramId: telegramIdRaw
    }
  };
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    // eslint-disable-next-line no-console
    console.log(`Hardening smoke runner

Usage:
  pnpm --filter @phantom-lab/api build
  pnpm --filter @phantom-lab/api smoke:hardening

Optional env:
  HARDENING_PORT=3120
  HARDENING_CHAT_ID=main
  HARDENING_LOAD_USERS=6
  HARDENING_LOAD_MESSAGES=60
  STORAGE_DRIVER=inmemory|postgres
  DATABASE_URL=postgresql://... (required when STORAGE_DRIVER=postgres)
  ALLOW_INSECURE_INITDATA=true (defaulted by script)
`);
    return;
  }

  process.env.ALLOW_INSECURE_INITDATA = process.env.ALLOW_INSECURE_INITDATA ?? "true";
  process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER ?? "inmemory";

  const port = parsePort(process.env.HARDENING_PORT, 3120);
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const chatId = process.env.HARDENING_CHAT_ID ?? "main";
  const loadUsers = parsePositiveInt(process.env.HARDENING_LOAD_USERS, 6);
  const loadMessages = parsePositiveInt(process.env.HARDENING_LOAD_MESSAGES, 60);

  let app: NestFastifyApplication | null = null;

  try {
    const runtime = await loadRuntimeModules();

    app = await NestFactory.create<NestFastifyApplication>(runtime.AppModule, new FastifyAdapter());
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
    await app.listen(port, "127.0.0.1");

    const db = app.get<DatabaseService>(runtime.DATABASE_SERVICE);

    // eslint-disable-next-line no-console
    console.log(`[hardening] API started on ${baseUrl} (driver=${process.env.STORAGE_DRIVER ?? "inmemory"})`);

    const health = await requestJson(baseUrl, "/health", { method: "GET" });
    assertStatus(health, 200, "health");

    const member = await auth(baseUrl, 880001, "hardening_member", chatId);
    const ownerCandidate = await auth(baseUrl, 880002, "hardening_owner", chatId);
    const target = await auth(baseUrl, 880003, "hardening_target", chatId);

    await elevateUserToRole(db, chatId, ownerCandidate.user.id, "owner");

    const memberRefreshed = await refreshSession(baseUrl, member.refreshToken);
    assertCondition(memberRefreshed.user.id === member.user.id, "auth:refresh", "Refreshed session user mismatch.");
    const staleRefreshReuse = await requestJson(baseUrl, "/auth/refresh", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        refreshToken: member.refreshToken
      })
    });
    assertStatus(staleRefreshReuse, 401, "auth:refresh_replay_forbidden");

    const memberHeaders = authHeaders(memberRefreshed.accessToken);
    const ownerHeaders = authHeaders(ownerCandidate.accessToken);
    const targetHeaders = authHeaders(target.accessToken);

    const memberChat = await requestJson(baseUrl, `/chats/${chatId}`, {
      method: "GET",
      headers: memberHeaders
    });
    assertStatus(memberChat, 200, "member:get_chat");

    const ownerRoles = await requestJson(baseUrl, `/chats/${chatId}/roles`, {
      method: "GET",
      headers: ownerHeaders
    });
    assertStatus(ownerRoles, 200, "owner:list_roles");

    const memberNotifyPatch = await requestJson(baseUrl, `/chats/${chatId}/channel-notify/config`, {
      method: "PATCH",
      headers: memberHeaders,
      body: JSON.stringify({
        mode: "off"
      })
    });
    assertStatus(memberNotifyPatch, 403, "member:channel_notify_forbidden");

    const identityId = await getFirstIdentityId(baseUrl, chatId, ownerHeaders);

    const memberAsGroupSend = await requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      headers: memberHeaders,
      body: JSON.stringify({
        sender_mode: "as_group",
        identity_id: identityId,
        text: "hardening member as_group deny check"
      })
    });
    assertStatus(memberAsGroupSend, 403, "member:send_as_group_forbidden");

    const memberMessage = await requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      headers: memberHeaders,
      body: JSON.stringify({
        sender_mode: "as_user",
        text: "hardening member baseline message"
      })
    });
    assertStatus(memberMessage, 201, "member:create_message");
    const memberMessageId = getString(asRecord(memberMessage.json, "member:create_message"), "id", "member:create_message");

    const ownerAsGroupMessage = await requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        sender_mode: "as_group",
        identity_id: identityId,
        signature_mode: "system",
        text: "hardening owner as_group message"
      })
    });
    assertStatus(ownerAsGroupMessage, 201, "owner:create_as_group_message");

    const muteTarget = await requestJson(baseUrl, `/chats/${chatId}/members/${target.user.id}/mute`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        reason: "hardening mute regression"
      })
    });
    assertStatus(muteTarget, [200, 201], "owner:mute_target");

    const targetSendWhileMuted = await requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      headers: targetHeaders,
      body: JSON.stringify({
        sender_mode: "as_user",
        text: "hardening muted message should fail"
      })
    });
    assertStatus(targetSendWhileMuted, 403, "target:send_while_muted");

    const unmuteTarget = await requestJson(baseUrl, `/chats/${chatId}/members/${target.user.id}/unmute`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        reason: "hardening unmute regression"
      })
    });
    assertStatus(unmuteTarget, [200, 201], "owner:unmute_target");

    const targetSendAfterUnmute = await requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      headers: targetHeaders,
      body: JSON.stringify({
        sender_mode: "as_user",
        text: "hardening target send after unmute"
      })
    });
    assertStatus(targetSendAfterUnmute, 201, "target:send_after_unmute");

    const translateMessage = await requestJson(baseUrl, `/chats/${chatId}/messages/${memberMessageId}/translate`, {
      method: "POST",
      headers: memberHeaders,
      body: JSON.stringify({
        target_language: "it"
      })
    });
    assertStatus(translateMessage, [200, 201], "member:translate_message");

    const listTranslations = await requestJson(baseUrl, `/chats/${chatId}/messages/${memberMessageId}/translations`, {
      method: "GET",
      headers: memberHeaders
    });
    assertStatus(listTranslations, 200, "member:list_translations");
    const translationsPayload = asRecord(listTranslations.json, "member:list_translations");
    const translations = asArray(translationsPayload.items, "member:list_translations:items");
    assertCondition(translations.length > 0, "member:list_translations", "Expected at least one translation.");

    const enableIncidentMode = await requestJson(baseUrl, `/chats/${chatId}/incident-mode/enable`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        reason: "hardening incident mode check"
      })
    });
    assertStatus(enableIncidentMode, [200, 201], "owner:incident_mode_enable");

    const disableIncidentMode = await requestJson(baseUrl, `/chats/${chatId}/incident-mode/disable`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        reason: "hardening incident mode disable check"
      })
    });
    assertStatus(disableIncidentMode, [200, 201], "owner:incident_mode_disable");

    const scheduledAt = new Date(Date.now() + 3500).toISOString();
    const scheduleMessage = await requestJson(baseUrl, `/chats/${chatId}/messages/scheduled`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        at: scheduledAt,
        payload: {
          sender_mode: "as_user",
          text: "hardening scheduled message"
        }
      })
    });
    assertStatus(scheduleMessage, [200, 201], "owner:schedule_message");
    const scheduledMessageId = getString(asRecord(scheduleMessage.json, "owner:schedule_message"), "id", "owner:schedule_message");

    await waitForScheduledMessageSent(baseUrl, chatId, scheduledMessageId, ownerHeaders, 15_000);

    const beforeLoadMessages = await requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "GET",
      headers: ownerHeaders
    });
    assertStatus(beforeLoadMessages, 200, "owner:list_messages_before_load");
    const beforeLoadCount = asArray(beforeLoadMessages.json, "owner:list_messages_before_load").length;

    const loadUsersAuth = await Promise.all(
      Array.from({ length: loadUsers }, (_, index) => auth(baseUrl, 881000 + index, `hardening_load_${index}`, chatId))
    );
    const loadHeaders = loadUsersAuth.map((entry) => authHeaders(entry.accessToken));

    await runLoadSmoke(baseUrl, chatId, loadHeaders, loadMessages);

    const afterLoadMessages = await requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "GET",
      headers: ownerHeaders
    });
    assertStatus(afterLoadMessages, 200, "owner:list_messages_after_load");
    const afterLoadCount = asArray(afterLoadMessages.json, "owner:list_messages_after_load").length;

    assertCondition(
      afterLoadCount >= beforeLoadCount + loadMessages,
      "load:count_check",
      `Expected at least ${beforeLoadCount + loadMessages} messages after load, got ${afterLoadCount}.`
    );

    // eslint-disable-next-line no-console
    console.log(
      `[hardening] OK: regression scenarios + load smoke passed (load_users=${loadUsers}, load_messages=${loadMessages}, before=${beforeLoadCount}, after=${afterLoadCount})`
    );
  } finally {
    if (app) {
      await app.close();
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`[hardening] FAILED\n${message}`);
  process.exitCode = 1;
});
