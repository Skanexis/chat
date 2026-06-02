import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type {
  AutomationRulePatch,
  BookmarkPatch,
  ChannelNotifyPatch,
  CountAuditOptions,
  DatabaseService,
  DeletedMessagesBatch,
  BroadcastCampaignPatch,
  KeywordAlertPatch,
  IntegrationWebhookPatch,
  KnowledgeArticlePatch,
  IdentityPatch,
  InvitePatch,
  JoinRequestPatch,
  JoinPolicyPatch,
  ListMessagesOptions,
  MessagePatch,
  PollPatch,
  ReadReceiptPolicyPatch,
  RoleLimitsPatch,
  ReminderPatch,
  RolePatch,
  ScheduledMessagePatch,
  TempRoomPatch,
  ThreadSubscriptionPatch,
  TicketPatch
} from "./database.service.js";
import { createDefaultRoleLimits } from "./limits.js";
import { BASE_ADMIN_PERMISSIONS, BASE_LEGIT_PERMISSIONS, BASE_MEMBER_PERMISSIONS, BASE_OWNER_PERMISSIONS } from "./permissions.js";
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

@Injectable()
export class InMemoryDatabase implements DatabaseService {
  private readonly users = new Map<string, User>();
  private readonly usersByTelegramId = new Map<number, string>();
  private readonly chats = new Map<string, Chat>();
  private readonly roles = new Map<string, Role>();
  private readonly roleLimits = new Map<string, RoleLimits>();
  private readonly members = new Map<string, ChatMember>();
  private readonly invites = new Map<string, Invite>();
  private readonly joinRequests = new Map<string, JoinRequest>();
  private readonly joinPolicies = new Map<string, JoinPolicy>();
  private readonly identities = new Map<string, ChatIdentity>();
  private readonly messages = new Map<string, Message>();
  private readonly reactions = new Map<string, MessageReaction>();
  private readonly messageTranslations = new Map<string, MessageTranslation>();
  private readonly scheduledMessages = new Map<string, ScheduledMessage>();
  private readonly audits = new Map<string, AuditLog>();
  private readonly channelNotifyConfigs = new Map<string, ChannelNotifyConfig>();
  private readonly savedViews = new Map<string, SavedMessageView>();
  private readonly knowledgeArticles = new Map<string, KnowledgeArticle>();
  private readonly polls = new Map<string, Poll>();
  private readonly pollVotes = new Map<string, PollVote>();
  private readonly reminders = new Map<string, Reminder>();
  private readonly bookmarks = new Map<string, Bookmark>();
  private readonly memberTags = new Map<string, MemberTag>();
  private readonly memberProfileFields = new Map<string, MemberProfileField>();
  private readonly keywordAlerts = new Map<string, KeywordAlert>();
  private readonly threadSubscriptions = new Map<string, ThreadSubscription>();
  private readonly readReceipts = new Map<string, ReadReceipt>();
  private readonly readReceiptPreferences = new Map<string, ReadReceiptPreference>();
  private readonly readReceiptPolicies = new Map<string, ReadReceiptPolicy>();
  private readonly e2eDevices = new Map<string, E2EDevice>();
  private readonly tickets = new Map<string, Ticket>();
  private readonly automationRules = new Map<string, AutomationRule>();
  private readonly automationExecutions = new Map<string, AutomationExecution>();
  private readonly tempRooms = new Map<string, TempRoom>();
  private readonly reputationEvents = new Map<string, ReputationEvent>();
  private readonly incidentModeLogs = new Map<string, IncidentModeLog>();
  private readonly webhooks = new Map<string, IntegrationWebhook>();
  private readonly broadcasts = new Map<string, BroadcastCampaign>();

  constructor() {
    this.seed();
  }

  async upsertTelegramUser(input: { telegramId: number; username?: string; firstName?: string; lastName?: string }): Promise<User> {
    const existingId = this.usersByTelegramId.get(input.telegramId);
    if (existingId) {
      const user = this.users.get(existingId);
      if (!user) {
        throw new NotFoundException("User mapping is corrupted.");
      }
      const updated: User = {
        ...user,
        username: input.username ?? user.username,
        firstName: input.firstName ?? user.firstName,
        lastName: input.lastName ?? user.lastName
      };
      this.users.set(existingId, updated);
      return updated;
    }

    const user: User = {
      id: randomUUID(),
      telegramId: input.telegramId,
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      createdAt: new Date().toISOString()
    };
    this.users.set(user.id, user);
    this.usersByTelegramId.set(user.telegramId, user.id);
    return user;
  }

  async getUserById(userId: string): Promise<User | undefined> {
    return this.users.get(userId);
  }

  async listChatsForUser(userId: string): Promise<Chat[]> {
    const memberChatIds = Array.from(this.members.values())
      .filter((member) => member.userId === userId && member.status !== "banned")
      .map((member) => member.chatId);

    const chats: Chat[] = [];
    for (const chatId of memberChatIds) {
      chats.push(await this.getChat(chatId));
    }
    return chats;
  }

  async getChat(chatId: string): Promise<Chat> {
    const chat = this.chats.get(chatId);
    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found.`);
    }
    return chat;
  }

  async listRoles(chatId: string): Promise<Role[]> {
    return Array.from(this.roles.values())
      .filter((role) => role.chatId === chatId)
      .sort((a, b) => b.priority - a.priority);
  }

  async getRole(chatId: string, roleId: string): Promise<Role> {
    const role = this.roles.get(roleId);
    if (!role || role.chatId !== chatId) {
      throw new NotFoundException(`Role ${roleId} not found in chat ${chatId}.`);
    }
    return role;
  }

  async createRole(input: { chatId: string; name: string; priority: number; permissions: string[]; isDefault?: boolean }): Promise<Role> {
    const role: Role = {
      id: randomUUID(),
      chatId: input.chatId,
      name: input.name,
      priority: input.priority,
      isSystem: false,
      isDefault: Boolean(input.isDefault),
      permissions: Array.from(new Set(input.permissions)),
      createdAt: new Date().toISOString()
    };
    if (role.isDefault) {
      const chat = await this.getChat(input.chatId);
      this.chats.set(chat.id, { ...chat, defaultRoleId: role.id });
      const roles = await this.listRoles(input.chatId);
      roles.forEach((existingRole) => {
        if (existingRole.isDefault) {
          this.roles.set(existingRole.id, { ...existingRole, isDefault: false });
        }
      });
    }
    this.roles.set(role.id, role);
    this.roleLimits.set(role.id, createDefaultRoleLimits(role.chatId, role.id));
    return role;
  }

  async updateRole(chatId: string, roleId: string, patch: RolePatch): Promise<Role> {
    const current = await this.getRole(chatId, roleId);
    const updated: Role = {
      ...current,
      name: patch.name ?? current.name,
      priority: patch.priority ?? current.priority,
      permissions: patch.permissions ? Array.from(new Set(patch.permissions)) : current.permissions,
      isDefault: patch.isDefault ?? current.isDefault
    };
    this.roles.set(roleId, updated);
    if (updated.isDefault) {
      const chat = await this.getChat(chatId);
      this.chats.set(chat.id, { ...chat, defaultRoleId: roleId });
      const roles = await this.listRoles(chatId);
      roles.forEach((existingRole) => {
        if (existingRole.id !== roleId && existingRole.isDefault) {
          this.roles.set(existingRole.id, { ...existingRole, isDefault: false });
        }
      });
    }
    return updated;
  }

  async listRoleLimits(chatId: string): Promise<RoleLimits[]> {
    const roles = await this.listRoles(chatId);
    return roles.map((role) => this.ensureRoleLimits(role.chatId, role.id));
  }

  async getRoleLimits(chatId: string, roleId: string): Promise<RoleLimits> {
    await this.getRole(chatId, roleId);
    return this.ensureRoleLimits(chatId, roleId);
  }

  async upsertRoleLimits(chatId: string, roleId: string, patch: RoleLimitsPatch): Promise<RoleLimits> {
    await this.getRole(chatId, roleId);
    const current = this.ensureRoleLimits(chatId, roleId);
    const updated: RoleLimits = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    this.roleLimits.set(roleId, updated);
    return updated;
  }

  async getMember(chatId: string, userId: string): Promise<ChatMember | undefined> {
    return Array.from(this.members.values()).find((member) => member.chatId === chatId && member.userId === userId);
  }

  async listMembers(chatId: string): Promise<ChatMember[]> {
    return Array.from(this.members.values()).filter((member) => member.chatId === chatId);
  }

  async ensureMember(chatId: string, userId: string): Promise<ChatMember> {
    const existing = await this.getMember(chatId, userId);
    if (existing) {
      const role = await this.getRole(chatId, existing.roleId);
      if (role.permissions.includes("*") && (existing.status !== "active" || existing.mutedUntil)) {
        const updated: ChatMember = {
          ...existing,
          status: "active",
          mutedUntil: null
        };
        this.members.set(existing.id, updated);
        return updated;
      }
      return existing;
    }
    const chat = await this.getChat(chatId);
    const member: ChatMember = {
      id: randomUUID(),
      chatId,
      userId,
      roleId: chat.defaultRoleId,
      status: "active",
      mutedUntil: null,
      bannedUntil: null,
      joinedAt: new Date().toISOString()
    };
    this.members.set(member.id, member);
    return member;
  }

  async updateMemberStatus(chatId: string, userId: string, status: MemberStatus, mutedUntil?: string | null): Promise<ChatMember> {
    const member = await this.getMember(chatId, userId);
    if (!member) {
      throw new NotFoundException(`Member ${userId} is not in chat ${chatId}.`);
    }
    const updated: ChatMember = {
      ...member,
      status,
      mutedUntil: mutedUntil === undefined ? member.mutedUntil : mutedUntil
    };
    this.members.set(member.id, updated);
    return updated;
  }

  async updateMemberRole(chatId: string, userId: string, roleId: string): Promise<ChatMember> {
    await this.getRole(chatId, roleId);
    const member = await this.getMember(chatId, userId);
    if (!member) {
      throw new NotFoundException(`Member ${userId} is not in chat ${chatId}.`);
    }
    const updated: ChatMember = {
      ...member,
      roleId
    };
    this.members.set(member.id, updated);
    return updated;
  }

  async listInvites(chatId: string): Promise<Invite[]> {
    return Array.from(this.invites.values())
      .filter((invite) => invite.chatId === chatId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getInvite(chatId: string, inviteId: string): Promise<Invite> {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.chatId !== chatId) {
      throw new NotFoundException(`Invite ${inviteId} not found.`);
    }
    return invite;
  }

  async getInviteByCode(chatId: string, code: string): Promise<Invite | undefined> {
    return Array.from(this.invites.values()).find((invite) => invite.chatId === chatId && invite.code === code);
  }

  async createInvite(input: Omit<Invite, "id" | "createdAt" | "updatedAt">): Promise<Invite> {
    const now = new Date().toISOString();
    const invite: Invite = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.invites.set(invite.id, invite);
    return invite;
  }

  async updateInvite(chatId: string, inviteId: string, patch: InvitePatch): Promise<Invite> {
    const current = await this.getInvite(chatId, inviteId);
    const updated: Invite = {
      ...current,
      code: patch.code ?? current.code,
      approvalMode: patch.approvalMode ?? current.approvalMode,
      targetRoleId: patch.targetRoleId !== undefined ? patch.targetRoleId : current.targetRoleId,
      maxUses: patch.maxUses !== undefined ? patch.maxUses : current.maxUses,
      usesCount: patch.usesCount ?? current.usesCount,
      expiresAt: patch.expiresAt !== undefined ? patch.expiresAt : current.expiresAt,
      revokedAt: patch.revokedAt !== undefined ? patch.revokedAt : current.revokedAt,
      updatedAt: new Date().toISOString()
    };
    this.invites.set(inviteId, updated);
    return updated;
  }

  async listJoinRequests(chatId: string, status?: JoinRequestStatus): Promise<JoinRequest[]> {
    return Array.from(this.joinRequests.values())
      .filter((request) => request.chatId === chatId && (status === undefined || request.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getJoinRequest(chatId: string, requestId: string): Promise<JoinRequest> {
    const request = this.joinRequests.get(requestId);
    if (!request || request.chatId !== chatId) {
      throw new NotFoundException(`Join request ${requestId} not found.`);
    }
    return request;
  }

  async getPendingJoinRequestByUser(chatId: string, userId: string): Promise<JoinRequest | undefined> {
    return Array.from(this.joinRequests.values()).find(
      (request) => request.chatId === chatId && request.userId === userId && request.status === "pending"
    );
  }

  async createJoinRequest(input: Omit<JoinRequest, "id" | "createdAt" | "updatedAt">): Promise<JoinRequest> {
    const now = new Date().toISOString();
    const request: JoinRequest = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.joinRequests.set(request.id, request);
    return request;
  }

  async updateJoinRequest(chatId: string, requestId: string, patch: JoinRequestPatch): Promise<JoinRequest> {
    const current = await this.getJoinRequest(chatId, requestId);
    const updated: JoinRequest = {
      ...current,
      status: patch.status ?? current.status,
      reviewedBy: patch.reviewedBy !== undefined ? patch.reviewedBy : current.reviewedBy,
      reviewedAt: patch.reviewedAt !== undefined ? patch.reviewedAt : current.reviewedAt,
      rejectReason: patch.rejectReason !== undefined ? patch.rejectReason : current.rejectReason,
      note: patch.note !== undefined ? patch.note : current.note,
      inviteCode: patch.inviteCode !== undefined ? patch.inviteCode : current.inviteCode,
      updatedAt: new Date().toISOString()
    };
    this.joinRequests.set(requestId, updated);
    return updated;
  }

  async getJoinPolicy(chatId: string): Promise<JoinPolicy | undefined> {
    await this.getChat(chatId);
    return this.joinPolicies.get(chatId);
  }

  async upsertJoinPolicy(chatId: string, patch: JoinPolicyPatch): Promise<JoinPolicy> {
    await this.getChat(chatId);
    const current = this.joinPolicies.get(chatId);
    const updated: JoinPolicy = {
      chatId,
      defaultApprovalMode: patch.defaultApprovalMode ?? current?.defaultApprovalMode ?? "manual",
      defaultTargetRoleId:
        patch.defaultTargetRoleId !== undefined ? patch.defaultTargetRoleId : (current?.defaultTargetRoleId ?? null),
      updatedBy: patch.updatedBy ?? current?.updatedBy ?? "system",
      updatedAt: new Date().toISOString()
    };
    this.joinPolicies.set(chatId, updated);
    return updated;
  }

  async listIdentities(chatId: string): Promise<ChatIdentity[]> {
    return Array.from(this.identities.values()).filter((identity) => identity.chatId === chatId);
  }

  async createIdentity(input: { chatId: string; name: string; type: "group" | "role_profile"; createdBy: string }): Promise<ChatIdentity> {
    const identity: ChatIdentity = {
      id: randomUUID(),
      chatId: input.chatId,
      name: input.name,
      type: input.type,
      isActive: true,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString()
    };
    this.identities.set(identity.id, identity);
    return identity;
  }

  async updateIdentity(chatId: string, identityId: string, patch: IdentityPatch): Promise<ChatIdentity> {
    const identity = this.identities.get(identityId);
    if (!identity || identity.chatId !== chatId) {
      throw new NotFoundException(`Identity ${identityId} not found.`);
    }
    const updated: ChatIdentity = {
      ...identity,
      name: patch.name ?? identity.name,
      isActive: patch.isActive ?? identity.isActive
    };
    this.identities.set(identityId, updated);
    return updated;
  }

  async getIdentity(chatId: string, identityId: string): Promise<ChatIdentity> {
    const identity = this.identities.get(identityId);
    if (!identity || identity.chatId !== chatId) {
      throw new NotFoundException(`Identity ${identityId} not found.`);
    }
    return identity;
  }

  async listMessages(chatId: string, options: ListMessagesOptions = {}): Promise<Message[]> {
    const before = options.before ?? null;
    const limit = options.limit ?? null;
    const includeDeleted = options.includeDeleted ?? false;
    const messages = Array.from(this.messages.values())
      .filter(
        (message) =>
          message.chatId === chatId &&
          (includeDeleted || !message.isDeleted) &&
          (before === null || message.createdAt < before)
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (limit === null || limit <= 0) {
      return messages;
    }
    return messages.slice(-limit);
  }

  async listMessagesByAuthorSince(chatId: string, userId: string, sinceIso: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(
        (message) =>
          message.chatId === chatId &&
          message.authorId === userId &&
          !message.isDeleted &&
          message.createdAt >= sinceIso
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getLastMessageByAuthor(chatId: string, userId: string): Promise<Message | undefined> {
    const own = Array.from(this.messages.values())
      .filter((message) => message.chatId === chatId && message.authorId === userId && !message.isDeleted)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return own[0];
  }

  async getMessage(chatId: string, messageId: string): Promise<Message> {
    const message = this.messages.get(messageId);
    if (!message || message.chatId !== chatId) {
      throw new NotFoundException(`Message ${messageId} not found.`);
    }
    return message;
  }

  async createMessage(message: Omit<Message, "id" | "createdAt" | "updatedAt" | "isDeleted">): Promise<Message> {
    const now = new Date().toISOString();
    const created: Message = {
      ...message,
      isEncrypted: message.isEncrypted ?? false,
      encryptedPayload: message.encryptedPayload ?? null,
      id: randomUUID(),
      isDeleted: false,
      createdAt: now,
      updatedAt: now
    };
    this.messages.set(created.id, created);
    return created;
  }

  async updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<Message> {
    const current = await this.getMessage(chatId, messageId);
    const updated: Message = {
      ...current,
      text: patch.text ?? current.text,
      customSignature: patch.customSignature ?? current.customSignature,
      updatedAt: new Date().toISOString()
    };
    this.messages.set(updated.id, updated);
    return updated;
  }

  async softDeleteMessage(chatId: string, messageId: string): Promise<Message> {
    const current = await this.getMessage(chatId, messageId);
    const updated: Message = {
      ...current,
      isDeleted: true,
      updatedAt: new Date().toISOString()
    };
    this.messages.set(updated.id, updated);
    return updated;
  }

  async hardDeleteMessage(chatId: string, messageId: string): Promise<void> {
    await this.getMessage(chatId, messageId);
    const messageIdSet = new Set([messageId]);
    this.messages.delete(messageId);

    for (const [reactionId, reaction] of this.reactions.entries()) {
      if (reaction.chatId === chatId && messageIdSet.has(reaction.messageId)) {
        this.reactions.delete(reactionId);
      }
    }
    for (const [translationId, translation] of this.messageTranslations.entries()) {
      if (translation.chatId === chatId && messageIdSet.has(translation.messageId)) {
        this.messageTranslations.delete(translationId);
      }
    }
    for (const [readReceiptId, readReceipt] of this.readReceipts.entries()) {
      if (readReceipt.chatId === chatId && messageIdSet.has(readReceipt.messageId)) {
        this.readReceipts.delete(readReceiptId);
      }
    }
    for (const [bookmarkId, bookmark] of this.bookmarks.entries()) {
      if (bookmark.chatId === chatId && messageIdSet.has(bookmark.messageId)) {
        this.bookmarks.delete(bookmarkId);
      }
    }
    for (const [reminderId, reminder] of this.reminders.entries()) {
      if (reminder.chatId === chatId && messageIdSet.has(reminder.messageId)) {
        this.reminders.delete(reminderId);
      }
    }
    for (const [subscriptionId, subscription] of this.threadSubscriptions.entries()) {
      if (subscription.chatId === chatId && messageIdSet.has(subscription.messageId)) {
        this.threadSubscriptions.delete(subscriptionId);
      }
    }
    for (const [scheduledMessageId, scheduledMessage] of this.scheduledMessages.entries()) {
      if (scheduledMessage.chatId === chatId && scheduledMessage.sentMessageId && messageIdSet.has(scheduledMessage.sentMessageId)) {
        this.scheduledMessages.delete(scheduledMessageId);
      }
    }
    for (const [auditId, audit] of this.audits.entries()) {
      if (audit.chatId === chatId && audit.targetType === "message" && messageIdSet.has(audit.targetId)) {
        this.audits.delete(auditId);
      }
    }
  }

  async hardDeleteMessages(chatId: string): Promise<string[]> {
    const messageIds = Array.from(this.messages.values())
      .filter((message) => message.chatId === chatId)
      .map((message) => message.id);
    if (messageIds.length === 0) {
      return [];
    }

    const messageIdSet = new Set(messageIds);
    for (const messageId of messageIds) {
      this.messages.delete(messageId);
    }

    for (const [reactionId, reaction] of this.reactions.entries()) {
      if (reaction.chatId === chatId && messageIdSet.has(reaction.messageId)) {
        this.reactions.delete(reactionId);
      }
    }
    for (const [translationId, translation] of this.messageTranslations.entries()) {
      if (translation.chatId === chatId && messageIdSet.has(translation.messageId)) {
        this.messageTranslations.delete(translationId);
      }
    }
    for (const [readReceiptId, readReceipt] of this.readReceipts.entries()) {
      if (readReceipt.chatId === chatId && messageIdSet.has(readReceipt.messageId)) {
        this.readReceipts.delete(readReceiptId);
      }
    }
    for (const [bookmarkId, bookmark] of this.bookmarks.entries()) {
      if (bookmark.chatId === chatId && messageIdSet.has(bookmark.messageId)) {
        this.bookmarks.delete(bookmarkId);
      }
    }
    for (const [reminderId, reminder] of this.reminders.entries()) {
      if (reminder.chatId === chatId && messageIdSet.has(reminder.messageId)) {
        this.reminders.delete(reminderId);
      }
    }
    for (const [subscriptionId, subscription] of this.threadSubscriptions.entries()) {
      if (subscription.chatId === chatId && messageIdSet.has(subscription.messageId)) {
        this.threadSubscriptions.delete(subscriptionId);
      }
    }
    for (const [scheduledMessageId, scheduledMessage] of this.scheduledMessages.entries()) {
      if (scheduledMessage.chatId === chatId && scheduledMessage.sentMessageId && messageIdSet.has(scheduledMessage.sentMessageId)) {
        this.scheduledMessages.delete(scheduledMessageId);
      }
    }
    for (const [auditId, audit] of this.audits.entries()) {
      if (audit.chatId === chatId && audit.targetType === "message" && messageIdSet.has(audit.targetId)) {
        this.audits.delete(auditId);
      }
    }

    return messageIds;
  }

  async hardDeleteMessagesOlderThan(cutoffIso: string): Promise<DeletedMessagesBatch[]> {
    const messageEntries = Array.from(this.messages.values()).filter((message) => message.createdAt <= cutoffIso);
    if (messageEntries.length === 0) {
      return [];
    }

    const messageIdSet = new Set(messageEntries.map((message) => message.id));
    const batchesByChatId = new Map<string, string[]>();
    for (const message of messageEntries) {
      this.messages.delete(message.id);
      const current = batchesByChatId.get(message.chatId) ?? [];
      current.push(message.id);
      batchesByChatId.set(message.chatId, current);
    }

    for (const [reactionId, reaction] of this.reactions.entries()) {
      if (messageIdSet.has(reaction.messageId)) {
        this.reactions.delete(reactionId);
      }
    }
    for (const [translationId, translation] of this.messageTranslations.entries()) {
      if (messageIdSet.has(translation.messageId)) {
        this.messageTranslations.delete(translationId);
      }
    }
    for (const [readReceiptId, readReceipt] of this.readReceipts.entries()) {
      if (messageIdSet.has(readReceipt.messageId)) {
        this.readReceipts.delete(readReceiptId);
      }
    }
    for (const [bookmarkId, bookmark] of this.bookmarks.entries()) {
      if (messageIdSet.has(bookmark.messageId)) {
        this.bookmarks.delete(bookmarkId);
      }
    }
    for (const [reminderId, reminder] of this.reminders.entries()) {
      if (messageIdSet.has(reminder.messageId)) {
        this.reminders.delete(reminderId);
      }
    }
    for (const [subscriptionId, subscription] of this.threadSubscriptions.entries()) {
      if (messageIdSet.has(subscription.messageId)) {
        this.threadSubscriptions.delete(subscriptionId);
      }
    }
    for (const [scheduledMessageId, scheduledMessage] of this.scheduledMessages.entries()) {
      if (scheduledMessage.sentMessageId && messageIdSet.has(scheduledMessage.sentMessageId)) {
        this.scheduledMessages.delete(scheduledMessageId);
      }
    }
    for (const [auditId, audit] of this.audits.entries()) {
      if (audit.targetType === "message" && messageIdSet.has(audit.targetId)) {
        this.audits.delete(auditId);
      }
    }

    return Array.from(batchesByChatId.entries()).map(([batchChatId, messageIds]) => ({
      chatId: batchChatId,
      messageIds
    }));
  }

  async listMessageReactions(chatId: string, messageId: string): Promise<MessageReaction[]> {
    await this.getMessage(chatId, messageId);
    return Array.from(this.reactions.values())
      .filter((reaction) => reaction.chatId === chatId && reaction.messageId === messageId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async upsertMessageReaction(chatId: string, messageId: string, userId: string, reaction: string): Promise<MessageReaction> {
    await this.getMessage(chatId, messageId);
    const existing = Array.from(this.reactions.values()).find(
      (item) => item.chatId === chatId && item.messageId === messageId && item.userId === userId
    );
    const now = new Date().toISOString();
    if (existing) {
      const updated: MessageReaction = {
        ...existing,
        reaction,
        updatedAt: now
      };
      this.reactions.set(existing.id, updated);
      return updated;
    }

    const created: MessageReaction = {
      id: randomUUID(),
      chatId,
      messageId,
      userId,
      reaction,
      createdAt: now,
      updatedAt: now
    };
    this.reactions.set(created.id, created);
    return created;
  }

  async deleteMessageReaction(chatId: string, messageId: string, userId: string): Promise<void> {
    await this.getMessage(chatId, messageId);
    const existing = Array.from(this.reactions.values()).find(
      (item) => item.chatId === chatId && item.messageId === messageId && item.userId === userId
    );
    if (!existing) {
      return;
    }
    this.reactions.delete(existing.id);
  }

  async listMessageTranslations(chatId: string, messageId: string): Promise<MessageTranslation[]> {
    await this.getMessage(chatId, messageId);
    return Array.from(this.messageTranslations.values())
      .filter((entry) => entry.chatId === chatId && entry.messageId === messageId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getMessageTranslation(
    chatId: string,
    messageId: string,
    targetLanguage: string
  ): Promise<MessageTranslation | undefined> {
    return Array.from(this.messageTranslations.values()).find(
      (entry) =>
        entry.chatId === chatId &&
        entry.messageId === messageId &&
        entry.targetLanguage.toLowerCase() === targetLanguage.toLowerCase()
    );
  }

  async upsertMessageTranslation(
    input: Omit<MessageTranslation, "id" | "createdAt" | "updatedAt">
  ): Promise<MessageTranslation> {
    await this.getMessage(input.chatId, input.messageId);
    const existing = await this.getMessageTranslation(input.chatId, input.messageId, input.targetLanguage);
    const now = new Date().toISOString();
    if (existing) {
      const updated: MessageTranslation = {
        ...existing,
        sourceLanguage: input.sourceLanguage,
        sourceText: input.sourceText,
        translatedText: input.translatedText,
        provider: input.provider,
        updatedBy: input.updatedBy,
        updatedAt: now
      };
      this.messageTranslations.set(existing.id, updated);
      return updated;
    }

    const created: MessageTranslation = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.messageTranslations.set(created.id, created);
    return created;
  }

  async deleteMessageTranslation(chatId: string, messageId: string, targetLanguage: string): Promise<void> {
    const existing = await this.getMessageTranslation(chatId, messageId, targetLanguage);
    if (!existing) {
      return;
    }
    this.messageTranslations.delete(existing.id);
  }

  async listScheduledMessages(chatId: string, userId: string): Promise<ScheduledMessage[]> {
    return Array.from(this.scheduledMessages.values())
      .filter((message) => message.chatId === chatId && message.userId === userId)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  async listPendingScheduledMessages(): Promise<ScheduledMessage[]> {
    return Array.from(this.scheduledMessages.values())
      .filter((message) => message.status === "scheduled")
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  async getScheduledMessage(chatId: string, scheduledMessageId: string): Promise<ScheduledMessage> {
    const existing = this.scheduledMessages.get(scheduledMessageId);
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Scheduled message ${scheduledMessageId} not found.`);
    }
    return existing;
  }

  async createScheduledMessage(
    input: Omit<ScheduledMessage, "id" | "sentMessageId" | "sentAt" | "canceledAt" | "error" | "createdAt" | "updatedAt">
  ): Promise<ScheduledMessage> {
    const now = new Date().toISOString();
    const created: ScheduledMessage = {
      id: randomUUID(),
      chatId: input.chatId,
      userId: input.userId,
      payload: input.payload,
      scheduledAt: input.scheduledAt,
      status: input.status,
      sentMessageId: null,
      sentAt: null,
      canceledAt: null,
      error: null,
      createdAt: now,
      updatedAt: now
    };
    this.scheduledMessages.set(created.id, created);
    return created;
  }

  async updateScheduledMessage(chatId: string, scheduledMessageId: string, patch: ScheduledMessagePatch): Promise<ScheduledMessage> {
    const existing = await this.getScheduledMessage(chatId, scheduledMessageId);
    const updated: ScheduledMessage = {
      ...existing,
      status: patch.status ?? existing.status,
      scheduledAt: patch.scheduledAt ?? existing.scheduledAt,
      sentMessageId: patch.sentMessageId !== undefined ? patch.sentMessageId : existing.sentMessageId,
      sentAt: patch.sentAt !== undefined ? patch.sentAt : existing.sentAt,
      canceledAt: patch.canceledAt !== undefined ? patch.canceledAt : existing.canceledAt,
      error: patch.error !== undefined ? patch.error : existing.error,
      updatedAt: new Date().toISOString()
    };
    this.scheduledMessages.set(scheduledMessageId, updated);
    return updated;
  }

  async addAuditLog(input: Omit<AuditLog, "id" | "createdAt">): Promise<AuditLog> {
    const audit: AuditLog = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.audits.set(audit.id, audit);
    return audit;
  }

  async listAudit(chatId: string): Promise<AuditLog[]> {
    return Array.from(this.audits.values())
      .filter((audit) => audit.chatId === chatId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async countAudit(chatId: string, options: CountAuditOptions = {}): Promise<number> {
    const since = options.since ?? null;
    let count = 0;
    for (const audit of this.audits.values()) {
      if (audit.chatId !== chatId) {
        continue;
      }
      if (options.action !== undefined && audit.action !== options.action) {
        continue;
      }
      if (options.targetType !== undefined && audit.targetType !== options.targetType) {
        continue;
      }
      if (options.targetId !== undefined && audit.targetId !== options.targetId) {
        continue;
      }
      if (since !== null && audit.createdAt < since) {
        continue;
      }
      count += 1;
    }
    return count;
  }

  async getChannelNotifyConfig(chatId: string): Promise<ChannelNotifyConfig> {
    const config = this.channelNotifyConfigs.get(chatId);
    if (!config) {
      throw new NotFoundException(`Channel notification config for chat ${chatId} not found.`);
    }
    return config;
  }

  async updateChannelNotifyConfig(chatId: string, updatedBy: string, patch: ChannelNotifyPatch): Promise<ChannelNotifyConfig> {
    const current = await this.getChannelNotifyConfig(chatId);
    const updated: ChannelNotifyConfig = {
      ...current,
      enabled: patch.enabled ?? current.enabled,
      mode: patch.mode ?? current.mode,
      template: patch.template ?? current.template,
      digestIntervalMinutes: patch.digestIntervalMinutes ?? current.digestIntervalMinutes,
      updatedBy,
      updatedAt: new Date().toISOString()
    };
    this.channelNotifyConfigs.set(chatId, updated);
    return updated;
  }

  async listSavedMessageViews(chatId: string, userId: string): Promise<SavedMessageView[]> {
    return Array.from(this.savedViews.values())
      .filter((view) => view.chatId === chatId && view.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createSavedMessageView(input: Omit<SavedMessageView, "id" | "createdAt" | "updatedAt">): Promise<SavedMessageView> {
    const now = new Date().toISOString();
    const view: SavedMessageView = {
      id: randomUUID(),
      chatId: input.chatId,
      userId: input.userId,
      name: input.name,
      filters: input.filters,
      createdAt: now,
      updatedAt: now
    };
    this.savedViews.set(view.id, view);
    return view;
  }

  async deleteSavedMessageView(chatId: string, userId: string, viewId: string): Promise<void> {
    const existing = this.savedViews.get(viewId);
    if (!existing || existing.chatId !== chatId || existing.userId !== userId) {
      throw new NotFoundException(`Saved view ${viewId} not found.`);
    }
    this.savedViews.delete(viewId);
  }

  async listKnowledgeArticles(chatId: string): Promise<KnowledgeArticle[]> {
    return Array.from(this.knowledgeArticles.values())
      .filter((article) => article.chatId === chatId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getKnowledgeArticle(chatId: string, articleId: string): Promise<KnowledgeArticle> {
    const article = this.knowledgeArticles.get(articleId);
    if (!article || article.chatId !== chatId) {
      throw new NotFoundException(`Knowledge article ${articleId} not found.`);
    }
    return article;
  }

  async createKnowledgeArticle(input: Omit<KnowledgeArticle, "id" | "createdAt" | "updatedAt">): Promise<KnowledgeArticle> {
    const now = new Date().toISOString();
    const article: KnowledgeArticle = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.knowledgeArticles.set(article.id, article);
    return article;
  }

  async updateKnowledgeArticle(chatId: string, articleId: string, patch: KnowledgeArticlePatch): Promise<KnowledgeArticle> {
    const current = await this.getKnowledgeArticle(chatId, articleId);
    const updated: KnowledgeArticle = {
      ...current,
      title: patch.title ?? current.title,
      content: patch.content ?? current.content,
      status: patch.status ?? current.status,
      category: patch.category !== undefined ? patch.category : current.category,
      tags: patch.tags ?? current.tags,
      version: patch.version ?? current.version,
      updatedBy: patch.updatedBy ?? current.updatedBy,
      publishedAt: patch.publishedAt !== undefined ? patch.publishedAt : current.publishedAt,
      archivedAt: patch.archivedAt !== undefined ? patch.archivedAt : current.archivedAt,
      updatedAt: new Date().toISOString()
    };
    this.knowledgeArticles.set(articleId, updated);
    return updated;
  }

  async listPolls(chatId: string): Promise<Poll[]> {
    return Array.from(this.polls.values())
      .filter((poll) => poll.chatId === chatId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getPoll(chatId: string, pollId: string): Promise<Poll> {
    const poll = this.polls.get(pollId);
    if (!poll || poll.chatId !== chatId) {
      throw new NotFoundException(`Poll ${pollId} not found.`);
    }
    return poll;
  }

  async createPoll(input: Omit<Poll, "id" | "createdAt" | "updatedAt">): Promise<Poll> {
    const now = new Date().toISOString();
    const poll: Poll = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.polls.set(poll.id, poll);
    return poll;
  }

  async updatePoll(chatId: string, pollId: string, patch: PollPatch): Promise<Poll> {
    const current = await this.getPoll(chatId, pollId);
    const updated: Poll = {
      ...current,
      question: patch.question ?? current.question,
      options: patch.options ?? current.options,
      allowMultiple: patch.allowMultiple ?? current.allowMultiple,
      isAnonymous: patch.isAnonymous ?? current.isAnonymous,
      isQuiz: patch.isQuiz ?? current.isQuiz,
      correctOptionIndexes: patch.correctOptionIndexes ?? current.correctOptionIndexes,
      allowedRoleIds: patch.allowedRoleIds ?? current.allowedRoleIds,
      closesAt: patch.closesAt !== undefined ? patch.closesAt : current.closesAt,
      status: patch.status ?? current.status,
      updatedAt: new Date().toISOString()
    };
    this.polls.set(pollId, updated);
    return updated;
  }

  async getPollVote(chatId: string, pollId: string, userId: string): Promise<PollVote | undefined> {
    return Array.from(this.pollVotes.values()).find(
      (vote) => vote.chatId === chatId && vote.pollId === pollId && vote.userId === userId
    );
  }

  async listPollVotes(chatId: string, pollId: string): Promise<PollVote[]> {
    return Array.from(this.pollVotes.values())
      .filter((vote) => vote.chatId === chatId && vote.pollId === pollId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createPollVote(input: Omit<PollVote, "id" | "createdAt" | "updatedAt">): Promise<PollVote> {
    const now = new Date().toISOString();
    const vote: PollVote = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.pollVotes.set(vote.id, vote);
    return vote;
  }

  async listReminders(chatId: string, userId: string): Promise<Reminder[]> {
    return Array.from(this.reminders.values())
      .filter((reminder) => reminder.chatId === chatId && reminder.userId === userId)
      .sort((a, b) => a.remindAt.localeCompare(b.remindAt));
  }

  async listPendingReminders(): Promise<Reminder[]> {
    return Array.from(this.reminders.values())
      .filter((reminder) => reminder.status === "scheduled")
      .sort((a, b) => a.remindAt.localeCompare(b.remindAt));
  }

  async getReminder(chatId: string, reminderId: string): Promise<Reminder> {
    const reminder = this.reminders.get(reminderId);
    if (!reminder || reminder.chatId !== chatId) {
      throw new NotFoundException(`Reminder ${reminderId} not found.`);
    }
    return reminder;
  }

  async createReminder(
    input: Omit<Reminder, "id" | "sentAt" | "canceledAt" | "error" | "createdAt" | "updatedAt">
  ): Promise<Reminder> {
    const now = new Date().toISOString();
    const reminder: Reminder = {
      ...input,
      id: randomUUID(),
      sentAt: null,
      canceledAt: null,
      error: null,
      createdAt: now,
      updatedAt: now
    };
    this.reminders.set(reminder.id, reminder);
    return reminder;
  }

  async updateReminder(chatId: string, reminderId: string, patch: ReminderPatch): Promise<Reminder> {
    const current = await this.getReminder(chatId, reminderId);
    const updated: Reminder = {
      ...current,
      reminderType: patch.reminderType ?? current.reminderType,
      targetRoleId: patch.targetRoleId !== undefined ? patch.targetRoleId : current.targetRoleId,
      note: patch.note !== undefined ? patch.note : current.note,
      remindAt: patch.remindAt ?? current.remindAt,
      telegramNotify: patch.telegramNotify ?? current.telegramNotify,
      status: patch.status ?? current.status,
      sentAt: patch.sentAt !== undefined ? patch.sentAt : current.sentAt,
      canceledAt: patch.canceledAt !== undefined ? patch.canceledAt : current.canceledAt,
      error: patch.error !== undefined ? patch.error : current.error,
      updatedAt: new Date().toISOString()
    };
    this.reminders.set(reminderId, updated);
    return updated;
  }

  async listBookmarks(chatId: string, userId: string): Promise<Bookmark[]> {
    return Array.from(this.bookmarks.values())
      .filter((bookmark) => bookmark.chatId === chatId && (bookmark.userId === userId || bookmark.isShared))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getBookmark(chatId: string, bookmarkId: string): Promise<Bookmark> {
    const bookmark = this.bookmarks.get(bookmarkId);
    if (!bookmark || bookmark.chatId !== chatId) {
      throw new NotFoundException(`Bookmark ${bookmarkId} not found.`);
    }
    return bookmark;
  }

  async createBookmark(input: Omit<Bookmark, "id" | "createdAt" | "updatedAt">): Promise<Bookmark> {
    const now = new Date().toISOString();
    const bookmark: Bookmark = {
      ...input,
      id: randomUUID(),
      collection: input.collection,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now
    };
    this.bookmarks.set(bookmark.id, bookmark);
    return bookmark;
  }

  async updateBookmark(chatId: string, bookmarkId: string, patch: BookmarkPatch): Promise<Bookmark> {
    const current = await this.getBookmark(chatId, bookmarkId);
    const updated: Bookmark = {
      ...current,
      collection: patch.collection !== undefined ? patch.collection : current.collection,
      tags: patch.tags ?? current.tags,
      note: patch.note !== undefined ? patch.note : current.note,
      isShared: patch.isShared ?? current.isShared,
      updatedAt: new Date().toISOString()
    };
    this.bookmarks.set(bookmarkId, updated);
    return updated;
  }

  async deleteBookmark(chatId: string, bookmarkId: string): Promise<void> {
    await this.getBookmark(chatId, bookmarkId);
    this.bookmarks.delete(bookmarkId);
  }

  async listMemberTags(chatId: string, userId: string): Promise<MemberTag[]> {
    return Array.from(this.memberTags.values())
      .filter((entry) => entry.chatId === chatId && entry.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listMemberTagsForChat(chatId: string): Promise<MemberTag[]> {
    return Array.from(this.memberTags.values())
      .filter((entry) => entry.chatId === chatId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getMemberTagByKey(chatId: string, userId: string, tag: string): Promise<MemberTag | undefined> {
    return Array.from(this.memberTags.values()).find(
      (entry) => entry.chatId === chatId && entry.userId === userId && entry.tag === tag
    );
  }

  async createMemberTag(input: Omit<MemberTag, "id" | "createdAt" | "updatedAt">): Promise<MemberTag> {
    const now = new Date().toISOString();
    const created: MemberTag = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.memberTags.set(created.id, created);
    return created;
  }

  async listMemberProfileFields(chatId: string, userId: string): Promise<MemberProfileField[]> {
    return Array.from(this.memberProfileFields.values())
      .filter((entry) => entry.chatId === chatId && entry.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getMemberProfileFieldByKey(
    chatId: string,
    userId: string,
    key: string
  ): Promise<MemberProfileField | undefined> {
    return Array.from(this.memberProfileFields.values()).find(
      (entry) => entry.chatId === chatId && entry.userId === userId && entry.key === key
    );
  }

  async upsertMemberProfileField(
    input: Omit<MemberProfileField, "id" | "createdAt" | "updatedAt">
  ): Promise<MemberProfileField> {
    const now = new Date().toISOString();
    const existing = await this.getMemberProfileFieldByKey(input.chatId, input.userId, input.key);
    if (existing) {
      const updated: MemberProfileField = {
        ...existing,
        value: input.value,
        updatedBy: input.updatedBy,
        updatedAt: now
      };
      this.memberProfileFields.set(existing.id, updated);
      return updated;
    }

    const created: MemberProfileField = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.memberProfileFields.set(created.id, created);
    return created;
  }

  async deleteMemberProfileField(chatId: string, userId: string, key: string): Promise<void> {
    const existing = await this.getMemberProfileFieldByKey(chatId, userId, key);
    if (!existing) {
      return;
    }
    this.memberProfileFields.delete(existing.id);
  }

  async listKeywordAlerts(chatId: string, userId: string): Promise<KeywordAlert[]> {
    return Array.from(this.keywordAlerts.values())
      .filter((alert) => alert.chatId === chatId && alert.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listActiveKeywordAlertsForChat(chatId: string): Promise<KeywordAlert[]> {
    return Array.from(this.keywordAlerts.values())
      .filter((alert) => alert.chatId === chatId && alert.isActive)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getKeywordAlert(chatId: string, alertId: string): Promise<KeywordAlert> {
    const alert = this.keywordAlerts.get(alertId);
    if (!alert || alert.chatId !== chatId) {
      throw new NotFoundException(`Keyword alert ${alertId} not found.`);
    }
    return alert;
  }

  async createKeywordAlert(input: Omit<KeywordAlert, "id" | "lastTriggeredAt" | "createdAt" | "updatedAt">): Promise<KeywordAlert> {
    const now = new Date().toISOString();
    const alert: KeywordAlert = {
      ...input,
      id: randomUUID(),
      lastTriggeredAt: null,
      createdAt: now,
      updatedAt: now
    };
    this.keywordAlerts.set(alert.id, alert);
    return alert;
  }

  async updateKeywordAlert(chatId: string, alertId: string, patch: KeywordAlertPatch): Promise<KeywordAlert> {
    const current = await this.getKeywordAlert(chatId, alertId);
    const updated: KeywordAlert = {
      ...current,
      keyword: patch.keyword ?? current.keyword,
      normalizedKeyword: patch.normalizedKeyword ?? current.normalizedKeyword,
      isRegex: patch.isRegex ?? current.isRegex,
      caseSensitive: patch.caseSensitive ?? current.caseSensitive,
      dedupWindowSeconds: patch.dedupWindowSeconds ?? current.dedupWindowSeconds,
      isActive: patch.isActive ?? current.isActive,
      lastTriggeredAt: patch.lastTriggeredAt !== undefined ? patch.lastTriggeredAt : current.lastTriggeredAt,
      updatedAt: new Date().toISOString()
    };
    this.keywordAlerts.set(alertId, updated);
    return updated;
  }

  async deleteKeywordAlert(chatId: string, alertId: string): Promise<void> {
    await this.getKeywordAlert(chatId, alertId);
    this.keywordAlerts.delete(alertId);
  }

  async listThreadSubscriptions(chatId: string, userId: string): Promise<ThreadSubscription[]> {
    return Array.from(this.threadSubscriptions.values())
      .filter((subscription) => subscription.chatId === chatId && subscription.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listActiveThreadSubscriptionsForChat(chatId: string): Promise<ThreadSubscription[]> {
    return Array.from(this.threadSubscriptions.values())
      .filter((subscription) => subscription.chatId === chatId && subscription.isActive)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getThreadSubscription(chatId: string, subscriptionId: string): Promise<ThreadSubscription> {
    const subscription = this.threadSubscriptions.get(subscriptionId);
    if (!subscription || subscription.chatId !== chatId) {
      throw new NotFoundException(`Thread subscription ${subscriptionId} not found.`);
    }
    return subscription;
  }

  async getThreadSubscriptionByKey(
    chatId: string,
    userId: string,
    messageId: string,
    subscriptionType: ThreadSubscriptionType
  ): Promise<ThreadSubscription | undefined> {
    return Array.from(this.threadSubscriptions.values()).find(
      (subscription) =>
        subscription.chatId === chatId &&
        subscription.userId === userId &&
        subscription.messageId === messageId &&
        subscription.subscriptionType === subscriptionType
    );
  }

  async createThreadSubscription(
    input: Omit<ThreadSubscription, "id" | "lastTriggeredAt" | "createdAt" | "updatedAt">
  ): Promise<ThreadSubscription> {
    const now = new Date().toISOString();
    const subscription: ThreadSubscription = {
      ...input,
      id: randomUUID(),
      lastTriggeredAt: null,
      createdAt: now,
      updatedAt: now
    };
    this.threadSubscriptions.set(subscription.id, subscription);
    return subscription;
  }

  async updateThreadSubscription(
    chatId: string,
    subscriptionId: string,
    patch: ThreadSubscriptionPatch
  ): Promise<ThreadSubscription> {
    const current = await this.getThreadSubscription(chatId, subscriptionId);
    const updated: ThreadSubscription = {
      ...current,
      subscriptionType: patch.subscriptionType ?? current.subscriptionType,
      telegramNotify: patch.telegramNotify ?? current.telegramNotify,
      dedupWindowSeconds: patch.dedupWindowSeconds ?? current.dedupWindowSeconds,
      isActive: patch.isActive ?? current.isActive,
      lastTriggeredAt: patch.lastTriggeredAt !== undefined ? patch.lastTriggeredAt : current.lastTriggeredAt,
      updatedAt: new Date().toISOString()
    };
    this.threadSubscriptions.set(subscriptionId, updated);
    return updated;
  }

  async deleteThreadSubscription(chatId: string, subscriptionId: string): Promise<void> {
    await this.getThreadSubscription(chatId, subscriptionId);
    this.threadSubscriptions.delete(subscriptionId);
  }

  async listReadReceipts(chatId: string, messageId: string): Promise<ReadReceipt[]> {
    await this.getMessage(chatId, messageId);
    return Array.from(this.readReceipts.values())
      .filter((receipt) => receipt.chatId === chatId && receipt.messageId === messageId)
      .sort((a, b) => a.readAt.localeCompare(b.readAt));
  }

  async getReadReceipt(chatId: string, messageId: string, userId: string): Promise<ReadReceipt | undefined> {
    return Array.from(this.readReceipts.values()).find(
      (receipt) => receipt.chatId === chatId && receipt.messageId === messageId && receipt.userId === userId
    );
  }

  async upsertReadReceipt(chatId: string, messageId: string, userId: string, readAt: string): Promise<ReadReceipt> {
    await this.getMessage(chatId, messageId);
    const existing = await this.getReadReceipt(chatId, messageId, userId);
    const now = new Date().toISOString();
    if (existing) {
      const updated: ReadReceipt = {
        ...existing,
        readAt,
        updatedAt: now
      };
      this.readReceipts.set(existing.id, updated);
      return updated;
    }

    const created: ReadReceipt = {
      id: randomUUID(),
      chatId,
      messageId,
      userId,
      readAt,
      createdAt: now,
      updatedAt: now
    };
    this.readReceipts.set(created.id, created);
    return created;
  }

  async getReadReceiptPreference(chatId: string, userId: string): Promise<ReadReceiptPreference | undefined> {
    return this.readReceiptPreferences.get(`${chatId}:${userId}`);
  }

  async upsertReadReceiptPreference(chatId: string, userId: string, mode: ReadReceiptMode): Promise<ReadReceiptPreference> {
    const updated: ReadReceiptPreference = {
      chatId,
      userId,
      mode,
      updatedAt: new Date().toISOString()
    };
    this.readReceiptPreferences.set(`${chatId}:${userId}`, updated);
    return updated;
  }

  async getReadReceiptPolicy(chatId: string): Promise<ReadReceiptPolicy> {
    await this.getChat(chatId);
    return this.ensureReadReceiptPolicy(chatId);
  }

  async upsertReadReceiptPolicy(chatId: string, patch: ReadReceiptPolicyPatch): Promise<ReadReceiptPolicy> {
    const current = await this.getReadReceiptPolicy(chatId);
    const updated: ReadReceiptPolicy = {
      chatId,
      allowCrossRoleView: patch.allowCrossRoleView ?? current.allowCrossRoleView,
      updatedBy: patch.updatedBy ?? current.updatedBy,
      updatedAt: new Date().toISOString()
    };
    this.readReceiptPolicies.set(chatId, updated);
    return updated;
  }

  async upsertE2EDevice(input: Omit<E2EDevice, "id" | "isActive" | "createdAt" | "updatedAt">): Promise<E2EDevice> {
    await this.getChat(input.chatId);
    await this.ensureMember(input.chatId, input.userId);

    const existing = Array.from(this.e2eDevices.values()).find(
      (device) => device.chatId === input.chatId && device.userId === input.userId && device.deviceId === input.deviceId
    );
    const now = new Date().toISOString();
    if (existing) {
      const updated: E2EDevice = {
        ...existing,
        algorithm: input.algorithm,
        identityKey: input.identityKey,
        signedPreKey: input.signedPreKey,
        oneTimePreKeys: input.oneTimePreKeys,
        fallbackKey: input.fallbackKey ?? null,
        isActive: true,
        lastPreKeyRotationAt: input.lastPreKeyRotationAt ?? existing.lastPreKeyRotationAt ?? now,
        updatedAt: now
      };
      this.e2eDevices.set(existing.id, updated);
      return updated;
    }

    const created: E2EDevice = {
      id: randomUUID(),
      chatId: input.chatId,
      userId: input.userId,
      deviceId: input.deviceId,
      algorithm: input.algorithm,
      identityKey: input.identityKey,
      signedPreKey: input.signedPreKey,
      oneTimePreKeys: input.oneTimePreKeys,
      fallbackKey: input.fallbackKey ?? null,
      isActive: true,
      lastPreKeyRotationAt: input.lastPreKeyRotationAt ?? now,
      createdAt: now,
      updatedAt: now
    };
    this.e2eDevices.set(created.id, created);
    return created;
  }

  async listE2EDevices(chatId: string, userIds?: string[]): Promise<E2EDevice[]> {
    await this.getChat(chatId);
    const userIdFilter = userIds && userIds.length > 0 ? new Set(userIds) : null;
    return Array.from(this.e2eDevices.values())
      .filter((device) => device.chatId === chatId && device.isActive)
      .filter((device) => (userIdFilter ? userIdFilter.has(device.userId) : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listE2EDevicesForUser(chatId: string, userId: string): Promise<E2EDevice[]> {
    return (await this.listE2EDevices(chatId, [userId])).filter((device) => device.userId === userId);
  }

  async deactivateE2EDevice(chatId: string, userId: string, deviceId: string): Promise<E2EDevice> {
    await this.getChat(chatId);
    const existing = Array.from(this.e2eDevices.values()).find(
      (device) => device.chatId === chatId && device.userId === userId && device.deviceId === deviceId
    );
    if (!existing) {
      throw new NotFoundException(`E2E device ${deviceId} not found.`);
    }
    const updated: E2EDevice = {
      ...existing,
      isActive: false,
      updatedAt: new Date().toISOString()
    };
    this.e2eDevices.set(existing.id, updated);
    return updated;
  }

  async listTickets(chatId: string): Promise<Ticket[]> {
    return Array.from(this.tickets.values())
      .filter((ticket) => ticket.chatId === chatId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listTicketsPendingSlaBreach(nowIso: string): Promise<Ticket[]> {
    return Array.from(this.tickets.values())
      .filter((ticket) => {
        if (ticket.status === "resolved" || ticket.status === "closed") {
          return false;
        }
        if (!ticket.slaDueAt) {
          return false;
        }
        if (ticket.slaBreachedAt) {
          return false;
        }
        return ticket.slaDueAt <= nowIso;
      })
      .sort((a, b) => (a.slaDueAt ?? "").localeCompare(b.slaDueAt ?? ""));
  }

  async getTicket(chatId: string, ticketId: string): Promise<Ticket> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket || ticket.chatId !== chatId) {
      throw new NotFoundException(`Ticket ${ticketId} not found.`);
    }
    return ticket;
  }

  async createTicket(input: Omit<Ticket, "id" | "createdAt" | "updatedAt">): Promise<Ticket> {
    const now = new Date().toISOString();
    const ticket: Ticket = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  async updateTicket(chatId: string, ticketId: string, patch: TicketPatch): Promise<Ticket> {
    const current = await this.getTicket(chatId, ticketId);
    const updated: Ticket = {
      ...current,
      status: patch.status ?? current.status,
      priority: patch.priority ?? current.priority,
      assigneeId: patch.assigneeId !== undefined ? patch.assigneeId : current.assigneeId,
      slaDueAt: patch.slaDueAt !== undefined ? patch.slaDueAt : current.slaDueAt,
      slaBreachedAt: patch.slaBreachedAt !== undefined ? patch.slaBreachedAt : current.slaBreachedAt,
      labels: patch.labels ?? current.labels,
      updatedAt: new Date().toISOString()
    };
    this.tickets.set(ticketId, updated);
    return updated;
  }

  async listAutomationRules(chatId: string): Promise<AutomationRule[]> {
    return Array.from(this.automationRules.values())
      .filter((rule) => rule.chatId === chatId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getAutomationRule(chatId: string, ruleId: string): Promise<AutomationRule> {
    const rule = this.automationRules.get(ruleId);
    if (!rule || rule.chatId !== chatId) {
      throw new NotFoundException(`Automation rule ${ruleId} not found.`);
    }
    return rule;
  }

  async createAutomationRule(input: Omit<AutomationRule, "id" | "createdAt" | "updatedAt">): Promise<AutomationRule> {
    const now = new Date().toISOString();
    const rule: AutomationRule = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.automationRules.set(rule.id, rule);
    return rule;
  }

  async updateAutomationRule(chatId: string, ruleId: string, patch: AutomationRulePatch): Promise<AutomationRule> {
    const current = await this.getAutomationRule(chatId, ruleId);
    const updated: AutomationRule = {
      ...current,
      name: patch.name ?? current.name,
      triggerType: patch.triggerType ?? current.triggerType,
      conditions: patch.conditions ?? current.conditions,
      actions: patch.actions ?? current.actions,
      isEnabled: patch.isEnabled ?? current.isEnabled,
      updatedBy: patch.updatedBy ?? current.updatedBy,
      updatedAt: new Date().toISOString()
    };
    this.automationRules.set(ruleId, updated);
    return updated;
  }

  async listAutomationExecutions(chatId: string, ruleId: string, limit: number): Promise<AutomationExecution[]> {
    return Array.from(this.automationExecutions.values())
      .filter((execution) => execution.chatId === chatId && execution.ruleId === ruleId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async createAutomationExecution(input: Omit<AutomationExecution, "id" | "createdAt">): Promise<AutomationExecution> {
    const execution: AutomationExecution = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.automationExecutions.set(execution.id, execution);
    return execution;
  }

  async createTempRoom(input: Omit<TempRoom, "id" | "createdAt" | "updatedAt">): Promise<TempRoom> {
    const now = new Date().toISOString();
    const room: TempRoom = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.tempRooms.set(room.id, room);
    return room;
  }

  async getTempRoom(chatId: string, tempRoomId: string): Promise<TempRoom> {
    const room = this.tempRooms.get(tempRoomId);
    if (!room || room.chatId !== chatId) {
      throw new NotFoundException(`Temp room ${tempRoomId} not found.`);
    }
    return room;
  }

  async updateTempRoom(chatId: string, tempRoomId: string, patch: TempRoomPatch): Promise<TempRoom> {
    const current = await this.getTempRoom(chatId, tempRoomId);
    const updated: TempRoom = {
      ...current,
      status: patch.status ?? current.status,
      archivedAt: patch.archivedAt !== undefined ? patch.archivedAt : current.archivedAt,
      updatedAt: new Date().toISOString()
    };
    this.tempRooms.set(tempRoomId, updated);
    return updated;
  }

  async listDueTempRoomsForAutoArchive(nowIso: string): Promise<TempRoom[]> {
    return Array.from(this.tempRooms.values())
      .filter((room) => room.status === "active" && room.endsAt !== null && room.endsAt !== undefined && room.endsAt <= nowIso)
      .sort((a, b) => (a.endsAt ?? "").localeCompare(b.endsAt ?? ""));
  }

  async createReputationEvent(input: Omit<ReputationEvent, "id" | "createdAt">): Promise<ReputationEvent> {
    const entry: ReputationEvent = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.reputationEvents.set(entry.id, entry);
    return entry;
  }

  async getReputationScore(chatId: string, userId: string): Promise<number> {
    return Array.from(this.reputationEvents.values())
      .filter((entry) => entry.chatId === chatId && entry.userId === userId)
      .reduce((total, entry) => total + entry.delta, 0);
  }

  async getActiveIncidentMode(chatId: string): Promise<IncidentModeLog | undefined> {
    const active = Array.from(this.incidentModeLogs.values())
      .filter((entry) => entry.chatId === chatId && !entry.disabledAt)
      .sort((a, b) => b.enabledAt.localeCompare(a.enabledAt));
    return active[0];
  }

  async listActiveIncidentModes(): Promise<IncidentModeLog[]> {
    return Array.from(this.incidentModeLogs.values())
      .filter((entry) => !entry.disabledAt)
      .sort((a, b) => a.enabledAt.localeCompare(b.enabledAt));
  }

  async createIncidentModeLog(input: Omit<IncidentModeLog, "id">): Promise<IncidentModeLog> {
    const log: IncidentModeLog = {
      ...input,
      id: randomUUID()
    };
    this.incidentModeLogs.set(log.id, log);
    return log;
  }

  async closeIncidentMode(chatId: string, disabledAt: string): Promise<IncidentModeLog> {
    const active = await this.getActiveIncidentMode(chatId);
    if (!active) {
      throw new NotFoundException(`Active incident mode for chat ${chatId} not found.`);
    }
    const updated: IncidentModeLog = {
      ...active,
      disabledAt
    };
    this.incidentModeLogs.set(updated.id, updated);
    return updated;
  }

  async listIntegrationWebhooks(chatId: string): Promise<IntegrationWebhook[]> {
    return Array.from(this.webhooks.values())
      .filter((webhook) => webhook.chatId === chatId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getIntegrationWebhook(chatId: string, webhookId: string): Promise<IntegrationWebhook> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook || webhook.chatId !== chatId) {
      throw new NotFoundException(`Integration webhook ${webhookId} not found.`);
    }
    return webhook;
  }

  async createIntegrationWebhook(
    input: Omit<IntegrationWebhook, "id" | "lastDeliveredAt" | "lastError" | "createdAt" | "updatedAt">
  ): Promise<IntegrationWebhook> {
    const now = new Date().toISOString();
    const webhook: IntegrationWebhook = {
      ...input,
      id: randomUUID(),
      lastDeliveredAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now
    };
    this.webhooks.set(webhook.id, webhook);
    return webhook;
  }

  async updateIntegrationWebhook(chatId: string, webhookId: string, patch: IntegrationWebhookPatch): Promise<IntegrationWebhook> {
    const current = await this.getIntegrationWebhook(chatId, webhookId);
    const updated: IntegrationWebhook = {
      ...current,
      name: patch.name ?? current.name,
      url: patch.url ?? current.url,
      events: patch.events ?? current.events,
      enabled: patch.enabled ?? current.enabled,
      secret: patch.secret ?? current.secret,
      updatedBy: patch.updatedBy ?? current.updatedBy,
      lastDeliveredAt: patch.lastDeliveredAt !== undefined ? patch.lastDeliveredAt : current.lastDeliveredAt,
      lastError: patch.lastError !== undefined ? patch.lastError : current.lastError,
      updatedAt: new Date().toISOString()
    };
    this.webhooks.set(webhookId, updated);
    return updated;
  }

  async listBroadcastCampaigns(chatId: string): Promise<BroadcastCampaign[]> {
    return Array.from(this.broadcasts.values())
      .filter((campaign) => campaign.chatId === chatId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getBroadcastCampaign(chatId: string, campaignId: string): Promise<BroadcastCampaign> {
    const campaign = this.broadcasts.get(campaignId);
    if (!campaign || campaign.chatId !== chatId) {
      throw new NotFoundException(`Broadcast campaign ${campaignId} not found.`);
    }
    return campaign;
  }

  async createBroadcastCampaign(
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
  ): Promise<BroadcastCampaign> {
    const now = new Date().toISOString();
    const campaign: BroadcastCampaign = {
      ...input,
      id: randomUUID(),
      approvedBy: null,
      approvedAt: null,
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      canceledAt: null,
      pausedAt: null,
      targetCount: 0,
      sentCount: 0,
      failedCount: 0,
      lastRunAt: null,
      createdAt: now,
      updatedAt: now
    };
    this.broadcasts.set(campaign.id, campaign);
    return campaign;
  }

  async updateBroadcastCampaign(chatId: string, campaignId: string, patch: BroadcastCampaignPatch): Promise<BroadcastCampaign> {
    const current = await this.getBroadcastCampaign(chatId, campaignId);
    const updated: BroadcastCampaign = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    this.broadcasts.set(campaignId, updated);
    return updated;
  }

  private seed(): void {
    const now = new Date().toISOString();
    const chatId = "main";
    const ownerRoleId = randomUUID();
    const adminRoleId = randomUUID();
    const memberRoleId = randomUUID();
    const legitRoleId = randomUUID();
    const readonlyRoleId = randomUUID();

    this.roles.set(ownerRoleId, {
      id: ownerRoleId,
      chatId,
      name: "owner",
      priority: 1000,
      isSystem: true,
      isDefault: false,
      permissions: BASE_OWNER_PERMISSIONS,
      createdAt: now
    });
    this.roleLimits.set(ownerRoleId, createDefaultRoleLimits(chatId, ownerRoleId, now));
    this.roles.set(adminRoleId, {
      id: adminRoleId,
      chatId,
      name: "admin",
      priority: 900,
      isSystem: true,
      isDefault: false,
      permissions: BASE_ADMIN_PERMISSIONS,
      createdAt: now
    });
    this.roleLimits.set(adminRoleId, createDefaultRoleLimits(chatId, adminRoleId, now));
    this.roles.set(memberRoleId, {
      id: memberRoleId,
      chatId,
      name: "member",
      priority: 100,
      isSystem: true,
      isDefault: true,
      permissions: BASE_MEMBER_PERMISSIONS,
      createdAt: now
    });
    this.roleLimits.set(memberRoleId, createDefaultRoleLimits(chatId, memberRoleId, now));
    this.roles.set(legitRoleId, {
      id: legitRoleId,
      chatId,
      name: "legit",
      priority: 120,
      isSystem: true,
      isDefault: false,
      permissions: BASE_LEGIT_PERMISSIONS,
      createdAt: now
    });
    const legitLimits = createDefaultRoleLimits(chatId, legitRoleId, now);
    this.roleLimits.set(legitRoleId, {
      ...legitLimits,
      messagesPerDay: 3,
      exceedAction: "reject"
    });
    this.roles.set(readonlyRoleId, {
      id: readonlyRoleId,
      chatId,
      name: "readonly",
      priority: 10,
      isSystem: true,
      isDefault: false,
      permissions: ["chat.view", "chat.join", "chat.leave"],
      createdAt: now
    });
    this.roleLimits.set(readonlyRoleId, createDefaultRoleLimits(chatId, readonlyRoleId, now));

    this.chats.set(chatId, {
      id: chatId,
      name: "Ristoranti Chat",
      mode: "chat_mode",
      defaultRoleId: memberRoleId,
      createdAt: now
    });

    const identityId = randomUUID();
    this.identities.set(identityId, {
      id: identityId,
      chatId,
      name: "Ristoranti Chat Team",
      type: "group",
      isActive: true,
      createdBy: "system",
      createdAt: now
    });

    this.channelNotifyConfigs.set(chatId, {
      chatId,
      enabled: false,
      mode: "off",
      template: "{author_name} posted a new message.\nTap the button below to view.",
      digestIntervalMinutes: 15,
      updatedBy: "system",
      updatedAt: now
    });
  }

  private ensureRoleLimits(chatId: string, roleId: string): RoleLimits {
    const existing = this.roleLimits.get(roleId);
    if (existing && existing.chatId === chatId) {
      return existing;
    }
    const created = createDefaultRoleLimits(chatId, roleId);
    this.roleLimits.set(roleId, created);
    return created;
  }

  private ensureReadReceiptPolicy(chatId: string): ReadReceiptPolicy {
    const existing = this.readReceiptPolicies.get(chatId);
    if (existing) {
      return existing;
    }
    const created: ReadReceiptPolicy = {
      chatId,
      allowCrossRoleView: true,
      updatedBy: "system",
      updatedAt: new Date().toISOString()
    };
    this.readReceiptPolicies.set(chatId, created);
    return created;
  }
}
