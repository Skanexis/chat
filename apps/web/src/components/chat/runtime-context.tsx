"use client";

import { type FormEvent, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { type SenderModeValue } from "@/design-system";
import { ApiClient, ApiClientError } from "@/lib/api-client";
import { appConfig } from "@/lib/config";
import { loadSession } from "@/lib/session";
import { getTelegramInitData, initTelegramViewport } from "@/lib/telegram";
import type {
  BootstrapResponse,
  ChatIdentity,
  ChatMessage,
  ChatView,
  ReactionSummaryEntry,
  Session,
  WsAutomationRuleExecutedPayload,
  WsBroadcastDeliveryProgressPayload,
  WsBroadcastStateChangedPayload,
  WsIncidentModeChangedPayload,
  WsMemberBannedPayload,
  WsMemberUpdatedPayload,
  WsReputationUpdatedPayload,
  WsThreadSubscriptionTriggeredPayload,
  WsTicketUpdatedPayload
} from "@/lib/types";
import { connectChatSocket, type ChatSocket } from "@/lib/ws-client";

export type UiMessage = ChatMessage & {
  localStatus?: "pending" | "failed";
};

export type LoadState = "initializing" | "ready" | "error";

export type UiError = {
  message: string;
  statusCode?: number;
};

type ChatRuntimeValue = {
  chatId: string;
  state: LoadState;
  error: UiError | null;
  wsConnected: boolean;
  session: Session | null;
  chat: ChatView | null;
  identities: ChatIdentity[];
  messages: UiMessage[];
  reactionByMessage: Record<string, ReactionSummaryEntry[]>;
  typingUsers: string[];
  liveTicketsById: Record<string, WsTicketUpdatedPayload>;
  liveAutomationExecutions: WsAutomationRuleExecutedPayload[];
  liveBroadcastStateByCampaignId: Record<string, WsBroadcastStateChangedPayload>;
  liveBroadcastDeliveryByCampaignId: Record<string, WsBroadcastDeliveryProgressPayload>;
  liveIncidentMode: WsIncidentModeChangedPayload | null;
  liveReputationUpdates: WsReputationUpdatedPayload[];
  liveThreadSubscriptionTriggers: WsThreadSubscriptionTriggeredPayload[];
  liveInvalidation: {
    invites: number;
    webhooks: number;
    threadSubscriptions: number;
    reputation: number;
  };
  wsLastEventAt: string | null;
  draft: string;
  sending: boolean;
  senderMode: SenderModeValue;
  roleName: string;
  isAdmin: boolean;
  isModerator: boolean;
  canSend: boolean;
  restrictionText: string | null;
  senderOptions: Array<{ value: SenderModeValue; label: string; disabled?: boolean }>;
  currentUserId: string | null;
  setDraft: (value: string) => void;
  setSenderMode: (value: SenderModeValue) => void;
  reload: () => void;
  dismissError: () => void;
  onTyping: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onEdit: (messageId: string, currentText: string | undefined) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onAddReaction: (messageId: string) => Promise<void>;
  onRemoveReaction: (messageId: string) => Promise<void>;
};

const ChatRuntimeContext = createContext<ChatRuntimeValue | null>(null);

function mergeMessage(list: UiMessage[], next: UiMessage): UiMessage[] {
  const index = list.findIndex((entry) => entry.id === next.id);
  if (index === -1) {
    return [...list, next].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const updated = [...list];
  updated[index] = {
    ...updated[index],
    ...next,
    localStatus: undefined
  };
  return updated;
}

function parseError(error: unknown): UiError {
  if (error instanceof ApiClientError) {
    return { message: error.message, statusCode: error.statusCode };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: "Unexpected error" };
}

type ChatRuntimeProviderProps = {
  chatId: string;
  children: React.ReactNode;
};

export function ChatRuntimeProvider({ chatId, children }: ChatRuntimeProviderProps) {
  const apiRef = useRef(new ApiClient(appConfig.apiBaseUrl));
  const socketRef = useRef<ChatSocket | null>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<LoadState>("initializing");
  const [error, setError] = useState<UiError | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [chat, setChat] = useState<ChatView | null>(null);
  const [identities, setIdentities] = useState<ChatIdentity[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [reactionByMessage, setReactionByMessage] = useState<Record<string, ReactionSummaryEntry[]>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [liveTicketsById, setLiveTicketsById] = useState<Record<string, WsTicketUpdatedPayload>>({});
  const [liveAutomationExecutions, setLiveAutomationExecutions] = useState<WsAutomationRuleExecutedPayload[]>([]);
  const [liveBroadcastStateByCampaignId, setLiveBroadcastStateByCampaignId] = useState<
    Record<string, WsBroadcastStateChangedPayload>
  >({});
  const [liveBroadcastDeliveryByCampaignId, setLiveBroadcastDeliveryByCampaignId] = useState<
    Record<string, WsBroadcastDeliveryProgressPayload>
  >({});
  const [liveIncidentMode, setLiveIncidentMode] = useState<WsIncidentModeChangedPayload | null>(null);
  const [liveReputationUpdates, setLiveReputationUpdates] = useState<WsReputationUpdatedPayload[]>([]);
  const [liveThreadSubscriptionTriggers, setLiveThreadSubscriptionTriggers] = useState<WsThreadSubscriptionTriggeredPayload[]>([]);
  const [liveInvalidation, setLiveInvalidation] = useState({
    invites: 0,
    webhooks: 0,
    threadSubscriptions: 0,
    reputation: 0
  });
  const [wsLastEventAt, setWsLastEventAt] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [senderMode, setSenderMode] = useState<SenderModeValue>("as_user");

  const currentUserId = session?.user.id ?? null;
  const roleName = chat?.member.role.name ?? "member";
  const normalizedRole = roleName.toLowerCase();
  const isAdmin = normalizedRole.includes("admin");
  const isModerator = isAdmin || normalizedRole.includes("moderator");

  const markWsEvent = useCallback((): void => {
    setWsLastEventAt(new Date().toISOString());
  }, []);

  const invalidate = useCallback((resource: "invites" | "webhooks" | "threadSubscriptions" | "reputation"): void => {
    setLiveInvalidation((prev) => ({
      ...prev,
      [resource]: prev[resource] + 1
    }));
  }, []);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    let alive = true;

    async function bootstrapSession(): Promise<void> {
      try {
        initTelegramViewport();
        setState("initializing");
        setError(null);
        setTypingUsers([]);
        setLiveTicketsById({});
        setLiveAutomationExecutions([]);
        setLiveBroadcastStateByCampaignId({});
        setLiveBroadcastDeliveryByCampaignId({});
        setLiveIncidentMode(null);
        setLiveReputationUpdates([]);
        setLiveThreadSubscriptionTriggers([]);
        setLiveInvalidation({ invites: 0, webhooks: 0, threadSubscriptions: 0, reputation: 0 });
        setWsLastEventAt(null);

        const api = apiRef.current;
        const stored = loadSession();
        if (stored) {
          api.setSession(stored);
          setSession(stored);
        }

        let activeSession = stored;
        if (!activeSession) {
          const initData = getTelegramInitData();
          const authResponse = await api.authTelegram(initData, chatId);
          activeSession = {
            accessToken: authResponse.accessToken,
            refreshToken: authResponse.refreshToken,
            user: authResponse.user
          };
          api.setSession(activeSession);
          setSession(activeSession);
        }

        const bootstrap = await api.getBootstrap(chatId, 120);
        if (!alive) {
          return;
        }
        applyBootstrap(bootstrap);

        socketRef.current?.disconnect();
        socketRef.current = connectChatSocket(appConfig.apiBaseUrl, activeSession.accessToken, chatId, {
          onConnected: () => {
            setWsConnected(true);
            markWsEvent();
            invalidate("invites");
            invalidate("webhooks");
            invalidate("threadSubscriptions");
            invalidate("reputation");
          },
          onDisconnected: () => setWsConnected(false),
          onSnapshot: (payload) => {
            setChat(payload.chat);
            setMessages(payload.messages.map((message) => ({ ...message })));
          },
          onMessageCreated: (message) => {
            markWsEvent();
            invalidate("webhooks");
            setMessages((prev) => mergeMessage(prev, message));
          },
          onMessageUpdated: (message) => {
            markWsEvent();
            invalidate("webhooks");
            setMessages((prev) => mergeMessage(prev, message));
          },
          onMessageDeleted: (message) => {
            markWsEvent();
            invalidate("webhooks");
            setMessages((prev) => mergeMessage(prev, message));
          },
          onMemberUpdated: (_payload: WsMemberUpdatedPayload) => {
            markWsEvent();
            invalidate("invites");
            invalidate("webhooks");
          },
          onMemberBanned: (_payload: WsMemberBannedPayload) => {
            markWsEvent();
            invalidate("invites");
            invalidate("webhooks");
          },
          onReactionUpdated: (payload) => {
            markWsEvent();
            setReactionByMessage((prev) => ({
              ...prev,
              [payload.messageId]: payload.summary
            }));
          },
          onTypingStart: (payload) => {
            if (payload.userId === currentUserIdRef.current) {
              return;
            }
            markWsEvent();
            setTypingUsers((prev) => (prev.includes(payload.userId) ? prev : [...prev, payload.userId]));
          },
          onTypingStop: (payload) => {
            markWsEvent();
            setTypingUsers((prev) => prev.filter((userId) => userId !== payload.userId));
          },
          onTicketUpdated: (payload) => {
            markWsEvent();
            setLiveTicketsById((prev) => ({
              ...prev,
              [payload.id]: payload
            }));
          },
          onAutomationRuleExecuted: (payload) => {
            markWsEvent();
            setLiveAutomationExecutions((prev) => {
              const next = [payload, ...prev.filter((entry) => entry.id !== payload.id)];
              return next.slice(0, 100);
            });
          },
          onIncidentModeChanged: (payload) => {
            markWsEvent();
            setLiveIncidentMode(payload);
          },
          onReputationUpdated: (payload) => {
            markWsEvent();
            invalidate("reputation");
            setLiveReputationUpdates((prev) => {
              const next = [payload, ...prev.filter((entry) => entry.eventId !== payload.eventId)];
              return next.slice(0, 100);
            });
          },
          onBroadcastStateChanged: (payload) => {
            markWsEvent();
            invalidate("webhooks");
            setLiveBroadcastStateByCampaignId((prev) => ({
              ...prev,
              [payload.campaignId]: payload
            }));
          },
          onBroadcastDeliveryProgress: (payload) => {
            markWsEvent();
            invalidate("webhooks");
            setLiveBroadcastDeliveryByCampaignId((prev) => ({
              ...prev,
              [payload.campaignId]: payload
            }));
          },
          onThreadSubscriptionTriggered: (payload) => {
            markWsEvent();
            invalidate("threadSubscriptions");
            setLiveThreadSubscriptionTriggers((prev) => {
              const next = [payload, ...prev.filter((entry) => entry.subscriptionId !== payload.subscriptionId)];
              return next.slice(0, 100);
            });
          },
          onError: (message) => {
            setError({ message: `WS error: ${message}` });
          }
        });

        setState("ready");
      } catch (bootstrapError) {
        if (!alive) {
          return;
        }
        setError(parseError(bootstrapError));
        setState("error");
      }
    }

    bootstrapSession();

    return () => {
      alive = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
    };
  }, [chatId, invalidate, markWsEvent, reloadToken]);

  const groupIdentity = identities.find((entry) => entry.type === "group" && entry.isActive);
  const roleProfileIdentity = identities.find((entry) => entry.type === "role_profile" && entry.isActive);

  useEffect(() => {
    if (senderMode === "as_group" && !groupIdentity) {
      setSenderMode("as_user");
    }
    if (senderMode === "as_role_profile" && !roleProfileIdentity) {
      setSenderMode("as_user");
    }
  }, [groupIdentity, roleProfileIdentity, senderMode]);

  const senderOptions = useMemo(
    () => [
      { value: "as_user" as const, label: "You" },
      { value: "as_group" as const, label: "Group", disabled: !groupIdentity },
      { value: "as_role_profile" as const, label: "Role", disabled: !roleProfileIdentity }
    ],
    [groupIdentity, roleProfileIdentity]
  );

  const canSend = chat?.member.status === "active";
  const restrictionText =
    chat?.member.status === "muted"
      ? "You are muted in this chat. Sending is temporarily disabled."
      : chat?.member.status === "readonly"
        ? "This room is read-only for your role."
        : chat?.member.status === "banned"
          ? "You are banned from posting in this room."
          : null;

  function applyBootstrap(bootstrap: BootstrapResponse): void {
    setChat(bootstrap.chat);
    setMessages(bootstrap.messages.map((message) => ({ ...message })));
    setIdentities(bootstrap.identities);
  }

  function resolveIdentityId(): string | undefined {
    if (senderMode === "as_group") {
      return groupIdentity?.id;
    }
    if (senderMode === "as_role_profile") {
      return roleProfileIdentity?.id;
    }
    return undefined;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!chat) {
      return;
    }

    const text = draft.trim();
    if (!text) {
      return;
    }

    const identityId = resolveIdentityId();
    if (senderMode !== "as_user" && !identityId) {
      setError({ message: "Selected sender mode requires an active identity.", statusCode: 403 });
      return;
    }

    const tempId = `tmp-${Date.now()}`;
    const now = new Date().toISOString();
    const optimistic: UiMessage = {
      id: tempId,
      chatId: chat.id,
      authorId: currentUserId ?? "unknown",
      actorUserId: currentUserId ?? "unknown",
      displayAuthorType:
        senderMode === "as_group" ? "group" : senderMode === "as_role_profile" ? "role_profile" : "user",
      displayAuthorId: identityId ?? (currentUserId ?? "unknown"),
      senderMode,
      text,
      media: null,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      localStatus: "pending"
    };

    setDraft("");
    setSending(true);
    setMessages((prev) => mergeMessage(prev, optimistic));

    try {
      const created = await apiRef.current.createMessage(chat.id, text, senderMode, identityId);
      setMessages((prev) => {
        const withoutTemp = prev.filter((entry) => entry.id !== tempId);
        return mergeMessage(withoutTemp, created);
      });
      setError(null);
    } catch (sendError) {
      setMessages((prev) =>
        prev.map((entry) => (entry.id === tempId ? { ...entry, localStatus: "failed" } : entry))
      );
      setError(parseError(sendError));
    } finally {
      setSending(false);
    }
  }

  async function onEdit(messageId: string, currentText: string | undefined): Promise<void> {
    if (!chat) return;
    const next = window.prompt("Edit message", currentText ?? "");
    if (next === null) return;

    try {
      const updated = await apiRef.current.updateMessage(chat.id, messageId, next);
      setMessages((prev) => mergeMessage(prev, updated));
      setError(null);
    } catch (updateError) {
      setError(parseError(updateError));
    }
  }

  async function onDelete(messageId: string): Promise<void> {
    if (!chat) return;

    try {
      const deleted = await apiRef.current.deleteMessage(chat.id, messageId);
      setMessages((prev) => mergeMessage(prev, deleted));
      setError(null);
    } catch (deleteError) {
      setError(parseError(deleteError));
    }
  }

  async function onAddReaction(messageId: string): Promise<void> {
    if (!chat) return;
    try {
      const result = await apiRef.current.setReaction(chat.id, messageId, "👍");
      setReactionByMessage((prev) => ({ ...prev, [result.messageId]: result.summary }));
      setError(null);
    } catch (reactionError) {
      setError(parseError(reactionError));
    }
  }

  async function onRemoveReaction(messageId: string): Promise<void> {
    if (!chat) return;
    try {
      const result = await apiRef.current.removeReaction(chat.id, messageId);
      setReactionByMessage((prev) => ({ ...prev, [result.messageId]: result.summary }));
      setError(null);
    } catch (reactionError) {
      setError(parseError(reactionError));
    }
  }

  function onTyping(): void {
    const socket = socketRef.current?.socket;
    if (!socket || !chat) return;

    socket.emit("typing.start", { chatId: chat.id });
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
    }
    typingStopTimerRef.current = setTimeout(() => {
      socket.emit("typing.stop", { chatId: chat.id });
      typingStopTimerRef.current = null;
    }, 1200);
  }

  const value = useMemo<ChatRuntimeValue>(
    () => ({
      chatId,
      state,
      error,
      wsConnected,
      session,
      chat,
      identities,
      messages,
      reactionByMessage,
      typingUsers,
      liveTicketsById,
      liveAutomationExecutions,
      liveBroadcastStateByCampaignId,
      liveBroadcastDeliveryByCampaignId,
      liveIncidentMode,
      liveReputationUpdates,
      liveThreadSubscriptionTriggers,
      liveInvalidation,
      wsLastEventAt,
      draft,
      sending,
      senderMode,
      roleName,
      isAdmin,
      isModerator,
      canSend,
      restrictionText,
      senderOptions,
      currentUserId,
      setDraft,
      setSenderMode,
      reload: () => setReloadToken((prev) => prev + 1),
      dismissError: () => setError(null),
      onTyping,
      onSubmit,
      onEdit,
      onDelete,
      onAddReaction,
      onRemoveReaction
    }),
    [
      canSend,
      chat,
      chatId,
      currentUserId,
      draft,
      error,
      identities,
      isAdmin,
      isModerator,
      liveAutomationExecutions,
      liveBroadcastDeliveryByCampaignId,
      liveBroadcastStateByCampaignId,
      liveIncidentMode,
      liveReputationUpdates,
      liveThreadSubscriptionTriggers,
      liveInvalidation,
      liveTicketsById,
      messages,
      reactionByMessage,
      restrictionText,
      roleName,
      senderMode,
      senderOptions,
      sending,
      session,
      state,
      typingUsers,
      wsLastEventAt,
      wsConnected
    ]
  );

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>;
}

export function useChatRuntime(): ChatRuntimeValue {
  const context = useContext(ChatRuntimeContext);
  if (!context) {
    throw new Error("useChatRuntime must be used within ChatRuntimeProvider");
  }
  return context;
}
