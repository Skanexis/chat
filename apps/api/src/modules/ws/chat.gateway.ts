import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WsException,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Logger, OnModuleDestroy, UnauthorizedException } from "@nestjs/common";
import type { Server, Socket } from "socket.io";

import { EventBusService } from "../../core/event-bus.service.js";
import { resolveJwtTokenMaxChars, resolveJwtVerifyOptions } from "../../core/jwt-config.js";
import type { RequestUser } from "../../core/types.js";
import { ChatService } from "../chat/chat.service.js";
import type { CreateMessageDto, SetMessageReactionDto, UpdateMessageDto } from "../chat/chat.dto.js";

type ClientSocket = Socket & { data: { user?: RequestUser } };

const wsCorsOrigin = (() => {
  const raw = process.env.WS_CORS_ORIGINS ?? "*";
  if (raw.trim() === "*") {
    return "*";
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
})();

const wsMaxHttpBufferSize = (() => {
  const parsed = Number(process.env.WS_MAX_HTTP_BUFFER_SIZE ?? 1_000_000);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1_000_000;
  }
  return Math.floor(parsed);
})();

@WebSocketGateway({
  namespace: "/ws",
  path: "/ws/socket.io",
  maxHttpBufferSize: wsMaxHttpBufferSize,
  cors: {
    origin: wsCorsOrigin
  }
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private detachListeners: Array<() => void> = [];
  private readonly wsRateBucket = new Map<string, { count: number; resetAtMs: number }>();
  private wsRateLastCleanupAtMs = 0;
  private readonly jwtVerifyOptions: ReturnType<typeof resolveJwtVerifyOptions>;
  private readonly maxTokenChars: number;
  private readonly joinSnapshotLimit: number;
  private readonly wsRateWindowSeconds: number;
  private readonly wsRateMaxBuckets: number;
  private readonly wsRateLimitByEvent: Record<"join" | "send" | "edit" | "delete" | "reaction" | "typing", number>;

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    private readonly eventBus: EventBusService,
    private readonly configService: ConfigService
  ) {
    this.jwtVerifyOptions = resolveJwtVerifyOptions(this.configService);
    this.maxTokenChars = resolveJwtTokenMaxChars(this.configService);
    this.joinSnapshotLimit = this.parsePositiveIntConfig(this.configService.get<string>("WS_JOIN_SNAPSHOT_LIMIT"), 200);
    this.wsRateWindowSeconds = this.parsePositiveIntConfig(this.configService.get<string>("WS_RATE_LIMIT_WINDOW_SECONDS"), 10);
    this.wsRateMaxBuckets = this.parsePositiveIntConfig(this.configService.get<string>("WS_RATE_LIMIT_MAX_BUCKETS"), 50_000);
    this.wsRateLimitByEvent = {
      join: this.parsePositiveIntConfig(this.configService.get<string>("WS_RATE_LIMIT_JOIN_MAX"), 20),
      send: this.parsePositiveIntConfig(this.configService.get<string>("WS_RATE_LIMIT_SEND_MAX"), 60),
      edit: this.parsePositiveIntConfig(this.configService.get<string>("WS_RATE_LIMIT_EDIT_MAX"), 40),
      delete: this.parsePositiveIntConfig(this.configService.get<string>("WS_RATE_LIMIT_DELETE_MAX"), 30),
      reaction: this.parsePositiveIntConfig(this.configService.get<string>("WS_RATE_LIMIT_REACTION_MAX"), 100),
      typing: this.parsePositiveIntConfig(this.configService.get<string>("WS_RATE_LIMIT_TYPING_MAX"), 120)
    };

    this.detachListeners.push(
      this.eventBus.on("message.created", (payload) => {
        this.runBackgroundTask("message.created", () => this.broadcastMessageEventForRoom("message.created", payload));
      })
    );
    this.detachListeners.push(
      this.eventBus.on("message.updated", (payload) => {
        this.runBackgroundTask("message.updated", () => this.broadcastMessageEventForRoom("message.updated", payload));
      })
    );
    this.detachListeners.push(
      this.eventBus.on("message.deleted", (payload) => {
        this.runBackgroundTask("message.deleted", () => this.broadcastMessageEventForRoom("message.deleted", payload));
      })
    );
    this.detachListeners.push(
      this.eventBus.on("message.purged", (payload) => this.server.to(`chat:${payload.chatId}`).emit("message.purged", payload))
    );
    this.detachListeners.push(
      this.eventBus.on("message.reaction.updated", (payload) =>
        this.server.to(`chat:${payload.chatId}`).emit("message.reaction.updated", payload)
      )
    );
    this.detachListeners.push(
      this.eventBus.on("member.updated", (payload) => this.server.to(`chat:${payload.chatId}`).emit("member.updated", payload))
    );
    this.detachListeners.push(
      this.eventBus.on("member.banned", (payload) => this.server.to(`chat:${payload.chatId}`).emit("member.banned", payload))
    );
    this.detachListeners.push(
      this.eventBus.on("ticket.updated", (payload) => this.server.to(`chat:${payload.chatId}`).emit("ticket.updated", payload))
    );
    this.detachListeners.push(
      this.eventBus.on("automation.rule.executed", (payload) =>
        this.server.to(`chat:${payload.chatId}`).emit("automation.rule.executed", payload)
      )
    );
    this.detachListeners.push(
      this.eventBus.on("incident_mode.changed", (payload) => this.server.to(`chat:${payload.chatId}`).emit("incident_mode.changed", payload))
    );
    this.detachListeners.push(
      this.eventBus.on("reputation.updated", (payload) => this.server.to(`chat:${payload.chatId}`).emit("reputation.updated", payload))
    );
    this.detachListeners.push(
      this.eventBus.on("thread.subscription.triggered", (payload) =>
        this.server.to(`chat:${payload.chatId}`).emit("thread.subscription.triggered", payload)
      )
    );
    this.detachListeners.push(
      this.eventBus.on("broadcast.state.changed", (payload) =>
        this.server.to(`chat:${payload.chatId}`).emit("broadcast.state.changed", payload)
      )
    );
    this.detachListeners.push(
      this.eventBus.on("broadcast.delivery.progress", (payload) =>
        this.server.to(`chat:${payload.chatId}`).emit("broadcast.delivery.progress", payload)
      )
    );
  }

  handleConnection(client: ClientSocket): void {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }
    if (token.length > this.maxTokenChars) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; telegramId: number; type?: string }>(token, this.jwtVerifyOptions);
      if (payload.type !== "access" || !payload.sub || !Number.isFinite(payload.telegramId)) {
        throw new UnauthorizedException("Invalid websocket auth token.");
      }
      client.data.user = {
        userId: payload.sub,
        telegramId: payload.telegramId
      };
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: ClientSocket): void {
    client.removeAllListeners();
  }

  onModuleDestroy(): void {
    for (const detach of this.detachListeners) {
      detach();
    }
    this.detachListeners = [];
    this.wsRateBucket.clear();
  }

  @SubscribeMessage("chat.join")
  async handleJoin(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() body: { chatId: string }
  ): Promise<{ ok: boolean; chatId: string }> {
    const user = this.requireUser(client);
    this.assertWsRateLimit(user.userId, "chat.join", this.wsRateLimitByEvent.join);
    const [chat, messages] = await Promise.all([
      this.chatService.getChat(body.chatId, user),
      this.chatService.listMessages(body.chatId, user, { limit: this.joinSnapshotLimit })
    ]);
    client.join(`chat:${body.chatId}`);
    client.emit("chat.snapshot", {
      chat,
      messages
    });
    return { ok: true, chatId: body.chatId };
  }

  @SubscribeMessage("message.send")
  async handleSend(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() body: { chatId: string; payload: CreateMessageDto }
  ) {
    const user = this.requireUser(client);
    this.assertWsRateLimit(user.userId, "message.send", this.wsRateLimitByEvent.send);
    return this.chatService.createMessage(body.chatId, user, body.payload);
  }

  @SubscribeMessage("message.edit")
  async handleEdit(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() body: { chatId: string; messageId: string; payload: UpdateMessageDto }
  ) {
    const user = this.requireUser(client);
    this.assertWsRateLimit(user.userId, "message.edit", this.wsRateLimitByEvent.edit);
    return this.chatService.updateMessage(body.chatId, body.messageId, user, body.payload);
  }

  @SubscribeMessage("message.delete")
  async handleDelete(@ConnectedSocket() client: ClientSocket, @MessageBody() body: { chatId: string; messageId: string }) {
    const user = this.requireUser(client);
    this.assertWsRateLimit(user.userId, "message.delete", this.wsRateLimitByEvent.delete);
    return this.chatService.deleteMessage(body.chatId, body.messageId, user);
  }

  @SubscribeMessage("reaction.set")
  async handleSetReaction(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() body: { chatId: string; messageId: string; payload: SetMessageReactionDto }
  ) {
    const user = this.requireUser(client);
    this.assertWsRateLimit(user.userId, "reaction.set", this.wsRateLimitByEvent.reaction);
    return this.chatService.setMessageReaction(body.chatId, body.messageId, user, body.payload);
  }

  @SubscribeMessage("reaction.remove")
  async handleRemoveReaction(@ConnectedSocket() client: ClientSocket, @MessageBody() body: { chatId: string; messageId: string }) {
    const user = this.requireUser(client);
    this.assertWsRateLimit(user.userId, "reaction.remove", this.wsRateLimitByEvent.reaction);
    return this.chatService.removeMessageReaction(body.chatId, body.messageId, user);
  }

  @SubscribeMessage("typing.start")
  async handleTypingStart(@ConnectedSocket() client: ClientSocket, @MessageBody() body: { chatId: string }) {
    const user = this.requireUser(client);
    this.assertWsRateLimit(user.userId, "typing.start", this.wsRateLimitByEvent.typing);
    await this.chatService.getChat(body.chatId, user);
    client.to(`chat:${body.chatId}`).emit("typing.start", {
      chatId: body.chatId,
      userId: user.userId,
      at: new Date().toISOString()
    });
    return { ok: true, chatId: body.chatId };
  }

  @SubscribeMessage("typing.stop")
  async handleTypingStop(@ConnectedSocket() client: ClientSocket, @MessageBody() body: { chatId: string }) {
    const user = this.requireUser(client);
    this.assertWsRateLimit(user.userId, "typing.stop", this.wsRateLimitByEvent.typing);
    await this.chatService.getChat(body.chatId, user);
    client.to(`chat:${body.chatId}`).emit("typing.stop", {
      chatId: body.chatId,
      userId: user.userId,
      at: new Date().toISOString()
    });
    return { ok: true, chatId: body.chatId };
  }

  private extractToken(client: ClientSocket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === "string") {
      return authToken;
    }
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === "string") {
      return queryToken;
    }
    const authorization = client.handshake.headers?.authorization;
    if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
      return authorization.slice("Bearer ".length);
    }
    return null;
  }

  private requireUser(client: ClientSocket): RequestUser {
    if (!client.data.user) {
      throw new UnauthorizedException("Unauthorized websocket client.");
    }
    return client.data.user;
  }

  private async broadcastMessageEventForRoom(
    eventName: "message.created" | "message.updated" | "message.deleted",
    payload: Awaited<ReturnType<ChatService["deleteMessage"]>>
  ): Promise<void> {
    const roomId = `chat:${payload.chatId}`;
    const room = this.server.sockets.adapter.rooms.get(roomId);
    if (!room || room.size === 0) {
      return;
    }

    await Promise.all(
      Array.from(room).map(async (socketId) => {
        try {
          const socket = this.server.sockets.sockets.get(socketId) as ClientSocket | undefined;
          const user = socket?.data.user;
          if (!socket || !user) {
            return;
          }

          const sanitized = await this.chatService.sanitizeDeletedMessageForUser(payload.chatId, user, payload);
          socket.emit(eventName, sanitized);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "unknown socket broadcast error";
          this.logger.warn(`WS broadcast skipped for ${eventName} socket=${socketId}: ${reason}`);
        }
      })
    );
  }

  private runBackgroundTask(name: string, task: () => Promise<void>): void {
    void task().catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : "unexpected background task error";
      this.logger.warn(`WS background task '${name}' failed: ${reason}`);
    });
  }

  private parsePositiveIntConfig(rawValue: string | undefined, fallback: number): number {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private assertWsRateLimit(userId: string, eventName: string, maxEvents: number): void {
    const nowMs = Date.now();
    this.cleanupWsRateBucket(nowMs);

    const bucketKey = `${userId}:${eventName}`;
    const existing = this.wsRateBucket.get(bucketKey);
    if (!existing || existing.resetAtMs <= nowMs) {
      this.wsRateBucket.set(bucketKey, {
        count: 1,
        resetAtMs: nowMs + this.wsRateWindowSeconds * 1000
      });
      this.evictOverflowWsRateBuckets();
      return;
    }

    if (existing.count >= maxEvents) {
      throw new WsException(`Rate limit exceeded for ${eventName}.`);
    }
    existing.count += 1;
    this.wsRateBucket.set(bucketKey, existing);
    this.evictOverflowWsRateBuckets();
  }

  private cleanupWsRateBucket(nowMs: number): void {
    const cleanupIntervalMs = Math.max(5, this.wsRateWindowSeconds) * 1000;
    if (nowMs - this.wsRateLastCleanupAtMs < cleanupIntervalMs) {
      return;
    }

    this.wsRateLastCleanupAtMs = nowMs;
    for (const [key, entry] of this.wsRateBucket.entries()) {
      if (entry.resetAtMs <= nowMs) {
        this.wsRateBucket.delete(key);
      }
    }
  }

  private evictOverflowWsRateBuckets(): void {
    if (this.wsRateBucket.size <= this.wsRateMaxBuckets) {
      return;
    }

    const overflow = this.wsRateBucket.size - this.wsRateMaxBuckets;
    const byResetAsc = Array.from(this.wsRateBucket.entries()).sort((a, b) => a[1].resetAtMs - b[1].resetAtMs);
    for (let i = 0; i < overflow; i += 1) {
      const victim = byResetAsc[i];
      if (!victim) {
        break;
      }
      this.wsRateBucket.delete(victim[0]);
    }
  }
}
