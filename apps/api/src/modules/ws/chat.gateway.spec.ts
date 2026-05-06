import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { EventBusService } from "../../core/event-bus.service.js";
import type { RequestUser } from "../../core/types.js";
import { ChatGateway } from "./chat.gateway.js";

type MockClient = {
  data: { user?: RequestUser };
  handshake: {
    auth?: { token?: string };
    query?: { token?: string };
    headers?: { authorization?: string };
  };
  disconnect: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  to: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
};

function createClient(): MockClient {
  return {
    data: {},
    handshake: {
      auth: {
        token: "ws-token"
      },
      query: {},
      headers: {}
    },
    disconnect: vi.fn(),
    join: vi.fn(),
    to: vi.fn(() => ({
      emit: vi.fn()
    })),
    emit: vi.fn(),
    removeAllListeners: vi.fn()
  };
}

function createFixture(configOverrides?: Record<string, unknown>) {
  const jwtService = {
    verify: vi.fn(() => ({
      sub: "user-1",
      telegramId: 1001,
      type: "access"
    }))
  };
  const chatService = {
    getChat: vi.fn(async () => ({
      id: "main",
      name: "Main"
    })),
    listMessages: vi.fn(async () => []),
    createMessage: vi.fn(async () => ({
      id: "msg-1"
    })),
    updateMessage: vi.fn(async () => ({
      id: "msg-1",
      text: "edited"
    })),
    deleteMessage: vi.fn(async () => ({
      id: "msg-1",
      isDeleted: true
    })),
    setMessageReaction: vi.fn(async () => ({
      ok: true
    })),
    removeMessageReaction: vi.fn(async () => ({
      ok: true
    }))
  };
  const eventBus = new EventBusService();
  const gateway = new ChatGateway(jwtService as never, chatService as never, eventBus, new ConfigService(configOverrides));
  gateway.server = {
    to: vi.fn(() => ({
      emit: vi.fn()
    }))
  } as never;
  return { gateway, jwtService, chatService, eventBus };
}

describe("ChatGateway", () => {
  it("authenticates websocket client and attaches user context", () => {
    const { gateway, jwtService } = createFixture({
      JWT_ISSUER: " issuer ",
      JWT_AUDIENCE: " audience "
    });
    const client = createClient();

    gateway.handleConnection(client as never);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(jwtService.verify).toHaveBeenCalledWith(
      "ws-token",
      expect.objectContaining({
        issuer: "issuer",
        audience: "audience",
        algorithms: expect.arrayContaining(["HS256"])
      })
    );
    expect(client.data.user).toEqual({
      userId: "user-1",
      telegramId: 1001
    });
  });

  it("disconnects websocket client on invalid token", () => {
    const { gateway, jwtService } = createFixture();
    const client = createClient();
    jwtService.verify.mockImplementationOnce(() => {
      throw new Error("bad token");
    });

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("disconnects websocket client when refresh token is used", () => {
    const { gateway, jwtService } = createFixture();
    const client = createClient();
    jwtService.verify.mockImplementationOnce(() => ({
      sub: "user-1",
      telegramId: 1001,
      type: "refresh"
    }));

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("disconnects websocket client when token type is missing", () => {
    const { gateway, jwtService } = createFixture();
    const client = createClient();
    jwtService.verify.mockImplementationOnce(() => ({
      sub: "user-1",
      telegramId: 1001
    }));

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("disconnects websocket client on overlong token", () => {
    const { gateway, jwtService } = createFixture({ JWT_MAX_TOKEN_CHARS: "3" });
    const client = createClient();
    client.handshake.auth = {
      token: "toolong"
    };

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it("joins chat room and emits chat.snapshot", async () => {
    const { gateway, chatService } = createFixture();
    const client = createClient();
    client.data.user = {
      userId: "user-1",
      telegramId: 1001
    };

    const ack = await gateway.handleJoin(client as never, {
      chatId: "main"
    });

    expect(ack).toEqual({
      ok: true,
      chatId: "main"
    });
    expect(chatService.getChat).toHaveBeenCalledWith("main", client.data.user);
    expect(chatService.listMessages).toHaveBeenCalledWith("main", client.data.user, { limit: expect.any(Number) });
    expect(client.join).toHaveBeenCalledWith("chat:main");
    expect(client.emit).toHaveBeenCalledWith("chat.snapshot", {
      chat: {
        id: "main",
        name: "Main"
      },
      messages: []
    });
  });

  it("routes edit/delete/reaction events to chat service", async () => {
    const { gateway, chatService } = createFixture();
    const client = createClient();
    client.data.user = {
      userId: "user-1",
      telegramId: 1001
    };

    await gateway.handleEdit(client as never, {
      chatId: "main",
      messageId: "msg-1",
      payload: {
        text: "edited"
      }
    });
    await gateway.handleDelete(client as never, {
      chatId: "main",
      messageId: "msg-1"
    });
    await gateway.handleSetReaction(client as never, {
      chatId: "main",
      messageId: "msg-1",
      payload: {
        reaction: "👍"
      }
    });
    await gateway.handleRemoveReaction(client as never, {
      chatId: "main",
      messageId: "msg-1"
    });

    expect(chatService.updateMessage).toHaveBeenCalledWith("main", "msg-1", client.data.user, { text: "edited" });
    expect(chatService.deleteMessage).toHaveBeenCalledWith("main", "msg-1", client.data.user);
    expect(chatService.setMessageReaction).toHaveBeenCalledWith("main", "msg-1", client.data.user, { reaction: "👍" });
    expect(chatService.removeMessageReaction).toHaveBeenCalledWith("main", "msg-1", client.data.user);
  });

  it("broadcasts typing.start and typing.stop to chat room", async () => {
    const { gateway } = createFixture();
    const client = createClient();
    client.data.user = {
      userId: "user-1",
      telegramId: 1001
    };
    const roomEmitter = {
      emit: vi.fn()
    };
    client.to.mockReturnValue(roomEmitter);

    const started = await gateway.handleTypingStart(client as never, { chatId: "main" });
    const stopped = await gateway.handleTypingStop(client as never, { chatId: "main" });

    expect(started).toEqual({
      ok: true,
      chatId: "main"
    });
    expect(stopped).toEqual({
      ok: true,
      chatId: "main"
    });
    expect(client.to).toHaveBeenCalledWith("chat:main");
    expect(roomEmitter.emit).toHaveBeenCalledWith(
      "typing.start",
      expect.objectContaining({
        chatId: "main",
        userId: "user-1"
      })
    );
    expect(roomEmitter.emit).toHaveBeenCalledWith(
      "typing.stop",
      expect.objectContaining({
        chatId: "main",
        userId: "user-1"
      })
    );
  });

  it("throws UnauthorizedException when ws event is called without user context", async () => {
    const { gateway } = createFixture();
    const client = createClient();

    await expect(
      gateway.handleSend(client as never, {
        chatId: "main",
        payload: {
          sender_mode: "as_user",
          text: "hello"
        }
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("detaches event-bus listeners on module destroy", () => {
    const { gateway, eventBus } = createFixture();
    const roomEmitter = {
      emit: vi.fn()
    };
    gateway.server.to = vi.fn(() => roomEmitter) as never;

    eventBus.emit(
      "message.created",
      {
        chatId: "main"
      } as never
    );
    expect(roomEmitter.emit).toHaveBeenCalledTimes(1);

    gateway.onModuleDestroy();
    eventBus.emit(
      "message.created",
      {
        chatId: "main"
      } as never
    );
    expect(roomEmitter.emit).toHaveBeenCalledTimes(1);
  });
});
