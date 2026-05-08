import { appConfig } from "@/lib/config";
import type { EncryptedMessagePayloadInput } from "@/lib/e2e";
import { clearSession, saveSession } from "@/lib/session";
import type {
  ApiErrorPayload,
  AutomationExecution,
  AutomationRule,
  BroadcastCampaign,
  BroadcastCampaignStats,
  AuthResponse,
  Bookmark,
  BootstrapResponse,
  ChannelNotifyConfig,
  ChannelNotifyTestResult,
  ChatMemberRecord,
  ChatMessage,
  ChatInvite,
  ChatRole,
  ExportHistoryResult,
  IncidentModeResponse,
  IncidentModeStatusResponse,
  IntegrationWebhookView,
  InvitesListResponse,
  JoinPolicy,
  JoinRequestsListResponse,
  JoinRequest,
  KnowledgeArticle,
  KeywordAlert,
  LimitsOverview,
  ListTranslationsResponse,
  MemberProfileFieldsListResponse,
  ModerationHistoryResponse,
  UpsertMemberProfileFieldResponse,
  DeleteMemberProfileFieldResponse,
  AssignMemberTagResponse,
  E2EDevice,
  TempRoom,
  TempRoomArchiveResponse,
  TempRoomRestoreResponse,
  AdjustReputationResponse,
  MembersOverview,
  Poll,
  PollResultsResponse,
  PollVoteResponse,
  PermissionSimulationResult,
  PinnedMessageEntry,
  ReadReceiptMarkResponse,
  ReadReceiptPrivacyResponse,
  ReadReceiptPrivacyUpdateResponse,
  ReadReceiptsViewResponse,
  ReactionSummaryEntry,
  Reminder,
  RoleLimits,
  SavedMessageView,
  ScheduledMessage,
  SearchMessagesQuery,
  Session,
  Ticket,
  TicketSlaStatsResponse,
  ThreadSubscription,
  TranslateMessageResponse,
  DeleteTranslationResponse,
  KnowledgeArticleStatus,
  UnreadSummaryResponse
} from "@/lib/types";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: JsonValue;
  auth?: boolean;
  allowRefresh?: boolean;
  retryMode?: "safe" | "network_once" | "none";
};

export class ApiClientError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private session: Session | null = null;

  constructor(baseUrl = appConfig.apiBaseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  setSession(session: Session | null): void {
    this.session = session;
    if (session) {
      saveSession(session);
      return;
    }
    clearSession();
  }

  getSession(): Session | null {
    return this.session;
  }

  async authTelegram(initData: string, chatId: string): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/telegram", {
      method: "POST",
      body: {
        initData,
        chatId
      },
      auth: false,
      allowRefresh: false
    });
  }

  async refreshSession(): Promise<AuthResponse> {
    if (!this.session?.refreshToken) {
      throw new ApiClientError("No refresh token found.", 401);
    }

    const response = await this.request<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: {
        refreshToken: this.session.refreshToken
      },
      auth: false,
      allowRefresh: false
    });

    this.setSession({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: response.user
    });

    return response;
  }

  async getBootstrap(chatId: string, messagesLimit = 120): Promise<BootstrapResponse> {
    return this.request<BootstrapResponse>(`/chats/${encodeURIComponent(chatId)}/bootstrap?messages_limit=${messagesLimit}`, {
      method: "GET"
    });
  }

  async createMessage(
    chatId: string,
    text: string,
    senderMode: "as_user" | "as_group" | "as_role_profile" = "as_user",
    identityId?: string,
    replyToId?: string,
    options: {
      encryptedPayload?: EncryptedMessagePayloadInput;
    } = {}
  ): Promise<ChatMessage> {
    const body: {
      text?: string;
      encrypted_payload?: EncryptedMessagePayloadInput;
      sender_mode: "as_user" | "as_group" | "as_role_profile";
      identity_id?: string;
      reply_to_id?: string;
    } = {
      sender_mode: senderMode
    };

    if (options.encryptedPayload) {
      body.encrypted_payload = options.encryptedPayload;
    } else {
      body.text = text;
    }
    if (identityId) {
      body.identity_id = identityId;
    }
    if (replyToId) {
      body.reply_to_id = replyToId;
    }

    return this.request<ChatMessage>(`/chats/${encodeURIComponent(chatId)}/messages`, {
      method: "POST",
      body,
      retryMode: "network_once"
    });
  }

  async updateMessage(chatId: string, messageId: string, text: string): Promise<ChatMessage> {
    return this.request<ChatMessage>(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      body: {
        text
      },
      retryMode: "network_once"
    });
  }

  async deleteMessage(chatId: string, messageId: string): Promise<ChatMessage> {
    return this.request<ChatMessage>(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
      retryMode: "network_once"
    });
  }

  async setReaction(
    chatId: string,
    messageId: string,
    reaction: string
  ): Promise<{ ok: true; messageId: string; reaction: string; summary: ReactionSummaryEntry[] }> {
    return this.request<{ ok: true; messageId: string; reaction: string; summary: ReactionSummaryEntry[] }>(
      `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      {
        method: "POST",
        body: {
          reaction
        }
      }
    );
  }

  async removeReaction(chatId: string, messageId: string): Promise<{ ok: true; messageId: string; summary: ReactionSummaryEntry[] }> {
    return this.request<{ ok: true; messageId: string; summary: ReactionSummaryEntry[] }>(
      `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      {
        method: "DELETE"
      }
    );
  }

  async searchMessages(chatId: string, query: SearchMessagesQuery): Promise<ChatMessage[]> {
    const path = this.withQuery(`/chats/${encodeURIComponent(chatId)}/messages/search`, query as Record<string, JsonValue | undefined>);
    return this.request<ChatMessage[]>(path, { method: "GET" });
  }

  async listPinnedMessages(chatId: string): Promise<PinnedMessageEntry[]> {
    return this.request<PinnedMessageEntry[]>(`/chats/${encodeURIComponent(chatId)}/messages/pinned`, {
      method: "GET"
    });
  }

  async listSavedViews(chatId: string): Promise<SavedMessageView[]> {
    return this.request<SavedMessageView[]>(`/chats/${encodeURIComponent(chatId)}/messages/saved-views`, {
      method: "GET"
    });
  }

  async createSavedView(chatId: string, name: string, filters: Record<string, unknown>): Promise<SavedMessageView> {
    return this.request<SavedMessageView>(`/chats/${encodeURIComponent(chatId)}/messages/saved-views`, {
      method: "POST",
      body: {
        name,
        filters: filters as JsonValue
      }
    });
  }

  async deleteSavedView(chatId: string, viewId: string): Promise<{ ok: true; viewId: string }> {
    return this.request<{ ok: true; viewId: string }>(
      `/chats/${encodeURIComponent(chatId)}/messages/saved-views/${encodeURIComponent(viewId)}`,
      {
        method: "DELETE"
      }
    );
  }

  async listDrafts(chatId: string): Promise<ScheduledMessage[]> {
    return this.request<ScheduledMessage[]>(`/chats/${encodeURIComponent(chatId)}/drafts`, {
      method: "GET"
    });
  }

  async createDraft(
    chatId: string,
    at: string,
    payload: {
      text?: string;
      sender_mode: "as_user" | "as_group" | "as_role_profile";
      identity_id?: string;
    }
  ): Promise<ScheduledMessage> {
    const body: {
      at: string;
      payload: {
        text?: string;
        sender_mode: "as_user" | "as_group" | "as_role_profile";
        identity_id?: string;
      };
    } = {
      at,
      payload: {
        sender_mode: payload.sender_mode
      }
    };

    if (payload.text !== undefined) {
      body.payload.text = payload.text;
    }
    if (payload.identity_id !== undefined) {
      body.payload.identity_id = payload.identity_id;
    }

    return this.request<ScheduledMessage>(`/chats/${encodeURIComponent(chatId)}/drafts`, {
      method: "POST",
      body
    });
  }

  async deleteDraft(chatId: string, draftId: string): Promise<ScheduledMessage> {
    return this.request<ScheduledMessage>(`/chats/${encodeURIComponent(chatId)}/drafts/${encodeURIComponent(draftId)}`, {
      method: "DELETE"
    });
  }

  async listBookmarks(chatId: string): Promise<Bookmark[]> {
    return this.request<Bookmark[]>(`/chats/${encodeURIComponent(chatId)}/bookmarks`, {
      method: "GET"
    });
  }

  async createBookmark(
    chatId: string,
    messageId: string,
    options: {
      collection?: string;
      note?: string;
      tags?: string[];
      is_shared?: boolean;
    } = {}
  ): Promise<Bookmark> {
    const body: {
      message_id: string;
      collection?: string;
      note?: string;
      tags?: string[];
      is_shared?: boolean;
    } = {
      message_id: messageId
    };

    if (options.collection !== undefined) body.collection = options.collection;
    if (options.note !== undefined) body.note = options.note;
    if (options.tags !== undefined) body.tags = options.tags;
    if (options.is_shared !== undefined) body.is_shared = options.is_shared;

    return this.request<Bookmark>(`/chats/${encodeURIComponent(chatId)}/bookmarks`, {
      method: "POST",
      body
    });
  }

  async deleteBookmark(chatId: string, bookmarkId: string): Promise<{ ok: true; bookmarkId: string }> {
    return this.request<{ ok: true; bookmarkId: string }>(
      `/chats/${encodeURIComponent(chatId)}/bookmarks/${encodeURIComponent(bookmarkId)}`,
      {
        method: "DELETE"
      }
    );
  }

  async listReminders(chatId: string, status?: Reminder["status"]): Promise<Reminder[]> {
    const path = this.withQuery(`/chats/${encodeURIComponent(chatId)}/reminders`, status ? { status } : undefined);
    return this.request<Reminder[]>(path, {
      method: "GET"
    });
  }

  async createReminder(
    chatId: string,
    input: {
      message_id: string;
      remind_at: string;
      reminder_type?: "personal" | "team" | "moderator";
      target_role_id?: string;
      note?: string;
      telegram_notify?: boolean;
    }
  ): Promise<Reminder> {
    return this.request<Reminder>(`/chats/${encodeURIComponent(chatId)}/reminders`, {
      method: "POST",
      body: {
        ...input
      }
    });
  }

  async cancelReminder(chatId: string, reminderId: string, reason?: string): Promise<Reminder> {
    const body: { reason?: string } = {};
    if (reason) {
      body.reason = reason;
    }
    return this.request<Reminder>(`/chats/${encodeURIComponent(chatId)}/reminders/${encodeURIComponent(reminderId)}/cancel`, {
      method: "POST",
      body
    });
  }

  async listKeywordAlerts(chatId: string): Promise<KeywordAlert[]> {
    return this.request<KeywordAlert[]>(`/chats/${encodeURIComponent(chatId)}/alerts/keywords`, {
      method: "GET"
    });
  }

  async createKeywordAlert(chatId: string, keyword: string): Promise<KeywordAlert> {
    return this.request<KeywordAlert>(`/chats/${encodeURIComponent(chatId)}/alerts/keywords`, {
      method: "POST",
      body: {
        keyword
      }
    });
  }

  async deleteKeywordAlert(chatId: string, alertId: string): Promise<{ ok: true; alertId: string }> {
    return this.request<{ ok: true; alertId: string }>(
      `/chats/${encodeURIComponent(chatId)}/alerts/keywords/${encodeURIComponent(alertId)}`,
      {
        method: "DELETE"
      }
    );
  }

  async getUnreadSummary(
    chatId: string,
    query?: {
      mentions_only?: boolean;
      moderation_only?: boolean;
      announcements_only?: boolean;
      since?: string;
    }
  ): Promise<UnreadSummaryResponse> {
    const apiQuery: Record<string, JsonValue | undefined> = query
      ? {
          mentions_only: query.mentions_only === undefined ? undefined : String(query.mentions_only),
          moderation_only: query.moderation_only === undefined ? undefined : String(query.moderation_only),
          announcements_only: query.announcements_only === undefined ? undefined : String(query.announcements_only),
          since: query.since
        }
      : {};

    const path = this.withQuery(`/chats/${encodeURIComponent(chatId)}/unread-summary`, apiQuery);
    return this.request<UnreadSummaryResponse>(path, {
      method: "GET"
    });
  }

  async updateChannelNotifyConfig(
    chatId: string,
    patch: {
      enabled?: boolean;
      mode?: "off" | "instant" | "digest";
      template?: string;
      digestIntervalMinutes?: number;
    }
  ): Promise<ChannelNotifyConfig> {
    const body: {
      enabled?: boolean;
      mode?: "off" | "instant" | "digest";
      template?: string;
      digestIntervalMinutes?: number;
    } = {};
    if (patch.enabled !== undefined) body.enabled = patch.enabled;
    if (patch.mode !== undefined) body.mode = patch.mode;
    if (patch.template !== undefined) body.template = patch.template;
    if (patch.digestIntervalMinutes !== undefined) body.digestIntervalMinutes = patch.digestIntervalMinutes;

    return this.request<ChannelNotifyConfig>(`/chats/${encodeURIComponent(chatId)}/channel-notify/config`, {
      method: "PATCH",
      body
    });
  }

  async getChannelNotifyConfig(chatId: string): Promise<ChannelNotifyConfig> {
    return this.request<ChannelNotifyConfig>(`/chats/${encodeURIComponent(chatId)}/channel-notify/config`, {
      method: "GET"
    });
  }

  async testChannelNotify(
    chatId: string,
    payload: {
      messagePreview?: string;
      deliver?: boolean;
    } = {}
  ): Promise<ChannelNotifyTestResult> {
    const body: { messagePreview?: string; deliver?: boolean } = {};
    if (payload.messagePreview !== undefined) body.messagePreview = payload.messagePreview;
    if (payload.deliver !== undefined) body.deliver = payload.deliver;

    return this.request<ChannelNotifyTestResult>(`/chats/${encodeURIComponent(chatId)}/channel-notify/test`, {
      method: "POST",
      body
    });
  }

  async getReadReceiptPrivacy(chatId: string): Promise<ReadReceiptPrivacyResponse> {
    return this.request<ReadReceiptPrivacyResponse>(`/chats/${encodeURIComponent(chatId)}/read-receipts/privacy`, {
      method: "GET"
    });
  }

  async updateReadReceiptPrivacy(
    chatId: string,
    patch: {
      mode?: "off" | "private" | "role_visible" | "global";
      target_user_id?: string;
      allow_cross_role_view?: boolean;
    }
  ): Promise<ReadReceiptPrivacyUpdateResponse> {
    const body: {
      mode?: "off" | "private" | "role_visible" | "global";
      target_user_id?: string;
      allow_cross_role_view?: boolean;
    } = {};
    if (patch.mode !== undefined) body.mode = patch.mode;
    if (patch.target_user_id !== undefined) body.target_user_id = patch.target_user_id;
    if (patch.allow_cross_role_view !== undefined) body.allow_cross_role_view = patch.allow_cross_role_view;

    return this.request<ReadReceiptPrivacyUpdateResponse>(`/chats/${encodeURIComponent(chatId)}/read-receipts/privacy`, {
      method: "PATCH",
      body
    });
  }

  async markReadReceipt(chatId: string, messageId: string, readAt?: string): Promise<ReadReceiptMarkResponse> {
    const body: { read_at?: string } = {};
    if (readAt !== undefined) {
      body.read_at = readAt;
    }
    return this.request<ReadReceiptMarkResponse>(
      `/chats/${encodeURIComponent(chatId)}/read-receipts/${encodeURIComponent(messageId)}/mark`,
      {
        method: "POST",
        body
      }
    );
  }

  async getReadReceipts(chatId: string, messageId: string): Promise<ReadReceiptsViewResponse> {
    return this.request<ReadReceiptsViewResponse>(
      `/chats/${encodeURIComponent(chatId)}/read-receipts/${encodeURIComponent(messageId)}`,
      {
        method: "GET"
      }
    );
  }

  async listThreadSubscriptions(chatId: string): Promise<ThreadSubscription[]> {
    return this.request<ThreadSubscription[]>(`/chats/${encodeURIComponent(chatId)}/thread-subscriptions`, {
      method: "GET"
    });
  }

  async createThreadSubscription(
    chatId: string,
    payload: {
      message_id: string;
      subscription_type?: "thread" | "message";
      telegram_notify?: boolean;
      dedup_window_seconds?: number;
    }
  ): Promise<ThreadSubscription> {
    const body: {
      message_id: string;
      subscription_type?: "thread" | "message";
      telegram_notify?: boolean;
      dedup_window_seconds?: number;
    } = {
      message_id: payload.message_id
    };
    if (payload.subscription_type !== undefined) body.subscription_type = payload.subscription_type;
    if (payload.telegram_notify !== undefined) body.telegram_notify = payload.telegram_notify;
    if (payload.dedup_window_seconds !== undefined) body.dedup_window_seconds = payload.dedup_window_seconds;

    return this.request<ThreadSubscription>(`/chats/${encodeURIComponent(chatId)}/thread-subscriptions`, {
      method: "POST",
      body
    });
  }

  async deleteThreadSubscription(chatId: string, subscriptionId: string): Promise<{ ok: true; subscriptionId: string }> {
    return this.request<{ ok: true; subscriptionId: string }>(
      `/chats/${encodeURIComponent(chatId)}/thread-subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        method: "DELETE"
      }
    );
  }

  async createPoll(
    chatId: string,
    payload: {
      question: string;
      options: string[];
      allow_multiple?: boolean;
      is_anonymous?: boolean;
      is_quiz?: boolean;
      correct_option_indexes?: number[];
      allowed_role_ids?: string[];
      closes_at?: string;
    }
  ): Promise<Poll> {
    const body: {
      question: string;
      options: string[];
      allow_multiple?: boolean;
      is_anonymous?: boolean;
      is_quiz?: boolean;
      correct_option_indexes?: number[];
      allowed_role_ids?: string[];
      closes_at?: string;
    } = {
      question: payload.question,
      options: payload.options
    };
    if (payload.allow_multiple !== undefined) body.allow_multiple = payload.allow_multiple;
    if (payload.is_anonymous !== undefined) body.is_anonymous = payload.is_anonymous;
    if (payload.is_quiz !== undefined) body.is_quiz = payload.is_quiz;
    if (payload.correct_option_indexes !== undefined) body.correct_option_indexes = payload.correct_option_indexes;
    if (payload.allowed_role_ids !== undefined) body.allowed_role_ids = payload.allowed_role_ids;
    if (payload.closes_at !== undefined) body.closes_at = payload.closes_at;

    return this.request<Poll>(`/chats/${encodeURIComponent(chatId)}/polls`, {
      method: "POST",
      body
    });
  }

  async votePoll(chatId: string, pollId: string, optionIndexes: number[]): Promise<PollVoteResponse> {
    return this.request<PollVoteResponse>(`/chats/${encodeURIComponent(chatId)}/polls/${encodeURIComponent(pollId)}/vote`, {
      method: "POST",
      body: {
        option_indexes: optionIndexes
      }
    });
  }

  async closePoll(chatId: string, pollId: string, reason?: string): Promise<Poll> {
    const body: { reason?: string | null } = {};
    if (reason !== undefined) {
      body.reason = reason;
    }

    return this.request<Poll>(`/chats/${encodeURIComponent(chatId)}/polls/${encodeURIComponent(pollId)}/close`, {
      method: "POST",
      body
    });
  }

  async getPollResults(chatId: string, pollId: string): Promise<PollResultsResponse> {
    return this.request<PollResultsResponse>(
      `/chats/${encodeURIComponent(chatId)}/polls/${encodeURIComponent(pollId)}/results`,
      {
        method: "GET"
      }
    );
  }

  async createKnowledgeArticle(
    chatId: string,
    payload: {
      title: string;
      content: string;
      category?: string | null;
      tags?: string[];
      status?: KnowledgeArticleStatus;
    }
  ): Promise<KnowledgeArticle> {
    const body: {
      title: string;
      content: string;
      category?: string | null;
      tags?: string[];
      status?: KnowledgeArticleStatus;
    } = {
      title: payload.title,
      content: payload.content
    };
    if (payload.category !== undefined) body.category = payload.category;
    if (payload.tags !== undefined) body.tags = payload.tags;
    if (payload.status !== undefined) body.status = payload.status;

    return this.request<KnowledgeArticle>(`/chats/${encodeURIComponent(chatId)}/knowledge/articles`, {
      method: "POST",
      body
    });
  }

  async updateKnowledgeArticle(
    chatId: string,
    articleId: string,
    patch: {
      title?: string;
      content?: string;
      category?: string | null;
      tags?: string[];
      status?: KnowledgeArticleStatus;
    }
  ): Promise<KnowledgeArticle> {
    const body: {
      title?: string;
      content?: string;
      category?: string | null;
      tags?: string[];
      status?: KnowledgeArticleStatus;
    } = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.content !== undefined) body.content = patch.content;
    if (patch.category !== undefined) body.category = patch.category;
    if (patch.tags !== undefined) body.tags = patch.tags;
    if (patch.status !== undefined) body.status = patch.status;

    return this.request<KnowledgeArticle>(
      `/chats/${encodeURIComponent(chatId)}/knowledge/articles/${encodeURIComponent(articleId)}`,
      {
        method: "PATCH",
        body
      }
    );
  }

  async translateMessage(
    chatId: string,
    messageId: string,
    payload: {
      target_language: string;
      source_language?: string;
      force_refresh?: boolean;
    }
  ): Promise<TranslateMessageResponse> {
    const body: {
      target_language: string;
      source_language?: string;
      force_refresh?: boolean;
    } = {
      target_language: payload.target_language
    };
    if (payload.source_language !== undefined) body.source_language = payload.source_language;
    if (payload.force_refresh !== undefined) body.force_refresh = payload.force_refresh;

    return this.request<TranslateMessageResponse>(
      `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/translate`,
      {
        method: "POST",
        body
      }
    );
  }

  async listMessageTranslations(chatId: string, messageId: string): Promise<ListTranslationsResponse> {
    return this.request<ListTranslationsResponse>(
      `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/translations`,
      {
        method: "GET"
      }
    );
  }

  async deleteMessageTranslation(
    chatId: string,
    messageId: string,
    targetLanguage: string
  ): Promise<DeleteTranslationResponse> {
    return this.request<DeleteTranslationResponse>(
      `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/translations/${encodeURIComponent(targetLanguage)}`,
      {
        method: "DELETE"
      }
    );
  }

  async assignMemberTag(chatId: string, userId: string, tag: string): Promise<AssignMemberTagResponse> {
    return this.request<AssignMemberTagResponse>(
      `/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}/tags`,
      {
        method: "POST",
        body: { tag }
      }
    );
  }

  async listMemberProfileFields(chatId: string, userId: string): Promise<MemberProfileFieldsListResponse> {
    return this.request<MemberProfileFieldsListResponse>(
      `/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}/profile-fields`,
      {
        method: "GET"
      }
    );
  }

  async upsertMemberProfileField(
    chatId: string,
    userId: string,
    key: string,
    value: string
  ): Promise<UpsertMemberProfileFieldResponse> {
    return this.request<UpsertMemberProfileFieldResponse>(
      `/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}/profile-fields`,
      {
        method: "POST",
        body: { key, value }
      }
    );
  }

  async deleteMemberProfileField(
    chatId: string,
    userId: string,
    fieldKey: string
  ): Promise<DeleteMemberProfileFieldResponse> {
    return this.request<DeleteMemberProfileFieldResponse>(
      `/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}/profile-fields/${encodeURIComponent(fieldKey)}`,
      {
        method: "DELETE"
      }
    );
  }

  async upsertE2EDevice(
    chatId: string,
    payload: {
      device_id: string;
      algorithm: string;
      identity_key: string;
      signed_pre_key: string;
      one_time_pre_keys: string[];
      fallback_key?: string;
      last_pre_key_rotation_at?: string;
    }
  ): Promise<E2EDevice> {
    const body: {
      device_id: string;
      algorithm: string;
      identity_key: string;
      signed_pre_key: string;
      one_time_pre_keys: string[];
      fallback_key?: string;
      last_pre_key_rotation_at?: string;
    } = {
      device_id: payload.device_id,
      algorithm: payload.algorithm,
      identity_key: payload.identity_key,
      signed_pre_key: payload.signed_pre_key,
      one_time_pre_keys: payload.one_time_pre_keys
    };
    if (payload.fallback_key !== undefined) body.fallback_key = payload.fallback_key;
    if (payload.last_pre_key_rotation_at !== undefined) body.last_pre_key_rotation_at = payload.last_pre_key_rotation_at;

    return this.request<E2EDevice>(`/chats/${encodeURIComponent(chatId)}/e2e/devices`, {
      method: "POST",
      body
    });
  }

  async listOwnE2EDevices(chatId: string): Promise<E2EDevice[]> {
    return this.request<E2EDevice[]>(`/chats/${encodeURIComponent(chatId)}/e2e/devices/me`, {
      method: "GET"
    });
  }

  async listE2EDevices(chatId: string, userIds?: string[]): Promise<E2EDevice[]> {
    const queryUserIds = userIds && userIds.length > 0 ? userIds.join(",") : undefined;
    const path = this.withQuery(`/chats/${encodeURIComponent(chatId)}/e2e/devices`, { user_ids: queryUserIds });
    return this.request<E2EDevice[]>(path, {
      method: "GET"
    });
  }

  async deactivateE2EDevice(chatId: string, deviceId: string): Promise<E2EDevice> {
    return this.request<E2EDevice>(`/chats/${encodeURIComponent(chatId)}/e2e/devices/${encodeURIComponent(deviceId)}/deactivate`, {
      method: "POST",
      body: {}
    });
  }

  async createTempRoom(
    chatId: string,
    payload: {
      name: string;
      description?: string;
      starts_at?: string;
      ends_at?: string;
      inherit_permissions?: boolean;
      permission_overrides?: Record<string, unknown>;
    }
  ): Promise<TempRoom> {
    const body: {
      name: string;
      description?: string;
      starts_at?: string;
      ends_at?: string;
      inherit_permissions?: boolean;
      permission_overrides?: JsonValue;
    } = {
      name: payload.name
    };
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.starts_at !== undefined) body.starts_at = payload.starts_at;
    if (payload.ends_at !== undefined) body.ends_at = payload.ends_at;
    if (payload.inherit_permissions !== undefined) body.inherit_permissions = payload.inherit_permissions;
    if (payload.permission_overrides !== undefined) body.permission_overrides = payload.permission_overrides as JsonValue;

    return this.request<TempRoom>(`/chats/${encodeURIComponent(chatId)}/temp-rooms`, {
      method: "POST",
      body
    });
  }

  async archiveTempRoom(chatId: string, tempRoomId: string, reason?: string): Promise<TempRoomArchiveResponse> {
    const body: { reason?: string } = {};
    if (reason !== undefined) body.reason = reason;

    return this.request<TempRoomArchiveResponse>(
      `/chats/${encodeURIComponent(chatId)}/temp-rooms/${encodeURIComponent(tempRoomId)}/archive`,
      {
        method: "POST",
        body
      }
    );
  }

  async restoreTempRoom(chatId: string, tempRoomId: string, reason?: string): Promise<TempRoomRestoreResponse> {
    const body: { reason?: string } = {};
    if (reason !== undefined) body.reason = reason;

    return this.request<TempRoomRestoreResponse>(
      `/chats/${encodeURIComponent(chatId)}/temp-rooms/${encodeURIComponent(tempRoomId)}/restore`,
      {
        method: "POST",
        body
      }
    );
  }

  async adjustReputation(
    chatId: string,
    payload: {
      user_id: string;
      delta: number;
      reason: string;
      source_type?: string;
      source_id?: string;
    }
  ): Promise<AdjustReputationResponse> {
    const body: {
      user_id: string;
      delta: number;
      reason: string;
      source_type?: string;
      source_id?: string;
    } = {
      user_id: payload.user_id,
      delta: payload.delta,
      reason: payload.reason
    };
    if (payload.source_type !== undefined) body.source_type = payload.source_type;
    if (payload.source_id !== undefined) body.source_id = payload.source_id;

    return this.request<AdjustReputationResponse>(`/chats/${encodeURIComponent(chatId)}/reputation/adjust`, {
      method: "POST",
      body
    });
  }

  async listRoles(chatId: string): Promise<ChatRole[]> {
    return this.request<ChatRole[]>(`/chats/${encodeURIComponent(chatId)}/roles`, {
      method: "GET"
    });
  }

  async createRole(
    chatId: string,
    payload: {
      name: string;
      priority: number;
      permissions: string[];
      isDefault?: boolean;
    }
  ): Promise<ChatRole> {
    const body: {
      name: string;
      priority: number;
      permissions: string[];
      isDefault?: boolean;
    } = {
      name: payload.name,
      priority: payload.priority,
      permissions: payload.permissions
    };
    if (payload.isDefault !== undefined) {
      body.isDefault = payload.isDefault;
    }

    return this.request<ChatRole>(`/chats/${encodeURIComponent(chatId)}/roles`, {
      method: "POST",
      body
    });
  }

  async updateRole(
    chatId: string,
    roleId: string,
    patch: {
      name?: string;
      priority?: number;
      permissions?: string[];
      isDefault?: boolean;
    }
  ): Promise<ChatRole> {
    const body: {
      name?: string;
      priority?: number;
      permissions?: string[];
      isDefault?: boolean;
    } = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.priority !== undefined) body.priority = patch.priority;
    if (patch.permissions !== undefined) body.permissions = patch.permissions;
    if (patch.isDefault !== undefined) body.isDefault = patch.isDefault;

    return this.request<ChatRole>(`/chats/${encodeURIComponent(chatId)}/roles/${encodeURIComponent(roleId)}`, {
      method: "PATCH",
      body
    });
  }

  async grantRolePermissions(chatId: string, roleId: string, permissions: string[]): Promise<ChatRole> {
    return this.request<ChatRole>(
      `/chats/${encodeURIComponent(chatId)}/roles/${encodeURIComponent(roleId)}/permissions/grant`,
      {
        method: "POST",
        body: {
          permissions
        }
      }
    );
  }

  async revokeRolePermissions(chatId: string, roleId: string, permissions: string[]): Promise<ChatRole> {
    return this.request<ChatRole>(
      `/chats/${encodeURIComponent(chatId)}/roles/${encodeURIComponent(roleId)}/permissions/revoke`,
      {
        method: "POST",
        body: {
          permissions
        }
      }
    );
  }

  async assignRole(chatId: string, roleId: string, userId: string): Promise<{ ok: true; member: ChatMemberRecord }> {
    return this.request<{ ok: true; member: ChatMemberRecord }>(
      `/chats/${encodeURIComponent(chatId)}/roles/${encodeURIComponent(roleId)}/assign`,
      {
        method: "POST",
        body: {
          userId
        }
      }
    );
  }

  async unassignRole(chatId: string, roleId: string, userId: string): Promise<{ ok: true; member: ChatMemberRecord }> {
    return this.request<{ ok: true; member: ChatMemberRecord }>(
      `/chats/${encodeURIComponent(chatId)}/roles/${encodeURIComponent(roleId)}/unassign`,
      {
        method: "POST",
        body: {
          userId
        }
      }
    );
  }

  async simulatePermissions(
    chatId: string,
    payload: {
      actor_user_id?: string;
      target_user_id?: string;
      target_role_id?: string;
      join_target_role_id?: string;
      permissions?: string[];
    }
  ): Promise<PermissionSimulationResult> {
    const body: {
      actor_user_id?: string;
      target_user_id?: string;
      target_role_id?: string;
      join_target_role_id?: string;
      permissions?: string[];
    } = {};
    if (payload.actor_user_id !== undefined) body.actor_user_id = payload.actor_user_id;
    if (payload.target_user_id !== undefined) body.target_user_id = payload.target_user_id;
    if (payload.target_role_id !== undefined) body.target_role_id = payload.target_role_id;
    if (payload.join_target_role_id !== undefined) body.join_target_role_id = payload.join_target_role_id;
    if (payload.permissions !== undefined) body.permissions = payload.permissions;

    return this.request<PermissionSimulationResult>(`/chats/${encodeURIComponent(chatId)}/roles/permissions/simulate`, {
      method: "POST",
      body
    });
  }

  async listLimits(chatId: string): Promise<LimitsOverview> {
    return this.request<LimitsOverview>(`/chats/${encodeURIComponent(chatId)}/limits`, {
      method: "GET"
    });
  }

  async updateRoleLimits(
    chatId: string,
    roleId: string,
    patch: {
      slowmodeSeconds?: number;
      messagesPerDay?: number | null;
      messagesPerHour?: number | null;
      mediaPerDay?: number | null;
      linksPerDay?: number | null;
      mentionsPerDay?: number | null;
      burstCount?: number | null;
      burstWindowSeconds?: number | null;
      exceedAction?: "warn" | "mute" | "reject";
      exceedMuteSeconds?: number | null;
    }
  ): Promise<RoleLimits> {
    const body: {
      slowmodeSeconds?: number;
      messagesPerDay?: number | null;
      messagesPerHour?: number | null;
      mediaPerDay?: number | null;
      linksPerDay?: number | null;
      mentionsPerDay?: number | null;
      burstCount?: number | null;
      burstWindowSeconds?: number | null;
      exceedAction?: "warn" | "mute" | "reject";
      exceedMuteSeconds?: number | null;
    } = {};
    if (patch.slowmodeSeconds !== undefined) body.slowmodeSeconds = patch.slowmodeSeconds;
    if (patch.messagesPerDay !== undefined) body.messagesPerDay = patch.messagesPerDay;
    if (patch.messagesPerHour !== undefined) body.messagesPerHour = patch.messagesPerHour;
    if (patch.mediaPerDay !== undefined) body.mediaPerDay = patch.mediaPerDay;
    if (patch.linksPerDay !== undefined) body.linksPerDay = patch.linksPerDay;
    if (patch.mentionsPerDay !== undefined) body.mentionsPerDay = patch.mentionsPerDay;
    if (patch.burstCount !== undefined) body.burstCount = patch.burstCount;
    if (patch.burstWindowSeconds !== undefined) body.burstWindowSeconds = patch.burstWindowSeconds;
    if (patch.exceedAction !== undefined) body.exceedAction = patch.exceedAction;
    if (patch.exceedMuteSeconds !== undefined) body.exceedMuteSeconds = patch.exceedMuteSeconds;

    return this.request<RoleLimits>(`/chats/${encodeURIComponent(chatId)}/limits/roles/${encodeURIComponent(roleId)}`, {
      method: "PATCH",
      body
    });
  }

  async listMembers(chatId: string): Promise<MembersOverview> {
    return this.request<MembersOverview>(`/chats/${encodeURIComponent(chatId)}/members`, {
      method: "GET"
    });
  }

  async listModerationHistory(
    chatId: string,
    query?: { target_user_id?: string; limit?: number }
  ): Promise<ModerationHistoryResponse> {
    const path = this.withQuery(`/chats/${encodeURIComponent(chatId)}/members/moderation-history`, {
      target_user_id: query?.target_user_id,
      limit: query?.limit === undefined ? undefined : String(query.limit)
    });
    return this.request<ModerationHistoryResponse>(path, {
      method: "GET"
    });
  }

  async muteMember(chatId: string, userId: string, reason?: string): Promise<{ ok: true; member: ChatMemberRecord }> {
    return this.memberAction(chatId, userId, "mute", reason);
  }

  async unmuteMember(chatId: string, userId: string, reason?: string): Promise<{ ok: true; member: ChatMemberRecord }> {
    return this.memberAction(chatId, userId, "unmute", reason);
  }

  async banMember(chatId: string, userId: string, reason?: string): Promise<{ ok: true; member: ChatMemberRecord }> {
    return this.memberAction(chatId, userId, "ban", reason);
  }

  async unbanMember(chatId: string, userId: string, reason?: string): Promise<{ ok: true; member: ChatMemberRecord }> {
    return this.memberAction(chatId, userId, "unban", reason);
  }

  async kickMember(chatId: string, userId: string, reason?: string): Promise<{ ok: true; member: ChatMemberRecord }> {
    return this.memberAction(chatId, userId, "kick", reason);
  }

  async timeoutMember(
    chatId: string,
    userId: string,
    seconds: number,
    reason?: string
  ): Promise<{ ok: true; member: ChatMemberRecord }> {
    const body: { seconds: number; reason?: string } = { seconds };
    if (reason) {
      body.reason = reason;
    }
    return this.request<{ ok: true; member: ChatMemberRecord }>(
      `/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}/timeout`,
      {
        method: "POST",
        body
      }
    );
  }

  async clearMemberTimeout(chatId: string, userId: string, reason?: string): Promise<{ ok: true; member: ChatMemberRecord }> {
    const body: { reason?: string } = {};
    if (reason) {
      body.reason = reason;
    }
    return this.request<{ ok: true; member: ChatMemberRecord }>(
      `/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}/timeout/clear`,
      {
        method: "POST",
        body
      }
    );
  }

  async listInvites(chatId: string): Promise<InvitesListResponse> {
    return this.request<InvitesListResponse>(`/chats/${encodeURIComponent(chatId)}/invites`, {
      method: "GET"
    });
  }

  async createInvite(
    chatId: string,
    input: {
      approval_mode?: "auto" | "manual";
      target_role_id?: string | null;
      max_uses?: number | null;
      expires_at?: string | null;
    }
  ): Promise<{ ok: true; invite: ChatInvite }> {
    const body: {
      approval_mode?: "auto" | "manual";
      target_role_id?: string | null;
      max_uses?: number | null;
      expires_at?: string | null;
    } = {};
    if (input.approval_mode !== undefined) body.approval_mode = input.approval_mode;
    if (input.target_role_id !== undefined) body.target_role_id = input.target_role_id;
    if (input.max_uses !== undefined) body.max_uses = input.max_uses;
    if (input.expires_at !== undefined) body.expires_at = input.expires_at;

    return this.request<{ ok: true; invite: ChatInvite }>(`/chats/${encodeURIComponent(chatId)}/invites`, {
      method: "POST",
      body
    });
  }

  async updateInvite(
    chatId: string,
    inviteId: string,
    patch: {
      approval_mode?: "auto" | "manual";
      target_role_id?: string | null;
      max_uses?: number | null;
      expires_at?: string | null;
    }
  ): Promise<{ ok: true; invite: ChatInvite }> {
    const body: {
      approval_mode?: "auto" | "manual";
      target_role_id?: string | null;
      max_uses?: number | null;
      expires_at?: string | null;
    } = {};
    if (patch.approval_mode !== undefined) body.approval_mode = patch.approval_mode;
    if (patch.target_role_id !== undefined) body.target_role_id = patch.target_role_id;
    if (patch.max_uses !== undefined) body.max_uses = patch.max_uses;
    if (patch.expires_at !== undefined) body.expires_at = patch.expires_at;

    return this.request<{ ok: true; invite: ChatInvite }>(
      `/chats/${encodeURIComponent(chatId)}/invites/${encodeURIComponent(inviteId)}`,
      {
        method: "PATCH",
        body
      }
    );
  }

  async revokeInvite(
    chatId: string,
    inviteId: string
  ): Promise<{ ok: true; already_revoked: boolean; invite: ChatInvite }> {
    return this.request<{ ok: true; already_revoked: boolean; invite: ChatInvite }>(
      `/chats/${encodeURIComponent(chatId)}/invites/${encodeURIComponent(inviteId)}/revoke`,
      {
        method: "POST",
        body: {}
      }
    );
  }

  async rotateInviteCode(
    chatId: string,
    inviteId: string,
    code?: string
  ): Promise<{ ok: true; rotated: boolean; invite: ChatInvite }> {
    const body: { code?: string } = {};
    if (code !== undefined) {
      body.code = code;
    }

    return this.request<{ ok: true; rotated: boolean; invite: ChatInvite }>(
      `/chats/${encodeURIComponent(chatId)}/invites/${encodeURIComponent(inviteId)}/rotate-code`,
      {
        method: "POST",
        body
      }
    );
  }

  async listJoinRequests(
    chatId: string,
    status?: "pending" | "approved" | "rejected"
  ): Promise<JoinRequestsListResponse> {
    const path = this.withQuery(`/chats/${encodeURIComponent(chatId)}/join-requests`, status ? { status } : undefined);
    return this.request<JoinRequestsListResponse>(path, {
      method: "GET"
    });
  }

  async approveJoinRequest(
    chatId: string,
    requestId: string
  ): Promise<{ ok: true; request: JoinRequest; member: ChatMemberRecord }> {
    return this.request<{ ok: true; request: JoinRequest; member: ChatMemberRecord }>(
      `/chats/${encodeURIComponent(chatId)}/join-requests/${encodeURIComponent(requestId)}/approve`,
      {
        method: "POST",
        body: {}
      }
    );
  }

  async rejectJoinRequest(
    chatId: string,
    requestId: string,
    reason?: string
  ): Promise<{ ok: true; request: JoinRequest }> {
    const body: { reason?: string } = {};
    if (reason) {
      body.reason = reason;
    }

    return this.request<{ ok: true; request: JoinRequest }>(
      `/chats/${encodeURIComponent(chatId)}/join-requests/${encodeURIComponent(requestId)}/reject`,
      {
        method: "POST",
        body
      }
    );
  }

  async getJoinPolicy(chatId: string): Promise<{ ok: true; policy: JoinPolicy; requestedBy: string }> {
    return this.request<{ ok: true; policy: JoinPolicy; requestedBy: string }>(`/chats/${encodeURIComponent(chatId)}/join-policy`, {
      method: "GET"
    });
  }

  async updateJoinPolicy(
    chatId: string,
    patch: {
      default_approval_mode?: "auto" | "manual";
      default_target_role_id?: string | null;
    }
  ): Promise<{ ok: true; policy: JoinPolicy }> {
    const body: {
      default_approval_mode?: "auto" | "manual";
      default_target_role_id?: string | null;
    } = {};
    if (patch.default_approval_mode !== undefined) body.default_approval_mode = patch.default_approval_mode;
    if (patch.default_target_role_id !== undefined) body.default_target_role_id = patch.default_target_role_id;

    return this.request<{ ok: true; policy: JoinPolicy }>(`/chats/${encodeURIComponent(chatId)}/join-policy`, {
      method: "PATCH",
      body
    });
  }

  async listBroadcastCampaigns(chatId: string): Promise<BroadcastCampaign[]> {
    return this.request<BroadcastCampaign[]>(`/chats/${encodeURIComponent(chatId)}/broadcasts`, {
      method: "GET"
    });
  }

  async createBroadcastCampaign(
    chatId: string,
    payload: {
      name: string;
      broadcast_type: "scheduled" | "recurring" | "event_triggered" | "digest";
      audience: {
        roles?: string[];
        statuses?: string[];
        inactive_days_gte?: number;
        locale?: string[];
      };
      content: {
        text?: string;
        media?: unknown;
        buttons?: unknown[];
        template_id?: string;
      };
      schedule: {
        at?: string;
        cron?: string;
        timezone: string;
      };
      sender_mode: "as_user" | "as_group" | "as_role_profile";
      identity_id?: string;
      requires_approval?: boolean;
      rate_limit_per_minute?: number;
    }
  ): Promise<BroadcastCampaign> {
    const body: {
      name: string;
      broadcast_type: "scheduled" | "recurring" | "event_triggered" | "digest";
      audience: {
        roles?: string[];
        statuses?: string[];
        inactive_days_gte?: number;
        locale?: string[];
      };
      content: {
        text?: string;
        media?: JsonValue;
        buttons?: JsonValue[];
        template_id?: string;
      };
      schedule: {
        at?: string;
        cron?: string;
        timezone: string;
      };
      sender_mode: "as_user" | "as_group" | "as_role_profile";
      identity_id?: string;
      requires_approval?: boolean;
      rate_limit_per_minute?: number;
    } = {
      name: payload.name,
      broadcast_type: payload.broadcast_type,
      audience: payload.audience,
      content: {},
      schedule: payload.schedule,
      sender_mode: payload.sender_mode
    };

    if (payload.content.text !== undefined) body.content.text = payload.content.text;
    if (payload.content.template_id !== undefined) body.content.template_id = payload.content.template_id;
    if (payload.content.media !== undefined) body.content.media = payload.content.media as JsonValue;
    if (payload.content.buttons !== undefined) body.content.buttons = payload.content.buttons as JsonValue[];
    if (payload.identity_id !== undefined) body.identity_id = payload.identity_id;
    if (payload.requires_approval !== undefined) body.requires_approval = payload.requires_approval;
    if (payload.rate_limit_per_minute !== undefined) body.rate_limit_per_minute = payload.rate_limit_per_minute;

    return this.request<BroadcastCampaign>(`/chats/${encodeURIComponent(chatId)}/broadcasts`, {
      method: "POST",
      body
    });
  }

  async updateBroadcastCampaign(
    chatId: string,
    campaignId: string,
    patch: {
      name?: string;
      broadcast_type?: "scheduled" | "recurring" | "event_triggered" | "digest";
      audience?: {
        roles?: string[];
        statuses?: string[];
        inactive_days_gte?: number;
        locale?: string[];
      };
      content?: {
        text?: string;
        media?: unknown;
        buttons?: unknown[];
        template_id?: string;
      };
      schedule?: {
        at?: string;
        cron?: string;
        timezone: string;
      };
      sender_mode?: "as_user" | "as_group" | "as_role_profile";
      identity_id?: string;
      requires_approval?: boolean;
      rate_limit_per_minute?: number;
    }
  ): Promise<BroadcastCampaign> {
    const body: {
      name?: string;
      broadcast_type?: "scheduled" | "recurring" | "event_triggered" | "digest";
      audience?: {
        roles?: string[];
        statuses?: string[];
        inactive_days_gte?: number;
        locale?: string[];
      };
      content?: {
        text?: string;
        media?: JsonValue;
        buttons?: JsonValue[];
        template_id?: string;
      };
      schedule?: {
        at?: string;
        cron?: string;
        timezone: string;
      };
      sender_mode?: "as_user" | "as_group" | "as_role_profile";
      identity_id?: string;
      requires_approval?: boolean;
      rate_limit_per_minute?: number;
    } = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.broadcast_type !== undefined) body.broadcast_type = patch.broadcast_type;
    if (patch.audience !== undefined) body.audience = patch.audience;
    if (patch.content !== undefined) {
      body.content = {};
      if (patch.content.text !== undefined) body.content.text = patch.content.text;
      if (patch.content.template_id !== undefined) body.content.template_id = patch.content.template_id;
      if (patch.content.media !== undefined) body.content.media = patch.content.media as JsonValue;
      if (patch.content.buttons !== undefined) body.content.buttons = patch.content.buttons as JsonValue[];
    }
    if (patch.schedule !== undefined) body.schedule = patch.schedule;
    if (patch.sender_mode !== undefined) body.sender_mode = patch.sender_mode;
    if (patch.identity_id !== undefined) body.identity_id = patch.identity_id;
    if (patch.requires_approval !== undefined) body.requires_approval = patch.requires_approval;
    if (patch.rate_limit_per_minute !== undefined) body.rate_limit_per_minute = patch.rate_limit_per_minute;

    return this.request<BroadcastCampaign>(
      `/chats/${encodeURIComponent(chatId)}/broadcasts/${encodeURIComponent(campaignId)}`,
      {
        method: "PATCH",
        body
      }
    );
  }

  async approveBroadcastCampaign(chatId: string, campaignId: string): Promise<BroadcastCampaign> {
    return this.request<BroadcastCampaign>(
      `/chats/${encodeURIComponent(chatId)}/broadcasts/${encodeURIComponent(campaignId)}/approve`,
      {
        method: "POST",
        body: {}
      }
    );
  }

  async scheduleBroadcastCampaign(
    chatId: string,
    campaignId: string,
    patch: {
      at?: string;
      cron?: string;
      timezone?: string;
      idempotency_key?: string;
    }
  ): Promise<BroadcastCampaign> {
    const body: {
      at?: string;
      cron?: string;
      timezone?: string;
      idempotency_key?: string;
    } = {};
    if (patch.at !== undefined) body.at = patch.at;
    if (patch.cron !== undefined) body.cron = patch.cron;
    if (patch.timezone !== undefined) body.timezone = patch.timezone;
    if (patch.idempotency_key !== undefined) body.idempotency_key = patch.idempotency_key;

    return this.request<BroadcastCampaign>(
      `/chats/${encodeURIComponent(chatId)}/broadcasts/${encodeURIComponent(campaignId)}/schedule`,
      {
        method: "POST",
        body
      }
    );
  }

  async publishBroadcastNow(
    chatId: string,
    campaignId: string,
    idempotencyKey?: string
  ): Promise<BroadcastCampaign> {
    const body: { idempotency_key?: string } = {};
    if (idempotencyKey !== undefined) {
      body.idempotency_key = idempotencyKey;
    }

    return this.request<BroadcastCampaign>(
      `/chats/${encodeURIComponent(chatId)}/broadcasts/${encodeURIComponent(campaignId)}/publish-now`,
      {
        method: "POST",
        body
      }
    );
  }

  async pauseBroadcastCampaign(chatId: string, campaignId: string): Promise<BroadcastCampaign> {
    return this.request<BroadcastCampaign>(
      `/chats/${encodeURIComponent(chatId)}/broadcasts/${encodeURIComponent(campaignId)}/pause`,
      {
        method: "POST",
        body: {}
      }
    );
  }

  async resumeBroadcastCampaign(chatId: string, campaignId: string): Promise<BroadcastCampaign> {
    return this.request<BroadcastCampaign>(
      `/chats/${encodeURIComponent(chatId)}/broadcasts/${encodeURIComponent(campaignId)}/resume`,
      {
        method: "POST",
        body: {}
      }
    );
  }

  async cancelBroadcastCampaign(chatId: string, campaignId: string): Promise<BroadcastCampaign> {
    return this.request<BroadcastCampaign>(
      `/chats/${encodeURIComponent(chatId)}/broadcasts/${encodeURIComponent(campaignId)}/cancel`,
      {
        method: "POST",
        body: {}
      }
    );
  }

  async getBroadcastCampaignStats(chatId: string, campaignId: string): Promise<BroadcastCampaignStats> {
    return this.request<BroadcastCampaignStats>(
      `/chats/${encodeURIComponent(chatId)}/broadcasts/${encodeURIComponent(campaignId)}/stats`,
      {
        method: "GET"
      }
    );
  }

  async listWebhooks(chatId: string): Promise<IntegrationWebhookView[]> {
    return this.request<IntegrationWebhookView[]>(`/chats/${encodeURIComponent(chatId)}/webhooks`, {
      method: "GET"
    });
  }

  async createWebhook(
    chatId: string,
    payload: {
      name: string;
      url: string;
      events: Array<
        | "message.created"
        | "message.updated"
        | "message.deleted"
        | "member.updated"
        | "member.banned"
        | "broadcast.state.changed"
        | "broadcast.delivery.progress"
      >;
      enabled?: boolean;
    }
  ): Promise<IntegrationWebhookView> {
    const body: {
      name: string;
      url: string;
      events: Array<
        | "message.created"
        | "message.updated"
        | "message.deleted"
        | "member.updated"
        | "member.banned"
        | "broadcast.state.changed"
        | "broadcast.delivery.progress"
      >;
      enabled?: boolean;
    } = {
      name: payload.name,
      url: payload.url,
      events: payload.events
    };
    if (payload.enabled !== undefined) {
      body.enabled = payload.enabled;
    }
    return this.request<IntegrationWebhookView>(`/chats/${encodeURIComponent(chatId)}/webhooks`, {
      method: "POST",
      body
    });
  }

  async updateWebhook(
    chatId: string,
    webhookId: string,
    patch: {
      name?: string;
      url?: string;
      events?: Array<
        | "message.created"
        | "message.updated"
        | "message.deleted"
        | "member.updated"
        | "member.banned"
        | "broadcast.state.changed"
        | "broadcast.delivery.progress"
      >;
      enabled?: boolean;
    }
  ): Promise<IntegrationWebhookView> {
    const body: {
      name?: string;
      url?: string;
      events?: Array<
        | "message.created"
        | "message.updated"
        | "message.deleted"
        | "member.updated"
        | "member.banned"
        | "broadcast.state.changed"
        | "broadcast.delivery.progress"
      >;
      enabled?: boolean;
    } = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.url !== undefined) body.url = patch.url;
    if (patch.events !== undefined) body.events = patch.events;
    if (patch.enabled !== undefined) body.enabled = patch.enabled;

    return this.request<IntegrationWebhookView>(
      `/chats/${encodeURIComponent(chatId)}/webhooks/${encodeURIComponent(webhookId)}`,
      {
        method: "PATCH",
        body
      }
    );
  }

  async rotateWebhookSecret(
    chatId: string,
    webhookId: string,
    secret?: string
  ): Promise<{ webhook: IntegrationWebhookView; secret: string }> {
    const body: { secret?: string } = {};
    if (secret !== undefined) {
      body.secret = secret;
    }

    return this.request<{ webhook: IntegrationWebhookView; secret: string }>(
      `/chats/${encodeURIComponent(chatId)}/webhooks/${encodeURIComponent(webhookId)}/rotate-secret`,
      {
        method: "POST",
        body
      }
    );
  }

  async disableWebhook(chatId: string, webhookId: string): Promise<IntegrationWebhookView> {
    return this.request<IntegrationWebhookView>(
      `/chats/${encodeURIComponent(chatId)}/webhooks/${encodeURIComponent(webhookId)}/disable`,
      {
        method: "POST",
        body: {}
      }
    );
  }

  async createAutomationRule(
    chatId: string,
    payload: {
      name: string;
      trigger: "message.created" | "member.joined" | "ticket.overdue" | "limit.hit";
      conditions: unknown[];
      actions: unknown[];
      is_enabled: boolean;
    }
  ): Promise<AutomationRule> {
    return this.request<AutomationRule>(`/chats/${encodeURIComponent(chatId)}/automation/rules`, {
      method: "POST",
      body: {
        name: payload.name,
        trigger: payload.trigger,
        conditions: payload.conditions as JsonValue[],
        actions: payload.actions as JsonValue[],
        is_enabled: payload.is_enabled
      }
    });
  }

  async updateAutomationRule(
    chatId: string,
    ruleId: string,
    patch: {
      name?: string;
      trigger?: "message.created" | "member.joined" | "ticket.overdue" | "limit.hit";
      conditions?: unknown[];
      actions?: unknown[];
      is_enabled?: boolean;
    }
  ): Promise<AutomationRule> {
    const body: {
      name?: string;
      trigger?: "message.created" | "member.joined" | "ticket.overdue" | "limit.hit";
      conditions?: JsonValue[];
      actions?: JsonValue[];
      is_enabled?: boolean;
    } = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.trigger !== undefined) body.trigger = patch.trigger;
    if (patch.conditions !== undefined) body.conditions = patch.conditions as JsonValue[];
    if (patch.actions !== undefined) body.actions = patch.actions as JsonValue[];
    if (patch.is_enabled !== undefined) body.is_enabled = patch.is_enabled;

    return this.request<AutomationRule>(
      `/chats/${encodeURIComponent(chatId)}/automation/rules/${encodeURIComponent(ruleId)}`,
      {
        method: "PATCH",
        body
      }
    );
  }

  async executeAutomationRule(
    chatId: string,
    ruleId: string,
    payload: {
      trigger?: "message.created" | "member.joined" | "ticket.overdue" | "limit.hit";
      input_payload?: Record<string, unknown>;
      dry_run?: boolean;
    } = {}
  ): Promise<{ ok: true; execution: AutomationExecution }> {
    const body: {
      trigger?: "message.created" | "member.joined" | "ticket.overdue" | "limit.hit";
      input_payload?: JsonValue;
      dry_run?: boolean;
    } = {};
    if (payload.trigger !== undefined) body.trigger = payload.trigger;
    if (payload.input_payload !== undefined) body.input_payload = payload.input_payload as JsonValue;
    if (payload.dry_run !== undefined) body.dry_run = payload.dry_run;

    return this.request<{ ok: true; execution: AutomationExecution }>(
      `/chats/${encodeURIComponent(chatId)}/automation/rules/${encodeURIComponent(ruleId)}/execute`,
      {
        method: "POST",
        body
      }
    );
  }

  async listAutomationExecutions(chatId: string, ruleId: string, limit = 50): Promise<{ ok: true; items: AutomationExecution[] }> {
    const path = this.withQuery(`/chats/${encodeURIComponent(chatId)}/automation/rules/${encodeURIComponent(ruleId)}/executions`, {
      limit
    });
    return this.request<{ ok: true; items: AutomationExecution[] }>(path, {
      method: "GET"
    });
  }

  async createTicket(
    chatId: string,
    payload: {
      source_message_id: string;
      priority?: "low" | "normal" | "high" | "urgent";
      assignee_id?: string;
      sla_due_at?: string;
      labels?: string[];
    }
  ): Promise<Ticket> {
    const body: {
      source_message_id: string;
      priority?: "low" | "normal" | "high" | "urgent";
      assignee_id?: string;
      sla_due_at?: string;
      labels?: string[];
    } = {
      source_message_id: payload.source_message_id
    };
    if (payload.priority !== undefined) body.priority = payload.priority;
    if (payload.assignee_id !== undefined) body.assignee_id = payload.assignee_id;
    if (payload.sla_due_at !== undefined) body.sla_due_at = payload.sla_due_at;
    if (payload.labels !== undefined) body.labels = payload.labels;

    return this.request<Ticket>(`/chats/${encodeURIComponent(chatId)}/tickets`, {
      method: "POST",
      body
    });
  }

  async updateTicket(
    chatId: string,
    ticketId: string,
    patch: {
      status?: "open" | "in_progress" | "waiting" | "resolved" | "closed";
      priority?: "low" | "normal" | "high" | "urgent";
      assignee_id?: string | null;
      sla_due_at?: string | null;
      labels?: string[];
    }
  ): Promise<Ticket> {
    const body: {
      status?: "open" | "in_progress" | "waiting" | "resolved" | "closed";
      priority?: "low" | "normal" | "high" | "urgent";
      assignee_id?: string | null;
      sla_due_at?: string | null;
      labels?: string[];
    } = {};
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.priority !== undefined) body.priority = patch.priority;
    if (patch.assignee_id !== undefined) body.assignee_id = patch.assignee_id;
    if (patch.sla_due_at !== undefined) body.sla_due_at = patch.sla_due_at;
    if (patch.labels !== undefined) body.labels = patch.labels;

    return this.request<Ticket>(`/chats/${encodeURIComponent(chatId)}/tickets/${encodeURIComponent(ticketId)}`, {
      method: "PATCH",
      body
    });
  }

  async getTicketSlaStats(chatId: string, dueSoonMinutes?: number): Promise<TicketSlaStatsResponse> {
    const path = this.withQuery(`/chats/${encodeURIComponent(chatId)}/tickets/sla/stats`, {
      due_soon_minutes: dueSoonMinutes
    });
    return this.request<TicketSlaStatsResponse>(path, {
      method: "GET"
    });
  }

  async enableIncidentMode(
    chatId: string,
    input: {
      reason: string;
      policy_snapshot_json?: Record<string, unknown>;
    }
  ): Promise<IncidentModeResponse> {
    const body: {
      reason: string;
      policy_snapshot_json?: JsonValue;
    } = {
      reason: input.reason
    };
    if (input.policy_snapshot_json !== undefined) {
      body.policy_snapshot_json = input.policy_snapshot_json as JsonValue;
    }

    return this.request<IncidentModeResponse>(`/chats/${encodeURIComponent(chatId)}/incident-mode/enable`, {
      method: "POST",
      body
    });
  }

  async disableIncidentMode(chatId: string, reason?: string): Promise<IncidentModeResponse> {
    const body: { reason?: string } = {};
    if (reason !== undefined) {
      body.reason = reason;
    }
    return this.request<IncidentModeResponse>(`/chats/${encodeURIComponent(chatId)}/incident-mode/disable`, {
      method: "POST",
      body
    });
  }

  async getIncidentModeState(chatId: string): Promise<IncidentModeStatusResponse> {
    return this.request<IncidentModeStatusResponse>(`/chats/${encodeURIComponent(chatId)}/incident-mode/state`, {
      method: "GET"
    });
  }

  async exportHistory(
    chatId: string,
    query?: {
      format?: "jsonl" | "csv";
      from?: string;
      to?: string;
      author_id?: string;
      content_type?: "any" | "text" | "media";
      limit?: number;
    }
  ): Promise<ExportHistoryResult> {
    const path = this.withQuery(`/chats/${encodeURIComponent(chatId)}/export/history`, query as Record<string, JsonValue | undefined>);
    return this.request<ExportHistoryResult>(path, {
      method: "GET"
    });
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const auth = options.auth ?? true;
    const allowRefresh = options.allowRefresh ?? true;
    const retryMode = options.retryMode ?? "safe";
    const maxAttempts = this.resolveMaxAttempts(method, retryMode);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const isLastAttempt = attempt >= maxAttempts;
      const headers: Record<string, string> = {};
      if (options.body !== undefined) {
        headers["content-type"] = "application/json";
      }
      if (auth && this.session?.accessToken) {
        headers.authorization = `Bearer ${this.session.accessToken}`;
      }

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined
        });
      } catch (networkError) {
        if (!isLastAttempt && this.canRetryNetworkError(retryMode)) {
          await this.sleep(this.retryDelayMs(attempt));
          continue;
        }

        if (networkError instanceof Error) {
          throw new ApiClientError(`Network error: ${networkError.message}`, 0);
        }
        throw new ApiClientError("Network error: request failed", 0);
      }

      if (response.status === 401 && auth && allowRefresh && this.session?.refreshToken) {
        try {
          await this.refreshSession();
        } catch {
          this.setSession(null);
          throw new ApiClientError("Session expired. Re-authentication required.", 401);
        }

        return this.request<T>(path, {
          ...options,
          allowRefresh: false
        });
      }

      if (!response.ok) {
        if (!isLastAttempt && this.canRetryHttpStatus(method, retryMode, response.status)) {
          await this.sleep(this.retryDelayMs(attempt));
          continue;
        }
        const message = await this.extractErrorMessage(response);
        throw new ApiClientError(message, response.status);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    }

    throw new ApiClientError("Request failed after retries.", 0);
  }

  private resolveMaxAttempts(method: RequestOptions["method"], retryMode: RequestOptions["retryMode"]): number {
    if (retryMode === "none") {
      return 1;
    }
    if (retryMode === "network_once") {
      return 2;
    }

    // "safe": aggressively stabilize read paths and idempotent deletes.
    if (method === "GET") {
      return 3;
    }
    if (method === "DELETE") {
      return 2;
    }
    return 1;
  }

  private canRetryNetworkError(retryMode: RequestOptions["retryMode"]): boolean {
    return retryMode === "safe" || retryMode === "network_once";
  }

  private canRetryHttpStatus(
    method: RequestOptions["method"],
    retryMode: RequestOptions["retryMode"],
    statusCode: number
  ): boolean {
    if (retryMode !== "safe") {
      return false;
    }
    if (method !== "GET" && method !== "DELETE") {
      return false;
    }
    return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode === 500 || statusCode === 502 || statusCode === 503 || statusCode === 504;
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(250 * 2 ** (attempt - 1), 1500);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async extractErrorMessage(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      if (Array.isArray(payload.message)) {
        return payload.message.join("; ");
      }
      if (typeof payload.message === "string" && payload.message.trim().length > 0) {
        return payload.message;
      }
      if (typeof payload.error === "string" && payload.error.trim().length > 0) {
        return payload.error;
      }
    } catch {
      // keep fallback below
    }

    return `HTTP ${response.status}`;
  }

  private withQuery(path: string, query?: Record<string, JsonValue | undefined>): string {
    if (!query) {
      return path;
    }

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }
      params.set(key, String(value));
    }

    const queryString = params.toString();
    if (!queryString) {
      return path;
    }
    return `${path}?${queryString}`;
  }

  private async memberAction(
    chatId: string,
    userId: string,
    action: "mute" | "unmute" | "ban" | "unban" | "kick",
    reason?: string
  ): Promise<{ ok: true; member: ChatMemberRecord }> {
    const body: { reason?: string } = {};
    if (reason) {
      body.reason = reason;
    }
    return this.request<{ ok: true; member: ChatMemberRecord }>(
      `/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}/${action}`,
      {
        method: "POST",
        body
      }
    );
  }
}
