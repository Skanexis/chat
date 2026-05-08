"use client";

import { type FormEvent, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { type SenderModeValue } from "@/design-system";
import { ApiClient, ApiClientError } from "@/lib/api-client";
import { appConfig } from "@/lib/config";
import { decryptMessageText, encryptMessageText } from "@/lib/e2e";
import { clearSession, loadSession } from "@/lib/session";
import { getTelegramInitData, getTelegramInitDataUserId, initTelegramViewport } from "@/lib/telegram";
import type {
  BootstrapResponse,
  ChatIdentity,
  ChatMessage,
  ChatView,
  IncidentModeState,
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

const ROLE_BADGE_PERMISSION = "ui.role.badge.show";

export type UiMessage = ChatMessage & {
  localStatus?: "pending" | "failed";
};

export type LoadState = "initializing" | "ready" | "error";
export type WsStatus = "connecting" | "online" | "reconnecting" | "syncing" | "offline";

export type UiError = {
  message: string;
  statusCode?: number;
};

type ChatRuntimeValue = {
  chatId: string;
  state: LoadState;
  error: UiError | null;
  wsConnected: boolean;
  wsStatus: WsStatus;
  wsReconnectAttempt: number | null;
  wsReconnectStartedAt: string | null;
  session: Session | null;
  chat: ChatView | null;
  identities: ChatIdentity[];
  messages: UiMessage[];
  reactionByMessage: Record<string, ReactionSummaryEntry[]>;
  ownReactionByMessage: Record<string, string | undefined>;
  typingUsers: string[];
  liveTicketsById: Record<string, WsTicketUpdatedPayload>;
  liveAutomationExecutions: WsAutomationRuleExecutedPayload[];
  liveBroadcastStateByCampaignId: Record<string, WsBroadcastStateChangedPayload>;
  liveBroadcastDeliveryByCampaignId: Record<string, WsBroadcastDeliveryProgressPayload>;
  liveIncidentMode: WsIncidentModeChangedPayload | null;
  maintenanceState: IncidentModeState | null;
  maintenanceEnabled: boolean;
  maintenanceReason: string | null;
  isMaintenanceBypass: boolean;
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
  replyToMessageId: string | null;
  senderMode: SenderModeValue;
  roleName: string;
  permissions: string[];
  isDeveloper: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  canDeleteAnyMessages: boolean;
  canViewDeletedMessages: boolean;
  canSend: boolean;
  restrictionText: string | null;
  senderOptions: Array<{ value: SenderModeValue; label: string; disabled?: boolean }>;
  currentUserId: string | null;
  setDraft: (value: string) => void;
  setReplyToMessageId: (messageId: string | null) => void;
  clearReplyToMessage: () => void;
  setSenderMode: (value: SenderModeValue) => void;
  reload: () => void;
  dismissError: () => void;
  onTyping: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onEdit: (messageId: string, currentText: string | undefined) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onAddReaction: (messageId: string, reaction: string) => Promise<void>;
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
  const hasConnectedOnceRef = useRef(false);

  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<LoadState>("initializing");
  const [error, setError] = useState<UiError | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [chat, setChat] = useState<ChatView | null>(null);
  const [identities, setIdentities] = useState<ChatIdentity[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [reactionByMessage, setReactionByMessage] = useState<Record<string, ReactionSummaryEntry[]>>({});
  const [ownReactionByMessage, setOwnReactionByMessage] = useState<Record<string, string | undefined>>({});
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
  const [maintenanceState, setMaintenanceState] = useState<IncidentModeState | null>(null);
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
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [wsReconnectAttempt, setWsReconnectAttempt] = useState<number | null>(null);
  const [wsReconnectStartedAt, setWsReconnectStartedAt] = useState<string | null>(null);
  const [senderMode, setSenderMode] = useState<SenderModeValue>("as_user");

  const currentUserId = session?.user.id ?? null;
  const roleName = chat?.member.role.name ?? "member";
  const rolePermissions = chat?.member.role.permissions ?? [];
  const permissionSet = useMemo(() => new Set(rolePermissions), [rolePermissions]);
  const hasPermission = useCallback(
    (permission: string): boolean => permissionSet.has("*") || permissionSet.has(permission),
    [permissionSet]
  );
  const hasAnyPermission = useCallback(
    (permissions: string[]): boolean => permissionSet.has("*") || permissions.some((permission) => permissionSet.has(permission)),
    [permissionSet]
  );
  const isDeveloper = permissionSet.has("*");
  const isMaintenanceBypass =
    permissionSet.has("*") || (permissionSet.has("incident_mode.enable") && permissionSet.has("incident_mode.disable"));
  const isAdminByPermission =
    permissionSet.has("*") ||
    rolePermissions.some((permission) =>
      permission.startsWith("role.") ||
      permission.startsWith("chat.invite.") ||
      permission.startsWith("channel.notify.") ||
      permission.startsWith("broadcast.") ||
      permission.startsWith("integration.webhook.") ||
      permission.startsWith("automation.") ||
      permission.startsWith("incident_mode.") ||
      permission.startsWith("audit.")
    );
  const isModeratorByPermission =
    permissionSet.has("*") ||
    rolePermissions.some((permission) =>
      permission.startsWith("member.") ||
      permission.startsWith("ticket.") ||
      permission.startsWith("room.temp.") ||
      permission === "message.search" ||
      permission === "message.pin" ||
      permission === "message.pin.view"
    );
  const isAdmin = isAdminByPermission;
  const isModerator = isAdmin || isModeratorByPermission;
  const canDeleteAnyMessages = permissionSet.has("*") || permissionSet.has("message.delete.any");
  const canViewDeletedMessages =
    permissionSet.has("*") || permissionSet.has("message.deleted.view") || permissionSet.has("message.delete.any");
  const maintenanceEnabled = maintenanceState !== null;
  const maintenanceReason = maintenanceState?.reason ?? liveIncidentMode?.reason ?? null;

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
        setWsConnected(false);
        setWsStatus("connecting");
        setWsReconnectAttempt(null);
        setWsReconnectStartedAt(null);
        hasConnectedOnceRef.current = false;
        setTypingUsers([]);
        setLiveTicketsById({});
        setLiveAutomationExecutions([]);
        setLiveBroadcastStateByCampaignId({});
        setLiveBroadcastDeliveryByCampaignId({});
        setLiveIncidentMode(null);
        setMaintenanceState(null);
        setLiveReputationUpdates([]);
        setLiveThreadSubscriptionTriggers([]);
        setLiveInvalidation({ invites: 0, webhooks: 0, threadSubscriptions: 0, reputation: 0 });
        setWsLastEventAt(null);
        setOwnReactionByMessage({});

        const api = apiRef.current;
        const initData = getTelegramInitData();
        const telegramInitUserId = getTelegramInitDataUserId(initData);
        const stored = loadSession();
        if (stored) {
          const sessionMismatch =
            telegramInitUserId !== null &&
            Number.isFinite(stored.user.telegramId) &&
            stored.user.telegramId !== telegramInitUserId;

          if (sessionMismatch) {
            clearSession();
            api.setSession(null);
            setSession(null);
          } else {
            api.setSession(stored);
            setSession(stored);
          }
        }

        let activeSession = stored;
        if (activeSession && telegramInitUserId !== null && activeSession.user.telegramId !== telegramInitUserId) {
          activeSession = null;
        }
        if (!activeSession) {
          const authResponse = await api.authTelegram(initData, chatId);
          activeSession = {
            accessToken: authResponse.accessToken,
            refreshToken: authResponse.refreshToken,
            user: authResponse.user
          };
          api.setSession(activeSession);
          setSession(activeSession);
        }

        const [bootstrap, incidentMode] = await Promise.all([
          api.getBootstrap(chatId, 120),
          api.getIncidentModeState(chatId).catch(() => ({
            ok: true as const,
            enabled: false,
            state: null
          }))
        ]);
        if (!alive) {
          return;
        }
        await applyBootstrap(bootstrap);
        setMaintenanceState(incidentMode.enabled ? incidentMode.state : null);

        socketRef.current?.disconnect();
        socketRef.current = connectChatSocket(appConfig.apiBaseUrl, activeSession.accessToken, chatId, {
          onConnected: () => {
            const wasConnectedBefore = hasConnectedOnceRef.current;
            hasConnectedOnceRef.current = true;
            setWsConnected(true);
            setWsStatus(wasConnectedBefore ? "syncing" : "online");
            setWsReconnectAttempt(null);
            if (!wasConnectedBefore) {
              setWsReconnectStartedAt(null);
            }
            markWsEvent();
            invalidate("invites");
            invalidate("webhooks");
            invalidate("threadSubscriptions");
            invalidate("reputation");
          },
          onDisconnected: (reason) => {
            setWsConnected(false);
            setWsStatus(reason === "io server disconnect" ? "offline" : "reconnecting");
            if (reason !== "io server disconnect") {
              setWsReconnectStartedAt((prev) => prev ?? new Date().toISOString());
            }
          },
          onReconnecting: (attempt) => {
            setWsConnected(false);
            setWsStatus("reconnecting");
            setWsReconnectAttempt(attempt);
            setWsReconnectStartedAt((prev) => prev ?? new Date().toISOString());
          },
          onReconnected: (attempt) => {
            setWsConnected(true);
            setWsStatus("syncing");
            setWsReconnectAttempt(null);
            markWsEvent();
            invalidate("invites");
            invalidate("webhooks");
            invalidate("threadSubscriptions");
            invalidate("reputation");
            if (attempt > 0) {
              setError(null);
            }
          },
          onReconnectFailed: () => {
            setWsConnected(false);
            setWsStatus("offline");
            setWsReconnectStartedAt(null);
            setError({ message: "WS reconnect failed. Tap reload to restore live updates." });
          },
          onSnapshot: (payload) => {
            void applySnapshot(payload);
            setWsStatus("online");
            setWsReconnectAttempt(null);
            setWsReconnectStartedAt(null);
          },
          onMessageCreated: (message) => {
            markWsEvent();
            invalidate("webhooks");
            void mergeIncomingMessage(message);
          },
          onMessageUpdated: (message) => {
            markWsEvent();
            invalidate("webhooks");
            void mergeIncomingMessage(message);
          },
          onMessageDeleted: (message) => {
            markWsEvent();
            invalidate("webhooks");
            void mergeIncomingMessage(message);
          },
          onMessagesPurged: (payload) => {
            markWsEvent();
            invalidate("webhooks");
            if (!payload.messageIds || payload.messageIds.length === 0) {
              return;
            }
            const removed = new Set(payload.messageIds);
            setMessages((prev) => prev.filter((message) => !removed.has(message.id)));
          },
          onMemberUpdated: (payload: WsMemberUpdatedPayload) => {
            markWsEvent();
            invalidate("invites");
            invalidate("webhooks");
            if (payload.userId === currentUserIdRef.current) {
              setChat((prev) =>
                prev
                  ? {
                      ...prev,
                      member: {
                        ...prev.member,
                        status: payload.status
                      }
                    }
                  : prev
              );
            }
          },
          onMemberBanned: (payload: WsMemberBannedPayload) => {
            markWsEvent();
            invalidate("invites");
            invalidate("webhooks");
            if (payload.userId === currentUserIdRef.current) {
              setChat((prev) =>
                prev
                  ? {
                      ...prev,
                      member: {
                        ...prev.member,
                        status: payload.status
                      }
                    }
                  : prev
              );
            }
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
            setMaintenanceState(payload.enabled ? payload.state : null);
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
            setWsConnected(false);
            setWsStatus("reconnecting");
            const normalized = message.trim().toLowerCase();
            // Ignore transient transport errors while auto-reconnect is in progress.
            if (normalized === "websocket error" || normalized === "xhr poll error") {
              return;
            }
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
      setWsConnected(false);
      setWsStatus("offline");
      setWsReconnectAttempt(null);
      setWsReconnectStartedAt(null);
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
    };
  }, [chatId, invalidate, markWsEvent, reloadToken]);

  const groupIdentity = identities.find((entry) => entry.type === "group" && entry.isActive);
  const roleProfileIdentity = identities.find((entry) => entry.type === "role_profile" && entry.isActive);
  const senderRolePermissions = chat?.member.role.permissions ?? [];
  const hasSenderPermission = (permission: string): boolean =>
    senderRolePermissions.includes("*") || senderRolePermissions.includes(permission);
  const canUseGroupSender = hasSenderPermission("message.send.as_group");
  const canUseRoleProfileSender =
    hasSenderPermission("message.send.as_group") && hasSenderPermission("message.send.as_group.profile.select");
  const canShowOwnRoleBadge = hasSenderPermission(ROLE_BADGE_PERMISSION);
  const canSendText = hasSenderPermission("message.send.text");
  const canUsePurgeCommand = Boolean(chat && chat.member.status === "active" && !canSendText && canDeleteAnyMessages);

  useEffect(() => {
    if (senderMode === "as_group" && (!canUseGroupSender || !groupIdentity)) {
      setSenderMode("as_user");
    }
    if (senderMode === "as_role_profile" && (!canUseRoleProfileSender || !roleProfileIdentity)) {
      setSenderMode("as_user");
    }
  }, [canUseGroupSender, canUseRoleProfileSender, groupIdentity, roleProfileIdentity, senderMode]);

  useEffect(() => {
    if (!replyToMessageId) {
      return;
    }
    if (!messages.some((message) => message.id === replyToMessageId)) {
      setReplyToMessageId(null);
    }
  }, [messages, replyToMessageId]);

  const senderOptions = useMemo(() => {
    const options: Array<{ value: SenderModeValue; label: string; disabled?: boolean }> = [{ value: "as_user", label: "You" }];
    if (canUseGroupSender) {
      options.push({ value: "as_group", label: "Group", disabled: !groupIdentity });
    }
    if (canUseRoleProfileSender) {
      options.push({ value: "as_role_profile", label: "Role", disabled: !roleProfileIdentity });
    }
    return options;
  }, [canUseGroupSender, canUseRoleProfileSender, groupIdentity, roleProfileIdentity]);

  const canSend = chat?.member.status !== "banned" && (canSendText || canDeleteAnyMessages);
  const restrictionText =
    chat?.member.status === "muted"
      ? "You are muted in this chat. Sending is temporarily disabled."
      : chat?.member.status === "readonly"
        ? "This room is read-only for your role."
      : chat?.member.status === "banned"
          ? "You are banned from posting in this room."
        : canUsePurgeCommand
          ? "Moderation mode: only /purge command is available for your role."
          : chat?.member.status === "active" && !canSendText
            ? "Your role has read-only access with reactions only."
          : !wsConnected
            ? "Realtime connection is restoring. Sending works, but live updates can be delayed."
            : null;

  async function applyBootstrap(bootstrap: BootstrapResponse): Promise<void> {
    setChat(bootstrap.chat);
    setMessages(await hydrateMessages(bootstrap.messages));
    setIdentities(bootstrap.identities);
  }

  async function applySnapshot(payload: { chat: ChatView; messages: ChatMessage[] }): Promise<void> {
    setChat(payload.chat);
    setMessages(await hydrateMessages(payload.messages));
  }

  async function mergeIncomingMessage(message: ChatMessage): Promise<void> {
    const hydrated = await hydrateMessage(message);
    setMessages((prev) => mergeMessage(prev, hydrated));
  }

  async function hydrateMessages(items: ChatMessage[]): Promise<UiMessage[]> {
    return Promise.all(items.map((message) => hydrateMessage(message)));
  }

  async function hydrateMessage(message: ChatMessage): Promise<UiMessage> {
    if (!message.isEncrypted) {
      return { ...message };
    }
    const decryptedText = await decryptMessageText(chatId, message);
    return decryptedText === null ? { ...message } : { ...message, text: decryptedText };
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
    if (!canSendText && canDeleteAnyMessages) {
      const normalized = text.trim();
      if (!/^\/pur(?:ge|e)(?:@[a-zA-Z0-9_]+)?(?:\s+(?:\*|all))?$/i.test(normalized)) {
        setError({ message: "Only /purge (or /pure) command is allowed for your role.", statusCode: 403 });
        return;
      }
    }
    const identityId = resolveIdentityId();
    if (senderMode === "as_group" && !canUseGroupSender) {
      setError({ message: "Group sender mode is not allowed for your role.", statusCode: 403 });
      return;
    }
    if (senderMode === "as_role_profile" && !canUseRoleProfileSender) {
      setError({ message: "Role sender mode is not allowed for your role.", statusCode: 403 });
      return;
    }
    if (senderMode !== "as_user" && !identityId) {
      setError({ message: "Selected sender mode requires an active identity.", statusCode: 403 });
      return;
    }

    const tempId = `tmp-${Date.now()}`;
    const now = new Date().toISOString();
    const replyToId = replyToMessageId ?? undefined;
    const ownDisplayName =
      session?.user.username
        ? `@${session.user.username}`
        : [session?.user.firstName, session?.user.lastName].filter(Boolean).join(" ").trim() || undefined;
    const identityDisplayName =
      senderMode === "as_group" ? groupIdentity?.name : senderMode === "as_role_profile" ? roleProfileIdentity?.name : undefined;
    const optimistic: UiMessage = {
      id: tempId,
      chatId: chat.id,
      authorId: currentUserId ?? "unknown",
      actorUserId: currentUserId ?? "unknown",
      displayAuthorType:
        senderMode === "as_group" ? "group" : senderMode === "as_role_profile" ? "role_profile" : "user",
      displayAuthorId: identityId ?? (currentUserId ?? "unknown"),
      displayAuthorName: identityDisplayName ?? ownDisplayName,
      displayAuthorUsername: senderMode === "as_user" ? session?.user.username : undefined,
      authorRoleName: roleName,
      authorRoleBadgeEnabled: senderMode === "as_user" ? canShowOwnRoleBadge : false,
      senderMode,
      text,
      media: null,
      replyToId: replyToId ?? null,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      localStatus: "pending"
    };

    setDraft("");
    setSending(true);
    setMessages((prev) => mergeMessage(prev, optimistic));

    try {
      const encryptedPayload = appConfig.encryptedMessages ? await encryptMessageText(chat.id, text) : undefined;
      const created = await apiRef.current.createMessage(chat.id, text, senderMode, identityId, replyToId, {
        encryptedPayload
      });
      const hydratedCreated = await hydrateMessage(created);
      setMessages((prev) => {
        const withoutTemp = prev.filter((entry) => entry.id !== tempId);
        return mergeMessage(withoutTemp, hydratedCreated);
      });
      setReplyToMessageId(null);
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

  async function onAddReaction(messageId: string, reaction: string): Promise<void> {
    if (!chat) return;
    try {
      const currentOwnReaction = ownReactionByMessage[messageId];
      if (currentOwnReaction === reaction) {
        const removed = await apiRef.current.removeReaction(chat.id, messageId);
        setReactionByMessage((prev) => ({ ...prev, [removed.messageId]: removed.summary }));
        setOwnReactionByMessage((prev) => ({ ...prev, [messageId]: undefined }));
        setError(null);
        return;
      }

      const result = await apiRef.current.setReaction(chat.id, messageId, reaction);
      setReactionByMessage((prev) => ({ ...prev, [result.messageId]: result.summary }));
      setOwnReactionByMessage((prev) => ({ ...prev, [result.messageId]: reaction }));
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
      setOwnReactionByMessage((prev) => ({ ...prev, [result.messageId]: undefined }));
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
      wsStatus,
      wsReconnectAttempt,
      wsReconnectStartedAt,
      session,
      chat,
      identities,
      messages,
      reactionByMessage,
      ownReactionByMessage,
      typingUsers,
      liveTicketsById,
      liveAutomationExecutions,
      liveBroadcastStateByCampaignId,
      liveBroadcastDeliveryByCampaignId,
      liveIncidentMode,
      maintenanceState,
      maintenanceEnabled,
      maintenanceReason,
      isMaintenanceBypass,
      liveReputationUpdates,
      liveThreadSubscriptionTriggers,
      liveInvalidation,
      wsLastEventAt,
      draft,
      sending,
      replyToMessageId,
      senderMode,
      roleName,
      permissions: rolePermissions,
      isDeveloper,
      isAdmin,
      isModerator,
      hasPermission,
      hasAnyPermission,
      canDeleteAnyMessages,
      canViewDeletedMessages,
      canSend,
      restrictionText,
      senderOptions,
      currentUserId,
      setDraft,
      setReplyToMessageId,
      clearReplyToMessage: () => setReplyToMessageId(null),
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
      canDeleteAnyMessages,
      canViewDeletedMessages,
      liveAutomationExecutions,
      liveBroadcastDeliveryByCampaignId,
      liveBroadcastStateByCampaignId,
      liveIncidentMode,
      maintenanceState,
      maintenanceEnabled,
      maintenanceReason,
      isMaintenanceBypass,
      liveReputationUpdates,
      liveThreadSubscriptionTriggers,
      liveInvalidation,
      liveTicketsById,
      messages,
      reactionByMessage,
      ownReactionByMessage,
      replyToMessageId,
      restrictionText,
      roleName,
      rolePermissions,
      isDeveloper,
      senderMode,
      senderOptions,
      sending,
      session,
      state,
      typingUsers,
      wsLastEventAt,
      wsConnected,
      wsStatus,
      wsReconnectAttempt,
      wsReconnectStartedAt,
      hasPermission,
      hasAnyPermission
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
