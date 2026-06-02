import type {
  AutomationRule,
  AutomationExecution,
  AuditLog,
  Bookmark,
  BroadcastCampaign,
  ChannelNotifyConfig,
  Chat,
  ChatIdentity,
  ChatMember,
  IncidentModeLog,
  Invite,
  IntegrationWebhook,
  JoinRequest,
  JoinRequestStatus,
  JoinPolicy,
  KeywordAlert,
  KnowledgeArticle,
  MemberProfileField,
  MemberTag,
  MemberStatus,
  Message,
  MessageReaction,
  MessageTranslation,
  Poll,
  PollVote,
  ReputationEvent,
  ReadReceipt,
  ReadReceiptMode,
  ReadReceiptPolicy,
  ReadReceiptPreference,
  Reminder,
  Role,
  RoleLimits,
  E2EDevice,
  SavedMessageView,
  ScheduledMessage,
  TempRoom,
  Ticket,
  ThreadSubscription,
  ThreadSubscriptionType,
  User
} from "./types.js";

export const DATABASE_SERVICE = Symbol("DATABASE_SERVICE");

export type RolePatch = Partial<Pick<Role, "name" | "priority" | "permissions" | "isDefault">>;
export type MessagePatch = Partial<Pick<Message, "text" | "customSignature">>;
export type IdentityPatch = Partial<Pick<ChatIdentity, "name" | "isActive">>;
export type ChannelNotifyPatch = Partial<Pick<ChannelNotifyConfig, "enabled" | "mode" | "template" | "digestIntervalMinutes">>;
export type BroadcastCampaignPatch = Partial<
  Pick<
    BroadcastCampaign,
    | "name"
    | "broadcastType"
    | "audience"
    | "content"
    | "schedule"
    | "senderMode"
    | "identityId"
    | "requiresApproval"
    | "rateLimitPerMinute"
    | "status"
    | "approvedBy"
    | "approvedAt"
    | "scheduledAt"
    | "startedAt"
    | "completedAt"
    | "canceledAt"
    | "pausedAt"
    | "targetCount"
    | "sentCount"
    | "failedCount"
    | "lastRunAt"
  >
>;
export type ScheduledMessagePatch = Partial<
  Pick<ScheduledMessage, "status" | "scheduledAt" | "sentMessageId" | "sentAt" | "canceledAt" | "error">
>;
export type RoleLimitsPatch = Partial<
  Pick<
    RoleLimits,
    | "slowmodeSeconds"
    | "messagesPerDay"
    | "messagesPerHour"
    | "mediaPerDay"
    | "linksPerDay"
    | "mentionsPerDay"
    | "burstCount"
    | "burstWindowSeconds"
    | "exceedAction"
    | "exceedMuteSeconds"
  >
>;

export type IntegrationWebhookPatch = Partial<
  Pick<IntegrationWebhook, "name" | "url" | "events" | "enabled" | "secret" | "updatedBy" | "lastDeliveredAt" | "lastError">
>;
export type TicketPatch = Partial<Pick<Ticket, "status" | "priority" | "assigneeId" | "slaDueAt" | "slaBreachedAt" | "labels">>;
export type AutomationRulePatch = Partial<
  Pick<AutomationRule, "name" | "triggerType" | "conditions" | "actions" | "isEnabled" | "updatedBy">
>;
export type KnowledgeArticlePatch = Partial<
  Pick<KnowledgeArticle, "title" | "content" | "status" | "category" | "tags" | "version" | "updatedBy" | "publishedAt" | "archivedAt">
>;
export type PollPatch = Partial<
  Pick<Poll, "question" | "options" | "allowMultiple" | "isAnonymous" | "isQuiz" | "correctOptionIndexes" | "allowedRoleIds" | "closesAt" | "status">
>;
export type ReminderPatch = Partial<
  Pick<Reminder, "reminderType" | "targetRoleId" | "note" | "remindAt" | "telegramNotify" | "status" | "sentAt" | "canceledAt" | "error">
>;
export type BookmarkPatch = Partial<Pick<Bookmark, "collection" | "tags" | "note" | "isShared">>;
export type KeywordAlertPatch = Partial<
  Pick<KeywordAlert, "keyword" | "normalizedKeyword" | "isRegex" | "caseSensitive" | "dedupWindowSeconds" | "isActive" | "lastTriggeredAt">
>;
export type ThreadSubscriptionPatch = Partial<
  Pick<ThreadSubscription, "subscriptionType" | "telegramNotify" | "dedupWindowSeconds" | "isActive" | "lastTriggeredAt">
>;
export type InvitePatch = Partial<
  Pick<Invite, "code" | "approvalMode" | "targetRoleId" | "maxUses" | "usesCount" | "expiresAt" | "revokedAt">
>;
export type JoinRequestPatch = Partial<
  Pick<JoinRequest, "status" | "reviewedBy" | "reviewedAt" | "rejectReason" | "note" | "inviteCode">
>;
export type JoinPolicyPatch = Partial<Pick<JoinPolicy, "defaultApprovalMode" | "defaultTargetRoleId" | "updatedBy">>;
export type ReadReceiptPreferencePatch = Partial<Pick<ReadReceiptPreference, "mode">>;
export type ReadReceiptPolicyPatch = Partial<Pick<ReadReceiptPolicy, "allowCrossRoleView" | "updatedBy">>;
export type TempRoomPatch = Partial<Pick<TempRoom, "status" | "archivedAt">>;
export type ListMessagesOptions = {
  before?: string;
  limit?: number;
  includeDeleted?: boolean;
};
export type CountAuditOptions = {
  action?: string;
  targetType?: string;
  targetId?: string;
  since?: string;
};
export type DeletedMessagesBatch = {
  chatId: string;
  messageIds: string[];
};

export interface DatabaseService {
  upsertTelegramUser(input: { telegramId: number; username?: string; firstName?: string; lastName?: string }): Promise<User>;
  getUserById(userId: string): Promise<User | undefined>;
  listChatsForUser(userId: string): Promise<Chat[]>;
  getChat(chatId: string): Promise<Chat>;

  listRoles(chatId: string): Promise<Role[]>;
  getRole(chatId: string, roleId: string): Promise<Role>;
  createRole(input: { chatId: string; name: string; priority: number; permissions: string[]; isDefault?: boolean }): Promise<Role>;
  updateRole(chatId: string, roleId: string, patch: RolePatch): Promise<Role>;
  listRoleLimits(chatId: string): Promise<RoleLimits[]>;
  getRoleLimits(chatId: string, roleId: string): Promise<RoleLimits>;
  upsertRoleLimits(chatId: string, roleId: string, patch: RoleLimitsPatch): Promise<RoleLimits>;

  getMember(chatId: string, userId: string): Promise<ChatMember | undefined>;
  listMembers(chatId: string): Promise<ChatMember[]>;
  ensureMember(chatId: string, userId: string): Promise<ChatMember>;
  updateMemberStatus(chatId: string, userId: string, status: MemberStatus, mutedUntil?: string | null): Promise<ChatMember>;
  updateMemberRole(chatId: string, userId: string, roleId: string): Promise<ChatMember>;
  listInvites(chatId: string): Promise<Invite[]>;
  getInvite(chatId: string, inviteId: string): Promise<Invite>;
  getInviteByCode(chatId: string, code: string): Promise<Invite | undefined>;
  createInvite(input: Omit<Invite, "id" | "createdAt" | "updatedAt">): Promise<Invite>;
  updateInvite(chatId: string, inviteId: string, patch: InvitePatch): Promise<Invite>;
  listJoinRequests(chatId: string, status?: JoinRequestStatus): Promise<JoinRequest[]>;
  getJoinRequest(chatId: string, requestId: string): Promise<JoinRequest>;
  getPendingJoinRequestByUser(chatId: string, userId: string): Promise<JoinRequest | undefined>;
  createJoinRequest(input: Omit<JoinRequest, "id" | "createdAt" | "updatedAt">): Promise<JoinRequest>;
  updateJoinRequest(chatId: string, requestId: string, patch: JoinRequestPatch): Promise<JoinRequest>;
  getJoinPolicy(chatId: string): Promise<JoinPolicy | undefined>;
  upsertJoinPolicy(chatId: string, patch: JoinPolicyPatch): Promise<JoinPolicy>;

  listIdentities(chatId: string): Promise<ChatIdentity[]>;
  createIdentity(input: { chatId: string; name: string; type: "group" | "role_profile"; createdBy: string }): Promise<ChatIdentity>;
  updateIdentity(chatId: string, identityId: string, patch: IdentityPatch): Promise<ChatIdentity>;
  getIdentity(chatId: string, identityId: string): Promise<ChatIdentity>;

  listMessages(chatId: string, options?: ListMessagesOptions): Promise<Message[]>;
  listMessagesByAuthorSince(chatId: string, userId: string, sinceIso: string): Promise<Message[]>;
  getLastMessageByAuthor(chatId: string, userId: string): Promise<Message | undefined>;
  getMessage(chatId: string, messageId: string): Promise<Message>;
  createMessage(message: Omit<Message, "id" | "createdAt" | "updatedAt" | "isDeleted">): Promise<Message>;
  updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<Message>;
  softDeleteMessage(chatId: string, messageId: string): Promise<Message>;
  hardDeleteMessage(chatId: string, messageId: string): Promise<void>;
  hardDeleteMessages(chatId: string): Promise<string[]>;
  hardDeleteMessagesOlderThan(cutoffIso: string): Promise<DeletedMessagesBatch[]>;
  listMessageReactions(chatId: string, messageId: string): Promise<MessageReaction[]>;
  upsertMessageReaction(chatId: string, messageId: string, userId: string, reaction: string): Promise<MessageReaction>;
  deleteMessageReaction(chatId: string, messageId: string, userId: string): Promise<void>;
  listMessageTranslations(chatId: string, messageId: string): Promise<MessageTranslation[]>;
  getMessageTranslation(chatId: string, messageId: string, targetLanguage: string): Promise<MessageTranslation | undefined>;
  upsertMessageTranslation(
    input: Omit<MessageTranslation, "id" | "createdAt" | "updatedAt">
  ): Promise<MessageTranslation>;
  deleteMessageTranslation(chatId: string, messageId: string, targetLanguage: string): Promise<void>;
  listScheduledMessages(chatId: string, userId: string): Promise<ScheduledMessage[]>;
  listPendingScheduledMessages(): Promise<ScheduledMessage[]>;
  getScheduledMessage(chatId: string, scheduledMessageId: string): Promise<ScheduledMessage>;
  createScheduledMessage(input: Omit<ScheduledMessage, "id" | "sentMessageId" | "sentAt" | "canceledAt" | "error" | "createdAt" | "updatedAt">): Promise<ScheduledMessage>;
  updateScheduledMessage(chatId: string, scheduledMessageId: string, patch: ScheduledMessagePatch): Promise<ScheduledMessage>;

  addAuditLog(input: Omit<AuditLog, "id" | "createdAt">): Promise<AuditLog>;
  listAudit(chatId: string): Promise<AuditLog[]>;
  countAudit(chatId: string, options?: CountAuditOptions): Promise<number>;

  getChannelNotifyConfig(chatId: string): Promise<ChannelNotifyConfig>;
  updateChannelNotifyConfig(chatId: string, updatedBy: string, patch: ChannelNotifyPatch): Promise<ChannelNotifyConfig>;
  listSavedMessageViews(chatId: string, userId: string): Promise<SavedMessageView[]>;
  createSavedMessageView(input: Omit<SavedMessageView, "id" | "createdAt" | "updatedAt">): Promise<SavedMessageView>;
  deleteSavedMessageView(chatId: string, userId: string, viewId: string): Promise<void>;

  listKnowledgeArticles(chatId: string): Promise<KnowledgeArticle[]>;
  getKnowledgeArticle(chatId: string, articleId: string): Promise<KnowledgeArticle>;
  createKnowledgeArticle(input: Omit<KnowledgeArticle, "id" | "createdAt" | "updatedAt">): Promise<KnowledgeArticle>;
  updateKnowledgeArticle(chatId: string, articleId: string, patch: KnowledgeArticlePatch): Promise<KnowledgeArticle>;

  listPolls(chatId: string): Promise<Poll[]>;
  getPoll(chatId: string, pollId: string): Promise<Poll>;
  createPoll(input: Omit<Poll, "id" | "createdAt" | "updatedAt">): Promise<Poll>;
  updatePoll(chatId: string, pollId: string, patch: PollPatch): Promise<Poll>;
  getPollVote(chatId: string, pollId: string, userId: string): Promise<PollVote | undefined>;
  listPollVotes(chatId: string, pollId: string): Promise<PollVote[]>;
  createPollVote(input: Omit<PollVote, "id" | "createdAt" | "updatedAt">): Promise<PollVote>;

  listReminders(chatId: string, userId: string): Promise<Reminder[]>;
  listPendingReminders(): Promise<Reminder[]>;
  getReminder(chatId: string, reminderId: string): Promise<Reminder>;
  createReminder(
    input: Omit<Reminder, "id" | "sentAt" | "canceledAt" | "error" | "createdAt" | "updatedAt">
  ): Promise<Reminder>;
  updateReminder(chatId: string, reminderId: string, patch: ReminderPatch): Promise<Reminder>;

  listBookmarks(chatId: string, userId: string): Promise<Bookmark[]>;
  getBookmark(chatId: string, bookmarkId: string): Promise<Bookmark>;
  createBookmark(input: Omit<Bookmark, "id" | "createdAt" | "updatedAt">): Promise<Bookmark>;
  updateBookmark(chatId: string, bookmarkId: string, patch: BookmarkPatch): Promise<Bookmark>;
  deleteBookmark(chatId: string, bookmarkId: string): Promise<void>;
  listMemberTags(chatId: string, userId: string): Promise<MemberTag[]>;
  listMemberTagsForChat(chatId: string): Promise<MemberTag[]>;
  getMemberTagByKey(chatId: string, userId: string, tag: string): Promise<MemberTag | undefined>;
  createMemberTag(input: Omit<MemberTag, "id" | "createdAt" | "updatedAt">): Promise<MemberTag>;
  listMemberProfileFields(chatId: string, userId: string): Promise<MemberProfileField[]>;
  getMemberProfileFieldByKey(chatId: string, userId: string, key: string): Promise<MemberProfileField | undefined>;
  upsertMemberProfileField(
    input: Omit<MemberProfileField, "id" | "createdAt" | "updatedAt">
  ): Promise<MemberProfileField>;
  deleteMemberProfileField(chatId: string, userId: string, key: string): Promise<void>;

  listKeywordAlerts(chatId: string, userId: string): Promise<KeywordAlert[]>;
  listActiveKeywordAlertsForChat(chatId: string): Promise<KeywordAlert[]>;
  getKeywordAlert(chatId: string, alertId: string): Promise<KeywordAlert>;
  createKeywordAlert(input: Omit<KeywordAlert, "id" | "lastTriggeredAt" | "createdAt" | "updatedAt">): Promise<KeywordAlert>;
  updateKeywordAlert(chatId: string, alertId: string, patch: KeywordAlertPatch): Promise<KeywordAlert>;
  deleteKeywordAlert(chatId: string, alertId: string): Promise<void>;

  listThreadSubscriptions(chatId: string, userId: string): Promise<ThreadSubscription[]>;
  listActiveThreadSubscriptionsForChat(chatId: string): Promise<ThreadSubscription[]>;
  getThreadSubscription(chatId: string, subscriptionId: string): Promise<ThreadSubscription>;
  getThreadSubscriptionByKey(
    chatId: string,
    userId: string,
    messageId: string,
    subscriptionType: ThreadSubscriptionType
  ): Promise<ThreadSubscription | undefined>;
  createThreadSubscription(
    input: Omit<ThreadSubscription, "id" | "lastTriggeredAt" | "createdAt" | "updatedAt">
  ): Promise<ThreadSubscription>;
  updateThreadSubscription(chatId: string, subscriptionId: string, patch: ThreadSubscriptionPatch): Promise<ThreadSubscription>;
  deleteThreadSubscription(chatId: string, subscriptionId: string): Promise<void>;

  listReadReceipts(chatId: string, messageId: string): Promise<ReadReceipt[]>;
  getReadReceipt(chatId: string, messageId: string, userId: string): Promise<ReadReceipt | undefined>;
  upsertReadReceipt(chatId: string, messageId: string, userId: string, readAt: string): Promise<ReadReceipt>;
  getReadReceiptPreference(chatId: string, userId: string): Promise<ReadReceiptPreference | undefined>;
  upsertReadReceiptPreference(chatId: string, userId: string, mode: ReadReceiptMode): Promise<ReadReceiptPreference>;
  getReadReceiptPolicy(chatId: string): Promise<ReadReceiptPolicy>;
  upsertReadReceiptPolicy(chatId: string, patch: ReadReceiptPolicyPatch): Promise<ReadReceiptPolicy>;
  upsertE2EDevice(input: Omit<E2EDevice, "id" | "isActive" | "createdAt" | "updatedAt">): Promise<E2EDevice>;
  listE2EDevices(chatId: string, userIds?: string[]): Promise<E2EDevice[]>;
  listE2EDevicesForUser(chatId: string, userId: string): Promise<E2EDevice[]>;
  deactivateE2EDevice(chatId: string, userId: string, deviceId: string): Promise<E2EDevice>;

  listTickets(chatId: string): Promise<Ticket[]>;
  listTicketsPendingSlaBreach(nowIso: string): Promise<Ticket[]>;
  getTicket(chatId: string, ticketId: string): Promise<Ticket>;
  createTicket(input: Omit<Ticket, "id" | "createdAt" | "updatedAt">): Promise<Ticket>;
  updateTicket(chatId: string, ticketId: string, patch: TicketPatch): Promise<Ticket>;

  listAutomationRules(chatId: string): Promise<AutomationRule[]>;
  getAutomationRule(chatId: string, ruleId: string): Promise<AutomationRule>;
  createAutomationRule(input: Omit<AutomationRule, "id" | "createdAt" | "updatedAt">): Promise<AutomationRule>;
  updateAutomationRule(chatId: string, ruleId: string, patch: AutomationRulePatch): Promise<AutomationRule>;
  listAutomationExecutions(chatId: string, ruleId: string, limit: number): Promise<AutomationExecution[]>;
  createAutomationExecution(input: Omit<AutomationExecution, "id" | "createdAt">): Promise<AutomationExecution>;

  createTempRoom(
    input: Omit<TempRoom, "id" | "createdAt" | "updatedAt">
  ): Promise<TempRoom>;
  getTempRoom(chatId: string, tempRoomId: string): Promise<TempRoom>;
  updateTempRoom(chatId: string, tempRoomId: string, patch: TempRoomPatch): Promise<TempRoom>;
  listDueTempRoomsForAutoArchive(nowIso: string): Promise<TempRoom[]>;
  createReputationEvent(input: Omit<ReputationEvent, "id" | "createdAt">): Promise<ReputationEvent>;
  getReputationScore(chatId: string, userId: string): Promise<number>;

  getActiveIncidentMode(chatId: string): Promise<IncidentModeLog | undefined>;
  listActiveIncidentModes(): Promise<IncidentModeLog[]>;
  createIncidentModeLog(input: Omit<IncidentModeLog, "id">): Promise<IncidentModeLog>;
  closeIncidentMode(chatId: string, disabledAt: string): Promise<IncidentModeLog>;

  listIntegrationWebhooks(chatId: string): Promise<IntegrationWebhook[]>;
  getIntegrationWebhook(chatId: string, webhookId: string): Promise<IntegrationWebhook>;
  createIntegrationWebhook(
    input: Omit<IntegrationWebhook, "id" | "lastDeliveredAt" | "lastError" | "createdAt" | "updatedAt">
  ): Promise<IntegrationWebhook>;
  updateIntegrationWebhook(chatId: string, webhookId: string, patch: IntegrationWebhookPatch): Promise<IntegrationWebhook>;

  listBroadcastCampaigns(chatId: string): Promise<BroadcastCampaign[]>;
  getBroadcastCampaign(chatId: string, campaignId: string): Promise<BroadcastCampaign>;
  createBroadcastCampaign(
    input: Omit<
      BroadcastCampaign,
      | "id"
      | "approvedBy"
      | "approvedAt"
      | "scheduledAt"
      | "startedAt"
      | "completedAt"
      | "canceledAt"
      | "pausedAt"
      | "targetCount"
      | "sentCount"
      | "failedCount"
      | "lastRunAt"
      | "createdAt"
      | "updatedAt"
    >
  ): Promise<BroadcastCampaign>;
  updateBroadcastCampaign(chatId: string, campaignId: string, patch: BroadcastCampaignPatch): Promise<BroadcastCampaign>;
}
