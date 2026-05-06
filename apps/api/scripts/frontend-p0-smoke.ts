import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { io, type Socket } from "socket.io-client";

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

function assertCondition(condition: boolean, label: string, details: string): void {
  if (!condition) {
    throw new Error(`[${label}] ${details}`);
  }
}

function assertStatus(result: HttpResult, expected: number | number[], label: string): void {
  const expectedList = Array.isArray(expected) ? expected : [expected];
  if (!expectedList.includes(result.status)) {
    throw new Error(
      `[${label}] unexpected status ${result.status}, expected ${expectedList.join(", ")}.\nResponse: ${result.bodyText}`
    );
  }
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

function buildInsecureInitData(telegramId: number, username: string): string {
  return new URLSearchParams({
    user: JSON.stringify({
      id: telegramId,
      username
    })
  }).toString();
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
    authorization: `Bearer ${token}`
  };
}

function authJsonHeaders(token: string): Record<string, string> {
  return {
    ...authHeaders(token),
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEvent<T>(socket: Socket, eventName: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`[ws:${eventName}] timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };

    socket.once(eventName, handler);
  });
}

async function emitWithAck<T>(socket: Socket, eventName: string, payload: unknown, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    socket.timeout(timeoutMs).emit(eventName, payload, (error: unknown, response: T) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      resolve(response);
    });
  });
}

async function connectWs(origin: string, token: string, label: string): Promise<Socket> {
  const socket = io(`${origin}/ws`, {
    auth: {
      token
    },
    transports: ["websocket"],
    reconnection: false,
    timeout: 5000
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
      reject(new Error(`[${label}] websocket connect timeout`));
    }, 5000);

    const onConnect = () => {
      clearTimeout(timer);
      socket.off("connect_error", onError);
      resolve();
    };
    const onError = (error: Error) => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      reject(new Error(`[${label}] websocket connect error: ${error.message}`));
    };

    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
  });

  return socket;
}

async function waitForScheduledSent(
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
    const items = asArray(result.json, "scheduled:list");
    const found = items
      .map((item, index) => asRecord(item, `scheduled:list:${index}`))
      .find((item) => item.id === scheduledMessageId);
    if (found && found.status === "sent") {
      return;
    }
    if (found && found.status === "failed") {
      throw new Error(`[scheduled] message failed: ${JSON.stringify(found.error ?? null)}`);
    }
    await sleep(400);
  }
  throw new Error(`[scheduled] timeout waiting sent status for ${scheduledMessageId}`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    // eslint-disable-next-line no-console
    console.log(`Frontend P0 smoke

Usage:
  pnpm --filter @phantom-lab/api build
  pnpm --filter @phantom-lab/api smoke:frontend-p0

Optional env:
  FRONTEND_P0_PORT=3122
  FRONTEND_P0_CHAT_ID=main
  STORAGE_DRIVER=inmemory|postgres
  DATABASE_URL=postgresql://... (required when STORAGE_DRIVER=postgres)
  ALLOW_INSECURE_INITDATA=true (defaulted by script)
`);
    return;
  }

  process.env.ALLOW_INSECURE_INITDATA = process.env.ALLOW_INSECURE_INITDATA ?? "true";
  process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER ?? "inmemory";

  const port = parsePort(process.env.FRONTEND_P0_PORT, 3122);
  const chatId = process.env.FRONTEND_P0_CHAT_ID ?? "main";
  const origin = `http://127.0.0.1:${port}`;
  const baseUrl = `${origin}/v1`;

  let app: NestFastifyApplication | null = null;
  let socketA: Socket | null = null;
  let socketB: Socket | null = null;

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
    console.log(`[frontend-p0] API started on ${baseUrl} (driver=${process.env.STORAGE_DRIVER ?? "inmemory"})`);

    const health = await requestJson(baseUrl, "/health", { method: "GET" });
    assertStatus(health, 200, "health");

    // E2E-P0-01 Auth success
    const userA = await auth(baseUrl, 990001, "frontend_p0_a", chatId);
    const userB = await auth(baseUrl, 990002, "frontend_p0_b", chatId);
    const owner = await auth(baseUrl, 990003, "frontend_p0_owner", chatId);
    await elevateUserToRole(db, chatId, owner.user.id, "owner");

    const userAHeaders = authHeaders(userA.accessToken);
    const userBHeaders = authHeaders(userB.accessToken);
    const ownerHeaders = authHeaders(owner.accessToken);

    // E2E-P0-02 Protected route without token
    const noAuth = await requestJson(baseUrl, `/chats/${chatId}`, { method: "GET" });
    assertStatus(noAuth, 401, "p0:protected_without_token");

    // Frontend bootstrap endpoint contract
    const bootstrap = await requestJson(baseUrl, `/chats/${chatId}/bootstrap?messages_limit=50`, {
      method: "GET",
      headers: userAHeaders
    });
    assertStatus(bootstrap, 200, "bootstrap:get");
    const bootstrapJson = asRecord(bootstrap.json, "bootstrap:get");
    assertCondition(typeof bootstrapJson.serverTime === "string", "bootstrap:get", "serverTime missing.");
    const bootstrapWs = asRecord(bootstrapJson.ws, "bootstrap:get:ws");
    assertCondition(bootstrapWs.namespace === "/ws", "bootstrap:get", "ws.namespace must be /ws.");
    asArray(bootstrapJson.messages, "bootstrap:get:messages");
    asArray(bootstrapJson.identities, "bootstrap:get:identities");

    socketA = await connectWs(origin, userA.accessToken, "userA");
    socketB = await connectWs(origin, userB.accessToken, "userB");

    // E2E-P0-03 Initial snapshot after join
    const snapshotPromise = waitForEvent<Record<string, unknown>>(socketA, "chat.snapshot", 5000);
    const joinAckA = await emitWithAck<{ ok: boolean; chatId: string }>(socketA, "chat.join", { chatId }, 5000);
    assertCondition(joinAckA.ok && joinAckA.chatId === chatId, "p0:join_ack_a", "Invalid chat.join ack for user A.");
    const snapshot = await snapshotPromise;
    asRecord(snapshot.chat, "p0:chat_snapshot:chat");
    asArray(snapshot.messages, "p0:chat_snapshot:messages");

    const joinAckB = await emitWithAck<{ ok: boolean; chatId: string }>(socketB, "chat.join", { chatId }, 5000);
    assertCondition(joinAckB.ok && joinAckB.chatId === chatId, "p0:join_ack_b", "Invalid chat.join ack for user B.");

    // E2E-P0-04 Send message + ws event
    const createdEventPromise = waitForEvent<Record<string, unknown>>(socketB, "message.created", 5000);
    const sendMessage = await requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      headers: authJsonHeaders(userA.accessToken),
      body: JSON.stringify({
        sender_mode: "as_user",
        text: "frontend p0 message"
      })
    });
    assertStatus(sendMessage, 201, "p0:send_message");
    const createdJson = asRecord(sendMessage.json, "p0:send_message");
    const messageId = getString(createdJson, "id", "p0:send_message");
    const createdEvent = await createdEventPromise;
    assertCondition(createdEvent.id === messageId, "p0:send_message_ws", "message.created id mismatch.");

    // E2E-P0-05 Edit/delete own message + ws events
    const updatedEventPromise = waitForEvent<Record<string, unknown>>(socketB, "message.updated", 5000);
    const editMessage = await requestJson(baseUrl, `/chats/${chatId}/messages/${messageId}`, {
      method: "PATCH",
      headers: authJsonHeaders(userA.accessToken),
      body: JSON.stringify({
        text: "frontend p0 message edited"
      })
    });
    assertStatus(editMessage, 200, "p0:edit_message");
    const updatedEvent = await updatedEventPromise;
    assertCondition(updatedEvent.id === messageId, "p0:edit_ws", "message.updated id mismatch.");

    const deletedEventPromise = waitForEvent<Record<string, unknown>>(socketB, "message.deleted", 5000);
    const deleteMessage = await requestJson(baseUrl, `/chats/${chatId}/messages/${messageId}`, {
      method: "DELETE",
      headers: userAHeaders
    });
    assertStatus(deleteMessage, 200, "p0:delete_message");
    const deletedEvent = await deletedEventPromise;
    assertCondition(deletedEvent.id === messageId, "p0:delete_ws", "message.deleted id mismatch.");

    // Fresh message for reactions flow
    const reactionBase = await requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      headers: authJsonHeaders(userA.accessToken),
      body: JSON.stringify({
        sender_mode: "as_user",
        text: "frontend p0 reaction target"
      })
    });
    assertStatus(reactionBase, 201, "p0:reaction_base_message");
    const reactionMessageId = getString(asRecord(reactionBase.json, "p0:reaction_base_message"), "id", "p0:reaction_base_message");

    // E2E-P0-06 Reactions + ws summary updates
    const reactionSetEventPromise = waitForEvent<Record<string, unknown>>(socketA, "message.reaction.updated", 5000);
    const reactionSet = await requestJson(baseUrl, `/chats/${chatId}/messages/${reactionMessageId}/reactions`, {
      method: "POST",
      headers: authJsonHeaders(userB.accessToken),
      body: JSON.stringify({
        reaction: "👍"
      })
    });
    assertStatus(reactionSet, [200, 201], "p0:reaction_set");
    const reactionSetJson = asRecord(reactionSet.json, "p0:reaction_set");
    asArray(reactionSetJson.summary, "p0:reaction_set:summary");
    const reactionSetEvent = await reactionSetEventPromise;
    assertCondition(reactionSetEvent.messageId === reactionMessageId, "p0:reaction_set_ws", "reaction updated messageId mismatch.");

    const reactionRemoveEventPromise = waitForEvent<Record<string, unknown>>(socketA, "message.reaction.updated", 5000);
    const reactionDelete = await requestJson(baseUrl, `/chats/${chatId}/messages/${reactionMessageId}/reactions`, {
      method: "DELETE",
      headers: userBHeaders
    });
    assertStatus(reactionDelete, 200, "p0:reaction_delete");
    const reactionDeleteJson = asRecord(reactionDelete.json, "p0:reaction_delete");
    asArray(reactionDeleteJson.summary, "p0:reaction_delete:summary");
    const reactionDeleteEvent = await reactionRemoveEventPromise;
    assertCondition(
      reactionDeleteEvent.messageId === reactionMessageId,
      "p0:reaction_delete_ws",
      "reaction remove messageId mismatch."
    );

    // E2E-P0-07 member cannot send as_group
    const identities = await requestJson(baseUrl, `/chats/${chatId}/identities`, {
      method: "GET",
      headers: ownerHeaders
    });
    assertStatus(identities, 200, "p0:list_identities");
    const firstIdentity = asRecord(asArray(identities.json, "p0:list_identities")[0], "p0:first_identity");
    const identityId = getString(firstIdentity, "id", "p0:first_identity");
    const memberAsGroup = await requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      headers: authJsonHeaders(userA.accessToken),
      body: JSON.stringify({
        sender_mode: "as_group",
        identity_id: identityId,
        text: "forbidden as_group"
      })
    });
    assertStatus(memberAsGroup, 403, "p0:member_as_group_forbidden");

    // E2E-P0-08 mute -> blocked send -> unmute -> send
    const mute = await requestJson(baseUrl, `/chats/${chatId}/members/${userB.user.id}/mute`, {
      method: "POST",
      headers: authJsonHeaders(owner.accessToken),
      body: JSON.stringify({
        reason: "frontend p0 mute flow"
      })
    });
    assertStatus(mute, [200, 201], "p0:mute_member");
    const mutedSend = await requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      headers: authJsonHeaders(userB.accessToken),
      body: JSON.stringify({
        sender_mode: "as_user",
        text: "blocked by mute"
      })
    });
    assertStatus(mutedSend, 403, "p0:send_while_muted");
    const unmute = await requestJson(baseUrl, `/chats/${chatId}/members/${userB.user.id}/unmute`, {
      method: "POST",
      headers: authJsonHeaders(owner.accessToken),
      body: JSON.stringify({
        reason: "frontend p0 unmute flow"
      })
    });
    assertStatus(unmute, [200, 201], "p0:unmute_member");
    const afterUnmute = await requestJson(baseUrl, `/chats/${chatId}/messages`, {
      method: "POST",
      headers: authJsonHeaders(userB.accessToken),
      body: JSON.stringify({
        sender_mode: "as_user",
        text: "allowed after unmute"
      })
    });
    assertStatus(afterUnmute, 201, "p0:send_after_unmute");

    // E2E-P0-09 scheduled message execution
    const scheduled = await requestJson(baseUrl, `/chats/${chatId}/messages/scheduled`, {
      method: "POST",
      headers: authJsonHeaders(owner.accessToken),
      body: JSON.stringify({
        at: new Date(Date.now() + 3500).toISOString(),
        payload: {
          sender_mode: "as_user",
          text: "frontend p0 scheduled"
        }
      })
    });
    assertStatus(scheduled, [200, 201], "p0:scheduled_create");
    const scheduledId = getString(asRecord(scheduled.json, "p0:scheduled_create"), "id", "p0:scheduled_create");
    await waitForScheduledSent(baseUrl, chatId, scheduledId, ownerHeaders, 15_000);

    // E2E-P0-10 typing fanout
    const typingStartPromise = waitForEvent<Record<string, unknown>>(socketB, "typing.start", 5000);
    const typingStartAck = await emitWithAck<{ ok: boolean; chatId: string }>(socketA, "typing.start", { chatId }, 5000);
    assertCondition(typingStartAck.ok, "p0:typing_start_ack", "typing.start ack is invalid.");
    const typingStartEvent = await typingStartPromise;
    assertCondition(typingStartEvent.userId === userA.user.id, "p0:typing_start_event", "typing.start user mismatch.");

    const typingStopPromise = waitForEvent<Record<string, unknown>>(socketB, "typing.stop", 5000);
    const typingStopAck = await emitWithAck<{ ok: boolean; chatId: string }>(socketA, "typing.stop", { chatId }, 5000);
    assertCondition(typingStopAck.ok, "p0:typing_stop_ack", "typing.stop ack is invalid.");
    const typingStopEvent = await typingStopPromise;
    assertCondition(typingStopEvent.userId === userA.user.id, "p0:typing_stop_event", "typing.stop user mismatch.");

    // eslint-disable-next-line no-console
    console.log("[frontend-p0] OK: P0 auth/bootstrap/chat/reactions/mute/scheduled/typing scenarios passed.");
  } finally {
    if (socketA) {
      socketA.disconnect();
    }
    if (socketB) {
      socketB.disconnect();
    }
    if (app) {
      await app.close();
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`[frontend-p0] FAILED\n${message}`);
  process.exitCode = 1;
});
