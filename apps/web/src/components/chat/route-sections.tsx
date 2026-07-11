"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ApiClient, ApiClientError } from "@/lib/api-client";
import { appConfig } from "@/lib/config";
import type {
  AdjustReputationResponse,
  AutomationExecution,
  AutomationRule,
  Bookmark,
  BroadcastCampaign,
  BroadcastCampaignStats,
  ChannelNotifyConfig,
  ChannelNotifyTestResult,
  ChatInvite,
  ChatMessage,
  ChatRole,
  E2EDevice,
  ExportHistoryResult,
  IncidentModeState,
  IntegrationWebhookView,
  JoinPolicy,
  JoinRequest,
  KnowledgeArticle,
  KnowledgeArticleStatus,
  LimitsOverview,
  ListTranslationsResponse,
  MemberProfileField,
  MembersOverview,
  ModerationHistoryEntry,
  PinnedMessageEntry,
  PermissionSimulationResult,
  Poll,
  PollResultsResponse,
  ReadReceiptMode,
  ReadReceiptPrivacyResponse,
  ReadReceiptsViewResponse,
  Reminder,
  SavedMessageView,
  ScheduledMessage,
  SearchMessagesQuery,
  TempRoom,
  Ticket,
  ThreadSubscription,
  TicketSlaStatsResponse,
  TranslateMessageResponse,
  WsReputationUpdatedPayload,
  WsThreadSubscriptionTriggeredPayload
} from "@/lib/types";
import {
  AdminPageScaffold,
  Button,
  Card,
  Composer,
  MessageBubble,
  PermissionGate,
  PinnedBanner,
  RestrictionHint,
  SectionTitle,
  StateBlock,
  TypingIndicator,
  type GlobalUiState
} from "@/design-system";
import { useChatRuntime, type UiMessage } from "@/components/chat/runtime-context";

type PanelError = {
  message: string;
  statusCode?: number;
};

const ROLE_BADGE_PERMISSION = "ui.role.badge.show";

function shortId(value: string): string {
  return value.length <= 8 ? value : value.slice(0, 8);
}

function hasRoleBadgePermission(permissions: string[]): boolean {
  return permissions.includes("*") || permissions.includes(ROLE_BADGE_PERMISSION);
}

function resolveAuthorLabel(message: Pick<ChatMessage, "authorId" | "displayAuthorId" | "displayAuthorName" | "displayAuthorUsername">, currentUserId?: string | null): string {
  if (currentUserId && message.authorId === currentUserId) {
    return "You";
  }
  if (message.displayAuthorName && message.displayAuthorName.trim().length > 0) {
    return message.displayAuthorName;
  }
  if (message.displayAuthorUsername && message.displayAuthorUsername.trim().length > 0) {
    return `@${message.displayAuthorUsername}`;
  }
  return shortId(message.displayAuthorId);
}

function getMessagePreview(message: UiMessage | ChatMessage): string {
  if (message.isDeleted) return "[deleted]";
  if (message.text && message.text.trim().length > 0) return message.text;
  if (message.isEncrypted) return "[encrypted payload]";
  if (message.media) return `[${message.media.type}] ${message.media.url}`;
  return "[empty message]";
}

function getDeletedMessageOriginalPreview(message: UiMessage | ChatMessage): string {
  if (message.text && message.text.trim().length > 0) return message.text;
  if (message.isEncrypted) return "[encrypted payload]";
  if (message.media) return `[${message.media.type}] ${message.media.url}`;
  return "[empty message]";
}

function getPanelState(statusCode?: number): GlobalUiState {
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 403) return "forbidden";
  if (statusCode === 404) return "not_found";
  if (statusCode === 429) return "rate_limited";
  return "error";
}

function parseError(error: unknown): PanelError {
  if (error instanceof ApiClientError) {
    return {
      message: error.message,
      statusCode: error.statusCode
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message
    };
  }

  return {
    message: "Unexpected error"
  };
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
}

function moderationActionLabel(action: ModerationHistoryEntry["action"]): string {
  switch (action) {
    case "member.mute":
      return "mute";
    case "member.unmute":
      return "unmute";
    case "member.timeout":
      return "timeout";
    case "member.timeout.clear":
      return "timeout cleared";
    case "member.kick":
      return "kick";
    case "member.ban":
      return "ban";
    case "member.unban":
      return "unban";
    case "message.delete":
      return "message deleted";
    default:
      return action;
  }
}

function buildDraftDefaultDateTimeValue(): string {
  const date = new Date(Date.now() + 30 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function csvList(input: string): string[] {
  return input
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function csvNumbers(input: string): number[] {
  return csvList(input)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.floor(entry));
}

const ROLE_PERMISSION_GROUPS: Array<{ label: string; permissions: string[] }> = [
  {
    label: "Chat Core",
    permissions: [
      "chat.view",
      "chat.join",
      "chat.leave",
      "message.send.text",
      "message.send.reply",
      "message.react",
      "message.edit.own",
      "message.delete.own",
      "message.deleted.view",
      "message.search",
      "message.pin.view"
    ]
  },
  {
    label: "Moderation",
    permissions: [
      "member.view_list",
      "member.mute",
      "member.unmute",
      "member.timeout.set",
      "member.timeout.clear",
      "member.kick",
      "member.ban",
      "member.unban"
    ]
  },
  {
    label: "Roles and Access",
    permissions: [
      "role.create",
      "role.update",
      "role.assign",
      "role.unassign",
      "permission.grant",
      "permission.revoke"
    ]
  },
  {
    label: "Advanced Sender and Features",
    permissions: [
      "message.send.as_group",
      "message.send.as_group.profile.select",
      "message.send.poll",
      "read_receipt.privacy.manage",
      "bookmark.create",
      "reminder.create",
      "thread.subscription.manage"
    ]
  },
  {
    label: "Admin Operations",
    permissions: [
      "limit.view",
      "limit.update.role",
      "channel.notify.enable",
      "channel.notify.disable",
      "channel.notify.frequency.edit",
      "broadcast.create",
      "broadcast.approve",
      "integration.webhook.create",
      "automation.rule.create",
      "incident_mode.enable",
      "audit.view"
    ]
  },
  {
    label: "Extended Chat and Invite",
    permissions: [
      "chat.invite.create",
      "chat.invite.revoke",
      "chat.invite.use_unlimited",
      "member.approve_join",
      "member.reject_join",
      "message.edit.any",
      "message.delete.any",
      "message.pin",
      "message.unpin"
    ]
  },
  {
    label: "Delivery and Drafts",
    permissions: [
      "draft.create",
      "draft.update",
      "draft.delete",
      "draft.schedule_send",
      "message.send.as_group.signature.hide",
      "message.send.as_group.signature.custom",
      "channel.notify.template.edit",
      "summary.unread.generate",
      "summary.unread.configure",
      "read_receipt.view.own",
      "read_receipt.view.any"
    ]
  },
  {
    label: "Broadcast and Integrations",
    permissions: [
      "integration.webhook.rotate_secret",
      "integration.webhook.disable",
      "broadcast.update",
      "broadcast.delete",
      "broadcast.publish.now",
      "broadcast.schedule",
      "broadcast.pause",
      "broadcast.resume",
      "broadcast.cancel",
      "broadcast.audience.manage",
      "broadcast.template.manage",
      "broadcast.stats.view"
    ]
  },
  {
    label: "Knowledge and Translation",
    permissions: [
      "knowledge.article.create",
      "knowledge.article.update",
      "knowledge.article.publish",
      "knowledge.article.archive",
      "translation.use",
      "translation.manage",
      "bookmark.collection.manage"
    ]
  },
  {
    label: "Security and Meta",
    permissions: [
      "e2e.device.register",
      "e2e.device.view",
      "poll.quiz.create",
      "poll.quiz.close",
      "poll.quiz.results.view",
      "ticket.create",
      "ticket.assign",
      "ticket.close",
      "ticket.sla.manage",
      "member.tag.create",
      "member.tag.assign",
      "member.profile_fields.manage",
      "automation.rule.update",
      "automation.rule.execute",
      "room.temp.create",
      "room.temp.archive",
      "room.temp.restore",
      "reputation.view",
      "reputation.adjust",
      "limit.update.user",
      "limit.reset.user",
      "slowmode.view",
      "slowmode.update",
      "ttl.view",
      "ttl.update",
      "incident_mode.disable",
      "incident_mode.policy.edit",
      "audit.export"
    ]
  },
  {
    label: "UI",
    permissions: [ROLE_BADGE_PERMISSION]
  }
];

const KNOWN_ROLE_PERMISSIONS = new Set(ROLE_PERMISSION_GROUPS.flatMap((group) => group.permissions));

const ROLE_PERMISSION_PRESETS: Record<string, string[]> = {
  member_default: [
    "chat.view",
    "chat.join",
    "chat.leave",
    "message.react"
  ],
  legit_limited: [
    "chat.view",
    "chat.join",
    "chat.leave",
    "message.send.text",
    "message.send.reply",
    "message.react",
    "message.edit.own",
    "message.delete.own"
  ],
  moderator_core: [
    "chat.view",
    "message.send.text",
    "message.send.reply",
    "message.react",
    "message.edit.own",
    "message.delete.own",
    "message.search",
    "message.pin.view",
    "member.view_list",
    "member.mute",
    "member.unmute",
    "member.timeout.set",
    "member.timeout.clear",
    "member.kick",
    "member.ban",
    "member.unban"
  ],
  admin_core: [
    "chat.view",
    "message.send.text",
    "message.send.reply",
    "message.react",
    "message.edit.own",
    "message.delete.own",
    "message.delete.any",
    "message.deleted.view",
    "message.edit.any",
    "message.search",
    "message.pin",
    "message.pin.view",
    "message.unpin",
    "member.view_list",
    "member.mute",
    "member.unmute",
    "member.timeout.set",
    "member.timeout.clear",
    "member.kick",
    "member.ban",
    "member.unban",
    "role.create",
    "role.update",
    "role.assign",
    "role.unassign",
    "permission.grant",
    "permission.revoke",
      "limit.view",
      "limit.update.role",
      "channel.notify.enable",
      "channel.notify.disable",
      "channel.notify.frequency.edit",
      "channel.notify.template.edit",
      "broadcast.create",
      "automation.rule.create",
      "incident_mode.enable",
    "audit.view"
  ],
  owner_all: ["*"]
};

function parseJsonOrThrow(input: string): unknown {
  const text = input.trim();
  if (!text) {
    return {};
  }
  return JSON.parse(text) as unknown;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function useAuthedApi() {
  const runtime = useChatRuntime();
  const api = useMemo(() => new ApiClient(appConfig.apiBaseUrl), []);

  useEffect(() => {
    api.setSession(runtime.session);
  }, [api, runtime.session]);

  return api;
}

function PanelErrorState({ error, onRetry }: { error: PanelError; onRetry: () => void }) {
  return (
    <StateBlock
      state={getPanelState(error.statusCode)}
      title={`Error ${error.statusCode ?? ""}`.trim()}
      description={error.message}
      onAction={onRetry}
      actionLabel="Retry"
    />
  );
}

export function ChatMainSection() {
  const runtime = useChatRuntime();
  const chatMainRef = useRef<HTMLElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const messageById = useMemo(
    () => new Map(runtime.messages.map((message) => [message.id, message] as const)),
    [runtime.messages]
  );
  const replyTargetMessage = useMemo(
    () => runtime.messages.find((message) => message.id === runtime.replyToMessageId) ?? null,
    [runtime.messages, runtime.replyToMessageId]
  );

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || !isNearBottom) {
      return;
    }
    feed.scrollTop = feed.scrollHeight;
  }, [isNearBottom, runtime.messages]);

  useEffect(() => {
    if (!selectedMessageId) {
      return;
    }
    if (!runtime.messages.some((message) => message.id === selectedMessageId)) {
      setSelectedMessageId(null);
    }
  }, [runtime.messages, selectedMessageId]);

  useEffect(() => {
    if (!selectedMessageId) {
      return;
    }

    function handleGlobalPointerDown(event: PointerEvent): void {
      const root = chatMainRef.current;
      if (!root) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!root.contains(target)) {
        setSelectedMessageId(null);
        return;
      }
      if (!(target instanceof Element)) {
        return;
      }
      const isMessageSurface = Boolean(
        target.closest(".ds-bubble, .ds-bubble-popover, .ds-reaction-pill, .ds-reaction-btn, .ds-action-row button")
      );
      if (!isMessageSurface) {
        setSelectedMessageId(null);
      }
    }

    document.addEventListener("pointerdown", handleGlobalPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleGlobalPointerDown, true);
    };
  }, [selectedMessageId]);

  return (
    <section className="chat-main" ref={chatMainRef}>
      <PinnedBanner message={`${runtime.chat?.name ?? "Phantom Lab"} is online. Keep the conversation clear and timely.`} />
      <div
        className="chat-feed"
        ref={feedRef}
        onScroll={(event) => {
          const target = event.currentTarget;
          const distance = target.scrollHeight - target.scrollTop - target.clientHeight;
          setIsNearBottom(distance < 72);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedMessageId(null);
          }
        }}
      >
        {runtime.messages.length === 0 ? (
          <StateBlock state="empty" title="No messages yet" description="Send the first message to start the thread." />
        ) : (
          runtime.messages.map((message) => (
            <MessageBubble
              key={message.id}
              item={{
                id: message.id,
                own: message.authorId === runtime.currentUserId,
                authorId: message.authorId,
                authorName: resolveAuthorLabel(message, runtime.currentUserId),
                roleBadgeText:
                  message.displayAuthorType === "user" && message.authorRoleBadgeEnabled && message.authorRoleName
                    ? message.authorRoleName
                    : undefined,
                replyTo: message.replyToId
                  ? (() => {
                      const target = messageById.get(message.replyToId);
                      if (!target) {
                        return {
                          author: "Message",
                          text: "Original message"
                        };
                      }
                      return {
                        author: resolveAuthorLabel(target, runtime.currentUserId),
                        text: getMessagePreview(target)
                      };
                    })()
                  : null,
                text: message.isDeleted ? "Messagio Eliminato" : getMessagePreview(message),
                deletedOriginalText: message.isDeleted ? getDeletedMessageOriginalPreview(message) : undefined,
                canRevealDeletedContent: message.isDeleted && runtime.canViewDeletedMessages,
                createdAtLabel: new Date(message.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit"
                }),
                edited: message.updatedAt !== message.createdAt,
                encrypted: Boolean(message.isEncrypted),
                deleted: message.isDeleted,
                canDelete: message.authorId === runtime.currentUserId || runtime.canDeleteAnyMessages,
                failed: message.localStatus === "failed",
                status: message.localStatus === "pending" ? "pending" : "read",
                reactions: runtime.reactionByMessage[message.id] ?? []
              }}
              selected={selectedMessageId === message.id}
              selectedReaction={runtime.ownReactionByMessage[message.id]}
              onSelect={() => {
                setSelectedMessageId((prev) => (prev === message.id ? null : message.id));
              }}
              onOpenActions={() => {
                setSelectedMessageId(message.id);
              }}
              onReply={() => {
                runtime.setReplyToMessageId(message.id);
                setSelectedMessageId(message.id);
              }}
              onAddReaction={async (reaction) => {
                await runtime.onAddReaction(message.id, reaction);
                setSelectedMessageId(null);
              }}
              onRemoveReaction={async () => {
                await runtime.onRemoveReaction(message.id);
                setSelectedMessageId(null);
              }}
              onEdit={() => runtime.onEdit(message.id, message.text)}
              onDelete={
                message.authorId === runtime.currentUserId || runtime.canDeleteAnyMessages
                  ? () => runtime.onDelete(message.id)
                  : undefined
              }
            />
          ))
        )}
      </div>
      {!isNearBottom ? (
        <div className="chat-scroll-actions">
          <button
            type="button"
            className="chat-scroll-bottom-btn"
            onClick={() => {
              const feed = feedRef.current;
              if (!feed) {
                return;
              }
              feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
              setIsNearBottom(true);
            }}
          >
            Jump to latest
          </button>
        </div>
      ) : null}
      <TypingIndicator users={runtime.typingUsers.map(shortId)} />
      {runtime.restrictionText ? <RestrictionHint message={runtime.restrictionText} variant="warning" /> : null}
      <Composer
        draft={runtime.draft}
        sending={runtime.sending}
        disabled={!runtime.canSend}
        replyPreview={
          replyTargetMessage
            ? {
                author: resolveAuthorLabel(replyTargetMessage, runtime.currentUserId),
                text: getMessagePreview(replyTargetMessage)
              }
            : null
        }
        onCancelReply={runtime.clearReplyToMessage}
        senderMode={runtime.senderMode}
        senderOptions={runtime.senderOptions}
        onSenderModeChange={runtime.setSenderMode}
        onChange={runtime.setDraft}
        onTyping={runtime.onTyping}
        onSubmit={runtime.onSubmit}
      />
    </section>
  );
}

function MessageListCard({ title, subtitle, messages }: { title: string; subtitle?: string; messages: ChatMessage[] }) {
  return (
    <Card className="app-tab-card">
      <SectionTitle title={title} subtitle={subtitle} />
      {messages.length === 0 ? (
        <StateBlock state="empty" title="No messages found" description="Try changing filters or search query." />
      ) : (
        <div className="panel-list">
          {messages.map((message) => (
            <article key={message.id} className="panel-item">
              <header>
                <strong>{resolveAuthorLabel(message)}</strong>
                <time>{formatDateTime(message.createdAt)}</time>
              </header>
              <p>{getMessagePreview(message)}</p>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

export function SearchSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();

  const [query, setQuery] = useState("");
  const [contentType, setContentType] = useState<"any" | "text" | "media">("any");
  const [results, setResults] = useState<ChatMessage[]>([]);
  const [savedViews, setSavedViews] = useState<SavedMessageView[]>([]);
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);

  const loadSavedViews = useCallback(async () => {
    try {
      const views = await api.listSavedViews(runtime.chatId);
      setSavedViews(views);
    } catch {
      // Keep search usable even if saved views fail.
    }
  }, [api, runtime.chatId]);

  const runSearch = useCallback(
    async (params?: SearchMessagesQuery) => {
      setUpdating(true);
      setError(null);
      try {
        const payload: SearchMessagesQuery = params ?? {
          q: query.trim() || undefined,
          content_type: contentType,
          limit: 100
        };
        const list = await api.searchMessages(runtime.chatId, payload);
        setResults(list);
        setState("ready");
      } catch (searchError) {
        const parsed = parseError(searchError);
        setError(parsed);
        setState(getPanelState(parsed.statusCode));
      } finally {
        setUpdating(false);
      }
    },
    [api, contentType, query, runtime.chatId]
  );

  useEffect(() => {
    let alive = true;
    async function bootstrap(): Promise<void> {
      setState("loading");
      setError(null);
      try {
        const [list, views] = await Promise.all([
          api.searchMessages(runtime.chatId, { q: "", limit: 50 }),
          api.listSavedViews(runtime.chatId)
        ]);
        if (!alive) return;
        setResults(list);
        setSavedViews(views);
        setState("ready");
      } catch (bootstrapError) {
        if (!alive) return;
        const parsed = parseError(bootstrapError);
        setError(parsed);
        setState(getPanelState(parsed.statusCode));
      }
    }
    void bootstrap();
    return () => {
      alive = false;
    };
  }, [api, runtime.chatId]);

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await runSearch();
  }

  async function handleSaveView(): Promise<void> {
    const name = window.prompt("Saved view name");
    if (!name) {
      return;
    }

    const filters: Record<string, unknown> = {
      q: query.trim() || null,
      content_type: contentType
    };

    setUpdating(true);
    try {
      await api.createSavedView(runtime.chatId, name.trim(), filters);
      await loadSavedViews();
    } catch (saveError) {
      setError(parseError(saveError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleDeleteView(viewId: string): Promise<void> {
    setUpdating(true);
    try {
      await api.deleteSavedView(runtime.chatId, viewId);
      await loadSavedViews();
    } catch (deleteError) {
      setError(parseError(deleteError));
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void runSearch({ q: "", limit: 50 })} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <StateBlock state={updating ? "updating" : "ready"}>
      <Card className="app-tab-card">
        <SectionTitle title="Search" subtitle="Connected to /messages/search and /messages/saved-views." />
        <form className="panel-form" onSubmit={handleSearchSubmit}>
          <label>
            Query
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages..." />
          </label>
          <label>
            Content type
            <select value={contentType} onChange={(event) => setContentType(event.target.value as "any" | "text" | "media")}>
              <option value="any">Any</option>
              <option value="text">Text</option>
              <option value="media">Media</option>
            </select>
          </label>
          <div className="panel-actions">
            <Button type="submit">Search</Button>
            <Button type="button" variant="secondary" onClick={() => void handleSaveView()}>
              Save view
            </Button>
          </div>
        </form>

        {savedViews.length > 0 ? (
          <div className="panel-chip-list">
            {savedViews.map((view) => {
              const viewQuery =
                typeof view.filters.q === "string" ? view.filters.q : typeof view.filters.query === "string" ? view.filters.query : "";
              const viewContentType =
                view.filters.content_type === "text" || view.filters.content_type === "media"
                  ? (view.filters.content_type as "text" | "media")
                  : "any";

              return (
                <div key={view.id} className="panel-chip">
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(viewQuery);
                      setContentType(viewContentType);
                      void runSearch({
                        q: viewQuery || undefined,
                        content_type: viewContentType,
                        limit: 100
                      });
                    }}
                  >
                    {view.name}
                  </button>
                  <button type="button" className="danger" onClick={() => void handleDeleteView(view.id)}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

        <div className="panel-list">
          {results.length === 0 ? (
            <StateBlock state="empty" title="No messages matched" description="Try broader query or another content type." />
          ) : (
            results.map((message) => (
              <article key={message.id} className="panel-item">
                <header>
                  <strong>{resolveAuthorLabel(message)}</strong>
                  <time>{formatDateTime(message.createdAt)}</time>
                </header>
                <p>{getMessagePreview(message)}</p>
              </article>
            ))
          )}
        </div>
      </Card>
    </StateBlock>
  );
}

export function PinnedSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [items, setItems] = useState<PinnedMessageEntry[]>([]);
  const [state, setState] = useState<GlobalUiState>("loading");
  const [error, setError] = useState<PanelError | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const result = await api.listPinnedMessages(runtime.chatId);
      setItems(result);
      setState("ready");
    } catch (loadError) {
      const parsed = parseError(loadError);
      setError(parsed);
      setState(getPanelState(parsed.statusCode));
    }
  }, [api, runtime.chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void load()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <Card className="app-tab-card">
      <SectionTitle title="Pinned Messages" subtitle="Live data from /messages/pinned." />
      <div className="panel-actions">
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {items.length === 0 ? (
        <StateBlock state="empty" title="No pinned messages" description="Pin a message from chat feed to see it here." />
      ) : (
        <div className="panel-list">
          {items.map((entry) => (
            <article key={entry.message.id} className="panel-item">
              <header>
                <strong>{resolveAuthorLabel(entry.message)}</strong>
                <time>pinned: {formatDateTime(entry.pinnedAt)}</time>
              </header>
              <p>{getMessagePreview(entry.message)}</p>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

export function DraftsSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [draftText, setDraftText] = useState("");
  const [scheduledAt, setScheduledAt] = useState(buildDraftDefaultDateTimeValue);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const result = await api.listDrafts(runtime.chatId);
      setItems(result);
      setState("ready");
    } catch (loadError) {
      const parsed = parseError(loadError);
      setError(parsed);
      setState(getPanelState(parsed.statusCode));
    }
  }, [api, runtime.chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const text = draftText.trim();
    if (!text) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const iso = new Date(scheduledAt).toISOString();
      await api.createDraft(runtime.chatId, iso, {
        text,
        sender_mode: "as_user"
      });
      setDraftText("");
      setScheduledAt(buildDraftDefaultDateTimeValue());
      await load();
    } catch (createError) {
      setError(parseError(createError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleCancelDraft(draftId: string): Promise<void> {
    setUpdating(true);
    setError(null);
    try {
      await api.deleteDraft(runtime.chatId, draftId);
      await load();
    } catch (cancelError) {
      setError(parseError(cancelError));
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void load()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <StateBlock state={updating ? "updating" : "ready"}>
      <Card className="app-tab-card">
        <SectionTitle title="Drafts Workspace" subtitle="Connected to /drafts and scheduled message payloads." />
        <form className="panel-form" onSubmit={handleCreate}>
          <label>
            Draft text
            <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} rows={3} />
          </label>
          <label>
            Schedule at
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
          <div className="panel-actions">
            <Button type="submit">Create draft</Button>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </form>

        {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

        {items.length === 0 ? (
          <StateBlock state="empty" title="No drafts" description="Create a scheduled draft to see it listed here." />
        ) : (
          <div className="panel-list">
            {items.map((item) => (
              <article key={item.id} className="panel-item">
                <header>
                  <strong>{item.status}</strong>
                  <time>{formatDateTime(item.scheduledAt)}</time>
                </header>
                <p>{item.payload.text ?? "[no text]"}</p>
                <div className="panel-actions">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void handleCancelDraft(item.id)}
                    disabled={item.status !== "scheduled"}
                  >
                    Cancel
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </StateBlock>
  );
}

export function BookmarksSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [items, setItems] = useState<Bookmark[]>([]);
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [messageId, setMessageId] = useState("");
  const [collection, setCollection] = useState("default");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const result = await api.listBookmarks(runtime.chatId);
      setItems(result);
      setState("ready");
    } catch (loadError) {
      const parsed = parseError(loadError);
      setError(parsed);
      setState(getPanelState(parsed.statusCode));
    }
  }, [api, runtime.chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!messageId.trim()) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.createBookmark(runtime.chatId, messageId.trim(), {
        collection: collection.trim() || "default",
        note: note.trim() || undefined
      });
      setMessageId("");
      setNote("");
      await load();
    } catch (createError) {
      setError(parseError(createError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete(bookmarkId: string): Promise<void> {
    setUpdating(true);
    setError(null);
    try {
      await api.deleteBookmark(runtime.chatId, bookmarkId);
      await load();
    } catch (deleteError) {
      setError(parseError(deleteError));
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void load()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <StateBlock state={updating ? "updating" : "ready"}>
      <Card className="app-tab-card">
        <SectionTitle title="Bookmarks" subtitle="Connected to /bookmarks* contracts." />
        <form className="panel-form" onSubmit={handleCreate}>
          <label>
            Message ID
            <input value={messageId} onChange={(event) => setMessageId(event.target.value)} placeholder="msg_..." />
          </label>
          <label>
            Collection
            <input value={collection} onChange={(event) => setCollection(event.target.value)} />
          </label>
          <label>
            Note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
          </label>
          <div className="panel-actions">
            <Button type="submit">Save bookmark</Button>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </form>

        {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

        {items.length === 0 ? (
          <StateBlock state="empty" title="No bookmarks" description="Add a message ID to create your first bookmark." />
        ) : (
          <div className="panel-list">
            {items.map((bookmark) => (
              <article key={bookmark.id} className="panel-item">
                <header>
                  <strong>{bookmark.collection}</strong>
                  <time>{formatDateTime(bookmark.createdAt)}</time>
                </header>
                <p>message: {bookmark.messageId}</p>
                {bookmark.note ? <p>{bookmark.note}</p> : null}
                <div className="panel-actions">
                  <Button variant="danger" size="sm" onClick={() => void handleDelete(bookmark.id)}>
                    Delete
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </StateBlock>
  );
}

export function RemindersSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [items, setItems] = useState<Reminder[]>([]);
  const [keywordAlerts, setKeywordAlerts] = useState<Array<{ id: string; keyword: string; isActive: boolean }>>([]);
  const [unreadSummary, setUnreadSummary] = useState<string>("");
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [statusFilter, setStatusFilter] = useState<Reminder["status"] | "all">("all");
  const [messageId, setMessageId] = useState("");
  const [remindAt, setRemindAt] = useState(buildDraftDefaultDateTimeValue);
  const [note, setNote] = useState("");
  const [newKeyword, setNewKeyword] = useState("");

  const load = useCallback(
    async (status: Reminder["status"] | "all" = statusFilter) => {
      setState("loading");
      setError(null);
      try {
        const [result, alerts, summary] = await Promise.all([
          api.listReminders(runtime.chatId, status === "all" ? undefined : status),
          api.listKeywordAlerts(runtime.chatId),
          api.getUnreadSummary(runtime.chatId)
        ]);
        setItems(result);
        setKeywordAlerts(alerts.map((alert) => ({ id: alert.id, keyword: alert.keyword, isActive: alert.isActive })));
        setUnreadSummary(summary.summary);
        setState("ready");
      } catch (loadError) {
        const parsed = parseError(loadError);
        setError(parsed);
        setState(getPanelState(parsed.statusCode));
      }
    },
    [api, runtime.chatId, statusFilter]
  );

  useEffect(() => {
    void load(statusFilter);
  }, [load, statusFilter]);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!messageId.trim()) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.createReminder(runtime.chatId, {
        message_id: messageId.trim(),
        remind_at: new Date(remindAt).toISOString(),
        note: note.trim() || undefined
      });
      setMessageId("");
      setNote("");
      setRemindAt(buildDraftDefaultDateTimeValue());
      await load(statusFilter);
    } catch (createError) {
      setError(parseError(createError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleCancel(reminderId: string): Promise<void> {
    setUpdating(true);
    setError(null);
    try {
      await api.cancelReminder(runtime.chatId, reminderId, "Canceled from UI");
      await load(statusFilter);
    } catch (cancelError) {
      setError(parseError(cancelError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleCreateKeyword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const keyword = newKeyword.trim();
    if (!keyword) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.createKeywordAlert(runtime.chatId, keyword);
      setNewKeyword("");
      await load(statusFilter);
    } catch (keywordError) {
      setError(parseError(keywordError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleDeleteKeyword(alertId: string): Promise<void> {
    setUpdating(true);
    setError(null);
    try {
      await api.deleteKeywordAlert(runtime.chatId, alertId);
      await load(statusFilter);
    } catch (keywordError) {
      setError(parseError(keywordError));
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void load(statusFilter)} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <StateBlock state={updating ? "updating" : "ready"}>
      <Card className="app-tab-card">
        <SectionTitle title="Reminders" subtitle="Connected to /reminders* contracts." />
        <div className="panel-toolbar">
          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as Reminder["status"] | "all")}
            >
              <option value="all">All</option>
              <option value="scheduled">Scheduled</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="canceled">Canceled</option>
            </select>
          </label>
          <Button variant="secondary" onClick={() => void load(statusFilter)}>
            Refresh
          </Button>
        </div>
        <form className="panel-form" onSubmit={handleCreate}>
          <label>
            Message ID
            <input value={messageId} onChange={(event) => setMessageId(event.target.value)} />
          </label>
          <label>
            Remind at
            <input type="datetime-local" value={remindAt} onChange={(event) => setRemindAt(event.target.value)} />
          </label>
          <label>
            Note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
          </label>
          <div className="panel-actions">
            <Button type="submit">Create reminder</Button>
          </div>
        </form>

        {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

        {items.length === 0 ? (
          <StateBlock state="empty" title="No reminders" description="Create a reminder for a message to track follow-ups." />
        ) : (
          <div className="panel-list">
            {items.map((reminder) => (
              <article key={reminder.id} className="panel-item">
                <header>
                  <strong>{reminder.status}</strong>
                  <time>{formatDateTime(reminder.remindAt)}</time>
                </header>
                <p>message: {reminder.messageId}</p>
                {reminder.note ? <p>{reminder.note}</p> : null}
                <div className="panel-actions">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void handleCancel(reminder.id)}
                    disabled={reminder.status !== "scheduled"}
                  >
                    Cancel
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        <section className="panel-subcard">
          <SectionTitle title="Keyword Alerts" subtitle="Connected to /alerts/keywords." />
          <form className="panel-form" onSubmit={handleCreateKeyword}>
            <label>
              Keyword
              <input value={newKeyword} onChange={(event) => setNewKeyword(event.target.value)} placeholder="urgent" />
            </label>
            <div className="panel-actions">
              <Button type="submit">Add keyword</Button>
            </div>
          </form>
          {keywordAlerts.length === 0 ? (
            <StateBlock state="empty" title="No keyword alerts" description="Add a keyword to start tracking mentions." />
          ) : (
            <div className="panel-chip-list">
              {keywordAlerts.map((alert) => (
                <div key={alert.id} className="panel-chip">
                  <span>{alert.keyword}</span>
                  <button type="button" className="danger" onClick={() => void handleDeleteKeyword(alert.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel-subcard">
          <SectionTitle title="Unread Summary" subtitle="Connected to /unread-summary." />
          <div className="panel-actions">
            <Button variant="secondary" onClick={() => void load(statusFilter)}>
              Refresh summary
            </Button>
          </div>
          {unreadSummary ? <p className="panel-summary">{unreadSummary}</p> : <StateBlock state="empty" title="No unread summary" />}
        </section>
      </Card>
    </StateBlock>
  );
}

export function ReadReceiptsSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();

  const [privacy, setPrivacy] = useState<ReadReceiptPrivacyResponse | null>(null);
  const [view, setView] = useState<ReadReceiptsViewResponse | null>(null);
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);

  const [mode, setMode] = useState<ReadReceiptMode>("private");
  const [targetUserId, setTargetUserId] = useState("");
  const [allowCrossRoleView, setAllowCrossRoleView] = useState(false);
  const [messageId, setMessageId] = useState("");
  const [readAt, setReadAt] = useState("");

  const loadPrivacy = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const response = await api.getReadReceiptPrivacy(runtime.chatId);
      setPrivacy(response);
      setMode(response.mode);
      setAllowCrossRoleView(response.policy.allowCrossRoleView);
      setState("ready");
    } catch (loadError) {
      const parsed = parseError(loadError);
      setError(parsed);
      setState(getPanelState(parsed.statusCode));
    }
  }, [api, runtime.chatId]);

  useEffect(() => {
    void loadPrivacy();
  }, [loadPrivacy]);

  async function handleSavePrivacy(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setUpdating(true);
    setError(null);
    try {
      const patch: {
        mode?: ReadReceiptMode;
        target_user_id?: string;
        allow_cross_role_view?: boolean;
      } = {
        mode
      };

      if (privacy?.canManage) {
        patch.allow_cross_role_view = allowCrossRoleView;
        if (targetUserId.trim()) {
          patch.target_user_id = targetUserId.trim();
        }
      }

      await api.updateReadReceiptPrivacy(runtime.chatId, patch);
      await loadPrivacy();
    } catch (saveError) {
      setError(parseError(saveError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleMarkRead(): Promise<void> {
    const id = messageId.trim();
    if (!id) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const iso = readAt.trim() ? new Date(readAt).toISOString() : undefined;
      await api.markReadReceipt(runtime.chatId, id, iso);
      const nextView = await api.getReadReceipts(runtime.chatId, id);
      setView(nextView);
    } catch (markError) {
      setError(parseError(markError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleLoadMessageReceipts(): Promise<void> {
    const id = messageId.trim();
    if (!id) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const nextView = await api.getReadReceipts(runtime.chatId, id);
      setView(nextView);
    } catch (viewError) {
      setError(parseError(viewError));
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void loadPrivacy()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <StateBlock state={updating ? "updating" : "ready"}>
      <Card className="app-tab-card">
        <SectionTitle title="Read Receipts" subtitle="Connected to /read-receipts/privacy and /read-receipts/:messageId." />
        <form className="panel-form" onSubmit={handleSavePrivacy}>
          <label>
            Privacy mode
            <select value={mode} onChange={(event) => setMode(event.target.value as ReadReceiptMode)}>
              <option value="off">off</option>
              <option value="private">private</option>
              <option value="role_visible">role_visible</option>
              <option value="global">global</option>
            </select>
          </label>
          <label>
            Target user ID (optional)
            <input
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
              disabled={!privacy?.canManage}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={allowCrossRoleView}
              onChange={(event) => setAllowCrossRoleView(event.target.checked)}
              disabled={!privacy?.canManage}
            />
            {" "}Allow cross-role view
          </label>
          <div className="panel-actions">
            <Button type="submit">Save privacy</Button>
            <Button type="button" variant="secondary" onClick={() => void loadPrivacy()}>
              Refresh privacy
            </Button>
          </div>
        </form>
        <p className="panel-summary">
          current mode: <strong>{privacy?.mode ?? "-"}</strong> | can_manage:{" "}
          <strong>{privacy?.canManage ? "true" : "false"}</strong>
        </p>

        <section className="panel-subcard">
          <SectionTitle title="Mark and Inspect Message" subtitle="Use message id to store and read receipts visibility." />
          <div className="panel-form">
            <label>
              Message ID
              <input value={messageId} onChange={(event) => setMessageId(event.target.value)} placeholder="msg_..." />
            </label>
            <label>
              Read at (optional)
              <input type="datetime-local" value={readAt} onChange={(event) => setReadAt(event.target.value)} />
            </label>
            <div className="panel-actions">
              <Button onClick={() => void handleMarkRead()}>Mark read</Button>
              <Button variant="secondary" onClick={() => void handleLoadMessageReceipts()}>
                View receipts
              </Button>
            </div>
          </div>
        </section>

        {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

        <section className="panel-subcard">
          <SectionTitle title="Receipt View Result" subtitle="Totals, role distribution and visible readers." />
          {!view ? (
            <StateBlock state="empty" title="No message selected" description="Enter message id and load receipts." />
          ) : (
            <div className="panel-list">
              <article className="panel-item">
                <header>
                  <strong>{view.messageId}</strong>
                  <time>mode: {view.mode}</time>
                </header>
                <p>
                  own_read_at: {view.ownReadAt ? formatDateTime(view.ownReadAt) : "-"} | readers: {view.totals.readers} | visible:{" "}
                  {view.totals.visible_readers} | hidden: {view.totals.hidden_readers}
                </p>
              </article>
              {view.byRole.map((entry) => (
                <article key={entry.roleId} className="panel-item">
                  <header>
                    <strong>role: {entry.roleId}</strong>
                    <time>{entry.count}</time>
                  </header>
                  <p>visible readers in this role: {entry.count}</p>
                </article>
              ))}
              {view.readers.map((reader) => (
                <article key={`${reader.userId}:${reader.readAt}`} className="panel-item">
                  <header>
                    <strong>{reader.userId}</strong>
                    <time>{formatDateTime(reader.readAt)}</time>
                  </header>
                  <p>role: {reader.roleId}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </Card>
    </StateBlock>
  );
}

export function ThreadSubscriptionsSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [items, setItems] = useState<ThreadSubscription[]>([]);
  const [triggers, setTriggers] = useState<WsThreadSubscriptionTriggeredPayload[]>([]);
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);

  const [messageId, setMessageId] = useState("");
  const [subscriptionType, setSubscriptionType] = useState<"thread" | "message">("thread");
  const [telegramNotify, setTelegramNotify] = useState(false);
  const [dedupWindowSeconds, setDedupWindowSeconds] = useState("300");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setState("loading");
      } else {
        setUpdating(true);
      }
      setError(null);
      try {
        const list = await api.listThreadSubscriptions(runtime.chatId);
        setItems(list.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "")));
        if (!silent) {
          setState("ready");
        }
      } catch (loadError) {
        const parsed = parseError(loadError);
        setError(parsed);
        if (!silent) {
          setState(getPanelState(parsed.statusCode));
        }
      } finally {
        if (silent) {
          setUpdating(false);
        }
      }
    },
    [api, runtime.chatId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!runtime.wsConnected) {
      return;
    }
    if (state !== "ready" && state !== "updating") {
      return;
    }

    if (liveRefreshTimerRef.current) {
      clearTimeout(liveRefreshTimerRef.current);
    }
    liveRefreshTimerRef.current = setTimeout(() => {
      void load(true);
    }, 500);

    return () => {
      if (liveRefreshTimerRef.current) {
        clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
    };
  }, [load, runtime.liveInvalidation.threadSubscriptions, runtime.wsConnected, state]);

  useEffect(() => {
    if (runtime.liveThreadSubscriptionTriggers.length === 0) {
      return;
    }

    setTriggers((prev) => {
      const seen = new Set(prev.map((entry) => `${entry.subscriptionId}:${entry.triggerMessageId}`));
      const incoming = runtime.liveThreadSubscriptionTriggers.filter((entry) => {
        const key = `${entry.subscriptionId}:${entry.triggerMessageId}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      const next = [...incoming, ...prev];
      return next.slice(0, 100);
    });
  }, [runtime.liveThreadSubscriptionTriggers]);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const id = messageId.trim();
    if (!id) {
      return;
    }

    const dedup = Number(dedupWindowSeconds);
    if (!Number.isFinite(dedup) || dedup < 30) {
      setError({ message: "Dedup window must be at least 30 seconds." });
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.createThreadSubscription(runtime.chatId, {
        message_id: id,
        subscription_type: subscriptionType,
        telegram_notify: telegramNotify,
        dedup_window_seconds: Math.floor(dedup)
      });
      setMessageId("");
      await load();
    } catch (createError) {
      setError(parseError(createError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete(subscriptionId: string): Promise<void> {
    setUpdating(true);
    setError(null);
    try {
      await api.deleteThreadSubscription(runtime.chatId, subscriptionId);
      await load();
    } catch (deleteError) {
      setError(parseError(deleteError));
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void load()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <StateBlock state={updating ? "updating" : "ready"}>
      <Card className="app-tab-card">
        <SectionTitle title="Thread Subscriptions" subtitle="Connected to /thread-subscriptions and WS trigger event." />
        <form className="panel-form" onSubmit={handleCreate}>
          <label>
            Source message ID
            <input value={messageId} onChange={(event) => setMessageId(event.target.value)} placeholder="msg_..." />
          </label>
          <label>
            Subscription type
            <select value={subscriptionType} onChange={(event) => setSubscriptionType(event.target.value as "thread" | "message")}>
              <option value="thread">thread</option>
              <option value="message">message</option>
            </select>
          </label>
          <label>
            Dedup window seconds
            <input
              type="number"
              min={30}
              value={dedupWindowSeconds}
              onChange={(event) => setDedupWindowSeconds(event.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={telegramNotify}
              onChange={(event) => setTelegramNotify(event.target.checked)}
            />
            {" "}Telegram notify
          </label>
          <div className="panel-actions">
            <Button type="submit">Create subscription</Button>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </form>

        {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

        <section className="panel-subcard">
          <SectionTitle title="Active Subscriptions" subtitle="Your stored subscriptions for this chat." />
          {items.length === 0 ? (
            <StateBlock state="empty" title="No subscriptions" description="Create a subscription to receive thread trigger events." />
          ) : (
            <div className="panel-list">
              {items.map((item) => (
                <article key={item.id} className="panel-item">
                  <header>
                    <strong>{item.id}</strong>
                    <time>{item.subscriptionType}</time>
                  </header>
                  <p>
                    message: {item.messageId} | dedup: {item.dedupWindowSeconds}s | active: {item.isActive ? "true" : "false"} | notify:{" "}
                    {item.telegramNotify ? "true" : "false"}
                  </p>
                  <p>last_triggered_at: {item.lastTriggeredAt ? formatDateTime(item.lastTriggeredAt) : "-"}</p>
                  <div className="panel-actions">
                    <Button variant="danger" size="sm" onClick={() => void handleDelete(item.id)}>
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel-subcard">
          <SectionTitle title="Recent Trigger Events" subtitle="Live WS stream from thread.subscription.triggered." />
          {triggers.length === 0 ? (
            <StateBlock state="empty" title="No trigger events yet" description="Reply to subscribed message from another user to trigger event." />
          ) : (
            <div className="panel-list">
              {triggers.map((trigger) => (
                <article key={`${trigger.subscriptionId}:${trigger.triggerMessageId}`} className="panel-item">
                  <header>
                    <strong>{trigger.subscriptionId}</strong>
                    <time>{shortId(trigger.subscriberUserId)}</time>
                  </header>
                  <p>
                    source: {trigger.sourceMessageId} | trigger: {trigger.triggerMessageId}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </Card>
    </StateBlock>
  );
}

export function ChannelNotifyAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();

  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [config, setConfig] = useState<ChannelNotifyConfig | null>(null);
  const [testResult, setTestResult] = useState<ChannelNotifyTestResult | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<"off" | "instant" | "digest">("off");
  const [template, setTemplate] = useState("{author_name} posted a new message.\nTap the button below to view.");
  const [digestIntervalMinutes, setDigestIntervalMinutes] = useState("60");
  const [messagePreview, setMessagePreview] = useState("Test channel notification");
  const [deliver, setDeliver] = useState(false);
  const canEnableNotify = runtime.hasPermission("channel.notify.enable");
  const canDisableNotify = runtime.hasPermission("channel.notify.disable");
  const canEditNotifyTemplate = runtime.hasPermission("channel.notify.template.edit");
  const canEditNotifyFrequency = runtime.hasPermission("channel.notify.frequency.edit");

  function syncConfig(next: ChannelNotifyConfig): void {
    setConfig(next);
    setEnabled(next.enabled);
    setMode(next.mode);
    setTemplate(next.template);
    setDigestIntervalMinutes(String(next.digestIntervalMinutes));
  }

  const loadConfig = useCallback(async (): Promise<void> => {
    setState("loading");
    setError(null);
    try {
      const next = await api.getChannelNotifyConfig(runtime.chatId);
      syncConfig(next);
      setState("ready");
    } catch (loadError) {
      setError(parseError(loadError));
      setState("error");
    }
  }, [api, runtime.chatId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function handleSaveConfig(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const digest = Number(digestIntervalMinutes);
    if (!Number.isFinite(digest) || digest < 1 || digest > 1440) {
      setError({ message: "Digest interval must be between 1 and 1440 minutes." });
      return;
    }

    const trimmedTemplate = template.trim();
    const patch: {
      enabled?: boolean;
      mode?: "off" | "instant" | "digest";
      template?: string;
      digestIntervalMinutes?: number;
    } = {};
    const baseline = config;

    if (!baseline || enabled !== baseline.enabled) {
      if (enabled && !canEnableNotify) {
        setError({ message: "Missing permission: channel.notify.enable" });
        return;
      }
      if (!enabled && !canDisableNotify) {
        setError({ message: "Missing permission: channel.notify.disable" });
        return;
      }
      patch.enabled = enabled;
    }

    if (!baseline || mode !== baseline.mode) {
      if (!canEditNotifyFrequency) {
        setError({ message: "Missing permission: channel.notify.frequency.edit" });
        return;
      }
      patch.mode = mode;
    }

    if (!baseline || Math.floor(digest) !== baseline.digestIntervalMinutes) {
      if (!canEditNotifyFrequency) {
        setError({ message: "Missing permission: channel.notify.frequency.edit" });
        return;
      }
      patch.digestIntervalMinutes = Math.floor(digest);
    }

    if (!baseline || trimmedTemplate !== baseline.template) {
      if (!canEditNotifyTemplate) {
        setError({ message: "Missing permission: channel.notify.template.edit" });
        return;
      }
      patch.template = trimmedTemplate;
    }

    if (Object.keys(patch).length === 0) {
      setError({ message: "No changes to save." });
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.updateChannelNotifyConfig(runtime.chatId, patch);
      await loadConfig();
    } catch (saveError) {
      setError(parseError(saveError));
      setState("error");
    } finally {
      setUpdating(false);
    }
  }

  async function handleTest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setUpdating(true);
    setError(null);
    try {
      const result = await api.testChannelNotify(runtime.chatId, {
        messagePreview: messagePreview.trim() || undefined,
        deliver
      });
      setTestResult(result);
      syncConfig(result.config);
      setState("ready");
    } catch (testError) {
      setError(parseError(testError));
      setState("error");
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void loadConfig()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY["channel-notify"] ?? [])}
      hint="Channel notify permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Channel Notify Config" subtitle="Connected to /channel-notify/config and /channel-notify/test.">
          <AdminNavChips />
          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <section className="panel-subcard">
            <SectionTitle title="Config Patch" subtitle="Loaded from /channel-notify/config and persisted with PATCH." />
            <form className="panel-form" onSubmit={handleSaveConfig}>
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  disabled={enabled ? !canDisableNotify : !canEnableNotify}
                />
                {" "}Enabled
              </label>
              <label>
                Mode
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as "off" | "instant" | "digest")}
                  disabled={!canEditNotifyFrequency}
                >
                  <option value="off">off</option>
                  <option value="instant">instant</option>
                  <option value="digest">digest</option>
                </select>
              </label>
              <label>
                Digest interval minutes
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={digestIntervalMinutes}
                  onChange={(event) => setDigestIntervalMinutes(event.target.value)}
                  disabled={!canEditNotifyFrequency}
                />
              </label>
              <label>
                Template
                <textarea
                  value={template}
                  onChange={(event) => setTemplate(event.target.value)}
                  rows={4}
                  disabled={!canEditNotifyTemplate}
                />
              </label>
              <div className="panel-actions">
                <Button
                  type="submit"
                  disabled={
                    updating ||
                    (!canEnableNotify && !canDisableNotify && !canEditNotifyTemplate && !canEditNotifyFrequency)
                  }
                >
                  Save config
                </Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Template Test" subtitle="Dry-run render with optional delivery attempt." />
            <form className="panel-form" onSubmit={handleTest}>
              <label>
                Message preview
                <input value={messagePreview} onChange={(event) => setMessagePreview(event.target.value)} />
              </label>
              <label>
                <input type="checkbox" checked={deliver} onChange={(event) => setDeliver(event.target.checked)} />
                {" "}Deliver test message
              </label>
              <div className="panel-actions">
                <Button type="submit">Run test</Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Last Known Config" subtitle="Current persisted config loaded from backend." />
            {config ? (
              <div className="panel-list">
                <article className="panel-item">
                  <header>
                    <strong>{config.chatId}</strong>
                    <time>{config.mode}</time>
                  </header>
                  <p>
                    enabled: {config.enabled ? "true" : "false"} | digest: {config.digestIntervalMinutes}m | updated_by: {config.updatedBy}
                  </p>
                  <p>updated_at: {formatDateTime(config.updatedAt)}</p>
                  <pre className="panel-summary">{config.template}</pre>
                </article>
              </div>
            ) : (
              <StateBlock state="empty" title="No config loaded yet" description="Save config or run test to capture backend payload." />
            )}
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Last Test Result" subtitle="Dry-run output and optional delivery status." />
            {testResult ? (
              <div className="panel-list">
                <article className="panel-item">
                  <header>
                    <strong>rendered</strong>
                    <time>{testResult.ok ? "ok" : "failed"}</time>
                  </header>
                  <pre className="panel-summary">{testResult.dryRun.rendered}</pre>
                  <p>
                    delivery:{" "}
                    {testResult.delivery
                      ? `requested=${String(testResult.delivery.requested)}, ok=${String(testResult.delivery.ok)}, skipped=${String(testResult.delivery.skipped)}, reason=${testResult.delivery.reason ?? "-"}`
                      : "not requested"}
                  </p>
                </article>
              </div>
            ) : (
              <StateBlock state="empty" title="No test executed" description="Run template test to inspect render/delivery payload." />
            )}
          </section>
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function PollsSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [resultsByPollId, setResultsByPollId] = useState<Record<string, PollResultsResponse>>({});

  const [question, setQuestion] = useState("");
  const [optionsCsv, setOptionsCsv] = useState("Yes,No");
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isQuiz, setIsQuiz] = useState(false);
  const [correctIndexesCsv, setCorrectIndexesCsv] = useState("0");
  const [allowedRoleIdsCsv, setAllowedRoleIdsCsv] = useState("");
  const [closesAt, setClosesAt] = useState("");

  const [votePollId, setVotePollId] = useState("");
  const [voteIndexesCsv, setVoteIndexesCsv] = useState("0");

  const [closePollId, setClosePollId] = useState("");
  const [closeReason, setCloseReason] = useState("");

  const [resultsPollId, setResultsPollId] = useState("");

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedQuestion = question.trim();
    const options = csvList(optionsCsv);
    if (!normalizedQuestion || options.length < 2) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const created = await api.createPoll(runtime.chatId, {
        question: normalizedQuestion,
        options,
        allow_multiple: allowMultiple,
        is_anonymous: isAnonymous,
        is_quiz: isQuiz,
        correct_option_indexes: isQuiz ? csvNumbers(correctIndexesCsv) : [],
        allowed_role_ids: csvList(allowedRoleIdsCsv),
        closes_at: closesAt.trim() ? new Date(closesAt).toISOString() : undefined
      });
      setPolls((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setQuestion("");
    } catch (createError) {
      setError(parseError(createError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleVote(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const pollId = votePollId.trim();
    const indexes = csvNumbers(voteIndexesCsv);
    if (!pollId || indexes.length === 0) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.votePoll(runtime.chatId, pollId, indexes);
      const results = await api.getPollResults(runtime.chatId, pollId);
      setResultsByPollId((prev) => ({ ...prev, [pollId]: results }));
    } catch (voteError) {
      setError(parseError(voteError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleClose(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const pollId = closePollId.trim();
    if (!pollId) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const closed = await api.closePoll(runtime.chatId, pollId, closeReason.trim() || undefined);
      setPolls((prev) => {
        const has = prev.some((item) => item.id === closed.id);
        if (has) {
          return prev.map((item) => (item.id === closed.id ? closed : item));
        }
        return [closed, ...prev];
      });
      setCloseReason("");
      const results = await api.getPollResults(runtime.chatId, pollId);
      setResultsByPollId((prev) => ({ ...prev, [pollId]: results }));
    } catch (closeError) {
      setError(parseError(closeError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleLoadResults(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const pollId = resultsPollId.trim();
    if (!pollId) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const results = await api.getPollResults(runtime.chatId, pollId);
      setResultsByPollId((prev) => ({ ...prev, [pollId]: results }));
    } catch (resultsError) {
      setError(parseError(resultsError));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <StateBlock state={updating ? "updating" : "ready"}>
      <Card className="app-tab-card">
        <SectionTitle title="Polls and Quizzes" subtitle="Connected to /polls, /vote, /close and /results." />
        <form className="panel-form" onSubmit={handleCreate}>
          <label>
            Question
            <input value={question} onChange={(event) => setQuestion(event.target.value)} />
          </label>
          <label>
            Options (comma-separated)
            <input value={optionsCsv} onChange={(event) => setOptionsCsv(event.target.value)} />
          </label>
          <label>
            Correct option indexes (comma-separated)
            <input value={correctIndexesCsv} onChange={(event) => setCorrectIndexesCsv(event.target.value)} disabled={!isQuiz} />
          </label>
          <label>
            Allowed role IDs (optional, comma-separated)
            <input value={allowedRoleIdsCsv} onChange={(event) => setAllowedRoleIdsCsv(event.target.value)} />
          </label>
          <label>
            Closes at (optional)
            <input type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} />
          </label>
          <label>
            <input type="checkbox" checked={allowMultiple} onChange={(event) => setAllowMultiple(event.target.checked)} />
            {" "}Allow multiple answers
          </label>
          <label>
            <input type="checkbox" checked={isAnonymous} onChange={(event) => setIsAnonymous(event.target.checked)} />
            {" "}Anonymous poll
          </label>
          <label>
            <input type="checkbox" checked={isQuiz} onChange={(event) => setIsQuiz(event.target.checked)} />
            {" "}Quiz mode
          </label>
          <div className="panel-actions">
            <Button type="submit">Create poll</Button>
          </div>
        </form>

        <section className="panel-subcard">
          <SectionTitle title="Vote" subtitle="Submit option indexes for a poll id." />
          <form className="panel-form" onSubmit={handleVote}>
            <label>
              Poll ID
              <input value={votePollId} onChange={(event) => setVotePollId(event.target.value)} />
            </label>
            <label>
              Option indexes (comma-separated)
              <input value={voteIndexesCsv} onChange={(event) => setVoteIndexesCsv(event.target.value)} />
            </label>
            <div className="panel-actions">
              <Button type="submit">Vote</Button>
            </div>
          </form>
        </section>

        <section className="panel-subcard">
          <SectionTitle title="Close Poll" subtitle="Moderator/admin close action with optional reason." />
          <form className="panel-form" onSubmit={handleClose}>
            <label>
              Poll ID
              <input value={closePollId} onChange={(event) => setClosePollId(event.target.value)} />
            </label>
            <label>
              Reason (optional)
              <input value={closeReason} onChange={(event) => setCloseReason(event.target.value)} />
            </label>
            <div className="panel-actions">
              <Button type="submit" variant="danger">
                Close poll
              </Button>
            </div>
          </form>
        </section>

        <section className="panel-subcard">
          <SectionTitle title="Load Results" subtitle="Fetch poll aggregates by poll id." />
          <form className="panel-form" onSubmit={handleLoadResults}>
            <label>
              Poll ID
              <input value={resultsPollId} onChange={(event) => setResultsPollId(event.target.value)} />
            </label>
            <div className="panel-actions">
              <Button type="submit" variant="secondary">
                Get results
              </Button>
            </div>
          </form>
        </section>

        {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

        <section className="panel-subcard">
          <SectionTitle title="Tracked Polls" subtitle="Polls created/updated in this UI session." />
          {polls.length === 0 ? (
            <StateBlock state="empty" title="No tracked polls" description="Create or close a poll to track it here." />
          ) : (
            <div className="panel-list">
              {polls.map((poll) => (
                <article key={poll.id} className="panel-item">
                  <header>
                    <strong>{poll.id}</strong>
                    <time>{poll.status}</time>
                  </header>
                  <p>{poll.question}</p>
                  <p>
                    options: {poll.options.length} | quiz: {poll.isQuiz ? "true" : "false"} | multiple:{" "}
                    {poll.allowMultiple ? "true" : "false"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel-subcard">
          <SectionTitle title="Loaded Results" subtitle="Result snapshots fetched during this UI session." />
          {Object.values(resultsByPollId).length === 0 ? (
            <StateBlock state="empty" title="No results loaded" description="Fetch results for a poll to display totals." />
          ) : (
            <div className="panel-list">
              {Object.values(resultsByPollId).map((result) => (
                <article key={result.pollId} className="panel-item">
                  <header>
                    <strong>{result.pollId}</strong>
                    <time>{result.status}</time>
                  </header>
                  <p>total votes: {result.totalVotes}</p>
                  <p>
                    {result.options.map((entry) => `${entry.optionIndex}:${entry.votes}`).join(" | ")}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </Card>
    </StateBlock>
  );
}

export function KnowledgeSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [tagsCsv, setTagsCsv] = useState("");
  const [status, setStatus] = useState<KnowledgeArticleStatus>("draft");

  const [articleId, setArticleId] = useState("");
  const [updateTitle, setUpdateTitle] = useState("");
  const [updateContent, setUpdateContent] = useState("");
  const [updateCategory, setUpdateCategory] = useState("");
  const [updateTagsCsv, setUpdateTagsCsv] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();
    if (!normalizedTitle || !normalizedContent) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const created = await api.createKnowledgeArticle(runtime.chatId, {
        title: normalizedTitle,
        content: normalizedContent,
        category: category.trim() ? category.trim() : null,
        tags: csvList(tagsCsv),
        status
      });
      setArticles((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setTitle("");
      setContent("");
      setCategory("");
      setTagsCsv("");
      setStatus("draft");
    } catch (createError) {
      setError(parseError(createError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const id = articleId.trim();
    if (!id) {
      return;
    }

    const patch: {
      title?: string;
      content?: string;
      category?: string | null;
      tags?: string[];
      status?: KnowledgeArticleStatus;
    } = {};
    if (updateTitle.trim()) patch.title = updateTitle.trim();
    if (updateContent.trim()) patch.content = updateContent;
    if (updateCategory.trim()) patch.category = updateCategory.trim();
    if (updateCategory === "__null__") patch.category = null;
    if (updateTagsCsv.trim()) patch.tags = csvList(updateTagsCsv);
    if (updateStatus) patch.status = updateStatus as KnowledgeArticleStatus;
    if (Object.keys(patch).length === 0) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const updated = await api.updateKnowledgeArticle(runtime.chatId, id, patch);
      setArticles((prev) => {
        const has = prev.some((item) => item.id === updated.id);
        if (has) {
          return prev.map((item) => (item.id === updated.id ? updated : item));
        }
        return [updated, ...prev];
      });
    } catch (updateError) {
      setError(parseError(updateError));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.knowledge ?? [])}
      hint="Knowledge permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <Card className="app-tab-card">
          <SectionTitle title="Knowledge Articles" subtitle="Connected to /knowledge/articles create and update contracts." />
        <form className="panel-form" onSubmit={handleCreate}>
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Content
            <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} />
          </label>
          <label>
            Category (optional)
            <input value={category} onChange={(event) => setCategory(event.target.value)} />
          </label>
          <label>
            Tags (comma-separated)
            <input value={tagsCsv} onChange={(event) => setTagsCsv(event.target.value)} />
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as KnowledgeArticleStatus)}>
              <option value="draft">draft</option>
              <option value="review">review</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <div className="panel-actions">
            <Button type="submit">Create article</Button>
          </div>
        </form>

        <section className="panel-subcard">
          <SectionTitle title="Update Article" subtitle="Patch article fields by id." />
          <form className="panel-form" onSubmit={handleUpdate}>
            <label>
              Article ID
              <input value={articleId} onChange={(event) => setArticleId(event.target.value)} />
            </label>
            <label>
              Title (optional)
              <input value={updateTitle} onChange={(event) => setUpdateTitle(event.target.value)} />
            </label>
            <label>
              Content (optional)
              <textarea value={updateContent} onChange={(event) => setUpdateContent(event.target.value)} rows={4} />
            </label>
            <label>
              Category (optional, use `__null__` to clear)
              <input value={updateCategory} onChange={(event) => setUpdateCategory(event.target.value)} />
            </label>
            <label>
              Tags (optional, comma-separated)
              <input value={updateTagsCsv} onChange={(event) => setUpdateTagsCsv(event.target.value)} />
            </label>
            <label>
              Status (optional)
              <select value={updateStatus} onChange={(event) => setUpdateStatus(event.target.value)}>
                <option value="">unchanged</option>
                <option value="draft">draft</option>
                <option value="review">review</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <div className="panel-actions">
              <Button type="submit">Update article</Button>
            </div>
          </form>
        </section>

        {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

        <section className="panel-subcard">
          <SectionTitle title="Tracked Articles" subtitle="Created/updated knowledge articles in this UI session." />
          {articles.length === 0 ? (
            <StateBlock state="empty" title="No tracked articles" description="Create or update an article to show it here." />
          ) : (
            <div className="panel-list">
              {articles.map((article) => (
                <article key={article.id} className="panel-item">
                  <header>
                    <strong>{article.id}</strong>
                    <time>
                      {article.status} v{article.version}
                    </time>
                  </header>
                  <p>{article.title}</p>
                  <p>category: {article.category ?? "-"} | tags: {article.tags.join(", ") || "-"}</p>
                </article>
              ))}
            </div>
          )}
        </section>
        </Card>
      </StateBlock>
    </PermissionGate>
  );
}

export function TranslationsSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);

  const [messageId, setMessageId] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [forceRefresh, setForceRefresh] = useState(false);
  const [deleteLanguage, setDeleteLanguage] = useState("");

  const [lastTranslate, setLastTranslate] = useState<TranslateMessageResponse | null>(null);
  const [listResult, setListResult] = useState<ListTranslationsResponse | null>(null);

  async function loadTranslationsList(): Promise<void> {
    const id = messageId.trim();
    if (!id) {
      return;
    }

    const list = await api.listMessageTranslations(runtime.chatId, id);
    setListResult(list);
  }

  async function handleTranslate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const id = messageId.trim();
    if (!id || !targetLanguage.trim()) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const response = await api.translateMessage(runtime.chatId, id, {
        target_language: targetLanguage.trim(),
        source_language: sourceLanguage.trim() || undefined,
        force_refresh: forceRefresh
      });
      setLastTranslate(response);
      await loadTranslationsList();
    } catch (translateError) {
      setError(parseError(translateError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleList(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const id = messageId.trim();
    if (!id) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await loadTranslationsList();
    } catch (listError) {
      setError(parseError(listError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const id = messageId.trim();
    const language = deleteLanguage.trim();
    if (!id || !language) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.deleteMessageTranslation(runtime.chatId, id, language);
      await loadTranslationsList();
    } catch (deleteError) {
      setError(parseError(deleteError));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.translations ?? [])}
      hint="Translation permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <Card className="app-tab-card">
          <SectionTitle title="Translations" subtitle="Connected to /messages/:messageId/translate and /translations." />
        <form className="panel-form" onSubmit={handleTranslate}>
          <label>
            Message ID
            <input value={messageId} onChange={(event) => setMessageId(event.target.value)} placeholder="msg_..." />
          </label>
          <label>
            Target language
            <input value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} />
          </label>
          <label>
            Source language (optional)
            <input value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)} />
          </label>
          <label>
            <input type="checkbox" checked={forceRefresh} onChange={(event) => setForceRefresh(event.target.checked)} />
            {" "}Force refresh
          </label>
          <div className="panel-actions">
            <Button type="submit">Translate</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                setUpdating(true);
                setError(null);
                try {
                  await loadTranslationsList();
                } catch (listError) {
                  setError(parseError(listError));
                } finally {
                  setUpdating(false);
                }
              }}
            >
              List
            </Button>
          </div>
        </form>

        <form className="panel-form" onSubmit={handleList}>
          <div className="panel-actions">
            <Button type="submit" variant="secondary">
              Reload translations
            </Button>
          </div>
        </form>

        <form className="panel-form" onSubmit={handleDelete}>
          <label>
            Delete language
            <input value={deleteLanguage} onChange={(event) => setDeleteLanguage(event.target.value)} placeholder="en" />
          </label>
          <div className="panel-actions">
            <Button type="submit" variant="danger">
              Delete translation
            </Button>
          </div>
        </form>

        {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

        <section className="panel-subcard">
          <SectionTitle title="Last Translate Response" subtitle="Most recent translate call payload." />
          {!lastTranslate ? (
            <StateBlock state="empty" title="No translation yet" description="Run translation for a message." />
          ) : (
            <div className="panel-list">
              <article className="panel-item">
                <header>
                  <strong>{lastTranslate.translation.id}</strong>
                  <time>{lastTranslate.cacheHit ? "cache_hit" : "fresh"}</time>
                </header>
                <p>
                  {lastTranslate.translation.sourceLanguage}
                  {" -> "}
                  {lastTranslate.translation.targetLanguage} | provider:{" "}
                  {lastTranslate.translation.provider}
                </p>
                <pre className="panel-summary">{lastTranslate.translation.text}</pre>
              </article>
            </div>
          )}
        </section>

        <section className="panel-subcard">
          <SectionTitle title="Translations List" subtitle="Stored translations for current message id." />
          {!listResult || listResult.items.length === 0 ? (
            <StateBlock state="empty" title="No stored translations" description="Translate message or reload list." />
          ) : (
            <div className="panel-list">
              {listResult.items.map((item) => (
                <article key={item.id} className="panel-item">
                  <header>
                    <strong>{item.targetLanguage}</strong>
                    <time>{formatDateTime(item.updatedAt)}</time>
                  </header>
                  <p>
                    source: {item.sourceLanguage} | provider: {item.provider}
                  </p>
                  <pre className="panel-summary">{item.text}</pre>
                </article>
              ))}
            </div>
          )}
        </section>
        </Card>
      </StateBlock>
    </PermissionGate>
  );
}

export function MemberMetaAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [targetUserId, setTargetUserId] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [profileKey, setProfileKey] = useState("");
  const [profileValue, setProfileValue] = useState("");
  const [deleteProfileKey, setDeleteProfileKey] = useState("");
  const [tags, setTags] = useState<Array<{ id: string; tag: string; createdAt: string }>>([]);
  const [fields, setFields] = useState<MemberProfileField[]>([]);

  async function handleAssignTag(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const userId = targetUserId.trim();
    const tag = tagInput.trim();
    if (!userId || !tag) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const response = await api.assignMemberTag(runtime.chatId, userId, tag);
      setTags(response.tags.map((entry) => ({ id: entry.id, tag: entry.tag, createdAt: entry.createdAt })));
      setTagInput("");
    } catch (assignError) {
      setError(parseError(assignError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleLoadFields(): Promise<void> {
    const userId = targetUserId.trim();
    if (!userId) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const response = await api.listMemberProfileFields(runtime.chatId, userId);
      setFields(response.fields);
    } catch (loadError) {
      setError(parseError(loadError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleUpsertField(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const userId = targetUserId.trim();
    const key = profileKey.trim();
    const value = profileValue.trim();
    if (!userId || !key || !value) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const response = await api.upsertMemberProfileField(runtime.chatId, userId, key, value);
      setFields(response.fields);
      setProfileKey("");
      setProfileValue("");
    } catch (upsertError) {
      setError(parseError(upsertError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleDeleteField(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const userId = targetUserId.trim();
    const key = deleteProfileKey.trim();
    if (!userId || !key) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const response = await api.deleteMemberProfileField(runtime.chatId, userId, key);
      setFields(response.fields);
      setDeleteProfileKey("");
    } catch (deleteError) {
      setError(parseError(deleteError));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY["member-meta"] ?? [])}
      hint="Member profile permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Member Tags and Profile Fields" subtitle="Connected to /members/:id/tags and /profile-fields.">
          <AdminNavChips />
          <section className="panel-subcard">
            <SectionTitle title="Target User" subtitle="All actions in this panel use the same user id." />
            <div className="panel-form">
              <label>
                User ID
                <input value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} />
              </label>
              <div className="panel-actions">
                <Button variant="secondary" onClick={() => void handleLoadFields()}>
                  Load profile fields
                </Button>
              </div>
            </div>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Assign Tag" subtitle="Creates tag in chat if needed and assigns to member." />
            <form className="panel-form" onSubmit={handleAssignTag}>
              <label>
                Tag
                <input value={tagInput} onChange={(event) => setTagInput(event.target.value)} />
              </label>
              <div className="panel-actions">
                <Button type="submit">Assign tag</Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Upsert Profile Field" subtitle="Creates or updates a key/value field for selected member." />
            <form className="panel-form" onSubmit={handleUpsertField}>
              <label>
                Field key
                <input value={profileKey} onChange={(event) => setProfileKey(event.target.value)} />
              </label>
              <label>
                Field value
                <input value={profileValue} onChange={(event) => setProfileValue(event.target.value)} />
              </label>
              <div className="panel-actions">
                <Button type="submit">Upsert field</Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Delete Profile Field" subtitle="Deletes single field key for selected member." />
            <form className="panel-form" onSubmit={handleDeleteField}>
              <label>
                Field key
                <input value={deleteProfileKey} onChange={(event) => setDeleteProfileKey(event.target.value)} />
              </label>
              <div className="panel-actions">
                <Button type="submit" variant="danger">
                  Delete field
                </Button>
              </div>
            </form>
          </section>

          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <section className="panel-subcard">
            <SectionTitle title="Assigned Tags" subtitle="Last received tag list from assign operation." />
            {tags.length === 0 ? (
              <StateBlock state="empty" title="No tags loaded" description="Assign a tag to populate this list." />
            ) : (
              <div className="panel-chip-list">
                {tags.map((entry) => (
                  <div key={entry.id} className="panel-chip">
                    <span>{entry.tag}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Profile Fields" subtitle="Fields loaded or returned by upsert/delete actions." />
            {fields.length === 0 ? (
              <StateBlock state="empty" title="No fields loaded" description="Load fields or upsert one to display data." />
            ) : (
              <div className="panel-list">
                {fields.map((field) => (
                  <article key={field.id} className="panel-item">
                    <header>
                      <strong>{field.key}</strong>
                      <time>{formatDateTime(field.updatedAt)}</time>
                    </header>
                    <p>{field.value}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function E2EDevicesSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [ownDevices, setOwnDevices] = useState<E2EDevice[]>([]);
  const [queryDevices, setQueryDevices] = useState<E2EDevice[]>([]);

  const [deviceId, setDeviceId] = useState("device-web-1");
  const [algorithm, setAlgorithm] = useState("x25519");
  const [identityKey, setIdentityKey] = useState("YWJjMTIz");
  const [signedPreKey, setSignedPreKey] = useState("c2lnbmVkMTIz");
  const [oneTimePreKeysCsv, setOneTimePreKeysCsv] = useState(
    "b3RwazE=,b3RwazI=,b3RwazM=,b3RwazQ=,b3RwazU=,b3RwazY=,b3Rwazc=,b3Rwazg=,b3Rwazk=,b3RwazEw"
  );
  const [fallbackKey, setFallbackKey] = useState("");
  const [lastRotationAt, setLastRotationAt] = useState("");
  const [queryUserIdsCsv, setQueryUserIdsCsv] = useState("");
  const [deactivateDeviceId, setDeactivateDeviceId] = useState("");

  const loadOwnDevices = useCallback(async (): Promise<void> => {
    setUpdating(true);
    setError(null);
    try {
      const list = await api.listOwnE2EDevices(runtime.chatId);
      setOwnDevices(list);
    } catch (loadError) {
      setError(parseError(loadError));
    } finally {
      setUpdating(false);
    }
  }, [api, runtime.chatId]);

  async function handleUpsert(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedDeviceId = deviceId.trim();
    if (!normalizedDeviceId) {
      return;
    }
    const keys = csvList(oneTimePreKeysCsv);
    if (keys.length === 0) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.upsertE2EDevice(runtime.chatId, {
        device_id: normalizedDeviceId,
        algorithm: algorithm.trim(),
        identity_key: identityKey.trim(),
        signed_pre_key: signedPreKey.trim(),
        one_time_pre_keys: keys,
        fallback_key: fallbackKey.trim() || undefined,
        last_pre_key_rotation_at: lastRotationAt.trim() ? new Date(lastRotationAt).toISOString() : undefined
      });
      await loadOwnDevices();
    } catch (upsertError) {
      setError(parseError(upsertError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleQueryDevices(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const userIds = csvList(queryUserIdsCsv);
    setUpdating(true);
    setError(null);
    try {
      const list = await api.listE2EDevices(runtime.chatId, userIds.length > 0 ? userIds : undefined);
      setQueryDevices(list);
    } catch (queryError) {
      setError(parseError(queryError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleDeactivate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const id = deactivateDeviceId.trim();
    if (!id) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.deactivateE2EDevice(runtime.chatId, id);
      setDeactivateDeviceId("");
      await loadOwnDevices();
    } catch (deactivateError) {
      setError(parseError(deactivateError));
    } finally {
      setUpdating(false);
    }
  }

  useEffect(() => {
    void loadOwnDevices();
  }, [loadOwnDevices]);

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY["e2e-devices"] ?? [])}
      hint="E2E device permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <Card className="app-tab-card">
          <SectionTitle title="E2E Devices" subtitle="Connected to /e2e/devices register/list/deactivate endpoints." />
        <form className="panel-form" onSubmit={handleUpsert}>
          <label>
            Device ID
            <input value={deviceId} onChange={(event) => setDeviceId(event.target.value)} />
          </label>
          <label>
            Algorithm
            <input value={algorithm} onChange={(event) => setAlgorithm(event.target.value)} />
          </label>
          <label>
            Identity key
            <input value={identityKey} onChange={(event) => setIdentityKey(event.target.value)} />
          </label>
          <label>
            Signed pre-key
            <input value={signedPreKey} onChange={(event) => setSignedPreKey(event.target.value)} />
          </label>
          <label>
            One-time pre-keys (comma-separated)
            <textarea value={oneTimePreKeysCsv} onChange={(event) => setOneTimePreKeysCsv(event.target.value)} rows={3} />
          </label>
          <label>
            Fallback key (optional)
            <input value={fallbackKey} onChange={(event) => setFallbackKey(event.target.value)} />
          </label>
          <label>
            Last rotation at (optional)
            <input type="datetime-local" value={lastRotationAt} onChange={(event) => setLastRotationAt(event.target.value)} />
          </label>
          <div className="panel-actions">
            <Button type="submit">Upsert device</Button>
            <Button type="button" variant="secondary" onClick={() => void loadOwnDevices()}>
              Reload own devices
            </Button>
          </div>
        </form>

        <section className="panel-subcard">
          <SectionTitle title="Deactivate Device" subtitle="Deactivate one of your registered devices by device id." />
          <form className="panel-form" onSubmit={handleDeactivate}>
            <label>
              Device ID
              <input value={deactivateDeviceId} onChange={(event) => setDeactivateDeviceId(event.target.value)} />
            </label>
            <div className="panel-actions">
              <Button type="submit" variant="danger">
                Deactivate
              </Button>
            </div>
          </form>
        </section>

        <section className="panel-subcard">
          <SectionTitle title="Query Devices" subtitle="List devices in chat with optional user id filter." />
          <form className="panel-form" onSubmit={handleQueryDevices}>
            <label>
              User IDs filter (comma-separated)
              <input value={queryUserIdsCsv} onChange={(event) => setQueryUserIdsCsv(event.target.value)} />
            </label>
            <div className="panel-actions">
              <Button type="submit" variant="secondary">
                Query devices
              </Button>
            </div>
          </form>
        </section>

        {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

        <section className="panel-subcard">
          <SectionTitle title="Own Devices" subtitle="Result of /e2e/devices/me calls." />
          {ownDevices.length === 0 ? (
            <StateBlock state="empty" title="No own devices loaded" />
          ) : (
            <div className="panel-list">
              {ownDevices.map((device) => (
                <article key={device.id} className="panel-item">
                  <header>
                    <strong>{device.deviceId}</strong>
                    <time>{device.isActive ? "active" : "inactive"}</time>
                  </header>
                  <p>
                    algorithm: {device.algorithm} | pre_keys: {device.oneTimePreKeys.length}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel-subcard">
          <SectionTitle title="Queried Devices" subtitle="Result of /e2e/devices query endpoint." />
          {queryDevices.length === 0 ? (
            <StateBlock state="empty" title="No queried devices" description="Run query to load devices list." />
          ) : (
            <div className="panel-list">
              {queryDevices.map((device) => (
                <article key={device.id} className="panel-item">
                  <header>
                    <strong>{device.userId}</strong>
                    <time>{device.deviceId}</time>
                  </header>
                  <p>
                    {device.algorithm} | active: {device.isActive ? "true" : "false"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
        </Card>
      </StateBlock>
    </PermissionGate>
  );
}

export function TempRoomsAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [rooms, setRooms] = useState<TempRoom[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [inheritPermissions, setInheritPermissions] = useState(true);
  const [permissionOverridesJson, setPermissionOverridesJson] = useState("{}");

  const [archiveRoomId, setArchiveRoomId] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [restoreRoomId, setRestoreRoomId] = useState("");
  const [restoreReason, setRestoreReason] = useState("");

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const roomName = name.trim();
    if (!roomName) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const overrides = parseJsonOrThrow(permissionOverridesJson) as Record<string, unknown>;
      const created = await api.createTempRoom(runtime.chatId, {
        name: roomName,
        description: description.trim() || undefined,
        starts_at: startsAt.trim() ? new Date(startsAt).toISOString() : undefined,
        ends_at: endsAt.trim() ? new Date(endsAt).toISOString() : undefined,
        inherit_permissions: inheritPermissions,
        permission_overrides: overrides
      });
      setRooms((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setName("");
      setDescription("");
      setStartsAt("");
      setEndsAt("");
    } catch (createError) {
      setError(parseError(createError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleArchive(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const roomId = archiveRoomId.trim();
    if (!roomId) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const response = await api.archiveTempRoom(runtime.chatId, roomId, archiveReason.trim() || undefined);
      setRooms((prev) => {
        const has = prev.some((item) => item.id === response.room.id);
        if (has) {
          return prev.map((item) => (item.id === response.room.id ? response.room : item));
        }
        return [response.room, ...prev];
      });
      setArchiveReason("");
    } catch (archiveError) {
      setError(parseError(archiveError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleRestore(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const roomId = restoreRoomId.trim();
    if (!roomId) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const response = await api.restoreTempRoom(runtime.chatId, roomId, restoreReason.trim() || undefined);
      setRooms((prev) => {
        const has = prev.some((item) => item.id === response.room.id);
        if (has) {
          return prev.map((item) => (item.id === response.room.id ? response.room : item));
        }
        return [response.room, ...prev];
      });
      setRestoreReason("");
    } catch (restoreError) {
      setError(parseError(restoreError));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY["temp-rooms"] ?? [])}
      hint="Temporary room permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Temporary Rooms" subtitle="Connected to /temp-rooms create/archive/restore endpoints.">
          <AdminNavChips />
          <section className="panel-subcard">
            <SectionTitle title="Create Temp Room" subtitle="Create active temporary room with optional schedule and overrides." />
            <form className="panel-form" onSubmit={handleCreate}>
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                Description
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
              </label>
              <label>
                Starts at (optional)
                <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
              </label>
              <label>
                Ends at (optional)
                <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={inheritPermissions}
                  onChange={(event) => setInheritPermissions(event.target.checked)}
                />
                {" "}Inherit permissions
              </label>
              <label>
                Permission overrides JSON
                <textarea
                  value={permissionOverridesJson}
                  onChange={(event) => setPermissionOverridesJson(event.target.value)}
                  rows={4}
                />
              </label>
              <div className="panel-actions">
                <Button type="submit">Create temp room</Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Archive Temp Room" subtitle="Archive by room id with optional reason." />
            <form className="panel-form" onSubmit={handleArchive}>
              <label>
                Room ID
                <input value={archiveRoomId} onChange={(event) => setArchiveRoomId(event.target.value)} />
              </label>
              <label>
                Reason
                <input value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} />
              </label>
              <div className="panel-actions">
                <Button type="submit" variant="danger">
                  Archive
                </Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Restore Temp Room" subtitle="Restore archived room by room id." />
            <form className="panel-form" onSubmit={handleRestore}>
              <label>
                Room ID
                <input value={restoreRoomId} onChange={(event) => setRestoreRoomId(event.target.value)} />
              </label>
              <label>
                Reason
                <input value={restoreReason} onChange={(event) => setRestoreReason(event.target.value)} />
              </label>
              <div className="panel-actions">
                <Button type="submit">Restore</Button>
              </div>
            </form>
          </section>

          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <section className="panel-subcard">
            <SectionTitle title="Tracked Temp Rooms" subtitle="Rooms created/archived/restored in current UI session." />
            {rooms.length === 0 ? (
              <StateBlock state="empty" title="No tracked temp rooms" />
            ) : (
              <div className="panel-list">
                {rooms.map((room) => (
                  <article key={room.id} className="panel-item">
                    <header>
                      <strong>{room.name}</strong>
                      <time>{room.status}</time>
                    </header>
                    <p>
                      id: {room.id} | starts: {room.startsAt ? formatDateTime(room.startsAt) : "-"} | ends:{" "}
                      {room.endsAt ? formatDateTime(room.endsAt) : "-"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function ReputationSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustReputationResponse[]>([]);
  const [liveEvents, setLiveEvents] = useState<WsReputationUpdatedPayload[]>([]);

  const [targetUserId, setTargetUserId] = useState("");
  const [delta, setDelta] = useState("1");
  const [reason, setReason] = useState("manual_adjustment");
  const [sourceType, setSourceType] = useState("");
  const [sourceId, setSourceId] = useState("");

  useEffect(() => {
    if (runtime.liveReputationUpdates.length === 0) {
      return;
    }

    setLiveEvents((prev) => {
      const seen = new Set(prev.map((entry) => entry.eventId));
      const incoming = runtime.liveReputationUpdates.filter((entry) => {
        if (seen.has(entry.eventId)) {
          return false;
        }
        seen.add(entry.eventId);
        return true;
      });
      const next = [...incoming, ...prev];
      return next.slice(0, 100);
    });
  }, [runtime.liveReputationUpdates]);

  async function handleAdjust(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const userId = targetUserId.trim();
    const deltaNumber = Number(delta);
    const normalizedReason = reason.trim();
    if (!userId || !Number.isFinite(deltaNumber) || deltaNumber === 0 || !normalizedReason) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const response = await api.adjustReputation(runtime.chatId, {
        user_id: userId,
        delta: Math.floor(deltaNumber),
        reason: normalizedReason,
        source_type: sourceType.trim() || undefined,
        source_id: sourceId.trim() || undefined
      });
      setAdjustments((prev) => [response, ...prev.filter((entry) => entry.event.id !== response.event.id)].slice(0, 100));
      setSourceType("");
      setSourceId("");
    } catch (adjustError) {
      setError(parseError(adjustError));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.reputation ?? [])}
      hint="Reputation permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <Card className="app-tab-card">
          <SectionTitle title="Reputation" subtitle="Connected to /reputation/adjust with live WS feed reputation.updated." />
          <form className="panel-form" onSubmit={handleAdjust}>
            <label>
              Target user ID
              <input value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} />
            </label>
            <label>
              Delta (non-zero integer)
              <input type="number" value={delta} onChange={(event) => setDelta(event.target.value)} />
            </label>
            <label>
              Reason
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <label>
              Source type (optional)
              <input value={sourceType} onChange={(event) => setSourceType(event.target.value)} />
            </label>
            <label>
              Source id (optional)
              <input value={sourceId} onChange={(event) => setSourceId(event.target.value)} />
            </label>
            <div className="panel-actions">
              <Button type="submit">Adjust reputation</Button>
            </div>
          </form>

          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <section className="panel-subcard">
            <SectionTitle title="Adjust Responses" subtitle="Direct API adjust responses in this UI session." />
            {adjustments.length === 0 ? (
              <StateBlock state="empty" title="No adjustments yet" />
            ) : (
              <div className="panel-list">
                {adjustments.map((entry) => (
                  <article key={entry.event.id} className="panel-item">
                    <header>
                      <strong>{entry.event.userId}</strong>
                      <time>score: {entry.score}</time>
                    </header>
                    <p>
                      delta: {entry.event.delta} | reason: {entry.event.reason} | actor: {entry.event.actorId}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Live WS Events" subtitle="Latest reputation.updated events from runtime socket." />
            {liveEvents.length === 0 ? (
              <StateBlock state="empty" title="No live events yet" description="Adjust reputation to trigger WS events." />
            ) : (
              <div className="panel-list">
                {liveEvents.map((event) => (
                  <article key={event.eventId} className="panel-item">
                    <header>
                      <strong>{event.userId}</strong>
                      <time>score: {event.score}</time>
                    </header>
                    <p>
                      delta: {event.delta} | reason: {event.reason} | actor: {event.actorId}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </Card>
      </StateBlock>
    </PermissionGate>
  );
}

function PlaceholderGrid({ cards }: { cards: Array<{ title: string; text: string }> }) {
  return (
    <div className="app-grid-two">
      {cards.map((card) => (
        <Card key={card.title}>
          <h3>{card.title}</h3>
          <p>{card.text}</p>
        </Card>
      ))}
    </div>
  );
}

type AdminRouteGroupId = "core" | "ops" | "governance" | "dev";
type AdminRouteDefinition = {
  key: string;
  label: string;
  description: string;
  href: string;
  group: AdminRouteGroupId;
  devOnly?: boolean;
};

const ADMIN_ROUTE_PERMISSION_BY_KEY: Record<string, string[]> = {
  members: ["member.view_list"],
  roles: ["role.create", "role.update", "role.assign", "role.unassign", "permission.grant", "permission.revoke"],
  limits: ["limit.view", "limit.update.role", "slowmode.view", "slowmode.update"],
  invites: ["chat.invite.create", "chat.invite.revoke", "member.approve_join", "member.reject_join"],
  "channel-notify": [
    "channel.notify.enable",
    "channel.notify.disable",
    "channel.notify.template.edit",
    "channel.notify.frequency.edit"
  ],
  tickets: ["ticket.create", "ticket.assign", "ticket.close", "ticket.sla.manage"],
  "temp-rooms": ["room.temp.create", "room.temp.archive", "room.temp.restore"],
  broadcasts: [
    "broadcast.create",
    "broadcast.update",
    "broadcast.delete",
    "broadcast.publish.now",
    "broadcast.schedule",
    "broadcast.pause",
    "broadcast.resume",
    "broadcast.cancel",
    "broadcast.audience.manage",
    "broadcast.template.manage",
    "broadcast.stats.view"
  ],
  webhooks: ["integration.webhook.create", "integration.webhook.rotate_secret", "integration.webhook.disable"],
  automation: ["automation.rule.create", "automation.rule.update", "automation.rule.execute"],
  incident: ["incident_mode.enable", "incident_mode.disable", "incident_mode.policy.edit"],
  audit: ["audit.view", "audit.export"],
  search: ["message.search"],
  pinned: ["message.pin.view"],
  drafts: ["draft.create", "draft.update", "draft.delete", "draft.schedule_send"],
  bookmarks: ["bookmark.create", "bookmark.collection.manage"],
  "thread-subscriptions": ["thread.subscription.manage"],
  polls: ["message.send.poll", "poll.quiz.create", "poll.quiz.close", "poll.quiz.results.view"],
  "e2e-devices": ["e2e.device.register", "e2e.device.view"]
};

const ADMIN_GROUP_META: Record<AdminRouteGroupId, { label: string; subtitle: string }> = {
  core: {
    label: "Core",
    subtitle: "Roles, members, limits, invites and channel notifications."
  },
  ops: {
    label: "Ops",
    subtitle: "Moderation operations, tickets, automation and integrations."
  },
  governance: {
    label: "Governance",
    subtitle: "Incident-mode control, audit and compliance flow."
  },
  dev: {
    label: "DEV",
    subtitle: "Advanced tooling available for Developer role."
  }
};

const ADMIN_GROUP_ORDER: AdminRouteGroupId[] = ["core", "ops", "governance", "dev"];

function getAdminRouteDefinitions(chatId: string): AdminRouteDefinition[] {
  const base = `/chat/${encodeURIComponent(chatId)}/admin`;
  const root = `/chat/${encodeURIComponent(chatId)}`;
  return [
    {
      key: "members",
      label: "Members",
      description: "Role assignment, moderation and member search.",
      href: `${base}/members`,
      group: "core"
    },
    {
      key: "roles",
      label: "Roles",
      description: "Role builder, permissions and presets.",
      href: `${base}/roles`,
      group: "core"
    },
    {
      key: "limits",
      label: "Limits",
      description: "Rate limits, slowmode and anti-spam thresholds.",
      href: `${base}/limits`,
      group: "core"
    },
    {
      key: "invites",
      label: "Invites",
      description: "Join policy, invite links and pending requests.",
      href: `${base}/invites`,
      group: "core"
    },
    {
      key: "channel-notify",
      label: "Notify",
      description: "Bot notifications for new messages in Telegram.",
      href: `${base}/channel-notify`,
      group: "core"
    },
    {
      key: "tickets",
      label: "Tickets",
      description: "Support queue, SLA and assignment workflow.",
      href: `${base}/tickets`,
      group: "ops"
    },
    {
      key: "temp-rooms",
      label: "TempRooms",
      description: "Create/archive/restore temporary rooms.",
      href: `${base}/temp-rooms`,
      group: "ops"
    },
    {
      key: "broadcasts",
      label: "Broadcasts",
      description: "Audience campaigns and delivery control.",
      href: `${base}/broadcasts`,
      group: "ops"
    },
    {
      key: "webhooks",
      label: "Webhooks",
      description: "Inbound integration endpoints and secrets.",
      href: `${base}/webhooks`,
      group: "ops"
    },
    {
      key: "automation",
      label: "Automation",
      description: "Rules, execution logs and operational flows.",
      href: `${base}/automation`,
      group: "ops"
    },
    {
      key: "incident",
      label: "Incident",
      description: "Maintenance/incident mode switches and policy lock.",
      href: `${base}/incident`,
      group: "governance"
    },
    {
      key: "audit",
      label: "Audit",
      description: "History exports and compliance traces.",
      href: `${base}/audit`,
      group: "governance"
    },
    {
      key: "search",
      label: "Search",
      description: "Deep query for chat history.",
      href: `${root}/search`,
      group: "dev",
      devOnly: true
    },
    {
      key: "pinned",
      label: "Pinned",
      description: "Pinned messages workspace.",
      href: `${root}/pinned`,
      group: "dev",
      devOnly: true
    },
    {
      key: "drafts",
      label: "Drafts",
      description: "Draft and scheduled message toolbox.",
      href: `${root}/drafts`,
      group: "dev",
      devOnly: true
    },
    {
      key: "bookmarks",
      label: "Bookmarks",
      description: "Saved message collections.",
      href: `${root}/bookmarks`,
      group: "dev",
      devOnly: true
    },
    {
      key: "thread-subscriptions",
      label: "Threads",
      description: "Thread alert subscriptions and triggers.",
      href: `${root}/thread-subscriptions`,
      group: "dev",
      devOnly: true
    },
    {
      key: "polls",
      label: "Polls",
      description: "Poll creation and result controls.",
      href: `${root}/polls`,
      group: "dev",
      devOnly: true
    },
    {
      key: "e2e-devices",
      label: "E2E",
      description: "E2E device registry and diagnostics.",
      href: `${root}/e2e-devices`,
      group: "dev",
      devOnly: true
    }
  ];
}

type RuntimePermissionShape = {
  isDeveloper: boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
};

function canAccessAdminRouteKey(runtime: RuntimePermissionShape, key: string): boolean {
  if (!runtime.isDeveloper && key !== "members") {
    return false;
  }
  const requiredPermissions = ADMIN_ROUTE_PERMISSION_BY_KEY[key];
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }
  return runtime.hasAnyPermission(requiredPermissions);
}

function canAccessAdminRoute(runtime: RuntimePermissionShape, route: AdminRouteDefinition): boolean {
  if (route.devOnly) {
    return runtime.isDeveloper && canAccessAdminRouteKey(runtime, route.key);
  }
  return canAccessAdminRouteKey(runtime, route.key);
}

function resolveAdminActiveGroup(pathname: string, base: string, routes: AdminRouteDefinition[]): AdminRouteGroupId {
  if (pathname.startsWith(`${base}/core`)) return "core";
  if (pathname.startsWith(`${base}/ops`)) return "ops";
  if (pathname.startsWith(`${base}/governance`)) return "governance";
  if (pathname.startsWith(`${base}/dev`)) return "dev";
  const matched = routes.find((route) => pathname === route.href);
  if (matched) {
    return matched.group;
  }
  return "core";
}

function AdminNavChips() {
  const runtime = useChatRuntime();
  const pathname = usePathname();
  const base = `/chat/${encodeURIComponent(runtime.chatId)}/admin`;
  const routes = getAdminRouteDefinitions(runtime.chatId).filter((route) => canAccessAdminRoute(runtime, route));
  const activeGroup = resolveAdminActiveGroup(pathname, base, routes);
  const activeGroupRoutes = routes.filter((route) => route.group === activeGroup);
  const visibleGroupLinks = ADMIN_GROUP_ORDER.filter((groupId) => {
    if (groupId === "dev") {
      return runtime.isDeveloper;
    }
    return routes.some((route) => route.group === groupId);
  });

  return (
    <>
      <div className="panel-chip-list panel-chip-list-groups">
        <div className="panel-chip">
          <Link className={pathname === base ? "active" : undefined} href={base}>
            Overview
          </Link>
        </div>
        {visibleGroupLinks.map((groupId) => (
          <div key={groupId} className="panel-chip">
            <Link
              className={pathname === `${base}/${groupId}` || pathname.startsWith(`${base}/${groupId}/`) ? "active" : undefined}
              href={`${base}/${groupId}`}
            >
              {ADMIN_GROUP_META[groupId].label}
            </Link>
          </div>
        ))}
      </div>
      <div className="panel-chip-list panel-chip-list-routes">
        {activeGroupRoutes.map((route) => (
          <div key={route.key} className="panel-chip">
            <Link className={pathname === route.href ? "active" : undefined} href={route.href}>
              {route.label}
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}

export function AdminDirectorySection() {
  const runtime = useChatRuntime();
  const routes = getAdminRouteDefinitions(runtime.chatId).filter((route) => canAccessAdminRoute(runtime, route));
  const canOpenDirectory = routes.length > 0;

  return (
    <PermissionGate allowed={canOpenDirectory} hint="You do not have permissions for admin sections in this workspace.">
      <AdminPageScaffold title="Admin Control Center" subtitle="Grouped routing for fast navigation without long pages.">
        <AdminNavChips />
        {ADMIN_GROUP_ORDER.map((groupId) => {
          const items = routes.filter((route) => route.group === groupId);
          if (items.length === 0) {
            return null;
          }
          return (
            <section key={groupId} className="panel-subcard">
              <SectionTitle title={ADMIN_GROUP_META[groupId].label} subtitle={ADMIN_GROUP_META[groupId].subtitle} />
              <div className="admin-link-grid">
                {items.map((item) => (
                  <Link key={item.key} className="admin-link-card" href={item.href}>
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </AdminPageScaffold>
    </PermissionGate>
  );
}

export function AdminGroupSection({ groupId }: { groupId: AdminRouteGroupId }) {
  const runtime = useChatRuntime();
  const routes = getAdminRouteDefinitions(runtime.chatId)
    .filter((route) => canAccessAdminRoute(runtime, route))
    .filter((route) => route.group === groupId);
  const canOpenGroup = routes.length > 0;

  return (
    <PermissionGate
      allowed={canOpenGroup}
      hint="You do not have permissions for this admin group."
    >
      <AdminPageScaffold title={`${ADMIN_GROUP_META[groupId].label} Tools`} subtitle={ADMIN_GROUP_META[groupId].subtitle}>
        <AdminNavChips />
        <section className="panel-subcard">
          <SectionTitle title={`${ADMIN_GROUP_META[groupId].label} Routes`} subtitle="Open a focused section without leaving admin flow." />
          {routes.length === 0 ? (
            <StateBlock state="empty" title="No available routes in this group" />
          ) : (
            <div className="admin-link-grid">
              {routes.map((item) => (
                <Link key={item.key} className="admin-link-card" href={item.href}>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </AdminPageScaffold>
    </PermissionGate>
  );
}

export function AdminRouteSectionSwitch({ routeKey }: { routeKey: string }) {
  const runtime = useChatRuntime();
  const normalizedRouteKey = routeKey.toLowerCase();
  const routeKeyAlias: Record<string, string> = {
    notify: "channel-notify",
    temprooms: "temp-rooms",
    membermeta: "member-meta"
  };
  const canonicalRouteKey = routeKeyAlias[normalizedRouteKey] ?? normalizedRouteKey;
  const knownRoute = getAdminRouteDefinitions(runtime.chatId).find((route) => route.key === canonicalRouteKey);
  if (knownRoute && !canAccessAdminRoute(runtime, knownRoute)) {
    return <AdminDirectorySection />;
  }

  switch (routeKey) {
    case "":
    case "overview":
      return <AdminDirectorySection />;
    case "hub":
      return <AdminHubSection />;
    case "core":
      return <AdminGroupSection groupId="core" />;
    case "ops":
      return <AdminGroupSection groupId="ops" />;
    case "governance":
      return <AdminGroupSection groupId="governance" />;
    case "dev":
      return <AdminGroupSection groupId="dev" />;
    case "members":
      return <MembersAdminSection />;
    case "roles":
      return <RolesAdminSection />;
    case "limits":
      return <LimitsAdminSection />;
    case "invites":
      return <InvitesAdminSection />;
    case "channel-notify":
    case "notify":
      return <ChannelNotifyAdminSection />;
    case "tickets":
      return <TicketsAdminSection />;
    case "temp-rooms":
    case "temprooms":
      return <TempRoomsAdminSection />;
    case "broadcasts":
      return <BroadcastsAdminSection />;
    case "webhooks":
      return <WebhooksAdminSection />;
    case "automation":
      return <AutomationAdminSection />;
    case "incident":
      return <IncidentAdminSection />;
    case "audit":
      return <AuditAdminSection />;
    default:
      return <AdminDirectorySection />;
  }
}

export function AdminHubSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [roles, setRoles] = useState<ChatRole[]>([]);
  const [members, setMembers] = useState<MembersOverview["members"]>([]);
  const [pendingJoinRequests, setPendingJoinRequests] = useState(0);
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceReasonDraft, setMaintenanceReasonDraft] = useState("Scheduled update in progress.");
  const [maintenanceAnimating, setMaintenanceAnimating] = useState(false);
  const canManageMaintenance = runtime.isMaintenanceBypass;
  const base = `/chat/${encodeURIComponent(runtime.chatId)}/admin`;

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const [membersResult, rolesResult, requestsResult, incidentModeResult] = await Promise.all([
        api.listMembers(runtime.chatId),
        api.listRoles(runtime.chatId),
        api.listJoinRequests(runtime.chatId, "pending").catch(() => ({ requests: [] })),
        api.getIncidentModeState(runtime.chatId).catch(() => ({ ok: true as const, enabled: false, state: null }))
      ]);
      setMembers(membersResult.members);
      setRoles(rolesResult.sort((a, b) => b.priority - a.priority));
      setPendingJoinRequests(requestsResult.requests.length);
      setMaintenanceEnabled(incidentModeResult.enabled);
      if (incidentModeResult.state?.reason) {
        setMaintenanceReasonDraft(incidentModeResult.state.reason);
      }
      setState("ready");
    } catch (loadError) {
      const parsed = parseError(loadError);
      setError(parsed);
      setState(getPanelState(parsed.statusCode));
    }
  }, [api, runtime.chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusCounts = useMemo(
    () =>
      members.reduce(
        (acc, member) => {
          acc[member.status] += 1;
          return acc;
        },
        { active: 0, readonly: 0, muted: 0, banned: 0 }
      ),
    [members]
  );

  const defaultRole = useMemo(() => roles.find((role) => role.isDefault) ?? null, [roles]);

  const quickRoutes = useMemo(() => {
    const routes = getAdminRouteDefinitions(runtime.chatId).filter((route) => canAccessAdminRoute(runtime, route));
    const order = ["members", "roles", "limits", "invites", "channel-notify", "tickets", "incident", "audit"];
    const byKey = new Map(routes.map((route) => [route.key, route] as const));
    return order.map((key) => byKey.get(key)).filter((route): route is AdminRouteDefinition => Boolean(route));
  }, [runtime.chatId, runtime.isDeveloper, runtime.hasAnyPermission]);

  async function handleToggleMaintenanceMode(): Promise<void> {
    if (!canManageMaintenance) {
      setError({ message: "Only roles with maintenance permissions can change maintenance mode." });
      return;
    }
    const reason = maintenanceReasonDraft.trim() || "Scheduled update in progress.";
    setUpdating(true);
    setError(null);
    try {
      if (maintenanceEnabled) {
        await api.disableIncidentMode(runtime.chatId, reason);
      } else {
        await api.enableIncidentMode(runtime.chatId, {
          reason,
          policy_snapshot_json: {
            maintenance: true,
            lock_scope: "non_owner_non_admin",
            ui: "animated_lock_v1"
          }
        });
      }
      setMaintenanceAnimating(true);
      window.setTimeout(() => setMaintenanceAnimating(false), 520);
      await load();
    } catch (maintenanceError) {
      setError(parseError(maintenanceError));
      setMaintenanceAnimating(false);
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void load()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <PermissionGate
      allowed={quickRoutes.length > 0 || canManageMaintenance}
      hint="You do not have permissions for admin hub actions."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Admin Hub" subtitle="KPI and quick actions only. Open dedicated pages for detailed workflows.">
          <AdminNavChips />
          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <div className="admin-stats-grid">
            <article className="admin-stat-card">
              <strong>{members.length}</strong>
              <span>Members</span>
            </article>
            <article className="admin-stat-card">
              <strong>{statusCounts.active}</strong>
              <span>Active</span>
            </article>
            <article className="admin-stat-card">
              <strong>{statusCounts.muted}</strong>
              <span>Muted</span>
            </article>
            <article className="admin-stat-card">
              <strong>{statusCounts.banned}</strong>
              <span>Banned</span>
            </article>
            <article className="admin-stat-card">
              <strong>{roles.length}</strong>
              <span>Roles</span>
            </article>
            <article className="admin-stat-card">
              <strong>{pendingJoinRequests}</strong>
              <span>Pending Joins</span>
            </article>
            <article className="admin-stat-card">
              <strong>{defaultRole ? defaultRole.name : "-"}</strong>
              <span>Default Role</span>
            </article>
            <article className="admin-stat-card">
              <strong>{maintenanceEnabled ? "ON" : "OFF"}</strong>
              <span>Maintenance</span>
            </article>
          </div>

          <section className="panel-subcard">
            <SectionTitle title="Quick Actions" subtitle="Jump directly to needed admin sections." />
            <div className="admin-link-grid">
              {quickRoutes.map((route) => (
                <Link key={`hub-route-${route.key}`} className="admin-link-card" href={route.href}>
                  <strong>{route.label}</strong>
                  <span>{route.description}</span>
                </Link>
              ))}
            </div>
            <div className="panel-actions">
              <Button variant="secondary" onClick={() => void load()}>
                Refresh KPI
              </Button>
              <Link className="ds-btn ds-btn-secondary" href={`${base}/members`}>
                Open Members
              </Link>
              <Link className="ds-btn ds-btn-secondary" href={`${base}/roles`}>
                Open Roles
              </Link>
              <Link className="ds-btn ds-btn-secondary" href={`${base}/channel-notify`}>
                Open Notify
              </Link>
            </div>
          </section>

          <section
            className={`maintenance-admin-card ${maintenanceEnabled ? "is-on" : "is-off"}${maintenanceAnimating ? " is-animating" : ""}`}
          >
            <div className="maintenance-admin-head">
              <div>
                <strong>Maintenance mode</strong>
                <p>Quick switch. Advanced controls are in Incident section.</p>
              </div>
              <button
                type="button"
                className={`maintenance-admin-toggle${maintenanceEnabled ? " is-on" : ""}`}
                onClick={() => void handleToggleMaintenanceMode()}
                disabled={!canManageMaintenance || updating}
                aria-pressed={maintenanceEnabled}
              >
                <span>{maintenanceEnabled ? "ON" : "OFF"}</span>
              </button>
            </div>
            <label className="maintenance-admin-reason">
              Reason shown on lock screen
              <input
                value={maintenanceReasonDraft}
                onChange={(event) => setMaintenanceReasonDraft(event.target.value)}
                placeholder="Scheduled update in progress."
                disabled={!canManageMaintenance}
              />
            </label>
            {!canManageMaintenance ? (
              <RestrictionHint
                message="Only roles with maintenance permissions can switch maintenance mode."
                variant="warning"
              />
            ) : null}
          </section>
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function RolesAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [roles, setRoles] = useState<ChatRole[]>([]);
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePriority, setNewRolePriority] = useState("50");
  const [newRolePermissions, setNewRolePermissions] = useState("chat.view");
  const [simulationPerms, setSimulationPerms] = useState("chat.view,message.send.text");
  const [simulationActorId, setSimulationActorId] = useState("");
  const [simulation, setSimulation] = useState<PermissionSimulationResult | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [editorName, setEditorName] = useState("");
  const [editorPriority, setEditorPriority] = useState("50");
  const [editorIsDefault, setEditorIsDefault] = useState(false);
  const [editorPermissions, setEditorPermissions] = useState<string[]>([]);
  const [grantPermissionInput, setGrantPermissionInput] = useState("");
  const [revokePermissionInput, setRevokePermissionInput] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const list = await api.listRoles(runtime.chatId);
      setRoles(list.sort((a, b) => b.priority - a.priority));
      setState("ready");
    } catch (loadError) {
      const parsed = parseError(loadError);
      setError(parsed);
      setState(getPanelState(parsed.statusCode));
    }
  }, [api, runtime.chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (roles.length === 0) {
      setSelectedRoleId("");
      setEditorPermissions([]);
      return;
    }

    const selected = roles.find((entry) => entry.id === selectedRoleId) ?? roles[0];
    if (!selected) {
      return;
    }

    setSelectedRoleId(selected.id);
    setEditorName(selected.name);
    setEditorPriority(String(selected.priority));
    setEditorIsDefault(selected.isDefault);
    setEditorPermissions(selected.permissions);
  }, [roles, selectedRoleId]);

  async function handleCreateRole(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const name = newRoleName.trim();
    const priority = Number(newRolePriority);
    if (!name || !Number.isFinite(priority)) {
      return;
    }
    const permissions = newRolePermissions
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (permissions.length === 0) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.createRole(runtime.chatId, {
        name,
        priority,
        permissions
      });
      setNewRoleName("");
      await load();
    } catch (createError) {
      setError(parseError(createError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleAssign(roleId: string): Promise<void> {
    const userId = window.prompt("User ID to assign");
    if (!userId) {
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      await api.assignRole(runtime.chatId, roleId, userId.trim());
    } catch (assignError) {
      setError(parseError(assignError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleUpdateRole(role: ChatRole): Promise<void> {
    const nextName = window.prompt("Role name", role.name);
    if (nextName === null) {
      return;
    }

    const nextPriorityRaw = window.prompt("Role priority", String(role.priority));
    if (nextPriorityRaw === null) {
      return;
    }
    const nextPriority = Number(nextPriorityRaw);
    if (!Number.isFinite(nextPriority)) {
      setError({ message: "Role priority must be a valid number." });
      return;
    }

    const nextPermissionsRaw = window.prompt("Permissions (comma-separated)", role.permissions.join(","));
    if (nextPermissionsRaw === null) {
      return;
    }
    const nextPermissions = csvList(nextPermissionsRaw);
    if (nextPermissions.length === 0) {
      setError({ message: "At least one permission is required." });
      return;
    }

    const defaultRaw = window.prompt("Set as default? (yes/no)", role.isDefault ? "yes" : "no");
    if (defaultRaw === null) {
      return;
    }
    const normalizedDefault = defaultRaw.trim().toLowerCase();
    const isDefault = normalizedDefault === "yes" || normalizedDefault === "y" || normalizedDefault === "true" || normalizedDefault === "1";

    setUpdating(true);
    setError(null);
    try {
      await api.updateRole(runtime.chatId, role.id, {
        name: nextName.trim() || role.name,
        priority: Math.floor(nextPriority),
        permissions: nextPermissions,
        isDefault
      });
      await load();
    } catch (updateError) {
      setError(parseError(updateError));
    } finally {
      setUpdating(false);
    }
  }

  function toggleEditorPermission(permission: string): void {
    setEditorPermissions((prev) =>
      prev.includes(permission) ? prev.filter((entry) => entry !== permission) : [...prev, permission]
    );
  }

  function setEditorFullAccess(enabled: boolean): void {
    setEditorPermissions((prev) => {
      if (enabled) {
        return ["*"];
      }
      return prev.filter((permission) => permission !== "*");
    });
  }

  function applyPermissionPreset(presetKey: keyof typeof ROLE_PERMISSION_PRESETS): void {
    const preset = ROLE_PERMISSION_PRESETS[presetKey];
    setEditorPermissions(Array.from(new Set(preset)));
  }

  async function handleSaveSelectedRole(): Promise<void> {
    if (!selectedRoleId) {
      setError({ message: "Select role first." });
      return;
    }
    const nextPriority = Number(editorPriority);
    if (!Number.isFinite(nextPriority)) {
      setError({ message: "Role priority must be a valid number." });
      return;
    }
    if (editorPermissions.length === 0) {
      setError({ message: "At least one permission is required." });
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.updateRole(runtime.chatId, selectedRoleId, {
        name: editorName.trim(),
        priority: Math.floor(nextPriority),
        permissions: editorPermissions,
        isDefault: editorIsDefault
      });
      await load();
    } catch (updateError) {
      setError(parseError(updateError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleGrantFromInput(roleId: string): Promise<void> {
    const permission = grantPermissionInput.trim();
    if (!permission) {
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      await api.grantRolePermissions(runtime.chatId, roleId, [permission]);
      setGrantPermissionInput("");
      await load();
    } catch (grantError) {
      setError(parseError(grantError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleRevokeFromInput(roleId: string): Promise<void> {
    const permission = revokePermissionInput.trim();
    if (!permission) {
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      await api.revokeRolePermissions(runtime.chatId, roleId, [permission]);
      setRevokePermissionInput("");
      await load();
    } catch (revokeError) {
      setError(parseError(revokeError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleSimulate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const permissions = simulationPerms
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    setUpdating(true);
    setError(null);
    try {
      const result = await api.simulatePermissions(runtime.chatId, {
        actor_user_id: simulationActorId.trim() || undefined,
        permissions
      });
      setSimulation(result);
    } catch (simulateError) {
      setError(parseError(simulateError));
    } finally {
      setUpdating(false);
    }
  }

  const selectedRole = roles.find((entry) => entry.id === selectedRoleId) ?? null;
  const unknownEditorPermissions = editorPermissions.filter(
    (permission) => permission !== "*" && !KNOWN_ROLE_PERMISSIONS.has(permission)
  );

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void load()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.roles ?? [])}
      hint="Role and permission management rights are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Roles and Permissions" subtitle="Connected to /roles and permission simulation.">
          <AdminNavChips />
          <form className="panel-form" onSubmit={handleCreateRole}>
            <label>
              Role name
              <input value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} />
            </label>
            <label>
              Priority
              <input type="number" value={newRolePriority} onChange={(event) => setNewRolePriority(event.target.value)} />
            </label>
            <label>
              Permissions (comma-separated)
              <textarea value={newRolePermissions} onChange={(event) => setNewRolePermissions(event.target.value)} rows={2} />
            </label>
            <div className="panel-actions">
              <Button type="submit">Create role</Button>
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Refresh
              </Button>
            </div>
          </form>

          <section className="panel-subcard">
            <SectionTitle title="Role Editor" subtitle="Visual role/permission editor with presets." />
            <div className="panel-form">
              <label>
                Role
                <select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} (p{role.priority})
                    </option>
                  ))}
                </select>
              </label>
              {selectedRole ? (
                <>
                  <label>
                    Name
                    <input value={editorName} onChange={(event) => setEditorName(event.target.value)} />
                  </label>
                  <label>
                    Priority
                    <input type="number" value={editorPriority} onChange={(event) => setEditorPriority(event.target.value)} />
                  </label>
                  <label className="panel-inline-check">
                    <input
                      type="checkbox"
                      checked={editorIsDefault}
                      onChange={(event) => setEditorIsDefault(event.target.checked)}
                    />
                    <span>Default role for new members</span>
                  </label>
                  <div className="panel-actions">
                    <Button size="sm" variant="secondary" onClick={() => applyPermissionPreset("member_default")}>
                      Preset: Member
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyPermissionPreset("legit_limited")}>
                      Preset: Legit
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyPermissionPreset("moderator_core")}>
                      Preset: Moderator
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyPermissionPreset("admin_core")}>
                      Preset: Admin
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyPermissionPreset("owner_all")}>
                      Preset: Owner
                    </Button>
                  </div>
                  <label className="panel-inline-check">
                    <input
                      type="checkbox"
                      checked={editorPermissions.includes("*")}
                      onChange={(event) => setEditorFullAccess(event.target.checked)}
                    />
                    <span>Full access (*)</span>
                  </label>
                  <div className="permission-grid">
                    {ROLE_PERMISSION_GROUPS.map((group) => (
                      <article key={group.label} className="permission-group-card">
                        <header>
                          <strong>{group.label}</strong>
                        </header>
                        <div className="permission-check-list">
                          {group.permissions.map((permission) => (
                            <label key={`${group.label}:${permission}`} className="panel-inline-check">
                              <input
                                type="checkbox"
                                checked={editorPermissions.includes(permission) || editorPermissions.includes("*")}
                                onChange={() => toggleEditorPermission(permission)}
                                disabled={editorPermissions.includes("*")}
                              />
                              <span>{permission}</span>
                            </label>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                  {unknownEditorPermissions.length > 0 ? (
                    <section className="panel-subcard">
                      <SectionTitle
                        title="Custom permissions"
                        subtitle="These permissions are not in checkbox groups. You can remove them here."
                      />
                      <div className="panel-chip-list">
                        {unknownEditorPermissions.map((permission) => (
                          <div key={`unknown-editor-perm-${permission}`} className="panel-chip">
                            <button type="button" onClick={() => toggleEditorPermission(permission)}>
                              {permission} x
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  <label>
                    Manual permission list (comma-separated)
                    <textarea
                      rows={3}
                      value={editorPermissions.join(",")}
                      onChange={(event) => setEditorPermissions(csvList(event.target.value))}
                    />
                  </label>
                  <div className="panel-actions">
                    <Button type="button" onClick={() => void handleSaveSelectedRole()}>
                      Save role
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void load()}>
                      Reload
                    </Button>
                  </div>
                </>
              ) : (
                <StateBlock state="empty" title="No roles found" description="Create a role first." />
              )}
            </div>
          </section>

          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <div className="panel-list">
            {roles.map((role) => (
              <article key={role.id} className="panel-item">
                <header>
                  <strong>
                    {role.name} (p{role.priority})
                  </strong>
                  <time>{role.isDefault ? "default" : role.isSystem ? "system" : "custom"}</time>
                </header>
                <p>{role.permissions.join(", ") || "No permissions"}</p>
                <div className="panel-actions">
                  <Button size="sm" variant="secondary" onClick={() => void handleUpdateRole(role)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void handleAssign(role.id)}>
                    Assign
                  </Button>
                </div>
                <div className="panel-inline-form">
                  <input
                    placeholder="permission to grant"
                    value={grantPermissionInput}
                    onChange={(event) => setGrantPermissionInput(event.target.value)}
                  />
                  <Button size="sm" variant="secondary" onClick={() => void handleGrantFromInput(role.id)}>
                    Grant
                  </Button>
                </div>
                <div className="panel-inline-form">
                  <input
                    placeholder="permission to revoke"
                    value={revokePermissionInput}
                    onChange={(event) => setRevokePermissionInput(event.target.value)}
                  />
                  <Button size="sm" variant="secondary" onClick={() => void handleRevokeFromInput(role.id)}>
                    Revoke
                  </Button>
                </div>
              </article>
            ))}
          </div>

          <section className="panel-subcard">
            <SectionTitle title="Permission Simulation" subtitle="Connected to /roles/permissions/simulate." />
            <form className="panel-form" onSubmit={handleSimulate}>
              <label>
                Actor user ID (optional)
                <input value={simulationActorId} onChange={(event) => setSimulationActorId(event.target.value)} />
              </label>
              <label>
                Permissions (comma-separated)
                <textarea value={simulationPerms} onChange={(event) => setSimulationPerms(event.target.value)} rows={2} />
              </label>
              <div className="panel-actions">
                <Button type="submit">Run simulation</Button>
              </div>
            </form>
            {simulation ? (
              <div className="panel-list">
                {simulation.permissions.map((entry) => (
                  <article key={entry.permission} className="panel-item">
                    <header>
                      <strong>{entry.permission}</strong>
                      <time>{entry.allowed ? "allowed" : "denied"}</time>
                    </header>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function LimitsAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [overview, setOverview] = useState<LimitsOverview | null>(null);
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [slowmodeSeconds, setSlowmodeSeconds] = useState("0");
  const [messagesPerHour, setMessagesPerHour] = useState("");
  const [messagesPerDay, setMessagesPerDay] = useState("");
  const [exceedAction, setExceedAction] = useState<"warn" | "mute" | "reject">("warn");
  const [exceedMuteSeconds, setExceedMuteSeconds] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const next = await api.listLimits(runtime.chatId);
      setOverview(next);
      setState("ready");
    } catch (loadError) {
      const parsed = parseError(loadError);
      setError(parsed);
      setState(getPanelState(parsed.statusCode));
    }
  }, [api, runtime.chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!overview || overview.roles.length === 0) {
      return;
    }
    const role = overview.roles.find((entry) => entry.roleId === selectedRoleId) ?? overview.roles[0];
    if (!role) {
      return;
    }
    setSelectedRoleId(role.roleId);
    setSlowmodeSeconds(String(role.limits.slowmodeSeconds));
    setMessagesPerHour(role.limits.messagesPerHour === null ? "" : String(role.limits.messagesPerHour));
    setMessagesPerDay(role.limits.messagesPerDay === null ? "" : String(role.limits.messagesPerDay));
    setExceedAction(role.limits.exceedAction);
    setExceedMuteSeconds(role.limits.exceedMuteSeconds === null ? "" : String(role.limits.exceedMuteSeconds));
  }, [overview, selectedRoleId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedRoleId) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.updateRoleLimits(runtime.chatId, selectedRoleId, {
        slowmodeSeconds: Number(slowmodeSeconds || "0"),
        messagesPerHour: messagesPerHour.trim() ? Number(messagesPerHour) : null,
        messagesPerDay: messagesPerDay.trim() ? Number(messagesPerDay) : null,
        exceedAction,
        exceedMuteSeconds: exceedMuteSeconds.trim() ? Number(exceedMuteSeconds) : null
      });
      await load();
    } catch (updateError) {
      setError(parseError(updateError));
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void load()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.limits ?? [])}
      hint="Limits management permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Limits and Timers" subtitle="Connected to /limits and /limits/roles/:roleId.">
          <AdminNavChips />
          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}
          {overview ? (
            <>
              <div className="panel-list">
                {overview.roles.map((entry) => (
                  <article key={entry.roleId} className="panel-item">
                    <header>
                      <strong>
                        {entry.roleName} (p{entry.rolePriority})
                      </strong>
                      <time>slowmode: {entry.limits.slowmodeSeconds}s</time>
                    </header>
                    <p>
                      per hour: {entry.limits.messagesPerHour ?? "-"}, per day: {entry.limits.messagesPerDay ?? "-"}, action:{" "}
                      {entry.limits.exceedAction}
                    </p>
                  </article>
                ))}
              </div>
              <form className="panel-form" onSubmit={handleSubmit}>
                <label>
                  Role
                  <select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}>
                    {overview.roles.map((entry) => (
                      <option key={entry.roleId} value={entry.roleId}>
                        {entry.roleName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Slowmode seconds
                  <input type="number" value={slowmodeSeconds} onChange={(event) => setSlowmodeSeconds(event.target.value)} />
                </label>
                <label>
                  Messages per hour (empty = null)
                  <input type="number" value={messagesPerHour} onChange={(event) => setMessagesPerHour(event.target.value)} />
                </label>
                <label>
                  Messages per day (empty = null)
                  <input type="number" value={messagesPerDay} onChange={(event) => setMessagesPerDay(event.target.value)} />
                </label>
                <label>
                  Exceed action
                  <select value={exceedAction} onChange={(event) => setExceedAction(event.target.value as "warn" | "mute" | "reject")}>
                    <option value="warn">warn</option>
                    <option value="mute">mute</option>
                    <option value="reject">reject</option>
                  </select>
                </label>
                <label>
                  Exceed mute seconds (empty = null)
                  <input type="number" value={exceedMuteSeconds} onChange={(event) => setExceedMuteSeconds(event.target.value)} />
                </label>
                <div className="panel-actions">
                  <Button type="submit">Update limits</Button>
                  <Button type="button" variant="secondary" onClick={() => void load()}>
                    Refresh
                  </Button>
                </div>
              </form>
            </>
          ) : null}
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function MembersAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const canAssignRoles = runtime.hasAnyPermission(["role.assign", "role.unassign"]);
  const canMute = runtime.hasPermission("member.mute");
  const canKick = runtime.hasPermission("member.kick");
  const canBan = runtime.hasPermission("member.ban");
  const canUnban = runtime.hasPermission("member.unban");
  const [overview, setOverview] = useState<MembersOverview | null>(null);
  const [roles, setRoles] = useState<ChatRole[]>([]);
  const [moderationHistory, setModerationHistory] = useState<ModerationHistoryEntry[]>([]);
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "readonly" | "muted" | "banned">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleDraftByUserId, setRoleDraftByUserId] = useState<Record<string, string>>({});
  const [selectedMemberUserId, setSelectedMemberUserId] = useState("");
  const members = overview?.members ?? [];

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const [members, roleList, moderationHistoryResult] = await Promise.all([
        api.listMembers(runtime.chatId),
        api.listRoles(runtime.chatId).catch(() => []),
        api.listModerationHistory(runtime.chatId, { limit: 250 }).catch(() => ({ chatId: runtime.chatId, events: [] }))
      ]);
      setOverview(members);
      setRoles(roleList);
      setModerationHistory(moderationHistoryResult.events);
      setRoleDraftByUserId(
        Object.fromEntries(members.members.map((member) => [member.userId, member.roleId]))
      );
      setState("ready");
    } catch (loadError) {
      const parsed = parseError(loadError);
      setError(parsed);
      setState(getPanelState(parsed.statusCode));
    }
  }, [api, runtime.chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (members.length === 0) {
      setSelectedMemberUserId("");
      return;
    }
    if (!selectedMemberUserId || !members.some((member) => member.userId === selectedMemberUserId)) {
      setSelectedMemberUserId(members[0]!.userId);
    }
  }, [members, selectedMemberUserId]);

  function getMemberIdentityLabel(member: MembersOverview["members"][number]): string {
    const shortMemberId = member.shortUserId ?? shortId(member.userId);
    const usernameLabel = member.telegramUsername ? `@${member.telegramUsername}` : "no_username";
    const telegramIdLabel = member.telegramId ?? "no_tg_id";
    return `${shortMemberId} | ${usernameLabel} | tg:${telegramIdLabel}`;
  }

  function getMemberTelegramLine(member: MembersOverview["members"][number]): string {
    const username = member.telegramUsername ? `@${member.telegramUsername}` : "no_username";
    const telegramId = member.telegramId ?? "no_tg_id";
    return `${username} | tg:${telegramId}`;
  }

  async function withMemberAction(
    userId: string,
    action: (reason?: string) => Promise<unknown>,
    reasonHint: string
  ): Promise<void> {
    const reason = window.prompt("Reason", reasonHint) ?? undefined;
    setUpdating(true);
    setError(null);
    try {
      await action(reason);
      await load();
    } catch (actionError) {
      setError(parseError(actionError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleSetRole(userId: string): Promise<void> {
    const roleId = roleDraftByUserId[userId];
    if (!roleId) {
      setError({ message: "Select role first." });
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      await api.assignRole(runtime.chatId, roleId, userId);
      await load();
    } catch (assignError) {
      setError(parseError(assignError));
    } finally {
      setUpdating(false);
    }
  }

  const statusCounts = useMemo(
    () =>
      members.reduce(
        (acc, member) => {
          acc[member.status] += 1;
          return acc;
        },
        {
          active: 0,
          readonly: 0,
          muted: 0,
          banned: 0
        }
      ),
    [members]
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleMembers = members.filter((member) => {
    if (statusFilter !== "all" && member.status !== statusFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const shortMemberId = (member.shortUserId ?? shortId(member.userId)).toLowerCase();
    const telegramUsername = (member.telegramUsername ?? "").toLowerCase();
    const telegramId = member.telegramId === null || member.telegramId === undefined ? "" : String(member.telegramId);
    return (
      member.userId.toLowerCase().includes(normalizedQuery) ||
      shortMemberId.includes(normalizedQuery) ||
      member.roleName.toLowerCase().includes(normalizedQuery) ||
      telegramUsername.includes(normalizedQuery) ||
      telegramId.includes(normalizedQuery)
    );
  });
  const memberByUserId = useMemo(() => {
    return new Map(members.map((member) => [member.userId, member] as const));
  }, [members]);
  const getUserRefLabel = useCallback(
    (userId: string): string => {
      const member = memberByUserId.get(userId);
      if (member) {
        return getMemberIdentityLabel(member);
      }
      return shortId(userId);
    },
    [memberByUserId]
  );
  const latestModerationByTargetAndAction = useMemo(() => {
    const result = new Map<string, ModerationHistoryEntry>();
    for (const event of moderationHistory) {
      const key = `${event.targetId}:${event.action}`;
      if (!result.has(key)) {
        result.set(key, event);
      }
    }
    return result;
  }, [moderationHistory]);
  const mutedMembers = useMemo(() => visibleMembers.filter((member) => member.status === "muted"), [visibleMembers]);
  const bannedMembers = useMemo(() => visibleMembers.filter((member) => member.status === "banned"), [visibleMembers]);
  const recentKickEvents = useMemo(
    () =>
      moderationHistory
        .filter((entry) => entry.action === "member.kick")
        .filter((entry) => (normalizedQuery ? entry.targetId.toLowerCase().includes(normalizedQuery) : true))
        .slice(0, 30),
    [moderationHistory, normalizedQuery]
  );
  const selectedMember = useMemo(
    () => members.find((member) => member.userId === selectedMemberUserId) ?? null,
    [members, selectedMemberUserId]
  );
  const selectedMemberAdminActions = useMemo(
    () => moderationHistory.filter((entry) => entry.targetId === selectedMemberUserId).slice(0, 30),
    [moderationHistory, selectedMemberUserId]
  );

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void load()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.members ?? [])}
      hint="Member moderation permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Members and Moderation" subtitle="Connected to /members and moderation actions.">
          <AdminNavChips />
          <div className="admin-stats-grid">
            <article className="admin-stat-card">
              <strong>{members.length}</strong>
              <span>Total</span>
            </article>
            <article className="admin-stat-card">
              <strong>{statusCounts.active}</strong>
              <span>Active</span>
            </article>
            <article className="admin-stat-card">
              <strong>{statusCounts.muted}</strong>
              <span>Muted</span>
            </article>
            <article className="admin-stat-card">
              <strong>{statusCounts.banned}</strong>
              <span>Banned</span>
            </article>
          </div>
          <div className="panel-toolbar">
            <label>
              Status filter
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "readonly" | "muted" | "banned")}
              >
                <option value="all">all</option>
                <option value="active">active</option>
                <option value="readonly">readonly</option>
                <option value="muted">muted</option>
                <option value="banned">banned</option>
              </select>
            </label>
            <label>
              Search user/role
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="user id / short id / @username / tg id / role..."
              />
            </label>
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          </div>

          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          {visibleMembers.length === 0 ? (
            <StateBlock state="empty" title="No members" description="No members matched current filter." />
          ) : (
            <>
              <div className="panel-list">
                {visibleMembers.map((member) => (
                  <article
                    key={member.id}
                    className={`panel-item member-admin-card${member.userId === selectedMemberUserId ? " is-selected" : ""}`}
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest("button, select, input, textarea, a")) {
                        return;
                      }
                      setSelectedMemberUserId(member.userId);
                    }}
                  >
                  <header>
                    <strong>{getMemberIdentityLabel(member)}</strong>
                    <time>
                      {member.status} | role: {member.roleName} (p{member.rolePriority})
                    </time>
                  </header>
                  <div className="member-admin-meta">
                    <span>Telegram: {getMemberTelegramLine(member)}</span>
                    <span>User ID: {member.userId}</span>
                    <span>Joined: {formatDateTime(member.joinedAt)}</span>
                    {member.mutedUntil ? <span>Muted until: {formatDateTime(member.mutedUntil)}</span> : null}
                    {member.bannedUntil ? <span>Banned until: {formatDateTime(member.bannedUntil)}</span> : null}
                  </div>
                  {canAssignRoles ? (
                    <div className="panel-inline-form">
                      <select
                        value={roleDraftByUserId[member.userId] ?? member.roleId}
                        onChange={(event) =>
                          setRoleDraftByUserId((prev) => ({
                            ...prev,
                            [member.userId]: event.target.value
                          }))
                        }
                      >
                        {roles.map((role) => (
                          <option key={`${member.userId}:${role.id}`} value={role.id}>
                            {role.name} (p{role.priority})
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleSetRole(member.userId)}
                        disabled={!roleDraftByUserId[member.userId] || roleDraftByUserId[member.userId] === member.roleId}
                      >
                        Set role
                      </Button>
                    </div>
                  ) : null}
                  <div className="panel-actions">
                    {canMute ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void withMemberAction(
                            member.userId,
                            (reason) => api.muteMember(runtime.chatId, member.userId, reason),
                            "manual mute"
                          )
                        }
                      >
                        Mute
                      </Button>
                    ) : null}
                    {canKick ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          void withMemberAction(member.userId, (reason) => api.kickMember(runtime.chatId, member.userId, reason), "kick")
                        }
                      >
                        Kick
                      </Button>
                    ) : null}
                    {canBan ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          void withMemberAction(member.userId, (reason) => api.banMember(runtime.chatId, member.userId, reason), "ban")
                        }
                      >
                        Ban
                      </Button>
                    ) : null}
                    {canUnban ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void withMemberAction(member.userId, (reason) => api.unbanMember(runtime.chatId, member.userId, reason), "unban")
                        }
                      >
                        Unban
                      </Button>
                    ) : null}
                  </div>
                </article>
                ))}
              </div>
              <section className="panel-subcard admin-inline-subcard">
                <SectionTitle
                  title="Selected User: Admin Actions"
                  subtitle="Tap a user card above to inspect latest admin actions on that user."
                />
                {selectedMember === null ? (
                  <StateBlock state="empty" title="Select a user" description="Tap any user card to load actions." />
                ) : selectedMemberAdminActions.length === 0 ? (
                  <StateBlock
                    state="empty"
                    title="No admin actions found"
                    description={`No moderation/delete actions found for ${getMemberIdentityLabel(selectedMember)}.`}
                  />
                ) : (
                  <div className="panel-list">
                    {selectedMemberAdminActions.map((entry) => (
                      <article key={`member-action-${entry.id}`} className="panel-item">
                        <header>
                          <strong>{moderationActionLabel(entry.action)}</strong>
                          <time>{formatDateTime(entry.createdAt)}</time>
                        </header>
                        <p>
                          by: {getUserRefLabel(entry.actorId)}
                          {entry.action === "message.delete" && entry.messageId ? ` | message: ${entry.messageId}` : ""}
                          {entry.reason ? ` | reason: ${entry.reason}` : ""}
                        </p>
                        {entry.action === "message.delete" ? (
                          <p className="member-admin-deleted-preview">{entry.deletedMessageText ?? "[message preview unavailable]"}</p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section className="panel-subcard admin-inline-subcard">
                <SectionTitle title="Muted Members" subtitle="Current muted users and who muted them." />
              {mutedMembers.length === 0 ? (
                <StateBlock state="empty" title="No muted users" />
              ) : (
                <div className="panel-list">
                  {mutedMembers.map((member) => {
                    const event =
                      latestModerationByTargetAndAction.get(`${member.userId}:member.timeout`) ??
                      latestModerationByTargetAndAction.get(`${member.userId}:member.mute`) ??
                      null;
                    return (
                      <article key={`muted-${member.id}`} className="panel-item">
                        <header>
                          <strong>{getMemberIdentityLabel(member)}</strong>
                          <time>{member.mutedUntil ? `until ${formatDateTime(member.mutedUntil)}` : "muted"}</time>
                        </header>
                        <p>
                          by: {event ? getUserRefLabel(event.actorId) : "unknown"} | at:{" "}
                          {event ? formatDateTime(event.createdAt) : "-"} | reason: {event?.reason ?? "-"}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="panel-subcard admin-inline-subcard">
              <SectionTitle title="Banned Members" subtitle="Current bans and who issued them." />
              {bannedMembers.length === 0 ? (
                <StateBlock state="empty" title="No banned users" />
              ) : (
                <div className="panel-list">
                  {bannedMembers.map((member) => {
                    const event = latestModerationByTargetAndAction.get(`${member.userId}:member.ban`) ?? null;
                    return (
                      <article key={`banned-${member.id}`} className="panel-item">
                        <header>
                          <strong>{getMemberIdentityLabel(member)}</strong>
                          <time>banned</time>
                        </header>
                        <p>
                          by: {event ? getUserRefLabel(event.actorId) : "unknown"} | at:{" "}
                          {event ? formatDateTime(event.createdAt) : "-"} | reason: {event?.reason ?? "-"}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="panel-subcard admin-inline-subcard">
              <SectionTitle title="Recent Kicks" subtitle="Latest kick actions with moderator and reason." />
              {recentKickEvents.length === 0 ? (
                <StateBlock state="empty" title="No kick events" />
              ) : (
                <div className="panel-list">
                  {recentKickEvents.map((event) => (
                    <article key={event.id} className="panel-item">
                      <header>
                        <strong>{getUserRefLabel(event.targetId)}</strong>
                        <time>{formatDateTime(event.createdAt)}</time>
                      </header>
                      <p>
                        action: {moderationActionLabel(event.action)} | by: {getUserRefLabel(event.actorId)} | reason:{" "}
                        {event.reason ?? "-"}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
            </>
          )}
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function InvitesAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [invites, setInvites] = useState<ChatInvite[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [roles, setRoles] = useState<ChatRole[]>([]);
  const [policy, setPolicy] = useState<JoinPolicy | null>(null);
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);

  const [inviteMode, setInviteMode] = useState<"auto" | "manual">("manual");
  const [inviteTargetRoleId, setInviteTargetRoleId] = useState("");
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [inviteExpiresAt, setInviteExpiresAt] = useState("");

  const [policyMode, setPolicyMode] = useState<"auto" | "manual">("manual");
  const [policyRoleId, setPolicyRoleId] = useState("");
  const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setState("loading");
    } else {
      setUpdating(true);
    }
    setError(null);
    try {
      const [invitesResult, requestsResult, policyResult, roleList] = await Promise.all([
        api.listInvites(runtime.chatId),
        api.listJoinRequests(runtime.chatId, "pending"),
        api.getJoinPolicy(runtime.chatId),
        api.listRoles(runtime.chatId).catch(() => [])
      ]);
      setInvites(
        invitesResult.invites.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
      );
      setRequests(
        requestsResult.requests.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
      );
      setRoles(roleList.sort((a, b) => b.priority - a.priority));
      setPolicy(policyResult.policy);
      if (!silent) {
        setState("ready");
      }
    } catch (loadError) {
      const parsed = parseError(loadError);
      setError(parsed);
      if (!silent) {
        setState(getPanelState(parsed.statusCode));
      }
    } finally {
      if (silent) {
        setUpdating(false);
      }
    }
  }, [api, runtime.chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!policy) {
      return;
    }
    setPolicyMode(policy.default_approval_mode);
    setPolicyRoleId(policy.default_target_role_id ?? "");
  }, [policy]);

  useEffect(() => {
    if (!runtime.wsConnected) {
      return;
    }
    if (state !== "ready" && state !== "updating") {
      return;
    }

    if (liveRefreshTimerRef.current) {
      clearTimeout(liveRefreshTimerRef.current);
    }
    liveRefreshTimerRef.current = setTimeout(() => {
      void load(true);
    }, 450);

    return () => {
      if (liveRefreshTimerRef.current) {
        clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
    };
  }, [load, runtime.liveInvalidation.invites, runtime.wsConnected, state]);

  async function handleCreateInvite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    setUpdating(true);
    setError(null);
    try {
      const payload: {
        approval_mode?: "auto" | "manual";
        target_role_id?: string | null;
        max_uses?: number | null;
        expires_at?: string | null;
      } = {
        approval_mode: inviteMode
      };
      payload.target_role_id = inviteTargetRoleId.trim() ? inviteTargetRoleId.trim() : null;
      payload.max_uses = inviteMaxUses.trim() ? Number(inviteMaxUses) : null;
      payload.expires_at = inviteExpiresAt.trim() ? new Date(inviteExpiresAt).toISOString() : null;

      await api.createInvite(runtime.chatId, payload);
      setInviteMaxUses("");
      setInviteExpiresAt("");
      await load();
    } catch (createError) {
      setError(parseError(createError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleUpdatePolicy(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setUpdating(true);
    setError(null);
    try {
      await api.updateJoinPolicy(runtime.chatId, {
        default_approval_mode: policyMode,
        default_target_role_id: policyRoleId.trim() ? policyRoleId.trim() : null
      });
      await load();
    } catch (policyError) {
      setError(parseError(policyError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleRevoke(inviteId: string): Promise<void> {
    setUpdating(true);
    setError(null);
    try {
      await api.revokeInvite(runtime.chatId, inviteId);
      await load();
    } catch (revokeError) {
      setError(parseError(revokeError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleUpdateInvite(invite: ChatInvite): Promise<void> {
    const nextModeRaw = window.prompt("Approval mode (manual/auto)", invite.approvalMode);
    if (nextModeRaw === null) {
      return;
    }
    const normalizedMode = nextModeRaw.trim().toLowerCase();
    if (normalizedMode !== "manual" && normalizedMode !== "auto") {
      setError({ message: "Approval mode must be 'manual' or 'auto'." });
      return;
    }

    const nextRoleId = window.prompt("Target role ID (empty = none)", invite.targetRoleId ?? "");
    if (nextRoleId === null) {
      return;
    }

    const nextMaxUsesRaw = window.prompt(
      "Max uses (empty = unlimited)",
      invite.maxUses === null ? "" : String(invite.maxUses)
    );
    if (nextMaxUsesRaw === null) {
      return;
    }
    const nextMaxUses = nextMaxUsesRaw.trim() ? Number(nextMaxUsesRaw) : null;
    if (nextMaxUsesRaw.trim() && !Number.isFinite(nextMaxUses)) {
      setError({ message: "Max uses must be a valid number." });
      return;
    }

    const nextExpiresAtRaw = window.prompt(
      "Expires at ISO datetime (empty = never)",
      invite.expiresAt ?? ""
    );
    if (nextExpiresAtRaw === null) {
      return;
    }
    const expiresTrimmed = nextExpiresAtRaw.trim();
    let nextExpiresAt: string | null = null;
    if (expiresTrimmed) {
      const parsed = Date.parse(expiresTrimmed);
      if (!Number.isFinite(parsed)) {
        setError({ message: "Expires at must be a valid datetime." });
        return;
      }
      nextExpiresAt = new Date(parsed).toISOString();
    }

    setUpdating(true);
    setError(null);
    try {
      await api.updateInvite(runtime.chatId, invite.id, {
        approval_mode: normalizedMode as "manual" | "auto",
        target_role_id: nextRoleId.trim() ? nextRoleId.trim() : null,
        max_uses: nextMaxUsesRaw.trim() ? Number(nextMaxUses) : null,
        expires_at: nextExpiresAt
      });
      await load();
    } catch (updateError) {
      setError(parseError(updateError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleRotate(inviteId: string): Promise<void> {
    const code = window.prompt("New invite code (optional, leave empty for auto-generated)");
    setUpdating(true);
    setError(null);
    try {
      const normalized = code?.trim();
      await api.rotateInviteCode(runtime.chatId, inviteId, normalized ? normalized : undefined);
      await load();
    } catch (rotateError) {
      setError(parseError(rotateError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleApproveJoin(requestId: string): Promise<void> {
    setUpdating(true);
    setError(null);
    try {
      await api.approveJoinRequest(runtime.chatId, requestId);
      await load();
    } catch (approveError) {
      setError(parseError(approveError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleRejectJoin(requestId: string): Promise<void> {
    const reason = window.prompt("Reject reason (optional)") ?? undefined;
    setUpdating(true);
    setError(null);
    try {
      await api.rejectJoinRequest(runtime.chatId, requestId, reason?.trim() || undefined);
      await load();
    } catch (rejectError) {
      setError(parseError(rejectError));
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void load()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.invites ?? [])}
      hint="Invite and join policy permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Invites and Join Policy" subtitle="Connected to /invites, /join-requests, /join-policy.">
          <AdminNavChips />

          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <section className="panel-subcard">
            <SectionTitle title="Join Policy" subtitle="Default approval mode and target role for join flow." />
            <form className="panel-form" onSubmit={handleUpdatePolicy}>
              <label>
                Default approval mode
                <select value={policyMode} onChange={(event) => setPolicyMode(event.target.value as "auto" | "manual")}>
                  <option value="manual">manual</option>
                  <option value="auto">auto</option>
                </select>
              </label>
              <label>
                Default target role
                <select value={policyRoleId} onChange={(event) => setPolicyRoleId(event.target.value)}>
                  <option value="">None</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="panel-actions">
                <Button type="submit">Update join policy</Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Create Invite" subtitle="Approval mode, quota and expiration controls." />
            <form className="panel-form" onSubmit={handleCreateInvite}>
              <label>
                Approval mode
                <select value={inviteMode} onChange={(event) => setInviteMode(event.target.value as "auto" | "manual")}>
                  <option value="manual">manual</option>
                  <option value="auto">auto</option>
                </select>
              </label>
              <label>
                Target role
                <select value={inviteTargetRoleId} onChange={(event) => setInviteTargetRoleId(event.target.value)}>
                  <option value="">None</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Max uses (empty = unlimited)
                <input type="number" min={1} value={inviteMaxUses} onChange={(event) => setInviteMaxUses(event.target.value)} />
              </label>
              <label>
                Expires at (optional)
                <input type="datetime-local" value={inviteExpiresAt} onChange={(event) => setInviteExpiresAt(event.target.value)} />
              </label>
              <div className="panel-actions">
                <Button type="submit">Create invite</Button>
                <Button type="button" variant="secondary" onClick={() => void load()}>
                  Refresh
                </Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Active Invites" subtitle="Live list and emergency controls." />
            {invites.length === 0 ? (
              <StateBlock state="empty" title="No invites" description="Create invite to start onboarding flow." />
            ) : (
              <div className="panel-list">
                {invites.map((invite) => (
                  <article key={invite.id} className="panel-item">
                    <header>
                      <strong>{invite.code}</strong>
                      <time>{invite.revokedAt ? "revoked" : invite.approvalMode}</time>
                    </header>
                    <p>
                      uses: {invite.usesCount}/{invite.maxUses ?? "∞"} | target role: {invite.targetRoleId ?? "-"} | expires:{" "}
                      {invite.expiresAt ? formatDateTime(invite.expiresAt) : "never"}
                    </p>
                    <div className="panel-actions">
                      <Button size="sm" variant="secondary" onClick={() => void handleUpdateInvite(invite)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void handleRotate(invite.id)}>
                        Rotate code
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void handleRevoke(invite.id)} disabled={Boolean(invite.revokedAt)}>
                        Revoke
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Join Requests" subtitle="Queue connected to /join-requests." />
            {requests.length === 0 ? (
              <StateBlock state="empty" title="No pending requests" description="Pending queue is clear." />
            ) : (
              <div className="panel-list">
                {requests.map((request) => (
                  <article key={request.id} className="panel-item">
                    <header>
                      <strong>{request.userId}</strong>
                      <time>{request.status}</time>
                    </header>
                    <p>
                      invite: {request.inviteCode ?? "-"} | note: {request.note ?? "-"}
                    </p>
                    <div className="panel-actions">
                      <Button size="sm" onClick={() => void handleApproveJoin(request.id)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void handleRejectJoin(request.id)}>
                        Reject
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function BroadcastsAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [campaigns, setCampaigns] = useState<BroadcastCampaign[]>([]);
  const [statsById, setStatsById] = useState<Record<string, BroadcastCampaignStats>>({});
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);

  const [name, setName] = useState("New campaign");
  const [broadcastType, setBroadcastType] = useState<"scheduled" | "recurring" | "event_triggered" | "digest">("scheduled");
  const [contentText, setContentText] = useState("Hello from Ristoranti Chat.");
  const [scheduleAt, setScheduleAt] = useState(buildDraftDefaultDateTimeValue);
  const [cron, setCron] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [senderMode, setSenderMode] = useState<"as_user" | "as_group" | "as_role_profile">("as_user");
  const [identityId, setIdentityId] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [rateLimit, setRateLimit] = useState("");
  const [audienceRoles, setAudienceRoles] = useState("");
  const [audienceStatuses, setAudienceStatuses] = useState("");
  const [audienceLocales, setAudienceLocales] = useState("");
  const [inactiveDaysGte, setInactiveDaysGte] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const list = await api.listBroadcastCampaigns(runtime.chatId);
      setCampaigns(list.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "")));
      setState("ready");
    } catch (loadError) {
      const parsed = parseError(loadError);
      setError(parsed);
      setState(getPanelState(parsed.statusCode));
    }
  }, [api, runtime.chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setCampaigns((prev) =>
      prev.map((campaign) => {
        const statePatch = runtime.liveBroadcastStateByCampaignId[campaign.id];
        const progressPatch = runtime.liveBroadcastDeliveryByCampaignId[campaign.id];
        if (!statePatch && !progressPatch) {
          return campaign;
        }

        return {
          ...campaign,
          status: statePatch?.status ?? campaign.status,
          targetCount: progressPatch?.targetCount ?? campaign.targetCount,
          sentCount: progressPatch?.sentCount ?? campaign.sentCount,
          failedCount: progressPatch?.failedCount ?? campaign.failedCount,
          lastRunAt: progressPatch ? new Date().toISOString() : campaign.lastRunAt
        };
      })
    );
  }, [runtime.liveBroadcastDeliveryByCampaignId, runtime.liveBroadcastStateByCampaignId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const title = name.trim();
    if (!title) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.createBroadcastCampaign(runtime.chatId, {
        name: title,
        broadcast_type: broadcastType,
        audience: {
          roles: csvList(audienceRoles),
          statuses: csvList(audienceStatuses),
          locale: csvList(audienceLocales),
          inactive_days_gte: inactiveDaysGte.trim() ? Number(inactiveDaysGte) : undefined
        },
        content: {
          text: contentText.trim() || undefined
        },
        schedule: {
          at: scheduleAt.trim() ? new Date(scheduleAt).toISOString() : undefined,
          cron: cron.trim() || undefined,
          timezone: timezone.trim() || "UTC"
        },
        sender_mode: senderMode,
        identity_id: identityId.trim() || undefined,
        requires_approval: requiresApproval,
        rate_limit_per_minute: rateLimit.trim() ? Number(rateLimit) : undefined
      });
      await load();
    } catch (createError) {
      setError(parseError(createError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleCampaignAction(campaign: BroadcastCampaign, action: "approve" | "schedule" | "publish" | "pause" | "resume" | "cancel") {
    setUpdating(true);
    setError(null);
    try {
      if (action === "approve") {
        await api.approveBroadcastCampaign(runtime.chatId, campaign.id);
      } else if (action === "schedule") {
        const at =
          window.prompt(
            "Schedule at (ISO datetime)",
            campaign.schedule.at ?? new Date(Date.now() + 10 * 60 * 1000).toISOString()
          ) ?? undefined;
        if (!at) {
          setUpdating(false);
          return;
        }
        const tzPrompt = window.prompt("Timezone", campaign.schedule.timezone || "UTC");
        const tz = tzPrompt ?? campaign.schedule.timezone ?? "UTC";
        await api.scheduleBroadcastCampaign(runtime.chatId, campaign.id, {
          at: at.trim(),
          timezone: tz.trim() || "UTC"
        });
      } else if (action === "publish") {
        await api.publishBroadcastNow(runtime.chatId, campaign.id);
      } else if (action === "pause") {
        await api.pauseBroadcastCampaign(runtime.chatId, campaign.id);
      } else if (action === "resume") {
        await api.resumeBroadcastCampaign(runtime.chatId, campaign.id);
      } else if (action === "cancel") {
        await api.cancelBroadcastCampaign(runtime.chatId, campaign.id);
      }

      await load();
    } catch (actionError) {
      setError(parseError(actionError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleUpdateCampaign(campaign: BroadcastCampaign): Promise<void> {
    const nextName = window.prompt("Campaign name", campaign.name);
    if (nextName === null) {
      return;
    }

    const nextText = window.prompt("Campaign text content", campaign.content.text ?? "");
    if (nextText === null) {
      return;
    }

    const nextRateRaw = window.prompt(
      "Rate limit per minute (empty = no limit)",
      campaign.rateLimitPerMinute === null ? "" : String(campaign.rateLimitPerMinute)
    );
    if (nextRateRaw === null) {
      return;
    }
    const nextRate = nextRateRaw.trim() ? Number(nextRateRaw) : undefined;
    if (nextRateRaw.trim() && !Number.isFinite(nextRate)) {
      setError({ message: "Rate limit must be a valid number." });
      return;
    }

    const nextRequiresApprovalRaw = window.prompt(
      "Requires approval? (yes/no)",
      campaign.requiresApproval ? "yes" : "no"
    );
    if (nextRequiresApprovalRaw === null) {
      return;
    }
    const normalizedApproval = nextRequiresApprovalRaw.trim().toLowerCase();
    const nextRequiresApproval =
      normalizedApproval === "yes" || normalizedApproval === "y" || normalizedApproval === "true" || normalizedApproval === "1";

    setUpdating(true);
    setError(null);
    try {
      await api.updateBroadcastCampaign(runtime.chatId, campaign.id, {
        name: nextName.trim() || campaign.name,
        content: {
          text: nextText
        },
        requires_approval: nextRequiresApproval,
        rate_limit_per_minute: nextRate
      });
      await load();
    } catch (updateError) {
      setError(parseError(updateError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleLoadStats(campaignId: string): Promise<void> {
    setUpdating(true);
    setError(null);
    try {
      const stats = await api.getBroadcastCampaignStats(runtime.chatId, campaignId);
      setStatsById((prev) => ({
        ...prev,
        [campaignId]: stats
      }));
    } catch (statsError) {
      setError(parseError(statsError));
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void load()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.broadcasts ?? [])}
      hint="Broadcast management permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Broadcast Campaigns" subtitle="Connected to /broadcasts and campaign state controls.">
          <AdminNavChips />

          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <section className="panel-subcard">
            <SectionTitle title="Create Campaign" subtitle="Wizard payload mapped to CreateBroadcastDto." />
            <form className="panel-form" onSubmit={handleCreate}>
              <label>
                Campaign name
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                Broadcast type
                <select
                  value={broadcastType}
                  onChange={(event) =>
                    setBroadcastType(event.target.value as "scheduled" | "recurring" | "event_triggered" | "digest")
                  }
                >
                  <option value="scheduled">scheduled</option>
                  <option value="recurring">recurring</option>
                  <option value="event_triggered">event_triggered</option>
                  <option value="digest">digest</option>
                </select>
              </label>
              <label>
                Text content
                <textarea rows={3} value={contentText} onChange={(event) => setContentText(event.target.value)} />
              </label>
              <label>
                Schedule at
                <input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
              </label>
              <label>
                Cron (for recurring)
                <input value={cron} onChange={(event) => setCron(event.target.value)} />
              </label>
              <label>
                Timezone
                <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
              </label>
              <label>
                Sender mode
                <select
                  value={senderMode}
                  onChange={(event) => setSenderMode(event.target.value as "as_user" | "as_group" | "as_role_profile")}
                >
                  <option value="as_user">as_user</option>
                  <option value="as_group">as_group</option>
                  <option value="as_role_profile">as_role_profile</option>
                </select>
              </label>
              <label>
                Identity ID (for group/profile modes)
                <input value={identityId} onChange={(event) => setIdentityId(event.target.value)} />
              </label>
              <label>
                Audience roles (comma-separated role IDs)
                <input value={audienceRoles} onChange={(event) => setAudienceRoles(event.target.value)} />
              </label>
              <label>
                Audience statuses (comma-separated)
                <input value={audienceStatuses} onChange={(event) => setAudienceStatuses(event.target.value)} />
              </label>
              <label>
                Audience locales (comma-separated)
                <input value={audienceLocales} onChange={(event) => setAudienceLocales(event.target.value)} />
              </label>
              <label>
                Inactive days gte
                <input type="number" min={1} value={inactiveDaysGte} onChange={(event) => setInactiveDaysGte(event.target.value)} />
              </label>
              <label>
                Rate limit per minute (optional)
                <input type="number" min={1} value={rateLimit} onChange={(event) => setRateLimit(event.target.value)} />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(event) => setRequiresApproval(event.target.checked)}
                />
                {" "}Requires approval
              </label>
              <div className="panel-actions">
                <Button type="submit">Create campaign</Button>
                <Button type="button" variant="secondary" onClick={() => void load()}>
                  Refresh
                </Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Campaign Table" subtitle="State machine actions + delivery stats." />
            {campaigns.length === 0 ? (
              <StateBlock state="empty" title="No campaigns" description="Create first broadcast campaign." />
            ) : (
              <div className="panel-list">
                {campaigns.map((campaign) => {
                  const stats = statsById[campaign.id];
                  return (
                    <article key={campaign.id} className="panel-item">
                      <header>
                        <strong>
                          {campaign.name} ({campaign.broadcastType})
                        </strong>
                        <time>{campaign.status}</time>
                      </header>
                      <p>
                        sent: {campaign.sentCount}/{campaign.targetCount} | failed: {campaign.failedCount} | schedule:{" "}
                        {campaign.schedule.at ? formatDateTime(campaign.schedule.at) : campaign.schedule.cron ?? "-"}
                      </p>
                      {stats ? (
                        <p>
                          delivery rate: {(stats.deliveryRate * 100).toFixed(1)}% | last run:{" "}
                          {stats.lastRunAt ? formatDateTime(stats.lastRunAt) : "-"}
                        </p>
                      ) : null}
                      <div className="panel-actions">
                        <Button size="sm" variant="secondary" onClick={() => void handleUpdateCampaign(campaign)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void handleCampaignAction(campaign, "approve")}>
                          Approve
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void handleCampaignAction(campaign, "schedule")}>
                          Schedule
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void handleCampaignAction(campaign, "publish")}>
                          Publish now
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void handleCampaignAction(campaign, "pause")}>
                          Pause
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void handleCampaignAction(campaign, "resume")}>
                          Resume
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void handleCampaignAction(campaign, "cancel")}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => void handleLoadStats(campaign.id)}>
                          Stats
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function WebhooksAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [webhooks, setWebhooks] = useState<IntegrationWebhookView[]>([]);
  const [rotatedSecrets, setRotatedSecrets] = useState<Record<string, string>>({});
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);

  const [name, setName] = useState("Main webhook");
  const [url, setUrl] = useState("https://example.com/webhook");
  const [events, setEvents] = useState("message.created,broadcast.state.changed");
  const [enabled, setEnabled] = useState(true);
  const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setState("loading");
    } else {
      setUpdating(true);
    }
    setError(null);
    try {
      const list = await api.listWebhooks(runtime.chatId);
      setWebhooks(list.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "")));
      if (!silent) {
        setState("ready");
      }
    } catch (loadError) {
      const parsed = parseError(loadError);
      setError(parsed);
      if (!silent) {
        setState(getPanelState(parsed.statusCode));
      }
    } finally {
      if (silent) {
        setUpdating(false);
      }
    }
  }, [api, runtime.chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!runtime.wsConnected) {
      return;
    }
    if (state !== "ready" && state !== "updating") {
      return;
    }

    if (liveRefreshTimerRef.current) {
      clearTimeout(liveRefreshTimerRef.current);
    }
    liveRefreshTimerRef.current = setTimeout(() => {
      void load(true);
    }, 650);

    return () => {
      if (liveRefreshTimerRef.current) {
        clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
    };
  }, [load, runtime.liveInvalidation.webhooks, runtime.wsConnected, state]);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.trim() || !url.trim()) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await api.createWebhook(runtime.chatId, {
        name: name.trim(),
        url: url.trim(),
        events: csvList(events) as IntegrationWebhookView["events"],
        enabled
      });
      await load();
    } catch (createError) {
      setError(parseError(createError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleDisable(webhookId: string): Promise<void> {
    setUpdating(true);
    setError(null);
    try {
      await api.disableWebhook(runtime.chatId, webhookId);
      await load();
    } catch (disableError) {
      setError(parseError(disableError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleEnable(webhookId: string): Promise<void> {
    setUpdating(true);
    setError(null);
    try {
      await api.updateWebhook(runtime.chatId, webhookId, { enabled: true });
      await load();
    } catch (enableError) {
      setError(parseError(enableError));
    } finally {
      setUpdating(false);
    }
  }

  async function handleRotate(webhookId: string): Promise<void> {
    const value = window.prompt("Custom secret (optional, min 16 chars)") ?? undefined;
    setUpdating(true);
    setError(null);
    try {
      const result = await api.rotateWebhookSecret(runtime.chatId, webhookId, value?.trim() || undefined);
      setRotatedSecrets((prev) => ({
        ...prev,
        [webhookId]: result.secret
      }));
      await load();
    } catch (rotateError) {
      setError(parseError(rotateError));
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void load()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.webhooks ?? [])}
      hint="Webhook management permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Webhook Manager" subtitle="Connected to /webhooks and secret rotation actions.">
          <AdminNavChips />

          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <section className="panel-subcard">
            <SectionTitle title="Create Webhook" subtitle="Events list + endpoint validation by backend." />
            <form className="panel-form" onSubmit={handleCreate}>
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                URL
                <input value={url} onChange={(event) => setUrl(event.target.value)} />
              </label>
              <label>
                Events (comma-separated)
                <input value={events} onChange={(event) => setEvents(event.target.value)} />
              </label>
              <label>
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                {" "}Enabled
              </label>
              <div className="panel-actions">
                <Button type="submit">Create webhook</Button>
                <Button type="button" variant="secondary" onClick={() => void load()}>
                  Refresh
                </Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Webhooks" subtitle="Live list from /webhooks." />
            {webhooks.length === 0 ? (
              <StateBlock state="empty" title="No webhooks" description="Create webhook to integrate external systems." />
            ) : (
              <div className="panel-list">
                {webhooks.map((webhook) => (
                  <article key={webhook.id} className="panel-item">
                    <header>
                      <strong>{webhook.name}</strong>
                      <time>{webhook.enabled ? "enabled" : "disabled"}</time>
                    </header>
                    <p>
                      {webhook.url} | events: {webhook.events.join(", ")} | secret: ****{webhook.secretLast4}
                    </p>
                    {webhook.lastError ? <p>last error: {webhook.lastError}</p> : null}
                    {rotatedSecrets[webhook.id] ? <p>last rotated secret: {rotatedSecrets[webhook.id]}</p> : null}
                    <div className="panel-actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void (webhook.enabled ? handleDisable(webhook.id) : handleEnable(webhook.id))}
                      >
                        {webhook.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" onClick={() => void handleRotate(webhook.id)}>
                        Rotate secret
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function AutomationAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [executions, setExecutions] = useState<AutomationExecution[]>([]);
  const [state, setState] = useState<GlobalUiState>("ready");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);

  const [createName, setCreateName] = useState("Auto: urgent keyword");
  const [createTrigger, setCreateTrigger] = useState<"message.created" | "member.joined" | "ticket.overdue" | "limit.hit">(
    "message.created"
  );
  const [createEnabled, setCreateEnabled] = useState(true);
  const [createConditions, setCreateConditions] = useState('[{"field":"message.text","op":"contains","value":"urgent"}]');
  const [createActions, setCreateActions] = useState('[{"type":"notify.moderators"}]');

  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [execDryRun, setExecDryRun] = useState(true);
  const [execTrigger, setExecTrigger] = useState("");
  const [execPayload, setExecPayload] = useState('{"message":{"text":"urgent issue"}}');

  useEffect(() => {
    if (runtime.liveAutomationExecutions.length === 0) {
      return;
    }

    setExecutions((prev) => {
      const seen = new Set(prev.map((entry) => entry.id));
      const incoming = runtime.liveAutomationExecutions.filter((entry) => !seen.has(entry.id));
      if (incoming.length === 0) {
        return prev;
      }
      return [...incoming, ...prev].slice(0, 100);
    });
  }, [runtime.liveAutomationExecutions]);

  async function handleCreateRule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const name = createName.trim();
    if (!name) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const conditions = parseJsonOrThrow(createConditions);
      const actions = parseJsonOrThrow(createActions);
      if (!Array.isArray(conditions) || !Array.isArray(actions)) {
        throw new Error("Conditions and actions must be JSON arrays.");
      }

      const created = await api.createAutomationRule(runtime.chatId, {
        name,
        trigger: createTrigger,
        conditions,
        actions,
        is_enabled: createEnabled
      });
      setRules((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setSelectedRuleId(created.id);
      setState("ready");
    } catch (createError) {
      setError(parseError(createError));
      setState("error");
    } finally {
      setUpdating(false);
    }
  }

  async function handleToggleEnabled(rule: AutomationRule): Promise<void> {
    setUpdating(true);
    setError(null);
    try {
      const updated = await api.updateAutomationRule(runtime.chatId, rule.id, {
        is_enabled: !rule.isEnabled
      });
      setRules((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setState("ready");
    } catch (updateError) {
      setError(parseError(updateError));
      setState("error");
    } finally {
      setUpdating(false);
    }
  }

  async function handleExecute(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const ruleId = selectedRuleId.trim();
    if (!ruleId) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const payload = parseJsonOrThrow(execPayload);
      const result = await api.executeAutomationRule(runtime.chatId, ruleId, {
        dry_run: execDryRun,
        trigger: execTrigger.trim() ? (execTrigger.trim() as "message.created" | "member.joined" | "ticket.overdue" | "limit.hit") : undefined,
        input_payload: payload as Record<string, unknown>
      });
      setExecutions((prev) => [result.execution, ...prev]);
      setState("ready");
    } catch (execError) {
      setError(parseError(execError));
      setState("error");
    } finally {
      setUpdating(false);
    }
  }

  async function handleLoadExecutions(ruleIdRaw?: string): Promise<void> {
    const ruleId = (ruleIdRaw ?? selectedRuleId).trim();
    if (!ruleId) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const result = await api.listAutomationExecutions(runtime.chatId, ruleId, 50);
      setExecutions(result.items);
      setState("ready");
    } catch (listError) {
      setError(parseError(listError));
      setState("error");
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void handleLoadExecutions()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.automation ?? [])}
      hint="Automation permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold
          title="Automation Rules"
          subtitle="Connected to /automation/rules, execute endpoint and executions log."
        >
          <AdminNavChips />
          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <section className="panel-subcard">
            <SectionTitle title="Create Rule" subtitle="No list endpoint yet: created rules are tracked in this UI session." />
            <form className="panel-form" onSubmit={handleCreateRule}>
              <label>
                Rule name
                <input value={createName} onChange={(event) => setCreateName(event.target.value)} />
              </label>
              <label>
                Trigger
                <select
                  value={createTrigger}
                  onChange={(event) =>
                    setCreateTrigger(event.target.value as "message.created" | "member.joined" | "ticket.overdue" | "limit.hit")
                  }
                >
                  <option value="message.created">message.created</option>
                  <option value="member.joined">member.joined</option>
                  <option value="ticket.overdue">ticket.overdue</option>
                  <option value="limit.hit">limit.hit</option>
                </select>
              </label>
              <label>
                Conditions JSON array
                <textarea rows={3} value={createConditions} onChange={(event) => setCreateConditions(event.target.value)} />
              </label>
              <label>
                Actions JSON array
                <textarea rows={3} value={createActions} onChange={(event) => setCreateActions(event.target.value)} />
              </label>
              <label>
                <input type="checkbox" checked={createEnabled} onChange={(event) => setCreateEnabled(event.target.checked)} />
                {" "}Enabled
              </label>
              <div className="panel-actions">
                <Button type="submit">Create rule</Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Known Rules" subtitle="Rules created/updated in current session." />
            {rules.length === 0 ? (
              <StateBlock state="empty" title="No local rules tracked" description="Create a rule to manage it here." />
            ) : (
              <div className="panel-list">
                {rules.map((rule) => (
                  <article key={rule.id} className="panel-item">
                    <header>
                      <strong>{rule.name}</strong>
                      <time>{rule.isEnabled ? "enabled" : "disabled"}</time>
                    </header>
                    <p>
                      id: {rule.id} | trigger: {rule.triggerType}
                    </p>
                    <div className="panel-actions">
                      <Button size="sm" variant="secondary" onClick={() => void handleToggleEnabled(rule)}>
                        Toggle enabled
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedRuleId(rule.id);
                          void handleLoadExecutions(rule.id);
                        }}
                      >
                        Load executions
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Execute Rule" subtitle="Dry-run and live execution via /execute." />
            <form className="panel-form" onSubmit={handleExecute}>
              <label>
                Rule ID
                <input value={selectedRuleId} onChange={(event) => setSelectedRuleId(event.target.value)} />
              </label>
              <label>
                Trigger override (optional)
                <input value={execTrigger} onChange={(event) => setExecTrigger(event.target.value)} />
              </label>
              <label>
                Input payload JSON object
                <textarea rows={3} value={execPayload} onChange={(event) => setExecPayload(event.target.value)} />
              </label>
              <label>
                <input type="checkbox" checked={execDryRun} onChange={(event) => setExecDryRun(event.target.checked)} />
                {" "}Dry run
              </label>
              <div className="panel-actions">
                <Button type="submit">Execute</Button>
                <Button type="button" variant="secondary" onClick={() => void handleLoadExecutions()}>
                  Refresh executions
                </Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Execution Log" subtitle="Latest /executions result for selected rule." />
            {executions.length === 0 ? (
              <StateBlock state="empty" title="No executions loaded" description="Execute rule or fetch existing log." />
            ) : (
              <div className="panel-list">
                {executions.map((execution) => (
                  <article key={execution.id} className="panel-item">
                    <header>
                      <strong>{execution.id}</strong>
                      <time>{execution.status}</time>
                    </header>
                    <p>
                      trigger: {execution.triggerType} | actions: {execution.actionsCount} | started:{" "}
                      {formatDateTime(execution.startedAt)}
                    </p>
                    {execution.error ? <p>error: {execution.error}</p> : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function TicketsAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketSlaStatsResponse | null>(null);
  const [state, setState] = useState<GlobalUiState>("loading");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);

  const [sourceMessageId, setSourceMessageId] = useState("");
  const [createPriority, setCreatePriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [createAssignee, setCreateAssignee] = useState("");
  const [createSlaDueAt, setCreateSlaDueAt] = useState("");
  const [createLabels, setCreateLabels] = useState("");

  const [patchTicketId, setPatchTicketId] = useState("");
  const [patchStatus, setPatchStatus] = useState("");
  const [patchPriority, setPatchPriority] = useState("");
  const [patchAssignee, setPatchAssignee] = useState("");
  const [patchSlaDueAt, setPatchSlaDueAt] = useState("");
  const [patchLabels, setPatchLabels] = useState("");
  const [clearAssignee, setClearAssignee] = useState(false);
  const [clearSla, setClearSla] = useState(false);
  const [dueSoonMinutes, setDueSoonMinutes] = useState("60");

  const loadStats = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const response = await api.getTicketSlaStats(runtime.chatId, dueSoonMinutes.trim() ? Number(dueSoonMinutes) : undefined);
      setStats(response);
      setState("ready");
    } catch (statsError) {
      const parsed = parseError(statsError);
      setError(parsed);
      setState(getPanelState(parsed.statusCode));
    }
  }, [api, dueSoonMinutes, runtime.chatId]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    const incoming = Object.values(runtime.liveTicketsById);
    if (incoming.length === 0) {
      return;
    }

    setTickets((prev) => {
      const map = new Map(prev.map((entry) => [entry.id, entry]));
      for (const ticket of incoming) {
        map.set(ticket.id, ticket);
      }
      return Array.from(map.values()).sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));
    });
  }, [runtime.liveTicketsById]);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const messageId = sourceMessageId.trim();
    if (!messageId) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const created = await api.createTicket(runtime.chatId, {
        source_message_id: messageId,
        priority: createPriority,
        assignee_id: createAssignee.trim() || undefined,
        sla_due_at: createSlaDueAt.trim() ? new Date(createSlaDueAt).toISOString() : undefined,
        labels: csvList(createLabels)
      });
      setTickets((prev) => [created, ...prev.filter((ticket) => ticket.id !== created.id)]);
      setPatchTicketId(created.id);
      setSourceMessageId("");
      await loadStats();
    } catch (createError) {
      setError(parseError(createError));
    } finally {
      setUpdating(false);
    }
  }

  async function handlePatch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const ticketId = patchTicketId.trim();
    if (!ticketId) {
      return;
    }

    const patch: {
      status?: "open" | "in_progress" | "waiting" | "resolved" | "closed";
      priority?: "low" | "normal" | "high" | "urgent";
      assignee_id?: string | null;
      sla_due_at?: string | null;
      labels?: string[];
    } = {};
    if (patchStatus) patch.status = patchStatus as "open" | "in_progress" | "waiting" | "resolved" | "closed";
    if (patchPriority) patch.priority = patchPriority as "low" | "normal" | "high" | "urgent";
    if (clearAssignee) patch.assignee_id = null;
    else if (patchAssignee.trim()) patch.assignee_id = patchAssignee.trim();
    if (clearSla) patch.sla_due_at = null;
    else if (patchSlaDueAt.trim()) patch.sla_due_at = new Date(patchSlaDueAt).toISOString();
    if (patchLabels.trim()) patch.labels = csvList(patchLabels);
    if (Object.keys(patch).length === 0) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const updated = await api.updateTicket(runtime.chatId, ticketId, patch);
      setTickets((prev) => {
        const has = prev.some((ticket) => ticket.id === updated.id);
        if (has) {
          return prev.map((ticket) => (ticket.id === updated.id ? updated : ticket));
        }
        return [updated, ...prev];
      });
      await loadStats();
    } catch (patchError) {
      setError(parseError(patchError));
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => void loadStats()} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.tickets ?? [])}
      hint="Ticket permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Tickets and SLA" subtitle="Connected to /tickets and /tickets/sla/stats.">
          <AdminNavChips />
          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <section className="panel-subcard">
            <SectionTitle title="SLA Snapshot" subtitle="Aggregated stats from backend." />
            <div className="panel-toolbar">
              <label>
                Due soon minutes
                <input type="number" min={1} value={dueSoonMinutes} onChange={(event) => setDueSoonMinutes(event.target.value)} />
              </label>
              <Button variant="secondary" onClick={() => void loadStats()}>
                Refresh stats
              </Button>
            </div>
            {stats ? (
              <div className="panel-list">
                <article className="panel-item">
                  <header>
                    <strong>Generated</strong>
                    <time>{formatDateTime(stats.generatedAt)}</time>
                  </header>
                  <p>
                    all: {stats.totals.all} | active SLA: {stats.totals.activeWithSla} | overdue: {stats.totals.overdue} | due soon:{" "}
                    {stats.totals.dueSoon}
                  </p>
                </article>
              </div>
            ) : (
              <StateBlock state="empty" title="No SLA stats loaded" />
            )}
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Create Ticket" subtitle="Manual creation by source message id." />
            <form className="panel-form" onSubmit={handleCreate}>
              <label>
                Source message ID
                <input value={sourceMessageId} onChange={(event) => setSourceMessageId(event.target.value)} />
              </label>
              <label>
                Priority
                <select
                  value={createPriority}
                  onChange={(event) => setCreatePriority(event.target.value as "low" | "normal" | "high" | "urgent")}
                >
                  <option value="low">low</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                  <option value="urgent">urgent</option>
                </select>
              </label>
              <label>
                Assignee ID (optional)
                <input value={createAssignee} onChange={(event) => setCreateAssignee(event.target.value)} />
              </label>
              <label>
                SLA due at (optional)
                <input type="datetime-local" value={createSlaDueAt} onChange={(event) => setCreateSlaDueAt(event.target.value)} />
              </label>
              <label>
                Labels (comma-separated)
                <input value={createLabels} onChange={(event) => setCreateLabels(event.target.value)} />
              </label>
              <div className="panel-actions">
                <Button type="submit">Create ticket</Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Update Ticket" subtitle="Patch status/priority/assignment/SLA by ticket id." />
            <form className="panel-form" onSubmit={handlePatch}>
              <label>
                Ticket ID
                <input value={patchTicketId} onChange={(event) => setPatchTicketId(event.target.value)} />
              </label>
              <label>
                Status (optional)
                <select value={patchStatus} onChange={(event) => setPatchStatus(event.target.value)}>
                  <option value="">unchanged</option>
                  <option value="open">open</option>
                  <option value="in_progress">in_progress</option>
                  <option value="waiting">waiting</option>
                  <option value="resolved">resolved</option>
                  <option value="closed">closed</option>
                </select>
              </label>
              <label>
                Priority (optional)
                <select value={patchPriority} onChange={(event) => setPatchPriority(event.target.value)}>
                  <option value="">unchanged</option>
                  <option value="low">low</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                  <option value="urgent">urgent</option>
                </select>
              </label>
              <label>
                Assignee ID
                <input value={patchAssignee} onChange={(event) => setPatchAssignee(event.target.value)} disabled={clearAssignee} />
              </label>
              <label>
                <input type="checkbox" checked={clearAssignee} onChange={(event) => setClearAssignee(event.target.checked)} />
                {" "}Clear assignee
              </label>
              <label>
                SLA due at
                <input type="datetime-local" value={patchSlaDueAt} onChange={(event) => setPatchSlaDueAt(event.target.value)} disabled={clearSla} />
              </label>
              <label>
                <input type="checkbox" checked={clearSla} onChange={(event) => setClearSla(event.target.checked)} />
                {" "}Clear SLA due at
              </label>
              <label>
                Labels (comma-separated)
                <input value={patchLabels} onChange={(event) => setPatchLabels(event.target.value)} />
              </label>
              <div className="panel-actions">
                <Button type="submit">Update ticket</Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Tracked Tickets" subtitle="Tickets touched in current session." />
            {tickets.length === 0 ? (
              <StateBlock state="empty" title="No local tickets tracked" description="Create or update a ticket to display it here." />
            ) : (
              <div className="panel-list">
                {tickets.map((ticket) => (
                  <article key={ticket.id} className="panel-item">
                    <header>
                      <strong>{ticket.id}</strong>
                      <time>
                        {ticket.status} / {ticket.priority}
                      </time>
                    </header>
                    <p>
                      source: {ticket.sourceMessageId} | assignee: {ticket.assigneeId ?? "-"} | sla:{" "}
                      {ticket.slaDueAt ? formatDateTime(ticket.slaDueAt) : "-"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function IncidentAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [state, setState] = useState<GlobalUiState>("ready");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [incidentState, setIncidentState] = useState<IncidentModeState | null>(null);
  const [enableReason, setEnableReason] = useState("security_review");
  const [disableReason, setDisableReason] = useState("manual_disable");
  const [policySnapshot, setPolicySnapshot] = useState(formatJson({ pre_moderation_enabled: true }));

  useEffect(() => {
    if (!runtime.liveIncidentMode) {
      return;
    }
    setIncidentState(runtime.liveIncidentMode.state);
  }, [runtime.liveIncidentMode]);

  async function handleEnable(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const reason = enableReason.trim();
    if (!reason) {
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const payloadRaw = parseJsonOrThrow(policySnapshot);
      const response = await api.enableIncidentMode(runtime.chatId, {
        reason,
        policy_snapshot_json: payloadRaw as Record<string, unknown>
      });
      setIncidentState(response.state);
      setState("ready");
    } catch (enableError) {
      setError(parseError(enableError));
      setState("error");
    } finally {
      setUpdating(false);
    }
  }

  async function handleDisable(): Promise<void> {
    setUpdating(true);
    setError(null);
    try {
      const response = await api.disableIncidentMode(runtime.chatId, disableReason.trim() || undefined);
      setIncidentState(response.state);
      setState("ready");
    } catch (disableError) {
      setError(parseError(disableError));
      setState("error");
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => setState("ready")} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.incident ?? [])}
      hint="Incident mode permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Incident Mode" subtitle="Connected to /incident-mode/enable and /incident-mode/disable.">
          <AdminNavChips />
          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <section className="panel-subcard">
            <SectionTitle title="Enable Incident Mode" subtitle="Reason and optional policy snapshot." />
            <form className="panel-form" onSubmit={handleEnable}>
              <label>
                Reason
                <input value={enableReason} onChange={(event) => setEnableReason(event.target.value)} />
              </label>
              <label>
                Policy snapshot JSON object
                <textarea rows={4} value={policySnapshot} onChange={(event) => setPolicySnapshot(event.target.value)} />
              </label>
              <div className="panel-actions">
                <Button type="submit">Enable</Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Disable Incident Mode" subtitle="Manual rollback reason." />
            <div className="panel-form">
              <label>
                Reason
                <input value={disableReason} onChange={(event) => setDisableReason(event.target.value)} />
              </label>
              <div className="panel-actions">
                <Button variant="danger" onClick={() => void handleDisable()}>
                  Disable
                </Button>
              </div>
            </div>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Last Incident State" subtitle="No read endpoint yet, showing last API response in this UI session." />
            {incidentState ? (
              <div className="panel-list">
                <article className="panel-item">
                  <header>
                    <strong>{incidentState.id}</strong>
                    <time>{incidentState.disabledAt ? "disabled" : "active"}</time>
                  </header>
                  <p>
                    enabled at: {formatDateTime(incidentState.enabledAt)} | disabled at:{" "}
                    {incidentState.disabledAt ? formatDateTime(incidentState.disabledAt) : "-"} | reason: {incidentState.reason}
                  </p>
                </article>
              </div>
            ) : (
              <StateBlock state="empty" title="No incident state loaded" description="Enable or disable incident mode to get state payload." />
            )}
          </section>
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

export function AuditAdminSection() {
  const runtime = useChatRuntime();
  const api = useAuthedApi();
  const [state, setState] = useState<GlobalUiState>("ready");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [result, setResult] = useState<ExportHistoryResult | null>(null);

  const [format, setFormat] = useState<"jsonl" | "csv">("jsonl");
  const [fromValue, setFromValue] = useState("");
  const [toValue, setToValue] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [contentType, setContentType] = useState<"any" | "text" | "media">("any");
  const [limit, setLimit] = useState("500");

  async function handleExport(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setUpdating(true);
    setError(null);
    try {
      const response = await api.exportHistory(runtime.chatId, {
        format,
        from: fromValue.trim() ? new Date(fromValue).toISOString() : undefined,
        to: toValue.trim() ? new Date(toValue).toISOString() : undefined,
        author_id: authorId.trim() || undefined,
        content_type: contentType,
        limit: limit.trim() ? Number(limit) : undefined
      });
      setResult(response);
      setState("ready");
    } catch (exportError) {
      setError(parseError(exportError));
      setState("error");
    } finally {
      setUpdating(false);
    }
  }

  if (state !== "ready" && state !== "updating") {
    return (
      <Card className="app-tab-card">
        {error ? <PanelErrorState error={error} onRetry={() => setState("ready")} /> : <StateBlock state={state} />}
      </Card>
    );
  }

  const preview = result?.content ?? "";
  const previewMax = 4000;
  const previewText = preview.length > previewMax ? `${preview.slice(0, previewMax)}\n...truncated...` : preview;

  return (
    <PermissionGate
      allowed={runtime.hasAnyPermission(ADMIN_ROUTE_PERMISSION_BY_KEY.audit ?? [])}
      hint="Audit permissions are required for this section."
    >
      <StateBlock state={updating ? "updating" : "ready"}>
        <AdminPageScaffold title="Audit Export" subtitle="Connected to /export/history for trace and audit workflows.">
          <AdminNavChips />
          {error ? <RestrictionHint message={error.message} variant="danger" /> : null}

          <section className="panel-subcard">
            <SectionTitle title="Export Filters" subtitle="Run audit/history export as JSONL or CSV." />
            <form className="panel-form" onSubmit={handleExport}>
              <label>
                Format
                <select value={format} onChange={(event) => setFormat(event.target.value as "jsonl" | "csv")}>
                  <option value="jsonl">jsonl</option>
                  <option value="csv">csv</option>
                </select>
              </label>
              <label>
                From (optional)
                <input type="datetime-local" value={fromValue} onChange={(event) => setFromValue(event.target.value)} />
              </label>
              <label>
                To (optional)
                <input type="datetime-local" value={toValue} onChange={(event) => setToValue(event.target.value)} />
              </label>
              <label>
                Author ID (optional)
                <input value={authorId} onChange={(event) => setAuthorId(event.target.value)} />
              </label>
              <label>
                Content type
                <select value={contentType} onChange={(event) => setContentType(event.target.value as "any" | "text" | "media")}>
                  <option value="any">any</option>
                  <option value="text">text</option>
                  <option value="media">media</option>
                </select>
              </label>
              <label>
                Limit
                <input type="number" min={1} value={limit} onChange={(event) => setLimit(event.target.value)} />
              </label>
              <div className="panel-actions">
                <Button type="submit">Run export</Button>
              </div>
            </form>
          </section>

          <section className="panel-subcard">
            <SectionTitle title="Export Result" subtitle="Preview of generated payload." />
            {result ? (
              <>
                <div className="panel-list">
                  <article className="panel-item">
                    <header>
                      <strong>{result.filename}</strong>
                      <time>{result.format}</time>
                    </header>
                    <p>rows: {result.rows}</p>
                  </article>
                </div>
                <pre className="panel-summary">{previewText || "[empty export]"}</pre>
              </>
            ) : (
              <StateBlock state="empty" title="No export yet" description="Run export with selected filters." />
            )}
          </section>
        </AdminPageScaffold>
      </StateBlock>
    </PermissionGate>
  );
}

type AdminSectionProps = {
  title: string;
  subtitle: string;
  cards: Array<{ title: string; text: string }>;
  requiresModerator?: boolean;
  requiresAdmin?: boolean;
  requiredPermissions?: string[];
};

export function AdminSection({
  title,
  subtitle,
  cards,
  requiresModerator,
  requiresAdmin,
  requiredPermissions
}: AdminSectionProps) {
  const runtime = useChatRuntime();
  const fallbackPermissions = requiresAdmin
    ? ["role.create", "role.update", "permission.grant", "permission.revoke"]
    : requiresModerator
      ? ["member.view_list", "member.mute", "member.ban"]
      : [];
  const effectivePermissions = requiredPermissions && requiredPermissions.length > 0 ? requiredPermissions : fallbackPermissions;
  const allowed = effectivePermissions.length === 0 ? true : runtime.hasAnyPermission(effectivePermissions);
  const hint = "Required permissions are missing for this section.";

  return (
    <PermissionGate allowed={allowed} hint={hint}>
      <AdminPageScaffold title={title} subtitle={subtitle}>
        <AdminNavChips />
        <PlaceholderGrid cards={cards} />
      </AdminPageScaffold>
    </PermissionGate>
  );
}

