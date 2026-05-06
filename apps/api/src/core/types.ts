export type ChatMode = "chat_mode" | "channel_mode" | "hybrid_mode";

export type MemberStatus = "active" | "readonly" | "muted" | "banned";

export type DisplayAuthorType = "user" | "group" | "role_profile";

export type SenderMode = "as_user" | "as_group" | "as_role_profile";
export type LimitExceedAction = "warn" | "mute" | "reject";
export type BroadcastType = "scheduled" | "recurring" | "event_triggered" | "digest";
export type BroadcastStatus = "draft" | "review" | "approved" | "scheduled" | "running" | "paused" | "completed" | "canceled";
export type ScheduledMessageStatus = "scheduled" | "sent" | "failed" | "canceled";
export type KnowledgeArticleStatus = "draft" | "review" | "published" | "archived";
export type PollStatus = "open" | "closed";
export type ReminderType = "personal" | "team" | "moderator";
export type ReminderStatus = "scheduled" | "sent" | "failed" | "canceled";
export type ReadReceiptMode = "off" | "private" | "role_visible" | "global";
export type ThreadSubscriptionType = "thread" | "message";
export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type AutomationTriggerType = "message.created" | "member.joined" | "ticket.overdue" | "limit.hit";
export type JoinRequestStatus = "pending" | "approved" | "rejected";
export type JoinApprovalMode = "auto" | "manual";
export type TempRoomStatus = "active" | "archived";
export type WebhookEvent =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "member.updated"
  | "member.banned"
  | "broadcast.state.changed"
  | "broadcast.delivery.progress";

export interface User {
  id: string;
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
}

export interface Chat {
  id: string;
  name: string;
  mode: ChatMode;
  defaultRoleId: string;
  createdAt: string;
}

export interface Role {
  id: string;
  chatId: string;
  name: string;
  priority: number;
  isSystem: boolean;
  isDefault: boolean;
  permissions: string[];
  createdAt: string;
}

export interface RoleLimits {
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
  exceedAction: LimitExceedAction;
  exceedMuteSeconds: number | null;
  updatedAt: string;
}

export interface ChatMember {
  id: string;
  chatId: string;
  userId: string;
  roleId: string;
  status: MemberStatus;
  mutedUntil?: string | null;
  bannedUntil?: string | null;
  joinedAt: string;
}

export interface Invite {
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
}

export interface JoinRequest {
  id: string;
  chatId: string;
  userId: string;
  inviteCode?: string | null;
  note?: string | null;
  status: JoinRequestStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JoinPolicy {
  chatId: string;
  defaultApprovalMode: JoinApprovalMode;
  defaultTargetRoleId?: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface ChatIdentity {
  id: string;
  chatId: string;
  name: string;
  type: "group" | "role_profile";
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  authorId: string;
  actorUserId: string;
  displayAuthorType: DisplayAuthorType;
  displayAuthorId: string;
  displayAuthorName?: string;
  displayAuthorUsername?: string;
  senderMode: SenderMode;
  text?: string;
  media?: {
    type: "image" | "video" | "audio" | "file";
    url: string;
  } | null;
  signatureMode?: "system" | "hidden" | "custom";
  customSignature?: string | null;
  replyToId?: string | null;
  isEncrypted?: boolean;
  encryptedPayload?: E2EEncryptedPayload | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface E2EEncryptedPayload {
  version: string;
  algorithm: string;
  ciphertext: string;
  nonce: string;
  aad?: string | null;
  keyId?: string | null;
  recipientKeyIds?: string[] | null;
}

export interface MessageReaction {
  id: string;
  chatId: string;
  messageId: string;
  userId: string;
  reaction: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTranslation {
  id: string;
  chatId: string;
  messageId: string;
  targetLanguage: string;
  sourceLanguage: string;
  sourceText: string;
  translatedText: string;
  provider: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledMessagePayload {
  text?: string;
  media?: {
    type: "image" | "video" | "audio" | "file";
    url: string;
  } | null;
  sender_mode: SenderMode;
  identity_id?: string;
  signature_mode?: "system" | "hidden" | "custom";
  custom_signature?: string;
  reply_to_id?: string;
}

export interface ScheduledMessage {
  id: string;
  chatId: string;
  userId: string;
  payload: ScheduledMessagePayload;
  scheduledAt: string;
  status: ScheduledMessageStatus;
  sentMessageId?: string | null;
  sentAt?: string | null;
  canceledAt?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  chatId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ChannelNotifyConfig {
  chatId: string;
  enabled: boolean;
  mode: "off" | "instant" | "digest";
  template: string;
  digestIntervalMinutes: number;
  updatedBy: string;
  updatedAt: string;
}

export interface RequestUser {
  userId: string;
  telegramId: number;
}

export interface BroadcastAudience {
  roles?: string[];
  statuses?: string[];
  inactive_days_gte?: number;
  locale?: string[];
}

export interface BroadcastContent {
  text?: string;
  media?: unknown;
  buttons?: unknown[];
  template_id?: string;
}

export interface BroadcastSchedule {
  at?: string;
  cron?: string;
  timezone: string;
}

export interface BroadcastCampaign {
  id: string;
  chatId: string;
  name: string;
  broadcastType: BroadcastType;
  audience: BroadcastAudience;
  content: BroadcastContent;
  schedule: BroadcastSchedule;
  senderMode: SenderMode;
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
}

export interface IntegrationWebhook {
  id: string;
  chatId: string;
  name: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  enabled: boolean;
  createdBy: string;
  updatedBy: string;
  lastDeliveredAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedMessageView {
  id: string;
  chatId: string;
  userId: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeArticle {
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
}

export interface Poll {
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
}

export interface PollVote {
  id: string;
  chatId: string;
  pollId: string;
  userId: string;
  optionIndexes: number[];
  createdAt: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  chatId: string;
  userId: string;
  messageId: string;
  reminderType: ReminderType;
  targetRoleId?: string | null;
  note?: string | null;
  remindAt: string;
  telegramNotify: boolean;
  status: ReminderStatus;
  sentAt?: string | null;
  canceledAt?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Bookmark {
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
}

export interface MemberTag {
  id: string;
  chatId: string;
  userId: string;
  tag: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemberProfileField {
  id: string;
  chatId: string;
  userId: string;
  key: string;
  value: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface KeywordAlert {
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
}

export interface ThreadSubscription {
  id: string;
  chatId: string;
  userId: string;
  messageId: string;
  subscriptionType: ThreadSubscriptionType;
  telegramNotify: boolean;
  dedupWindowSeconds: number;
  isActive: boolean;
  lastTriggeredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReadReceipt {
  id: string;
  chatId: string;
  messageId: string;
  userId: string;
  readAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReadReceiptPreference {
  chatId: string;
  userId: string;
  mode: ReadReceiptMode;
  updatedAt: string;
}

export interface ReadReceiptPolicy {
  chatId: string;
  allowCrossRoleView: boolean;
  updatedBy: string;
  updatedAt: string;
}

export interface E2EDevice {
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
}

export interface Ticket {
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
}

export interface AutomationRule {
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
}

export type AutomationExecutionStatus = "success" | "failed" | "skipped";

export interface AutomationExecution {
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
}

export interface TempRoom {
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
}

export interface ReputationEvent {
  id: string;
  chatId: string;
  userId: string;
  delta: number;
  reason: string;
  sourceType: string;
  sourceId?: string | null;
  actorId: string;
  createdAt: string;
}

export interface IncidentModeLog {
  id: string;
  chatId: string;
  enabledBy: string;
  enabledAt: string;
  disabledAt?: string | null;
  policySnapshot: Record<string, unknown>;
  reason: string;
}
