export type ChatMemberView = {
  id: string;
  status: "active" | "readonly" | "muted" | "banned";
  role: {
    id: string;
    name: string;
    permissions: string[];
  };
};

export type ChatView = {
  id: string;
  name: string;
  mode: "chat_mode" | "channel_mode" | "hybrid_mode";
  defaultRoleId: string;
  createdAt: string;
  member: ChatMemberView;
};

export type ChatIdentity = {
  id: string;
  chatId: string;
  name: string;
  type: "group" | "role_profile";
  isActive: boolean;
  createdBy: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  authorId: string;
  actorUserId: string;
  displayAuthorType: "user" | "group" | "role_profile";
  displayAuthorId: string;
  displayAuthorName?: string;
  displayAuthorUsername?: string;
  authorRoleName?: string;
  authorRoleBadgeEnabled?: boolean;
  senderMode: "as_user" | "as_group" | "as_role_profile";
  text?: string;
  media?: {
    type: "image" | "video" | "audio" | "file";
    url: string;
  } | null;
  isEncrypted?: boolean;
  encryptedPayload?: {
    version: string;
    algorithm: string;
    ciphertext: string;
    nonce: string;
    aad?: string | null;
    keyId?: string | null;
    recipientKeyIds?: string[] | null;
  } | null;
  replyToId?: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReactionSummaryEntry = {
  reaction: string;
  count: number;
};

export type SearchMessagesQuery = {
  q?: string;
  author_id?: string;
  from?: string;
  to?: string;
  content_type?: "any" | "text" | "media";
  media_type?: "image" | "video" | "audio" | "file";
  limit?: number;
};

export type PinnedMessageEntry = {
  pinnedAt: string;
  message: ChatMessage;
};

export type SavedMessageView = {
  id: string;
  chatId: string;
  userId: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledMessagePayload = {
  text?: string;
  media?: {
    type: "image" | "video" | "audio" | "file";
    url: string;
  } | null;
  sender_mode: "as_user" | "as_group" | "as_role_profile";
  identity_id?: string;
  signature_mode?: "system" | "hidden" | "custom";
  custom_signature?: string;
  reply_to_id?: string;
};

export type ScheduledMessage = {
  id: string;
  chatId: string;
  userId: string;
  payload: ScheduledMessagePayload;
  scheduledAt: string;
  status: "scheduled" | "sent" | "failed" | "canceled";
  sentMessageId?: string | null;
  sentAt?: string | null;
  canceledAt?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Bookmark = {
  id: string;
  chatId: string;
  userId: string;
  messageId: string;
  collection: string;
  tags: string[];
  note?: string | null;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Reminder = {
  id: string;
  chatId: string;
  userId: string;
  messageId: string;
  reminderType: "personal" | "team" | "moderator";
  targetRoleId?: string | null;
  note?: string | null;
  remindAt: string;
  telegramNotify: boolean;
  status: "scheduled" | "sent" | "failed" | "canceled";
  sentAt?: string | null;
  canceledAt?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KeywordAlert = {
  id: string;
  chatId: string;
  userId: string;
  keyword: string;
  normalizedKeyword: string;
  isRegex: boolean;
  caseSensitive: boolean;
  dedupWindowSeconds: number;
  isActive: boolean;
  lastTriggeredAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UnreadSummaryResponse = {
  ok: true;
  matchedCount: number;
  filters: {
    mentions_only: boolean;
    moderation_only: boolean;
    announcements_only: boolean;
    since: string | null;
  };
  summary: string;
  items: Array<{
    messageId: string;
    createdAt: string;
    preview: string;
  }>;
};

export type ChatRole = {
  id: string;
  chatId: string;
  name: string;
  priority: number;
  isSystem: boolean;
  isDefault: boolean;
  permissions: string[];
  createdAt: string;
};

export type RoleLimits = {
  chatId: string;
  roleId: string;
  slowmodeSeconds: number;
  messagesPerDay: number | null;
  messagesPerHour: number | null;
  mediaPerDay: number | null;
  linksPerDay: number | null;
  mentionsPerDay: number | null;
  burstCount: number | null;
  burstWindowSeconds: number | null;
  exceedAction: "warn" | "mute" | "reject";
  exceedMuteSeconds: number | null;
  updatedAt: string;
};

export type LimitsOverview = {
  chatId: string;
  roles: Array<{
    roleId: string;
    roleName: string;
    rolePriority: number;
    limits: RoleLimits;
  }>;
};

export type ChatMemberRecord = {
  id: string;
  chatId: string;
  userId: string;
  roleId: string;
  status: "active" | "readonly" | "muted" | "banned";
  mutedUntil?: string | null;
  bannedUntil?: string | null;
  joinedAt: string;
};

export type MembersOverview = {
  chatId: string;
  members: Array<{
    id: string;
    userId: string;
    shortUserId?: string;
    telegramId?: number | null;
    telegramUsername?: string | null;
    roleId: string;
    roleName: string;
    rolePriority: number;
    status: "active" | "readonly" | "muted" | "banned";
    mutedUntil: string | null;
    bannedUntil: string | null;
    joinedAt: string;
  }>;
};

export type ModerationHistoryEntry = {
  id: string;
  action:
    | "member.mute"
    | "member.unmute"
    | "member.timeout"
    | "member.timeout.clear"
    | "member.kick"
    | "member.ban"
    | "member.unban"
    | "message.delete";
  targetType: "member" | "message";
  actorId: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
  messageId: string | null;
  deletedMessageText: string | null;
};

export type ModerationHistoryResponse = {
  chatId: string;
  events: ModerationHistoryEntry[];
};

export type PermissionSimulationResult = {
  ok: true;
  actor: {
    user_id: string;
    role_id: string;
    status: "active" | "readonly" | "muted" | "banned";
  };
  permissions: Array<{
    permission: string;
    allowed: boolean;
  }>;
  role_checks: {
    target_user_id: string | null;
    target_user_exists: boolean | null;
    can_manage_target_user: boolean | null;
    target_role_id: string | null;
    target_role_exists: boolean | null;
    can_manage_target_role: boolean | null;
  };
  join_policy_checks: {
    can_approve_join: boolean;
    can_reject_join: boolean;
    can_create_invite: boolean;
    can_revoke_invite: boolean;
    can_create_unlimited_invite: boolean;
    join_target_role_id: string | null;
    join_target_role_exists: boolean | null;
    can_set_join_target_role: boolean | null;
  };
};

export type JoinApprovalMode = "auto" | "manual";

export type ChatInvite = {
  id: string;
  chatId: string;
  code: string;
  createdBy: string;
  approvalMode: JoinApprovalMode;
  targetRoleId?: string | null;
  maxUses?: number | null;
  usesCount: number;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JoinRequest = {
  id: string;
  chatId: string;
  userId: string;
  inviteCode?: string | null;
  note?: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JoinPolicy = {
  chatId: string;
  default_approval_mode: JoinApprovalMode;
  default_target_role_id: string | null;
  source: "chat" | "env";
  updated_by: string | null;
  updated_at: string | null;
};

export type InvitesListResponse = {
  ok: true;
  invites: ChatInvite[];
  requestedBy: string;
};

export type JoinRequestsListResponse = {
  ok: true;
  requests: JoinRequest[];
  requestedBy: string;
  filter: {
    status: "pending" | "approved" | "rejected" | null;
  };
};

export type BroadcastType = "scheduled" | "recurring" | "event_triggered" | "digest";
export type BroadcastStatus = "draft" | "review" | "approved" | "scheduled" | "running" | "paused" | "completed" | "canceled";

export type BroadcastAudience = {
  roles?: string[];
  statuses?: string[];
  inactive_days_gte?: number;
  locale?: string[];
};

export type BroadcastContent = {
  text?: string;
  media?: unknown;
  buttons?: unknown[];
  template_id?: string;
};

export type BroadcastSchedule = {
  at?: string;
  cron?: string;
  timezone: string;
};

export type BroadcastCampaign = {
  id: string;
  chatId: string;
  name: string;
  broadcastType: BroadcastType;
  audience: BroadcastAudience;
  content: BroadcastContent;
  schedule: BroadcastSchedule;
  senderMode: "as_user" | "as_group" | "as_role_profile";
  identityId?: string | null;
  requiresApproval: boolean;
  rateLimitPerMinute?: number | null;
  status: BroadcastStatus;
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  pausedAt?: string | null;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  lastRunAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BroadcastCampaignStats = {
  campaignId: string;
  status: BroadcastStatus;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  deliveryRate: number;
  lastRunAt?: string | null;
};

export type WebhookEvent =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "member.updated"
  | "member.banned"
  | "broadcast.state.changed"
  | "broadcast.delivery.progress";

export type IntegrationWebhookView = {
  id: string;
  chatId: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  createdBy: string;
  updatedBy: string;
  lastDeliveredAt?: string | null;
  lastError?: string | null;
  secretLast4: string;
  secret?: string;
  createdAt: string;
  updatedAt: string;
};

export type AutomationTriggerType = "message.created" | "member.joined" | "ticket.overdue" | "limit.hit";

export type AutomationRule = {
  id: string;
  chatId: string;
  name: string;
  triggerType: AutomationTriggerType;
  conditions: unknown[];
  actions: unknown[];
  isEnabled: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AutomationExecutionStatus = "success" | "failed" | "skipped";

export type AutomationExecution = {
  id: string;
  chatId: string;
  ruleId: string;
  triggerType: AutomationTriggerType;
  inputPayload: Record<string, unknown>;
  status: AutomationExecutionStatus;
  actionsCount: number;
  error?: string | null;
  executedBy: string;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
};

export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type Ticket = {
  id: string;
  chatId: string;
  sourceMessageId: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId?: string | null;
  slaDueAt?: string | null;
  slaBreachedAt?: string | null;
  labels: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TicketSlaStatsResponse = {
  ok: true;
  generatedAt: string;
  dueSoonMinutes: number;
  totals: {
    all: number;
    activeWithSla: number;
    overdue: number;
    dueSoon: number;
    breachedActive: number;
    resolvedOrClosed: number;
    resolvedOrClosedBreached: number;
  };
};

export type IncidentModeState = {
  id: string;
  chatId: string;
  enabledBy: string;
  enabledAt: string;
  disabledAt?: string | null;
  policySnapshot: Record<string, unknown>;
  reason: string;
};

export type IncidentModeResponse = {
  ok: true;
  state: IncidentModeState;
};

export type IncidentModeStatusResponse = {
  ok: true;
  enabled: boolean;
  state: IncidentModeState | null;
};

export type ExportHistoryResult = {
  format: "jsonl" | "csv";
  filename: string;
  rows: number;
  content: string;
};

export type ChannelNotifyConfig = {
  chatId: string;
  enabled: boolean;
  mode: "off" | "instant" | "digest";
  template: string;
  digestIntervalMinutes: number;
  updatedBy: string;
  updatedAt: string;
};

export type ChannelNotifyTestResult = {
  ok: true;
  config: ChannelNotifyConfig;
  dryRun: {
    rendered: string;
  };
  delivery: {
    requested: boolean;
    ok: boolean;
    skipped: boolean;
    reason?: string;
    attempts?: number;
  } | null;
};

export type ReadReceiptMode = "off" | "private" | "role_visible" | "global";

export type ReadReceiptPrivacyResponse = {
  mode: ReadReceiptMode;
  canManage: boolean;
  policy: {
    chatId: string;
    allowCrossRoleView: boolean;
    updatedBy?: string;
    updatedAt: string;
  };
};

export type ReadReceiptPrivacyUpdateResponse = {
  ok: true;
  mode: {
    userId: string;
    mode: ReadReceiptMode;
  } | null;
  policy: {
    chatId: string;
    allowCrossRoleView: boolean;
    updatedBy: string;
    updatedAt: string;
  };
};

export type ReadReceiptMarkResponse = {
  ok: true;
  stored: boolean;
  mode: ReadReceiptMode;
  readAt: string | null;
};

export type ReadReceiptsViewResponse = {
  messageId: string;
  ownReadAt: string | null;
  mode: ReadReceiptMode;
  totals: {
    readers: number;
    visible_readers: number;
    hidden_readers: number;
  };
  byRole: Array<{
    roleId: string;
    count: number;
  }>;
  readers: Array<{
    userId: string;
    roleId: string;
    readAt: string;
  }>;
};

export type ThreadSubscription = {
  id: string;
  chatId: string;
  userId: string;
  messageId: string;
  subscriptionType: "thread" | "message";
  telegramNotify: boolean;
  dedupWindowSeconds: number;
  isActive: boolean;
  lastTriggeredAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PollStatus = "open" | "closed";

export type Poll = {
  id: string;
  chatId: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
  isAnonymous: boolean;
  isQuiz: boolean;
  correctOptionIndexes: number[];
  allowedRoleIds: string[];
  closesAt?: string | null;
  status: PollStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PollVoteResponse = {
  ok: true;
  voteId: string;
};

export type PollResultsResponse = {
  pollId: string;
  status: PollStatus;
  totalVotes: number;
  allowMultiple: boolean;
  isQuiz: boolean;
  correctOptionIndexes: number[];
  options: Array<{
    optionIndex: number;
    option: string;
    votes: number;
  }>;
};

export type KnowledgeArticleStatus = "draft" | "review" | "published" | "archived";

export type KnowledgeArticle = {
  id: string;
  chatId: string;
  title: string;
  content: string;
  status: KnowledgeArticleStatus;
  category?: string | null;
  tags: string[];
  version: number;
  createdBy: string;
  updatedBy: string;
  publishedAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageTranslationView = {
  id: string;
  messageId: string;
  targetLanguage: string;
  sourceLanguage: string;
  text: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
};

export type TranslateMessageResponse = {
  ok: true;
  cacheHit: boolean;
  translation: MessageTranslationView;
};

export type ListTranslationsResponse = {
  ok: true;
  items: MessageTranslationView[];
};

export type DeleteTranslationResponse = {
  ok: true;
  deleted: boolean;
  targetLanguage: string;
};

export type MemberTag = {
  id: string;
  chatId: string;
  userId: string;
  tag: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AssignMemberTagResponse = {
  ok: true;
  created: boolean;
  tag: MemberTag;
  tags: MemberTag[];
};

export type MemberProfileField = {
  id: string;
  chatId: string;
  userId: string;
  key: string;
  value: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type MemberProfileFieldsListResponse = {
  ok: true;
  fields: MemberProfileField[];
};

export type UpsertMemberProfileFieldResponse = {
  ok: true;
  created: boolean;
  field: MemberProfileField;
  fields: MemberProfileField[];
};

export type DeleteMemberProfileFieldResponse = {
  ok: true;
  deleted: boolean;
  key: string;
  fields: MemberProfileField[];
};

export type E2EDevice = {
  id: string;
  chatId: string;
  userId: string;
  deviceId: string;
  algorithm: string;
  identityKey: string;
  signedPreKey: string;
  oneTimePreKeys: string[];
  fallbackKey?: string | null;
  isActive: boolean;
  lastPreKeyRotationAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TempRoomStatus = "active" | "archived";

export type TempRoom = {
  id: string;
  chatId: string;
  name: string;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status: TempRoomStatus;
  inheritPermissions: boolean;
  permissionOverrides: Record<string, unknown>;
  createdBy: string;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TempRoomArchiveResponse = {
  ok: true;
  alreadyArchived: boolean;
  room: TempRoom;
};

export type TempRoomRestoreResponse = {
  ok: true;
  alreadyActive: boolean;
  room: TempRoom;
};

export type ReputationEvent = {
  id: string;
  chatId: string;
  userId: string;
  delta: number;
  reason: string;
  sourceType: string;
  sourceId?: string | null;
  actorId: string;
  createdAt: string;
};

export type AdjustReputationResponse = {
  ok: true;
  event: ReputationEvent;
  score: number;
};

export type AuthUser = {
  id: string;
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
};

export type AuthMembership = {
  id: string;
  name: string;
  mode: "chat_mode" | "channel_mode" | "hybrid_mode";
  defaultRoleId: string;
  createdAt: string;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  memberships: AuthMembership[];
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type BootstrapResponse = {
  chat: ChatView;
  messages: ChatMessage[];
  identities: ChatIdentity[];
  pagination: {
    before: string | null;
    limit: number;
  };
  ws: {
    namespace: "/ws";
  };
  serverTime: string;
};

export type ApiErrorPayload = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
};

export type WsTypingPayload = {
  chatId: string;
  userId: string;
  at: string;
};

export type WsReactionPayload = {
  chatId: string;
  messageId: string;
  summary: ReactionSummaryEntry[];
};

export type WsMemberUpdatedPayload = ChatMemberRecord;
export type WsMemberBannedPayload = ChatMemberRecord;

export type WsTicketUpdatedPayload = Ticket;

export type WsAutomationRuleExecutedPayload = AutomationExecution;

export type WsIncidentModeChangedPayload = {
  chatId: string;
  enabled: boolean;
  reason: string;
  state: IncidentModeState;
};

export type WsBroadcastStateChangedPayload = {
  chatId: string;
  campaignId: string;
  status: BroadcastStatus;
};

export type WsBroadcastDeliveryProgressPayload = {
  chatId: string;
  campaignId: string;
  targetCount: number;
  sentCount: number;
  failedCount: number;
};

export type WsThreadSubscriptionTriggeredPayload = {
  chatId: string;
  subscriptionId: string;
  subscriberUserId: string;
  sourceMessageId: string;
  triggerMessageId: string;
};

export type WsReputationUpdatedPayload = {
  chatId: string;
  userId: string;
  delta: number;
  score: number;
  reason: string;
  actorId: string;
  eventId: string;
};
