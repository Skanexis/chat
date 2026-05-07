import { io, type Socket } from "socket.io-client";

import { getApiOrigin } from "@/lib/config";
import type {
  ChatMessage,
  ChatView,
  WsAutomationRuleExecutedPayload,
  WsBroadcastDeliveryProgressPayload,
  WsBroadcastStateChangedPayload,
  WsIncidentModeChangedPayload,
  WsMemberBannedPayload,
  WsMemberUpdatedPayload,
  WsReputationUpdatedPayload,
  WsReactionPayload,
  WsThreadSubscriptionTriggeredPayload,
  WsTicketUpdatedPayload,
  WsTypingPayload
} from "@/lib/types";

type WsCallbacks = {
  onConnected?: () => void;
  onDisconnected?: (reason: string) => void;
  onReconnecting?: (attempt: number) => void;
  onReconnected?: (attempt: number) => void;
  onReconnectFailed?: () => void;
  onSnapshot?: (payload: { chat: ChatView; messages: ChatMessage[] }) => void;
  onMessageCreated?: (message: ChatMessage) => void;
  onMessageUpdated?: (message: ChatMessage) => void;
  onMessageDeleted?: (message: ChatMessage) => void;
  onMemberUpdated?: (payload: WsMemberUpdatedPayload) => void;
  onMemberBanned?: (payload: WsMemberBannedPayload) => void;
  onReactionUpdated?: (payload: WsReactionPayload) => void;
  onTypingStart?: (payload: WsTypingPayload) => void;
  onTypingStop?: (payload: WsTypingPayload) => void;
  onTicketUpdated?: (payload: WsTicketUpdatedPayload) => void;
  onAutomationRuleExecuted?: (payload: WsAutomationRuleExecutedPayload) => void;
  onIncidentModeChanged?: (payload: WsIncidentModeChangedPayload) => void;
  onReputationUpdated?: (payload: WsReputationUpdatedPayload) => void;
  onBroadcastStateChanged?: (payload: WsBroadcastStateChangedPayload) => void;
  onBroadcastDeliveryProgress?: (payload: WsBroadcastDeliveryProgressPayload) => void;
  onThreadSubscriptionTriggered?: (payload: WsThreadSubscriptionTriggeredPayload) => void;
  onError?: (error: string) => void;
};

export type ChatSocket = {
  socket: Socket;
  disconnect: () => void;
};

export function connectChatSocket(apiBaseUrl: string, token: string, chatId: string, callbacks: WsCallbacks): ChatSocket {
  const socket = io(`${getApiOrigin(apiBaseUrl)}/ws`, {
    path: "/ws/socket.io",
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 10000,
    auth: {
      token
    }
  });
  const hasWindow = typeof window !== "undefined";
  const hasNavigator = typeof navigator !== "undefined";

  const forceReconnect = (): void => {
    if (hasNavigator && navigator.onLine === false) {
      return;
    }
    if (!socket.connected) {
      socket.connect();
    }
  };

  const handleOnline = (): void => {
    forceReconnect();
  };
  const handleOffline = (): void => {
    callbacks.onDisconnected?.("network offline");
  };

  if (hasWindow) {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  }

  const reconnectHealthTimer = setInterval(() => {
    forceReconnect();
  }, 5000);

  socket.on("connect", () => {
    callbacks.onConnected?.();
    socket.emit("chat.join", { chatId });
  });
  socket.on("disconnect", (reason: string) => {
    callbacks.onDisconnected?.(reason);
    // If server closed the namespace, force reconnect without page reload.
    if (reason === "io server disconnect") {
      forceReconnect();
    }
  });
  socket.io.on("reconnect_attempt", (attempt: number) => callbacks.onReconnecting?.(attempt));
  socket.io.on("reconnect", (attempt: number) => callbacks.onReconnected?.(attempt));
  socket.io.on("reconnect_failed", () => callbacks.onReconnectFailed?.());

  socket.on("chat.snapshot", (payload: { chat: ChatView; messages: ChatMessage[] }) => callbacks.onSnapshot?.(payload));
  socket.on("message.created", (payload: ChatMessage) => callbacks.onMessageCreated?.(payload));
  socket.on("message.updated", (payload: ChatMessage) => callbacks.onMessageUpdated?.(payload));
  socket.on("message.deleted", (payload: ChatMessage) => callbacks.onMessageDeleted?.(payload));
  socket.on("member.updated", (payload: WsMemberUpdatedPayload) => callbacks.onMemberUpdated?.(payload));
  socket.on("member.banned", (payload: WsMemberBannedPayload) => callbacks.onMemberBanned?.(payload));
  socket.on("message.reaction.updated", (payload: WsReactionPayload) => callbacks.onReactionUpdated?.(payload));
  socket.on("typing.start", (payload: WsTypingPayload) => callbacks.onTypingStart?.(payload));
  socket.on("typing.stop", (payload: WsTypingPayload) => callbacks.onTypingStop?.(payload));
  socket.on("ticket.updated", (payload: WsTicketUpdatedPayload) => callbacks.onTicketUpdated?.(payload));
  socket.on("automation.rule.executed", (payload: WsAutomationRuleExecutedPayload) => callbacks.onAutomationRuleExecuted?.(payload));
  socket.on("incident_mode.changed", (payload: WsIncidentModeChangedPayload) => callbacks.onIncidentModeChanged?.(payload));
  socket.on("reputation.updated", (payload: WsReputationUpdatedPayload) => callbacks.onReputationUpdated?.(payload));
  socket.on("broadcast.state.changed", (payload: WsBroadcastStateChangedPayload) => callbacks.onBroadcastStateChanged?.(payload));
  socket.on("broadcast.delivery.progress", (payload: WsBroadcastDeliveryProgressPayload) =>
    callbacks.onBroadcastDeliveryProgress?.(payload)
  );
  socket.on("thread.subscription.triggered", (payload: WsThreadSubscriptionTriggeredPayload) =>
    callbacks.onThreadSubscriptionTriggered?.(payload)
  );
  socket.on("connect_error", (error) => callbacks.onError?.(error.message));

  return {
    socket,
    disconnect: () => {
      clearInterval(reconnectHealthTimer);
      if (hasWindow) {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
      socket.removeAllListeners();
      socket.disconnect();
    }
  };
}
