"use client";

import { type FormEvent, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { type SenderModeValue } from "@/design-system";
import { ApiClient, ApiClientError } from "@/lib/api-client";
import { appConfig } from "@/lib/config";
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
  isAdmin: boolean;
  isModerator: boolean;
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
  const [senderMode, setSenderMode] = useState<SenderModeValue>("as_user");

  const currentUserId = session?.user.id ?? null;
  const roleName = chat?.member.role.name ?? "member";
  const rolePermissions = chat?.member.role.permissions ?? [];
  const permissionSet = useMemo(() => new Set(rolePermissions), [rolePermissions]);
  const normalizedRole = roleName.toLowerCase();
  const isOwnerLike = normalizedRole.includes("owner") || normalizedRole.includes("creator");
  const isMaintenanceBypass =
    permissionSet.has("*") || (permissionSet.has("incident_mode.enable") && permissionSet.has("incident_mode.disable"));
  const isAdminByName = normalizedRole.includes("admin") || isOwnerLike;
  const isAdminByPermission =
    permissionSet.has("*") ||
    rolePermissions.some((permission) =>
      permission.startsWith("role.") ||
      permission.startsWith("invite.") ||
      permission.startsWith("channel_notify.") ||
      permission.startsWith("broadcast.") ||
      permission.startsWith("webhook.") ||
      permission.startsWith("automation.") ||
      permission.startsWith("incident_mode.") ||
      permission.startsWith("audit.")
    );
  const isModeratorByName = normalizedRole.includes("moderator");
  const isModeratorByPermission =
    permissionSet.has("*") ||
    rolePermissions.some((permission) =>
      permission.startsWith("member.") ||
      permission.startsWith("ticket.") ||
      permission.startsWith("temp_room.") ||
      permission === "message.search" ||
      permission === "message.pin" ||
      permission === "message.pin.view"
    );
  const isAdmin = isAdminByName || isAdminByPermission;
  const isModerator = isAdmin || isModeratorByName || isModeratorByPermission;
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
        applyBootstrap(bootstrap);
        setMaintenanceState(incidentMode.enabled ? incidentMode.state : null);

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

  const canSend = chat?.member.status === "active" && canSendText;
  const restrictionText =
    chat?.member.status === "muted"
      ? "You are muted in this chat. Sending is temporarily disabled."
      : chat?.member.status === "readonly"
        ? "This room is read-only for your role."
        : chat?.member.status === "banned"
          ? "You are banned from posting in this room."
          : chat?.member.status === "active" && !canSendText
            ? "Your role has read-only access with reactions only."
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
      const created = await apiRef.current.createMessage(chat.id, text, senderMode, identityId, replyToId);
      setMessages((prev) => {
        const withoutTemp = prev.filter((entry) => entry.id !== tempId);
        return mergeMessage(withoutTemp, created);
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
      isAdmin,
      isModerator,
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
