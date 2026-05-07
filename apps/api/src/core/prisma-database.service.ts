import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AutomationExecutionStatus as PrismaAutomationExecutionStatus,
  AutomationTriggerType as PrismaAutomationTriggerType,
  BroadcastStatus as PrismaBroadcastStatus,
  BroadcastType as PrismaBroadcastType,
  ChannelNotifyMode,
  JoinApprovalMode as PrismaJoinApprovalMode,
  JoinRequestStatus as PrismaJoinRequestStatus,
  KnowledgeArticleStatus as PrismaKnowledgeArticleStatus,
  PollStatus as PrismaPollStatus,
  ReadReceiptMode as PrismaReadReceiptMode,
  ReminderStatus as PrismaReminderStatus,
  ReminderType as PrismaReminderType,
  ThreadSubscriptionType as PrismaThreadSubscriptionType,
  TempRoomStatus as PrismaTempRoomStatus,
  TicketPriority as PrismaTicketPriority,
  TicketStatus as PrismaTicketStatus,
  LimitExceedAction as PrismaLimitExceedAction,
  MemberStatus as PrismaMemberStatus,
  ScheduledMessageStatus as PrismaScheduledMessageStatus,
  Prisma
} from "@prisma/client";

import type {
  AutomationRulePatch,
  BookmarkPatch,
  BroadcastCampaignPatch,
  ChannelNotifyPatch,
  CountAuditOptions,
  DatabaseService,
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
import { BASE_ADMIN_PERMISSIONS, BASE_LEGIT_PERMISSIONS, BASE_MEMBER_PERMISSIONS, BASE_OWNER_PERMISSIONS } from "./permissions.js";
import { PrismaService } from "./prisma/prisma.service.js";
import type {
  AutomationRule,
  AutomationExecution,
  AuditLog,
  Bookmark,
  BroadcastCampaign,
  BroadcastContent,
  BroadcastSchedule,
  BroadcastAudience,
  ChannelNotifyConfig,
  Chat,
  ChatIdentity,
  ChatMember,
  KeywordAlert,
  IntegrationWebhook,
  IncidentModeLog,
  Invite,
  KnowledgeArticle,
  JoinRequest,
  JoinApprovalMode,
  JoinRequestStatus,
  JoinPolicy,
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
  ScheduledMessagePayload,
  TempRoom,
  Ticket,
  ThreadSubscription,
  ThreadSubscriptionType,
  User
} from "./types.js";

const MAIN_CHAT_ID = "main";
const MAIN_OWNER_ROLE_ID = "role_main_owner";
const MAIN_ADMIN_ROLE_ID = "role_main_admin";
const MAIN_MEMBER_ROLE_ID = "role_main_member";
const MAIN_LEGIT_ROLE_ID = "role_main_legit";
const MAIN_READONLY_ROLE_ID = "role_main_readonly";
const MAIN_IDENTITY_ID = "identity_main_group";

type RoleLimitsWritePatch = {
  slowmodeSeconds?: number;
  messagesPerDay?: number | null;
  messagesPerHour?: number | null;
  mediaPerDay?: number | null;
  linksPerDay?: number | null;
  mentionsPerDay?: number | null;
  burstCount?: number | null;
  burstWindowSeconds?: number | null;
  exceedAction?: PrismaLimitExceedAction;
  exceedMuteSeconds?: number | null;
};

@Injectable()
export class PrismaDatabaseService implements DatabaseService {
  private seedReady?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  async upsertTelegramUser(input: { telegramId: number; username?: string; firstName?: string; lastName?: string }): Promise<User> {
    await this.ensureSeeded();
    const saved = await this.prisma.user.upsert({
      where: { telegramId: BigInt(input.telegramId) },
      create: {
        telegramId: BigInt(input.telegramId),
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName
      },
      update: {
        username: input.username ?? undefined,
        firstName: input.firstName ?? undefined,
        lastName: input.lastName ?? undefined
      }
    });
    return this.mapUser(saved);
  }

  async getUserById(userId: string): Promise<User | undefined> {
    await this.ensureSeeded();
    const saved = await this.prisma.user.findUnique({ where: { id: userId } });
    return saved ? this.mapUser(saved) : undefined;
  }

  async listChatsForUser(userId: string): Promise<Chat[]> {
    await this.ensureSeeded();
    const memberships = await this.prisma.chatMember.findMany({
      where: {
        userId,
        status: { not: PrismaMemberStatus.banned }
      },
      include: {
        chat: true
      }
    });
    return memberships.map((item) => this.mapChat(item.chat));
  }

  async getChat(chatId: string): Promise<Chat> {
    await this.ensureSeeded();
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found.`);
    }
    return this.mapChat(chat);
  }

  async listRoles(chatId: string): Promise<Role[]> {
    await this.ensureSeeded();
    const roles = await this.prisma.role.findMany({
      where: { chatId },
      orderBy: { priority: "desc" }
    });
    return roles.map((role) => this.mapRole(role));
  }

  async getRole(chatId: string, roleId: string): Promise<Role> {
    await this.ensureSeeded();
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.chatId !== chatId) {
      throw new NotFoundException(`Role ${roleId} not found in chat ${chatId}.`);
    }
    return this.mapRole(role);
  }

  async createRole(input: {
    chatId: string;
    name: string;
    priority: number;
    permissions: string[];
    isDefault?: boolean;
  }): Promise<Role> {
    await this.ensureSeeded();
    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          chatId: input.chatId,
          name: input.name,
          priority: input.priority,
          isSystem: false,
          isDefault: Boolean(input.isDefault),
          permissions: Array.from(new Set(input.permissions))
        }
      });

      if (created.isDefault) {
        await tx.role.updateMany({
          where: {
            chatId: input.chatId,
            id: { not: created.id }
          },
          data: { isDefault: false }
        });
        await tx.chat.update({
          where: { id: input.chatId },
          data: { defaultRoleId: created.id }
        });
      }

      await tx.roleLimit.create({
        data: {
          roleId: created.id,
          chatId: input.chatId
        }
      });

      return created;
    });

    return this.mapRole(role);
  }

  async updateRole(chatId: string, roleId: string, patch: RolePatch): Promise<Role> {
    await this.ensureSeeded();
    const current = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!current || current.chatId !== chatId) {
      throw new NotFoundException(`Role ${roleId} not found in chat ${chatId}.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.update({
        where: { id: roleId },
        data: {
          name: patch.name ?? undefined,
          priority: patch.priority ?? undefined,
          permissions: patch.permissions ? Array.from(new Set(patch.permissions)) : undefined,
          isDefault: patch.isDefault ?? undefined
        }
      });

      if (role.isDefault) {
        await tx.role.updateMany({
          where: {
            chatId,
            id: { not: roleId }
          },
          data: { isDefault: false }
        });
        await tx.chat.update({
          where: { id: chatId },
          data: { defaultRoleId: roleId }
        });
      }

      return role;
    });

    return this.mapRole(updated);
  }

  async listRoleLimits(chatId: string): Promise<RoleLimits[]> {
    await this.ensureSeeded();
    const roles = await this.prisma.role.findMany({
      where: { chatId },
      orderBy: { priority: "desc" },
      select: { id: true }
    });

    const limits: RoleLimits[] = [];
    for (const role of roles) {
      limits.push(await this.ensureRoleLimits(chatId, role.id));
    }
    return limits;
  }

  async getRoleLimits(chatId: string, roleId: string): Promise<RoleLimits> {
    await this.ensureSeeded();
    return this.ensureRoleLimits(chatId, roleId);
  }

  async upsertRoleLimits(chatId: string, roleId: string, patch: RoleLimitsPatch): Promise<RoleLimits> {
    await this.ensureSeeded();
    await this.getRole(chatId, roleId);

    const entry = await this.prisma.roleLimit.upsert({
      where: { roleId },
      create: {
        ...this.mapRoleLimitsWritePatch(patch),
        roleId,
        chatId
      },
      update: this.mapRoleLimitsWritePatch(patch)
    });

    return this.mapRoleLimits(entry);
  }

  async getMember(chatId: string, userId: string): Promise<ChatMember | undefined> {
    await this.ensureSeeded();
    const member = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId
        }
      }
    });
    return member ? this.mapMember(member) : undefined;
  }

  async listMembers(chatId: string): Promise<ChatMember[]> {
    await this.ensureSeeded();
    const members = await this.prisma.chatMember.findMany({
      where: { chatId },
      orderBy: { joinedAt: "asc" }
    });
    return members.map((member) => this.mapMember(member));
  }

  async ensureMember(chatId: string, userId: string): Promise<ChatMember> {
    await this.ensureSeeded();
    const chat = await this.getChat(chatId);
    const member = await this.prisma.chatMember.upsert({
      where: {
        chatId_userId: {
          chatId,
          userId
        }
      },
      update: {},
      create: {
        chatId,
        userId,
        roleId: chat.defaultRoleId,
        status: PrismaMemberStatus.active
      }
    });
    return this.mapMember(member);
  }

  async updateMemberStatus(chatId: string, userId: string, status: MemberStatus, mutedUntil?: string | null): Promise<ChatMember> {
    await this.ensureSeeded();
    const existing = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId
        }
      }
    });
    if (!existing) {
      throw new NotFoundException(`Member ${userId} is not in chat ${chatId}.`);
    }

    const updated = await this.prisma.chatMember.update({
      where: {
        chatId_userId: {
          chatId,
          userId
        }
      },
      data: {
        status: status as PrismaMemberStatus,
        mutedUntil: mutedUntil === undefined ? undefined : mutedUntil ? new Date(mutedUntil) : null
      }
    });
    return this.mapMember(updated);
  }

  async updateMemberRole(chatId: string, userId: string, roleId: string): Promise<ChatMember> {
    await this.ensureSeeded();
    await this.getRole(chatId, roleId);

    const existing = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId
        }
      }
    });
    if (!existing) {
      throw new NotFoundException(`Member ${userId} is not in chat ${chatId}.`);
    }

    const updated = await this.prisma.chatMember.update({
      where: {
        chatId_userId: {
          chatId,
          userId
        }
      },
      data: {
        roleId
      }
    });
    return this.mapMember(updated);
  }

  async listInvites(chatId: string): Promise<Invite[]> {
    await this.ensureSeeded();
    const invites = await this.prisma.invite.findMany({
      where: { chatId },
      orderBy: { createdAt: "desc" }
    });
    return invites.map((invite) => this.mapInvite(invite));
  }

  async getInvite(chatId: string, inviteId: string): Promise<Invite> {
    await this.ensureSeeded();
    const invite = await this.prisma.invite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.chatId !== chatId) {
      throw new NotFoundException(`Invite ${inviteId} not found.`);
    }
    return this.mapInvite(invite);
  }

  async getInviteByCode(chatId: string, code: string): Promise<Invite | undefined> {
    await this.ensureSeeded();
    const invite = await this.prisma.invite.findUnique({
      where: {
        chatId_code: {
          chatId,
          code
        }
      }
    });
    return invite ? this.mapInvite(invite) : undefined;
  }

  async createInvite(input: Omit<Invite, "id" | "createdAt" | "updatedAt">): Promise<Invite> {
    await this.ensureSeeded();
    const invite = await this.prisma.invite.create({
      data: {
        chatId: input.chatId,
        code: input.code,
        createdBy: input.createdBy,
        approvalMode: this.mapJoinApprovalMode(input.approvalMode),
        targetRoleId: input.targetRoleId ?? null,
        maxUses: input.maxUses ?? null,
        usesCount: input.usesCount,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        revokedAt: input.revokedAt ? new Date(input.revokedAt) : null
      }
    });
    return this.mapInvite(invite);
  }

  async updateInvite(chatId: string, inviteId: string, patch: InvitePatch): Promise<Invite> {
    await this.ensureSeeded();
    const existing = await this.prisma.invite.findUnique({ where: { id: inviteId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Invite ${inviteId} not found.`);
    }

    const invite = await this.prisma.invite.update({
      where: { id: inviteId },
      data: {
        code: patch.code ?? undefined,
        approvalMode: patch.approvalMode ? this.mapJoinApprovalMode(patch.approvalMode) : undefined,
        targetRoleId: patch.targetRoleId === undefined ? undefined : patch.targetRoleId,
        maxUses: patch.maxUses === undefined ? undefined : patch.maxUses,
        usesCount: patch.usesCount ?? undefined,
        expiresAt: patch.expiresAt === undefined ? undefined : patch.expiresAt ? new Date(patch.expiresAt) : null,
        revokedAt: patch.revokedAt === undefined ? undefined : patch.revokedAt ? new Date(patch.revokedAt) : null
      }
    });
    return this.mapInvite(invite);
  }

  async listJoinRequests(chatId: string, status?: JoinRequestStatus): Promise<JoinRequest[]> {
    await this.ensureSeeded();
    const requests = await this.prisma.joinRequest.findMany({
      where: {
        chatId,
        status: status ? this.mapJoinRequestStatus(status) : undefined
      },
      orderBy: { createdAt: "desc" }
    });
    return requests.map((request) => this.mapJoinRequest(request));
  }

  async getJoinRequest(chatId: string, requestId: string): Promise<JoinRequest> {
    await this.ensureSeeded();
    const request = await this.prisma.joinRequest.findUnique({ where: { id: requestId } });
    if (!request || request.chatId !== chatId) {
      throw new NotFoundException(`Join request ${requestId} not found.`);
    }
    return this.mapJoinRequest(request);
  }

  async getPendingJoinRequestByUser(chatId: string, userId: string): Promise<JoinRequest | undefined> {
    await this.ensureSeeded();
    const request = await this.prisma.joinRequest.findFirst({
      where: {
        chatId,
        userId,
        status: PrismaJoinRequestStatus.pending
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    return request ? this.mapJoinRequest(request) : undefined;
  }

  async createJoinRequest(input: Omit<JoinRequest, "id" | "createdAt" | "updatedAt">): Promise<JoinRequest> {
    await this.ensureSeeded();
    const request = await this.prisma.joinRequest.create({
      data: {
        chatId: input.chatId,
        userId: input.userId,
        inviteCode: input.inviteCode ?? null,
        note: input.note ?? null,
        status: this.mapJoinRequestStatus(input.status),
        reviewedBy: input.reviewedBy ?? null,
        reviewedAt: input.reviewedAt ? new Date(input.reviewedAt) : null,
        rejectReason: input.rejectReason ?? null
      }
    });
    return this.mapJoinRequest(request);
  }

  async updateJoinRequest(chatId: string, requestId: string, patch: JoinRequestPatch): Promise<JoinRequest> {
    await this.ensureSeeded();
    const existing = await this.prisma.joinRequest.findUnique({ where: { id: requestId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Join request ${requestId} not found.`);
    }
    const request = await this.prisma.joinRequest.update({
      where: { id: requestId },
      data: {
        status: patch.status ? this.mapJoinRequestStatus(patch.status) : undefined,
        reviewedBy: patch.reviewedBy === undefined ? undefined : patch.reviewedBy,
        reviewedAt: patch.reviewedAt === undefined ? undefined : patch.reviewedAt ? new Date(patch.reviewedAt) : null,
        rejectReason: patch.rejectReason === undefined ? undefined : patch.rejectReason,
        note: patch.note === undefined ? undefined : patch.note,
        inviteCode: patch.inviteCode === undefined ? undefined : patch.inviteCode
      }
    });
    return this.mapJoinRequest(request);
  }

  async getJoinPolicy(chatId: string): Promise<JoinPolicy | undefined> {
    await this.ensureSeeded();
    const policy = await this.prisma.joinPolicy.findUnique({
      where: { chatId }
    });
    return policy ? this.mapJoinPolicy(policy) : undefined;
  }

  async upsertJoinPolicy(chatId: string, patch: JoinPolicyPatch): Promise<JoinPolicy> {
    await this.ensureSeeded();
    await this.getChat(chatId);
    const policy = await this.prisma.joinPolicy.upsert({
      where: { chatId },
      create: {
        chatId,
        defaultApprovalMode: this.mapJoinApprovalMode(patch.defaultApprovalMode ?? "manual"),
        defaultTargetRoleId: patch.defaultTargetRoleId ?? null,
        updatedBy: patch.updatedBy ?? "system"
      },
      update: {
        defaultApprovalMode: patch.defaultApprovalMode ? this.mapJoinApprovalMode(patch.defaultApprovalMode) : undefined,
        defaultTargetRoleId: patch.defaultTargetRoleId === undefined ? undefined : patch.defaultTargetRoleId,
        updatedBy: patch.updatedBy ?? undefined
      }
    });
    return this.mapJoinPolicy(policy);
  }

  async listIdentities(chatId: string): Promise<ChatIdentity[]> {
    await this.ensureSeeded();
    const identities = await this.prisma.chatIdentity.findMany({ where: { chatId } });
    return identities.map((identity) => this.mapIdentity(identity));
  }

  async createIdentity(input: { chatId: string; name: string; type: "group" | "role_profile"; createdBy: string }): Promise<ChatIdentity> {
    await this.ensureSeeded();
    const identity = await this.prisma.chatIdentity.create({
      data: {
        chatId: input.chatId,
        name: input.name,
        type: input.type,
        isActive: true,
        createdBy: input.createdBy
      }
    });
    return this.mapIdentity(identity);
  }

  async updateIdentity(chatId: string, identityId: string, patch: IdentityPatch): Promise<ChatIdentity> {
    await this.ensureSeeded();
    const existing = await this.prisma.chatIdentity.findUnique({ where: { id: identityId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Identity ${identityId} not found.`);
    }
    const updated = await this.prisma.chatIdentity.update({
      where: { id: identityId },
      data: {
        name: patch.name ?? undefined,
        isActive: patch.isActive ?? undefined
      }
    });
    return this.mapIdentity(updated);
  }

  async getIdentity(chatId: string, identityId: string): Promise<ChatIdentity> {
    await this.ensureSeeded();
    const identity = await this.prisma.chatIdentity.findUnique({ where: { id: identityId } });
    if (!identity || identity.chatId !== chatId) {
      throw new NotFoundException(`Identity ${identityId} not found.`);
    }
    return this.mapIdentity(identity);
  }

  async listMessages(chatId: string, options: ListMessagesOptions = {}): Promise<Message[]> {
    await this.ensureSeeded();
    const beforeDate = options.before ? new Date(options.before) : undefined;
    const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : null;
    const includeDeleted = options.includeDeleted ?? false;
    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        ...(includeDeleted ? {} : { isDeleted: false }),
        createdAt: beforeDate
          ? {
              lt: beforeDate
            }
          : undefined
      },
      orderBy: {
        createdAt: limit ? "desc" : "asc"
      },
      take: limit ?? undefined
    });
    const normalized = limit ? messages.reverse() : messages;
    return normalized.map((message) => this.mapMessage(message));
  }

  async listMessagesByAuthorSince(chatId: string, userId: string, sinceIso: string): Promise<Message[]> {
    await this.ensureSeeded();
    const sinceDate = new Date(sinceIso);
    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        authorId: userId,
        isDeleted: false,
        createdAt: {
          gte: sinceDate
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    return messages.map((message) => this.mapMessage(message));
  }

  async getLastMessageByAuthor(chatId: string, userId: string): Promise<Message | undefined> {
    await this.ensureSeeded();
    const message = await this.prisma.message.findFirst({
      where: {
        chatId,
        authorId: userId,
        isDeleted: false
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    return message ? this.mapMessage(message) : undefined;
  }

  async getMessage(chatId: string, messageId: string): Promise<Message> {
    await this.ensureSeeded();
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.chatId !== chatId) {
      throw new NotFoundException(`Message ${messageId} not found.`);
    }
    return this.mapMessage(message);
  }

  async createMessage(message: Omit<Message, "id" | "createdAt" | "updatedAt" | "isDeleted">): Promise<Message> {
    await this.ensureSeeded();
    const created = await this.prisma.message.create({
      data: {
        chatId: message.chatId,
        authorId: message.authorId,
        actorUserId: message.actorUserId,
        displayAuthorType: message.displayAuthorType,
        displayAuthorId: message.displayAuthorId,
        senderMode: message.senderMode,
        text: message.text,
        media: message.media ? (message.media as Prisma.InputJsonValue) : undefined,
        signatureMode: message.signatureMode,
        customSignature: message.customSignature,
        replyToId: message.replyToId,
        isEncrypted: message.isEncrypted ?? false,
        encryptedPayload: message.encryptedPayload ? (message.encryptedPayload as unknown as Prisma.InputJsonValue) : undefined
      }
    });
    return this.mapMessage(created);
  }

  async updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<Message> {
    await this.ensureSeeded();
    const existing = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Message ${messageId} not found.`);
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        text: patch.text ?? undefined,
        customSignature: patch.customSignature ?? undefined
      }
    });
    return this.mapMessage(updated);
  }

  async softDeleteMessage(chatId: string, messageId: string): Promise<Message> {
    await this.ensureSeeded();
    const existing = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Message ${messageId} not found.`);
    }
    const deleted = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true
      }
    });
    return this.mapMessage(deleted);
  }

  async hardDeleteMessages(chatId: string): Promise<string[]> {
    await this.ensureSeeded();
    const messages = await this.prisma.message.findMany({
      where: { chatId },
      select: { id: true }
    });
    const messageIds = messages.map((entry) => entry.id);
    if (messageIds.length === 0) {
      return [];
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reminder.deleteMany({
        where: {
          chatId,
          messageId: { in: messageIds }
        }
      });
      await tx.bookmark.deleteMany({
        where: {
          chatId,
          messageId: { in: messageIds }
        }
      });
      await tx.threadSubscription.deleteMany({
        where: {
          chatId,
          messageId: { in: messageIds }
        }
      });
      await tx.message.deleteMany({
        where: { chatId }
      });
    });

    return messageIds;
  }

  async listMessageReactions(chatId: string, messageId: string): Promise<MessageReaction[]> {
    await this.ensureSeeded();
    await this.getMessage(chatId, messageId);
    const reactions = await this.prisma.messageReaction.findMany({
      where: {
        chatId,
        messageId
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    return reactions.map((reaction) => this.mapMessageReaction(reaction));
  }

  async upsertMessageReaction(chatId: string, messageId: string, userId: string, reaction: string): Promise<MessageReaction> {
    await this.ensureSeeded();
    await this.getMessage(chatId, messageId);
    const saved = await this.prisma.messageReaction.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId
        }
      },
      create: {
        chatId,
        messageId,
        userId,
        reaction
      },
      update: {
        reaction
      }
    });
    return this.mapMessageReaction(saved);
  }

  async deleteMessageReaction(chatId: string, messageId: string, userId: string): Promise<void> {
    await this.ensureSeeded();
    await this.getMessage(chatId, messageId);
    await this.prisma.messageReaction.deleteMany({
      where: {
        chatId,
        messageId,
        userId
      }
    });
  }

  async listMessageTranslations(chatId: string, messageId: string): Promise<MessageTranslation[]> {
    await this.ensureSeeded();
    await this.getMessage(chatId, messageId);
    const translations = await this.prisma.messageTranslation.findMany({
      where: {
        chatId,
        messageId
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    return translations.map((entry) => this.mapMessageTranslation(entry));
  }

  async getMessageTranslation(
    chatId: string,
    messageId: string,
    targetLanguage: string
  ): Promise<MessageTranslation | undefined> {
    await this.ensureSeeded();
    const entry = await this.prisma.messageTranslation.findUnique({
      where: {
        chatId_messageId_targetLanguage: {
          chatId,
          messageId,
          targetLanguage
        }
      }
    });
    return entry ? this.mapMessageTranslation(entry) : undefined;
  }

  async upsertMessageTranslation(
    input: Omit<MessageTranslation, "id" | "createdAt" | "updatedAt">
  ): Promise<MessageTranslation> {
    await this.ensureSeeded();
    await this.getMessage(input.chatId, input.messageId);
    const saved = await this.prisma.messageTranslation.upsert({
      where: {
        chatId_messageId_targetLanguage: {
          chatId: input.chatId,
          messageId: input.messageId,
          targetLanguage: input.targetLanguage
        }
      },
      create: {
        chatId: input.chatId,
        messageId: input.messageId,
        targetLanguage: input.targetLanguage,
        sourceLanguage: input.sourceLanguage,
        sourceText: input.sourceText,
        translatedText: input.translatedText,
        provider: input.provider,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy
      },
      update: {
        sourceLanguage: input.sourceLanguage,
        sourceText: input.sourceText,
        translatedText: input.translatedText,
        provider: input.provider,
        updatedBy: input.updatedBy
      }
    });
    return this.mapMessageTranslation(saved);
  }

  async deleteMessageTranslation(chatId: string, messageId: string, targetLanguage: string): Promise<void> {
    await this.ensureSeeded();
    await this.prisma.messageTranslation.deleteMany({
      where: {
        chatId,
        messageId,
        targetLanguage
      }
    });
  }

  async listScheduledMessages(chatId: string, userId: string): Promise<ScheduledMessage[]> {
    await this.ensureSeeded();
    const scheduled = await this.prisma.scheduledMessage.findMany({
      where: { chatId, userId },
      orderBy: { scheduledAt: "asc" }
    });
    return scheduled.map((entry) => this.mapScheduledMessage(entry));
  }

  async listPendingScheduledMessages(): Promise<ScheduledMessage[]> {
    await this.ensureSeeded();
    const scheduled = await this.prisma.scheduledMessage.findMany({
      where: { status: PrismaScheduledMessageStatus.scheduled },
      orderBy: { scheduledAt: "asc" }
    });
    return scheduled.map((entry) => this.mapScheduledMessage(entry));
  }

  async getScheduledMessage(chatId: string, scheduledMessageId: string): Promise<ScheduledMessage> {
    await this.ensureSeeded();
    const entry = await this.prisma.scheduledMessage.findUnique({ where: { id: scheduledMessageId } });
    if (!entry || entry.chatId !== chatId) {
      throw new NotFoundException(`Scheduled message ${scheduledMessageId} not found.`);
    }
    return this.mapScheduledMessage(entry);
  }

  async createScheduledMessage(
    input: Omit<ScheduledMessage, "id" | "sentMessageId" | "sentAt" | "canceledAt" | "error" | "createdAt" | "updatedAt">
  ): Promise<ScheduledMessage> {
    await this.ensureSeeded();
    const created = await this.prisma.scheduledMessage.create({
      data: {
        chatId: input.chatId,
        userId: input.userId,
        payload: input.payload as unknown as Prisma.InputJsonValue,
        scheduledAt: new Date(input.scheduledAt),
        status: this.mapScheduledStatus(input.status)
      }
    });
    return this.mapScheduledMessage(created);
  }

  async updateScheduledMessage(chatId: string, scheduledMessageId: string, patch: ScheduledMessagePatch): Promise<ScheduledMessage> {
    await this.ensureSeeded();
    const existing = await this.prisma.scheduledMessage.findUnique({ where: { id: scheduledMessageId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Scheduled message ${scheduledMessageId} not found.`);
    }
    const updated = await this.prisma.scheduledMessage.update({
      where: { id: scheduledMessageId },
      data: {
        status: patch.status ? this.mapScheduledStatus(patch.status) : undefined,
        scheduledAt: patch.scheduledAt ? new Date(patch.scheduledAt) : undefined,
        sentMessageId: patch.sentMessageId !== undefined ? patch.sentMessageId : undefined,
        sentAt: patch.sentAt !== undefined ? (patch.sentAt ? new Date(patch.sentAt) : null) : undefined,
        canceledAt: patch.canceledAt !== undefined ? (patch.canceledAt ? new Date(patch.canceledAt) : null) : undefined,
        error: patch.error !== undefined ? patch.error : undefined
      }
    });
    return this.mapScheduledMessage(updated);
  }

  async addAuditLog(input: Omit<AuditLog, "id" | "createdAt">): Promise<AuditLog> {
    await this.ensureSeeded();
    const audit = await this.prisma.auditLog.create({
      data: {
        chatId: input.chatId,
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        payload: input.payload as Prisma.InputJsonValue
      }
    });
    return this.mapAudit(audit);
  }

  async listAudit(chatId: string): Promise<AuditLog[]> {
    await this.ensureSeeded();
    const audits = await this.prisma.auditLog.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" }
    });
    return audits.map((audit) => this.mapAudit(audit));
  }

  async countAudit(chatId: string, options: CountAuditOptions = {}): Promise<number> {
    await this.ensureSeeded();
    const sinceDate = options.since ? new Date(options.since) : undefined;
    return this.prisma.auditLog.count({
      where: {
        chatId,
        action: options.action,
        targetType: options.targetType,
        targetId: options.targetId,
        createdAt: sinceDate
          ? {
              gte: sinceDate
            }
          : undefined
      }
    });
  }

  async getChannelNotifyConfig(chatId: string): Promise<ChannelNotifyConfig> {
    await this.ensureSeeded();
    const config = await this.prisma.channelNotifyConfig.findUnique({
      where: { chatId }
    });
    if (!config) {
      throw new NotFoundException(`Channel notification config for chat ${chatId} not found.`);
    }
    return this.mapChannelNotify(config);
  }

  async updateChannelNotifyConfig(chatId: string, updatedBy: string, patch: ChannelNotifyPatch): Promise<ChannelNotifyConfig> {
    await this.ensureSeeded();
    const config = await this.prisma.channelNotifyConfig.update({
      where: { chatId },
      data: {
        enabled: patch.enabled ?? undefined,
        mode: patch.mode ? this.mapChannelNotifyMode(patch.mode) : undefined,
        template: patch.template ?? undefined,
        digestIntervalMinutes: patch.digestIntervalMinutes ?? undefined,
        updatedBy
      }
    });
    return this.mapChannelNotify(config);
  }

  async listSavedMessageViews(chatId: string, userId: string): Promise<SavedMessageView[]> {
    await this.ensureSeeded();
    const views = await this.prisma.savedMessageView.findMany({
      where: { chatId, userId },
      orderBy: { updatedAt: "desc" }
    });
    return views.map((view) => this.mapSavedMessageView(view));
  }

  async createSavedMessageView(input: Omit<SavedMessageView, "id" | "createdAt" | "updatedAt">): Promise<SavedMessageView> {
    await this.ensureSeeded();
    const created = await this.prisma.savedMessageView.create({
      data: {
        chatId: input.chatId,
        userId: input.userId,
        name: input.name,
        filters: input.filters as Prisma.InputJsonValue
      }
    });
    return this.mapSavedMessageView(created);
  }

  async deleteSavedMessageView(chatId: string, userId: string, viewId: string): Promise<void> {
    await this.ensureSeeded();
    const existing = await this.prisma.savedMessageView.findUnique({ where: { id: viewId } });
    if (!existing || existing.chatId !== chatId || existing.userId !== userId) {
      throw new NotFoundException(`Saved view ${viewId} not found.`);
    }
    await this.prisma.savedMessageView.delete({ where: { id: viewId } });
  }

  async listKnowledgeArticles(chatId: string): Promise<KnowledgeArticle[]> {
    await this.ensureSeeded();
    const articles = await this.prisma.knowledgeArticle.findMany({
      where: { chatId },
      orderBy: { updatedAt: "desc" }
    });
    return articles.map((article) => this.mapKnowledgeArticle(article));
  }

  async getKnowledgeArticle(chatId: string, articleId: string): Promise<KnowledgeArticle> {
    await this.ensureSeeded();
    const article = await this.prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
    if (!article || article.chatId !== chatId) {
      throw new NotFoundException(`Knowledge article ${articleId} not found.`);
    }
    return this.mapKnowledgeArticle(article);
  }

  async createKnowledgeArticle(input: Omit<KnowledgeArticle, "id" | "createdAt" | "updatedAt">): Promise<KnowledgeArticle> {
    await this.ensureSeeded();
    const created = await this.prisma.knowledgeArticle.create({
      data: {
        chatId: input.chatId,
        title: input.title,
        content: input.content,
        status: this.mapKnowledgeArticleStatus(input.status),
        category: input.category ?? null,
        tags: input.tags,
        version: input.version,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
        archivedAt: input.archivedAt ? new Date(input.archivedAt) : null
      }
    });
    return this.mapKnowledgeArticle(created);
  }

  async updateKnowledgeArticle(chatId: string, articleId: string, patch: KnowledgeArticlePatch): Promise<KnowledgeArticle> {
    await this.ensureSeeded();
    const existing = await this.prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Knowledge article ${articleId} not found.`);
    }
    const updated = await this.prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: {
        title: patch.title,
        content: patch.content,
        status: patch.status ? this.mapKnowledgeArticleStatus(patch.status) : undefined,
        category: patch.category !== undefined ? patch.category : undefined,
        tags: patch.tags ?? undefined,
        version: patch.version,
        updatedBy: patch.updatedBy,
        publishedAt: patch.publishedAt !== undefined ? (patch.publishedAt ? new Date(patch.publishedAt) : null) : undefined,
        archivedAt: patch.archivedAt !== undefined ? (patch.archivedAt ? new Date(patch.archivedAt) : null) : undefined
      }
    });
    return this.mapKnowledgeArticle(updated);
  }

  async listPolls(chatId: string): Promise<Poll[]> {
    await this.ensureSeeded();
    const polls = await this.prisma.poll.findMany({
      where: { chatId },
      orderBy: { createdAt: "desc" }
    });
    return polls.map((poll) => this.mapPoll(poll));
  }

  async getPoll(chatId: string, pollId: string): Promise<Poll> {
    await this.ensureSeeded();
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll || poll.chatId !== chatId) {
      throw new NotFoundException(`Poll ${pollId} not found.`);
    }
    return this.mapPoll(poll);
  }

  async createPoll(input: Omit<Poll, "id" | "createdAt" | "updatedAt">): Promise<Poll> {
    await this.ensureSeeded();
    const created = await this.prisma.poll.create({
      data: {
        chatId: input.chatId,
        question: input.question,
        options: input.options,
        allowMultiple: input.allowMultiple,
        isAnonymous: input.isAnonymous,
        isQuiz: input.isQuiz,
        correctOptionIndexes: input.correctOptionIndexes,
        allowedRoleIds: input.allowedRoleIds,
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
        status: this.mapPollStatus(input.status),
        createdBy: input.createdBy
      }
    });
    return this.mapPoll(created);
  }

  async updatePoll(chatId: string, pollId: string, patch: PollPatch): Promise<Poll> {
    await this.ensureSeeded();
    const existing = await this.prisma.poll.findUnique({ where: { id: pollId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Poll ${pollId} not found.`);
    }
    const updated = await this.prisma.poll.update({
      where: { id: pollId },
      data: {
        question: patch.question,
        options: patch.options,
        allowMultiple: patch.allowMultiple,
        isAnonymous: patch.isAnonymous,
        isQuiz: patch.isQuiz,
        correctOptionIndexes: patch.correctOptionIndexes,
        allowedRoleIds: patch.allowedRoleIds,
        closesAt: patch.closesAt !== undefined ? (patch.closesAt ? new Date(patch.closesAt) : null) : undefined,
        status: patch.status ? this.mapPollStatus(patch.status) : undefined
      }
    });
    return this.mapPoll(updated);
  }

  async getPollVote(chatId: string, pollId: string, userId: string): Promise<PollVote | undefined> {
    await this.ensureSeeded();
    const vote = await this.prisma.pollVote.findUnique({
      where: {
        pollId_userId: {
          pollId,
          userId
        }
      }
    });
    if (!vote || vote.chatId !== chatId) {
      return undefined;
    }
    return this.mapPollVote(vote);
  }

  async listPollVotes(chatId: string, pollId: string): Promise<PollVote[]> {
    await this.ensureSeeded();
    await this.getPoll(chatId, pollId);
    const votes = await this.prisma.pollVote.findMany({
      where: {
        chatId,
        pollId
      },
      orderBy: { createdAt: "asc" }
    });
    return votes.map((vote) => this.mapPollVote(vote));
  }

  async createPollVote(input: Omit<PollVote, "id" | "createdAt" | "updatedAt">): Promise<PollVote> {
    await this.ensureSeeded();
    const created = await this.prisma.pollVote.create({
      data: {
        chatId: input.chatId,
        pollId: input.pollId,
        userId: input.userId,
        optionIndexes: input.optionIndexes
      }
    });
    return this.mapPollVote(created);
  }

  async listReminders(chatId: string, userId: string): Promise<Reminder[]> {
    await this.ensureSeeded();
    const reminders = await this.prisma.reminder.findMany({
      where: {
        chatId,
        userId
      },
      orderBy: { remindAt: "asc" }
    });
    return reminders.map((reminder) => this.mapReminder(reminder));
  }

  async listPendingReminders(): Promise<Reminder[]> {
    await this.ensureSeeded();
    const reminders = await this.prisma.reminder.findMany({
      where: {
        status: PrismaReminderStatus.scheduled
      },
      orderBy: { remindAt: "asc" }
    });
    return reminders.map((reminder) => this.mapReminder(reminder));
  }

  async getReminder(chatId: string, reminderId: string): Promise<Reminder> {
    await this.ensureSeeded();
    const reminder = await this.prisma.reminder.findUnique({ where: { id: reminderId } });
    if (!reminder || reminder.chatId !== chatId) {
      throw new NotFoundException(`Reminder ${reminderId} not found.`);
    }
    return this.mapReminder(reminder);
  }

  async createReminder(
    input: Omit<Reminder, "id" | "sentAt" | "canceledAt" | "error" | "createdAt" | "updatedAt">
  ): Promise<Reminder> {
    await this.ensureSeeded();
    const created = await this.prisma.reminder.create({
      data: {
        chatId: input.chatId,
        userId: input.userId,
        messageId: input.messageId,
        reminderType: this.mapReminderType(input.reminderType),
        targetRoleId: input.targetRoleId ?? null,
        note: input.note ?? null,
        remindAt: new Date(input.remindAt),
        telegramNotify: input.telegramNotify,
        status: this.mapReminderStatus(input.status)
      }
    });
    return this.mapReminder(created);
  }

  async updateReminder(chatId: string, reminderId: string, patch: ReminderPatch): Promise<Reminder> {
    await this.ensureSeeded();
    const existing = await this.prisma.reminder.findUnique({ where: { id: reminderId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Reminder ${reminderId} not found.`);
    }

    const updated = await this.prisma.reminder.update({
      where: { id: reminderId },
      data: {
        reminderType: patch.reminderType ? this.mapReminderType(patch.reminderType) : undefined,
        targetRoleId: patch.targetRoleId !== undefined ? patch.targetRoleId : undefined,
        note: patch.note !== undefined ? patch.note : undefined,
        remindAt: patch.remindAt ? new Date(patch.remindAt) : undefined,
        telegramNotify: patch.telegramNotify,
        status: patch.status ? this.mapReminderStatus(patch.status) : undefined,
        sentAt: patch.sentAt !== undefined ? (patch.sentAt ? new Date(patch.sentAt) : null) : undefined,
        canceledAt: patch.canceledAt !== undefined ? (patch.canceledAt ? new Date(patch.canceledAt) : null) : undefined,
        error: patch.error !== undefined ? patch.error : undefined
      }
    });
    return this.mapReminder(updated);
  }

  async listBookmarks(chatId: string, userId: string): Promise<Bookmark[]> {
    await this.ensureSeeded();
    const bookmarks = await this.prisma.bookmark.findMany({
      where: {
        chatId,
        OR: [{ userId }, { isShared: true }]
      },
      orderBy: { updatedAt: "desc" }
    });
    return bookmarks.map((bookmark) => this.mapBookmark(bookmark));
  }

  async getBookmark(chatId: string, bookmarkId: string): Promise<Bookmark> {
    await this.ensureSeeded();
    const bookmark = await this.prisma.bookmark.findUnique({ where: { id: bookmarkId } });
    if (!bookmark || bookmark.chatId !== chatId) {
      throw new NotFoundException(`Bookmark ${bookmarkId} not found.`);
    }
    return this.mapBookmark(bookmark);
  }

  async createBookmark(input: Omit<Bookmark, "id" | "createdAt" | "updatedAt">): Promise<Bookmark> {
    await this.ensureSeeded();
    const created = await this.prisma.bookmark.create({
      data: {
        chatId: input.chatId,
        userId: input.userId,
        messageId: input.messageId,
        collection: input.collection,
        tags: input.tags,
        note: input.note ?? null,
        isShared: input.isShared
      }
    });
    return this.mapBookmark(created);
  }

  async updateBookmark(chatId: string, bookmarkId: string, patch: BookmarkPatch): Promise<Bookmark> {
    await this.ensureSeeded();
    const existing = await this.prisma.bookmark.findUnique({ where: { id: bookmarkId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Bookmark ${bookmarkId} not found.`);
    }
    const updated = await this.prisma.bookmark.update({
      where: { id: bookmarkId },
      data: {
        collection: patch.collection,
        tags: patch.tags,
        note: patch.note !== undefined ? patch.note : undefined,
        isShared: patch.isShared
      }
    });
    return this.mapBookmark(updated);
  }

  async deleteBookmark(chatId: string, bookmarkId: string): Promise<void> {
    await this.ensureSeeded();
    const existing = await this.prisma.bookmark.findUnique({ where: { id: bookmarkId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Bookmark ${bookmarkId} not found.`);
    }
    await this.prisma.bookmark.delete({ where: { id: bookmarkId } });
  }

  async listMemberTags(chatId: string, userId: string): Promise<MemberTag[]> {
    await this.ensureSeeded();
    const tags = await this.prisma.memberTag.findMany({
      where: {
        chatId,
        userId
      },
      orderBy: { createdAt: "asc" }
    });
    return tags.map((entry) => this.mapMemberTag(entry));
  }

  async listMemberTagsForChat(chatId: string): Promise<MemberTag[]> {
    await this.ensureSeeded();
    const tags = await this.prisma.memberTag.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" }
    });
    return tags.map((entry) => this.mapMemberTag(entry));
  }

  async getMemberTagByKey(chatId: string, userId: string, tag: string): Promise<MemberTag | undefined> {
    await this.ensureSeeded();
    const entry = await this.prisma.memberTag.findUnique({
      where: {
        chatId_userId_tag: {
          chatId,
          userId,
          tag
        }
      }
    });
    return entry ? this.mapMemberTag(entry) : undefined;
  }

  async createMemberTag(input: Omit<MemberTag, "id" | "createdAt" | "updatedAt">): Promise<MemberTag> {
    await this.ensureSeeded();
    const created = await this.prisma.memberTag.create({
      data: {
        chatId: input.chatId,
        userId: input.userId,
        tag: input.tag,
        createdBy: input.createdBy
      }
    });
    return this.mapMemberTag(created);
  }

  async listMemberProfileFields(chatId: string, userId: string): Promise<MemberProfileField[]> {
    await this.ensureSeeded();
    const fields = await this.prisma.memberProfileField.findMany({
      where: {
        chatId,
        userId
      },
      orderBy: { createdAt: "asc" }
    });
    return fields.map((entry) => this.mapMemberProfileField(entry));
  }

  async getMemberProfileFieldByKey(chatId: string, userId: string, key: string): Promise<MemberProfileField | undefined> {
    await this.ensureSeeded();
    const entry = await this.prisma.memberProfileField.findUnique({
      where: {
        chatId_userId_key: {
          chatId,
          userId,
          key
        }
      }
    });
    return entry ? this.mapMemberProfileField(entry) : undefined;
  }

  async upsertMemberProfileField(
    input: Omit<MemberProfileField, "id" | "createdAt" | "updatedAt">
  ): Promise<MemberProfileField> {
    await this.ensureSeeded();
    const created = await this.prisma.memberProfileField.upsert({
      where: {
        chatId_userId_key: {
          chatId: input.chatId,
          userId: input.userId,
          key: input.key
        }
      },
      create: {
        chatId: input.chatId,
        userId: input.userId,
        key: input.key,
        value: input.value,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy
      },
      update: {
        value: input.value,
        updatedBy: input.updatedBy
      }
    });
    return this.mapMemberProfileField(created);
  }

  async deleteMemberProfileField(chatId: string, userId: string, key: string): Promise<void> {
    await this.ensureSeeded();
    const existing = await this.prisma.memberProfileField.findUnique({
      where: {
        chatId_userId_key: {
          chatId,
          userId,
          key
        }
      }
    });
    if (!existing) {
      return;
    }
    await this.prisma.memberProfileField.delete({ where: { id: existing.id } });
  }

  async listKeywordAlerts(chatId: string, userId: string): Promise<KeywordAlert[]> {
    await this.ensureSeeded();
    const alerts = await this.prisma.keywordAlert.findMany({
      where: {
        chatId,
        userId
      },
      orderBy: { createdAt: "desc" }
    });
    return alerts.map((alert) => this.mapKeywordAlert(alert));
  }

  async listActiveKeywordAlertsForChat(chatId: string): Promise<KeywordAlert[]> {
    await this.ensureSeeded();
    const alerts = await this.prisma.keywordAlert.findMany({
      where: {
        chatId,
        isActive: true
      },
      orderBy: { createdAt: "desc" }
    });
    return alerts.map((alert) => this.mapKeywordAlert(alert));
  }

  async getKeywordAlert(chatId: string, alertId: string): Promise<KeywordAlert> {
    await this.ensureSeeded();
    const alert = await this.prisma.keywordAlert.findUnique({ where: { id: alertId } });
    if (!alert || alert.chatId !== chatId) {
      throw new NotFoundException(`Keyword alert ${alertId} not found.`);
    }
    return this.mapKeywordAlert(alert);
  }

  async createKeywordAlert(input: Omit<KeywordAlert, "id" | "lastTriggeredAt" | "createdAt" | "updatedAt">): Promise<KeywordAlert> {
    await this.ensureSeeded();
    const created = await this.prisma.keywordAlert.create({
      data: {
        chatId: input.chatId,
        userId: input.userId,
        keyword: input.keyword,
        normalizedKeyword: input.normalizedKeyword,
        isRegex: input.isRegex,
        caseSensitive: input.caseSensitive,
        dedupWindowSeconds: input.dedupWindowSeconds,
        isActive: input.isActive,
        lastTriggeredAt: null
      }
    });
    return this.mapKeywordAlert(created);
  }

  async updateKeywordAlert(chatId: string, alertId: string, patch: KeywordAlertPatch): Promise<KeywordAlert> {
    await this.ensureSeeded();
    const existing = await this.prisma.keywordAlert.findUnique({ where: { id: alertId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Keyword alert ${alertId} not found.`);
    }
    const updated = await this.prisma.keywordAlert.update({
      where: { id: alertId },
      data: {
        keyword: patch.keyword,
        normalizedKeyword: patch.normalizedKeyword,
        isRegex: patch.isRegex,
        caseSensitive: patch.caseSensitive,
        dedupWindowSeconds: patch.dedupWindowSeconds,
        isActive: patch.isActive,
        lastTriggeredAt:
          patch.lastTriggeredAt !== undefined ? (patch.lastTriggeredAt ? new Date(patch.lastTriggeredAt) : null) : undefined
      }
    });
    return this.mapKeywordAlert(updated);
  }

  async deleteKeywordAlert(chatId: string, alertId: string): Promise<void> {
    await this.ensureSeeded();
    const existing = await this.prisma.keywordAlert.findUnique({ where: { id: alertId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Keyword alert ${alertId} not found.`);
    }
    await this.prisma.keywordAlert.delete({ where: { id: alertId } });
  }

  async listThreadSubscriptions(chatId: string, userId: string): Promise<ThreadSubscription[]> {
    await this.ensureSeeded();
    const subscriptions = await this.prisma.threadSubscription.findMany({
      where: {
        chatId,
        userId
      },
      orderBy: { createdAt: "desc" }
    });
    return subscriptions.map((subscription) => this.mapThreadSubscription(subscription));
  }

  async listActiveThreadSubscriptionsForChat(chatId: string): Promise<ThreadSubscription[]> {
    await this.ensureSeeded();
    const subscriptions = await this.prisma.threadSubscription.findMany({
      where: {
        chatId,
        isActive: true
      },
      orderBy: { createdAt: "desc" }
    });
    return subscriptions.map((subscription) => this.mapThreadSubscription(subscription));
  }

  async getThreadSubscription(chatId: string, subscriptionId: string): Promise<ThreadSubscription> {
    await this.ensureSeeded();
    const subscription = await this.prisma.threadSubscription.findUnique({ where: { id: subscriptionId } });
    if (!subscription || subscription.chatId !== chatId) {
      throw new NotFoundException(`Thread subscription ${subscriptionId} not found.`);
    }
    return this.mapThreadSubscription(subscription);
  }

  async getThreadSubscriptionByKey(
    chatId: string,
    userId: string,
    messageId: string,
    subscriptionType: ThreadSubscriptionType
  ): Promise<ThreadSubscription | undefined> {
    await this.ensureSeeded();
    const subscription = await this.prisma.threadSubscription.findUnique({
      where: {
        chatId_userId_messageId_subscriptionType: {
          chatId,
          userId,
          messageId,
          subscriptionType: this.mapThreadSubscriptionType(subscriptionType)
        }
      }
    });
    if (!subscription) {
      return undefined;
    }
    return this.mapThreadSubscription(subscription);
  }

  async createThreadSubscription(
    input: Omit<ThreadSubscription, "id" | "lastTriggeredAt" | "createdAt" | "updatedAt">
  ): Promise<ThreadSubscription> {
    await this.ensureSeeded();
    const created = await this.prisma.threadSubscription.create({
      data: {
        chatId: input.chatId,
        userId: input.userId,
        messageId: input.messageId,
        subscriptionType: this.mapThreadSubscriptionType(input.subscriptionType),
        telegramNotify: input.telegramNotify,
        dedupWindowSeconds: input.dedupWindowSeconds,
        isActive: input.isActive,
        lastTriggeredAt: null
      }
    });
    return this.mapThreadSubscription(created);
  }

  async updateThreadSubscription(
    chatId: string,
    subscriptionId: string,
    patch: ThreadSubscriptionPatch
  ): Promise<ThreadSubscription> {
    await this.ensureSeeded();
    const existing = await this.prisma.threadSubscription.findUnique({ where: { id: subscriptionId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Thread subscription ${subscriptionId} not found.`);
    }
    const updated = await this.prisma.threadSubscription.update({
      where: { id: subscriptionId },
      data: {
        subscriptionType: patch.subscriptionType ? this.mapThreadSubscriptionType(patch.subscriptionType) : undefined,
        telegramNotify: patch.telegramNotify,
        dedupWindowSeconds: patch.dedupWindowSeconds,
        isActive: patch.isActive,
        lastTriggeredAt:
          patch.lastTriggeredAt !== undefined ? (patch.lastTriggeredAt ? new Date(patch.lastTriggeredAt) : null) : undefined
      }
    });
    return this.mapThreadSubscription(updated);
  }

  async deleteThreadSubscription(chatId: string, subscriptionId: string): Promise<void> {
    await this.ensureSeeded();
    const existing = await this.prisma.threadSubscription.findUnique({ where: { id: subscriptionId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Thread subscription ${subscriptionId} not found.`);
    }
    await this.prisma.threadSubscription.delete({ where: { id: subscriptionId } });
  }

  async listReadReceipts(chatId: string, messageId: string): Promise<ReadReceipt[]> {
    await this.ensureSeeded();
    await this.getMessage(chatId, messageId);
    const receipts = await this.prisma.readReceipt.findMany({
      where: {
        chatId,
        messageId
      },
      orderBy: { readAt: "asc" }
    });
    return receipts.map((receipt) => this.mapReadReceipt(receipt));
  }

  async getReadReceipt(chatId: string, messageId: string, userId: string): Promise<ReadReceipt | undefined> {
    await this.ensureSeeded();
    const receipt = await this.prisma.readReceipt.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId
        }
      }
    });
    if (!receipt || receipt.chatId !== chatId) {
      return undefined;
    }
    return this.mapReadReceipt(receipt);
  }

  async upsertReadReceipt(chatId: string, messageId: string, userId: string, readAt: string): Promise<ReadReceipt> {
    await this.ensureSeeded();
    await this.getMessage(chatId, messageId);
    const receipt = await this.prisma.readReceipt.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId
        }
      },
      create: {
        chatId,
        messageId,
        userId,
        readAt: new Date(readAt)
      },
      update: {
        readAt: new Date(readAt)
      }
    });
    return this.mapReadReceipt(receipt);
  }

  async getReadReceiptPreference(chatId: string, userId: string): Promise<ReadReceiptPreference | undefined> {
    await this.ensureSeeded();
    const preference = await this.prisma.readReceiptPreference.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId
        }
      }
    });
    return preference ? this.mapReadReceiptPreference(preference) : undefined;
  }

  async upsertReadReceiptPreference(chatId: string, userId: string, mode: ReadReceiptMode): Promise<ReadReceiptPreference> {
    await this.ensureSeeded();
    const preference = await this.prisma.readReceiptPreference.upsert({
      where: {
        chatId_userId: {
          chatId,
          userId
        }
      },
      create: {
        chatId,
        userId,
        mode: this.mapReadReceiptMode(mode)
      },
      update: {
        mode: this.mapReadReceiptMode(mode)
      }
    });
    return this.mapReadReceiptPreference(preference);
  }

  async getReadReceiptPolicy(chatId: string): Promise<ReadReceiptPolicy> {
    await this.ensureSeeded();
    const existing = await this.prisma.readReceiptPolicy.findUnique({
      where: { chatId }
    });
    if (existing) {
      return this.mapReadReceiptPolicy(existing);
    }
    const created = await this.prisma.readReceiptPolicy.create({
      data: {
        chatId,
        allowCrossRoleView: true,
        updatedBy: "system"
      }
    });
    return this.mapReadReceiptPolicy(created);
  }

  async upsertReadReceiptPolicy(chatId: string, patch: ReadReceiptPolicyPatch): Promise<ReadReceiptPolicy> {
    await this.ensureSeeded();
    const policy = await this.prisma.readReceiptPolicy.upsert({
      where: { chatId },
      create: {
        chatId,
        allowCrossRoleView: patch.allowCrossRoleView ?? true,
        updatedBy: patch.updatedBy ?? "system"
      },
      update: {
        allowCrossRoleView: patch.allowCrossRoleView ?? undefined,
        updatedBy: patch.updatedBy ?? undefined
      }
    });
    return this.mapReadReceiptPolicy(policy);
  }

  async upsertE2EDevice(input: Omit<E2EDevice, "id" | "isActive" | "createdAt" | "updatedAt">): Promise<E2EDevice> {
    await this.ensureSeeded();
    await this.getChat(input.chatId);
    await this.ensureMember(input.chatId, input.userId);
    const now = new Date();

    const saved = await this.prisma.e2EDevice.upsert({
      where: {
        chatId_userId_deviceId: {
          chatId: input.chatId,
          userId: input.userId,
          deviceId: input.deviceId
        }
      },
      create: {
        chatId: input.chatId,
        userId: input.userId,
        deviceId: input.deviceId,
        algorithm: input.algorithm,
        identityKey: input.identityKey,
        signedPreKey: input.signedPreKey,
        oneTimePreKeys: input.oneTimePreKeys,
        fallbackKey: input.fallbackKey ?? null,
        isActive: true,
        lastPreKeyRotationAt: input.lastPreKeyRotationAt ? new Date(input.lastPreKeyRotationAt) : now
      },
      update: {
        algorithm: input.algorithm,
        identityKey: input.identityKey,
        signedPreKey: input.signedPreKey,
        oneTimePreKeys: input.oneTimePreKeys,
        fallbackKey: input.fallbackKey ?? null,
        isActive: true,
        lastPreKeyRotationAt: input.lastPreKeyRotationAt ? new Date(input.lastPreKeyRotationAt) : now
      }
    });
    return this.mapE2EDevice(saved);
  }

  async listE2EDevices(chatId: string, userIds?: string[]): Promise<E2EDevice[]> {
    await this.ensureSeeded();
    await this.getChat(chatId);
    const filterUserIds = userIds && userIds.length > 0 ? userIds : undefined;
    const devices = await this.prisma.e2EDevice.findMany({
      where: {
        chatId,
        isActive: true,
        userId: filterUserIds
          ? {
              in: filterUserIds
            }
          : undefined
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
    return devices.map((device) => this.mapE2EDevice(device));
  }

  async listE2EDevicesForUser(chatId: string, userId: string): Promise<E2EDevice[]> {
    return (await this.listE2EDevices(chatId, [userId])).filter((device) => device.userId === userId);
  }

  async deactivateE2EDevice(chatId: string, userId: string, deviceId: string): Promise<E2EDevice> {
    await this.ensureSeeded();
    await this.getChat(chatId);
    const existing = await this.prisma.e2EDevice.findUnique({
      where: {
        chatId_userId_deviceId: {
          chatId,
          userId,
          deviceId
        }
      }
    });
    if (!existing) {
      throw new NotFoundException(`E2E device ${deviceId} not found.`);
    }
    const updated = await this.prisma.e2EDevice.update({
      where: { id: existing.id },
      data: {
        isActive: false
      }
    });
    return this.mapE2EDevice(updated);
  }

  async listTickets(chatId: string): Promise<Ticket[]> {
    await this.ensureSeeded();
    const tickets = await this.prisma.ticket.findMany({
      where: { chatId },
      orderBy: { createdAt: "desc" }
    });
    return tickets.map((ticket) => this.mapTicket(ticket));
  }

  async listTicketsPendingSlaBreach(nowIso: string): Promise<Ticket[]> {
    await this.ensureSeeded();
    const tickets = await this.prisma.ticket.findMany({
      where: {
        status: {
          in: [PrismaTicketStatus.open, PrismaTicketStatus.in_progress, PrismaTicketStatus.waiting]
        },
        slaDueAt: {
          not: null,
          lte: new Date(nowIso)
        },
        slaBreachedAt: null
      },
      orderBy: {
        slaDueAt: "asc"
      }
    });
    return tickets.map((ticket) => this.mapTicket(ticket));
  }

  async getTicket(chatId: string, ticketId: string): Promise<Ticket> {
    await this.ensureSeeded();
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.chatId !== chatId) {
      throw new NotFoundException(`Ticket ${ticketId} not found.`);
    }
    return this.mapTicket(ticket);
  }

  async createTicket(input: Omit<Ticket, "id" | "createdAt" | "updatedAt">): Promise<Ticket> {
    await this.ensureSeeded();
    const created = await this.prisma.ticket.create({
      data: {
        chatId: input.chatId,
        sourceMessageId: input.sourceMessageId,
        status: this.mapTicketStatus(input.status),
        priority: this.mapTicketPriority(input.priority),
        assigneeId: input.assigneeId ?? null,
        slaDueAt: input.slaDueAt ? new Date(input.slaDueAt) : null,
        slaBreachedAt: input.slaBreachedAt ? new Date(input.slaBreachedAt) : null,
        labels: input.labels,
        createdBy: input.createdBy
      }
    });
    return this.mapTicket(created);
  }

  async updateTicket(chatId: string, ticketId: string, patch: TicketPatch): Promise<Ticket> {
    await this.ensureSeeded();
    const existing = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Ticket ${ticketId} not found.`);
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: patch.status ? this.mapTicketStatus(patch.status) : undefined,
        priority: patch.priority ? this.mapTicketPriority(patch.priority) : undefined,
        assigneeId: patch.assigneeId !== undefined ? patch.assigneeId : undefined,
        slaDueAt: patch.slaDueAt !== undefined ? (patch.slaDueAt ? new Date(patch.slaDueAt) : null) : undefined,
        slaBreachedAt:
          patch.slaBreachedAt !== undefined ? (patch.slaBreachedAt ? new Date(patch.slaBreachedAt) : null) : undefined,
        labels: patch.labels ?? undefined
      }
    });
    return this.mapTicket(updated);
  }

  async listAutomationRules(chatId: string): Promise<AutomationRule[]> {
    await this.ensureSeeded();
    const rules = await this.prisma.automationRule.findMany({
      where: { chatId },
      orderBy: { createdAt: "desc" }
    });
    return rules.map((rule) => this.mapAutomationRule(rule));
  }

  async getAutomationRule(chatId: string, ruleId: string): Promise<AutomationRule> {
    await this.ensureSeeded();
    const rule = await this.prisma.automationRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.chatId !== chatId) {
      throw new NotFoundException(`Automation rule ${ruleId} not found.`);
    }
    return this.mapAutomationRule(rule);
  }

  async createAutomationRule(input: Omit<AutomationRule, "id" | "createdAt" | "updatedAt">): Promise<AutomationRule> {
    await this.ensureSeeded();
    const created = await this.prisma.automationRule.create({
      data: {
        chatId: input.chatId,
        name: input.name,
        triggerType: this.mapAutomationTriggerType(input.triggerType),
        conditions: input.conditions as Prisma.InputJsonValue,
        actions: input.actions as Prisma.InputJsonValue,
        isEnabled: input.isEnabled,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy
      }
    });
    return this.mapAutomationRule(created);
  }

  async updateAutomationRule(chatId: string, ruleId: string, patch: AutomationRulePatch): Promise<AutomationRule> {
    await this.ensureSeeded();
    const existing = await this.prisma.automationRule.findUnique({ where: { id: ruleId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Automation rule ${ruleId} not found.`);
    }

    const updated = await this.prisma.automationRule.update({
      where: { id: ruleId },
      data: {
        name: patch.name,
        triggerType: patch.triggerType ? this.mapAutomationTriggerType(patch.triggerType) : undefined,
        conditions: patch.conditions !== undefined ? (patch.conditions as Prisma.InputJsonValue) : undefined,
        actions: patch.actions !== undefined ? (patch.actions as Prisma.InputJsonValue) : undefined,
        isEnabled: patch.isEnabled,
        updatedBy: patch.updatedBy
      }
    });
    return this.mapAutomationRule(updated);
  }

  async listAutomationExecutions(chatId: string, ruleId: string, limit: number): Promise<AutomationExecution[]> {
    await this.ensureSeeded();
    const executions = await this.prisma.automationExecution.findMany({
      where: {
        chatId,
        ruleId
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return executions.map((execution) => this.mapAutomationExecution(execution));
  }

  async createAutomationExecution(input: Omit<AutomationExecution, "id" | "createdAt">): Promise<AutomationExecution> {
    await this.ensureSeeded();
    const created = await this.prisma.automationExecution.create({
      data: {
        chatId: input.chatId,
        ruleId: input.ruleId,
        triggerType: this.mapAutomationTriggerType(input.triggerType),
        inputPayload: input.inputPayload as Prisma.InputJsonValue,
        status: this.mapAutomationExecutionStatus(input.status),
        actionsCount: input.actionsCount,
        error: input.error ?? null,
        executedBy: input.executedBy,
        startedAt: new Date(input.startedAt),
        finishedAt: new Date(input.finishedAt)
      }
    });
    return this.mapAutomationExecution(created);
  }

  async createTempRoom(input: Omit<TempRoom, "id" | "createdAt" | "updatedAt">): Promise<TempRoom> {
    await this.ensureSeeded();
    const created = await this.prisma.tempRoom.create({
      data: {
        chatId: input.chatId,
        name: input.name,
        description: input.description ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        status: this.mapTempRoomStatus(input.status),
        inheritPermissions: input.inheritPermissions,
        permissionOverrides: input.permissionOverrides as Prisma.InputJsonValue,
        createdBy: input.createdBy,
        archivedAt: input.archivedAt ? new Date(input.archivedAt) : null
      }
    });
    return this.mapTempRoom(created);
  }

  async getTempRoom(chatId: string, tempRoomId: string): Promise<TempRoom> {
    await this.ensureSeeded();
    const room = await this.prisma.tempRoom.findUnique({
      where: { id: tempRoomId }
    });
    if (!room || room.chatId !== chatId) {
      throw new NotFoundException(`Temp room ${tempRoomId} not found.`);
    }
    return this.mapTempRoom(room);
  }

  async updateTempRoom(chatId: string, tempRoomId: string, patch: TempRoomPatch): Promise<TempRoom> {
    await this.ensureSeeded();
    const existing = await this.prisma.tempRoom.findUnique({
      where: { id: tempRoomId }
    });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Temp room ${tempRoomId} not found.`);
    }

    const updated = await this.prisma.tempRoom.update({
      where: { id: tempRoomId },
      data: {
        status: patch.status ? this.mapTempRoomStatus(patch.status) : undefined,
        archivedAt: patch.archivedAt !== undefined ? (patch.archivedAt ? new Date(patch.archivedAt) : null) : undefined
      }
    });
    return this.mapTempRoom(updated);
  }

  async listDueTempRoomsForAutoArchive(nowIso: string): Promise<TempRoom[]> {
    await this.ensureSeeded();
    const dueRooms = await this.prisma.tempRoom.findMany({
      where: {
        status: PrismaTempRoomStatus.active,
        endsAt: {
          not: null,
          lte: new Date(nowIso)
        }
      },
      orderBy: {
        endsAt: "asc"
      }
    });
    return dueRooms.map((entry) => this.mapTempRoom(entry));
  }

  async createReputationEvent(input: Omit<ReputationEvent, "id" | "createdAt">): Promise<ReputationEvent> {
    await this.ensureSeeded();
    const created = await this.prisma.reputationEvent.create({
      data: {
        chatId: input.chatId,
        userId: input.userId,
        delta: input.delta,
        reason: input.reason,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        actorId: input.actorId
      }
    });
    return this.mapReputationEvent(created);
  }

  async getReputationScore(chatId: string, userId: string): Promise<number> {
    await this.ensureSeeded();
    const aggregate = await this.prisma.reputationEvent.aggregate({
      where: {
        chatId,
        userId
      },
      _sum: {
        delta: true
      }
    });
    return aggregate._sum.delta ?? 0;
  }

  async getActiveIncidentMode(chatId: string): Promise<IncidentModeLog | undefined> {
    await this.ensureSeeded();
    const active = await this.prisma.incidentModeLog.findFirst({
      where: {
        chatId,
        disabledAt: null
      },
      orderBy: { enabledAt: "desc" }
    });
    return active ? this.mapIncidentModeLog(active) : undefined;
  }

  async listActiveIncidentModes(): Promise<IncidentModeLog[]> {
    await this.ensureSeeded();
    const activeModes = await this.prisma.incidentModeLog.findMany({
      where: {
        disabledAt: null
      },
      orderBy: {
        enabledAt: "asc"
      }
    });
    return activeModes.map((entry) => this.mapIncidentModeLog(entry));
  }

  async createIncidentModeLog(input: Omit<IncidentModeLog, "id">): Promise<IncidentModeLog> {
    await this.ensureSeeded();
    const created = await this.prisma.incidentModeLog.create({
      data: {
        chatId: input.chatId,
        enabledBy: input.enabledBy,
        enabledAt: new Date(input.enabledAt),
        disabledAt: input.disabledAt ? new Date(input.disabledAt) : null,
        policySnapshot: input.policySnapshot as Prisma.InputJsonValue,
        reason: input.reason
      }
    });
    return this.mapIncidentModeLog(created);
  }

  async closeIncidentMode(chatId: string, disabledAt: string): Promise<IncidentModeLog> {
    await this.ensureSeeded();
    const active = await this.prisma.incidentModeLog.findFirst({
      where: {
        chatId,
        disabledAt: null
      },
      orderBy: { enabledAt: "desc" }
    });
    if (!active) {
      throw new NotFoundException(`Active incident mode for chat ${chatId} not found.`);
    }

    const updated = await this.prisma.incidentModeLog.update({
      where: { id: active.id },
      data: {
        disabledAt: new Date(disabledAt)
      }
    });
    return this.mapIncidentModeLog(updated);
  }

  async listIntegrationWebhooks(chatId: string): Promise<IntegrationWebhook[]> {
    await this.ensureSeeded();
    const webhooks = await this.prisma.integrationWebhook.findMany({
      where: { chatId },
      orderBy: { createdAt: "desc" }
    });
    return webhooks.map((webhook) => this.mapIntegrationWebhook(webhook));
  }

  async getIntegrationWebhook(chatId: string, webhookId: string): Promise<IntegrationWebhook> {
    await this.ensureSeeded();
    const webhook = await this.prisma.integrationWebhook.findUnique({
      where: { id: webhookId }
    });
    if (!webhook || webhook.chatId !== chatId) {
      throw new NotFoundException(`Integration webhook ${webhookId} not found.`);
    }
    return this.mapIntegrationWebhook(webhook);
  }

  async createIntegrationWebhook(
    input: Omit<IntegrationWebhook, "id" | "lastDeliveredAt" | "lastError" | "createdAt" | "updatedAt">
  ): Promise<IntegrationWebhook> {
    await this.ensureSeeded();
    const webhook = await this.prisma.integrationWebhook.create({
      data: {
        chatId: input.chatId,
        name: input.name,
        url: input.url,
        secret: input.secret,
        events: input.events,
        enabled: input.enabled,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy
      }
    });
    return this.mapIntegrationWebhook(webhook);
  }

  async updateIntegrationWebhook(chatId: string, webhookId: string, patch: IntegrationWebhookPatch): Promise<IntegrationWebhook> {
    await this.ensureSeeded();
    const existing = await this.prisma.integrationWebhook.findUnique({ where: { id: webhookId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Integration webhook ${webhookId} not found.`);
    }

    const updated = await this.prisma.integrationWebhook.update({
      where: { id: webhookId },
      data: {
        name: patch.name,
        url: patch.url,
        events: patch.events,
        enabled: patch.enabled,
        secret: patch.secret,
        updatedBy: patch.updatedBy,
        lastDeliveredAt: patch.lastDeliveredAt !== undefined ? (patch.lastDeliveredAt ? new Date(patch.lastDeliveredAt) : null) : undefined,
        lastError: patch.lastError !== undefined ? patch.lastError : undefined
      }
    });
    return this.mapIntegrationWebhook(updated);
  }

  async listBroadcastCampaigns(chatId: string): Promise<BroadcastCampaign[]> {
    await this.ensureSeeded();
    const campaigns = await this.prisma.broadcastCampaign.findMany({
      where: { chatId },
      orderBy: { createdAt: "desc" }
    });
    return campaigns.map((campaign) => this.mapBroadcastCampaign(campaign));
  }

  async getBroadcastCampaign(chatId: string, campaignId: string): Promise<BroadcastCampaign> {
    await this.ensureSeeded();
    const campaign = await this.prisma.broadcastCampaign.findUnique({
      where: { id: campaignId }
    });
    if (!campaign || campaign.chatId !== chatId) {
      throw new NotFoundException(`Broadcast campaign ${campaignId} not found.`);
    }
    return this.mapBroadcastCampaign(campaign);
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
    await this.ensureSeeded();
    const campaign = await this.prisma.broadcastCampaign.create({
      data: {
        chatId: input.chatId,
        name: input.name,
        broadcastType: this.mapBroadcastType(input.broadcastType),
        audience: input.audience as Prisma.InputJsonValue,
        content: input.content as Prisma.InputJsonValue,
        schedule: input.schedule as unknown as Prisma.InputJsonValue,
        senderMode: input.senderMode,
        identityId: input.identityId ?? null,
        requiresApproval: input.requiresApproval,
        rateLimitPerMinute: input.rateLimitPerMinute ?? null,
        status: this.mapBroadcastStatus(input.status),
        createdBy: input.createdBy
      }
    });
    return this.mapBroadcastCampaign(campaign);
  }

  async updateBroadcastCampaign(chatId: string, campaignId: string, patch: BroadcastCampaignPatch): Promise<BroadcastCampaign> {
    await this.ensureSeeded();
    const existing = await this.prisma.broadcastCampaign.findUnique({ where: { id: campaignId } });
    if (!existing || existing.chatId !== chatId) {
      throw new NotFoundException(`Broadcast campaign ${campaignId} not found.`);
    }

    const updated = await this.prisma.broadcastCampaign.update({
      where: { id: campaignId },
      data: {
        name: patch.name,
        broadcastType: patch.broadcastType ? this.mapBroadcastType(patch.broadcastType) : undefined,
        audience: patch.audience !== undefined ? (patch.audience as Prisma.InputJsonValue) : undefined,
        content: patch.content !== undefined ? (patch.content as Prisma.InputJsonValue) : undefined,
        schedule: patch.schedule !== undefined ? (patch.schedule as unknown as Prisma.InputJsonValue) : undefined,
        senderMode: patch.senderMode,
        identityId: patch.identityId !== undefined ? patch.identityId : undefined,
        requiresApproval: patch.requiresApproval,
        rateLimitPerMinute: patch.rateLimitPerMinute !== undefined ? patch.rateLimitPerMinute : undefined,
        status: patch.status ? this.mapBroadcastStatus(patch.status) : undefined,
        approvedBy: patch.approvedBy !== undefined ? patch.approvedBy : undefined,
        approvedAt: patch.approvedAt !== undefined ? (patch.approvedAt ? new Date(patch.approvedAt) : null) : undefined,
        scheduledAt: patch.scheduledAt !== undefined ? (patch.scheduledAt ? new Date(patch.scheduledAt) : null) : undefined,
        startedAt: patch.startedAt !== undefined ? (patch.startedAt ? new Date(patch.startedAt) : null) : undefined,
        completedAt: patch.completedAt !== undefined ? (patch.completedAt ? new Date(patch.completedAt) : null) : undefined,
        canceledAt: patch.canceledAt !== undefined ? (patch.canceledAt ? new Date(patch.canceledAt) : null) : undefined,
        pausedAt: patch.pausedAt !== undefined ? (patch.pausedAt ? new Date(patch.pausedAt) : null) : undefined,
        targetCount: patch.targetCount,
        sentCount: patch.sentCount,
        failedCount: patch.failedCount,
        lastRunAt: patch.lastRunAt !== undefined ? (patch.lastRunAt ? new Date(patch.lastRunAt) : null) : undefined
      }
    });
    return this.mapBroadcastCampaign(updated);
  }

  private async ensureSeeded(): Promise<void> {
    if (!this.seedReady) {
      this.seedReady = this.seedBaseData();
    }
    await this.seedReady;
  }

  private async seedBaseData(): Promise<void> {
    const chatExists = await this.prisma.chat.findUnique({
      where: { id: MAIN_CHAT_ID },
      select: { id: true }
    });
    if (!chatExists) {
      await this.prisma.$transaction(async (tx) => {
        await tx.chat.create({
          data: {
            id: MAIN_CHAT_ID,
            name: "Ristoranti Chat",
            mode: "chat_mode",
            defaultRoleId: MAIN_MEMBER_ROLE_ID
          }
        });

        await tx.role.createMany({
          data: [
            {
              id: MAIN_OWNER_ROLE_ID,
              chatId: MAIN_CHAT_ID,
              name: "owner",
              priority: 1000,
              isSystem: true,
              isDefault: false,
              permissions: BASE_OWNER_PERMISSIONS
            },
            {
              id: MAIN_ADMIN_ROLE_ID,
              chatId: MAIN_CHAT_ID,
              name: "admin",
              priority: 900,
              isSystem: true,
              isDefault: false,
              permissions: BASE_ADMIN_PERMISSIONS
            },
            {
              id: MAIN_MEMBER_ROLE_ID,
              chatId: MAIN_CHAT_ID,
              name: "member",
              priority: 100,
              isSystem: true,
              isDefault: true,
              permissions: BASE_MEMBER_PERMISSIONS
            },
            {
              id: MAIN_LEGIT_ROLE_ID,
              chatId: MAIN_CHAT_ID,
              name: "legit",
              priority: 120,
              isSystem: true,
              isDefault: false,
              permissions: BASE_LEGIT_PERMISSIONS
            },
            {
              id: MAIN_READONLY_ROLE_ID,
              chatId: MAIN_CHAT_ID,
              name: "readonly",
              priority: 10,
              isSystem: true,
              isDefault: false,
              permissions: ["chat.view", "chat.join", "chat.leave"]
            }
          ]
        });

        await tx.roleLimit.createMany({
          data: [
            { roleId: MAIN_OWNER_ROLE_ID, chatId: MAIN_CHAT_ID },
            { roleId: MAIN_ADMIN_ROLE_ID, chatId: MAIN_CHAT_ID },
            { roleId: MAIN_MEMBER_ROLE_ID, chatId: MAIN_CHAT_ID },
            {
              roleId: MAIN_LEGIT_ROLE_ID,
              chatId: MAIN_CHAT_ID,
              messagesPerDay: 3,
              exceedAction: PrismaLimitExceedAction.reject
            },
            { roleId: MAIN_READONLY_ROLE_ID, chatId: MAIN_CHAT_ID }
          ]
        });

        await tx.chatIdentity.create({
          data: {
            id: MAIN_IDENTITY_ID,
            chatId: MAIN_CHAT_ID,
            name: "Ristoranti Chat Team",
            type: "group",
            isActive: true,
            createdBy: "system"
          }
        });

        await tx.channelNotifyConfig.create({
          data: {
            chatId: MAIN_CHAT_ID,
            enabled: false,
            mode: ChannelNotifyMode.off,
            template: "{author_name} posted a new message.\nTap the button below to view.",
            digestIntervalMinutes: 15,
            updatedBy: "system"
          }
        });
      });
    }

    await this.ensureMainSystemRolesUpToDate();
  }

  private async ensureMainSystemRolesUpToDate(): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.role.upsert({
        where: { id: MAIN_OWNER_ROLE_ID },
        create: {
          id: MAIN_OWNER_ROLE_ID,
          chatId: MAIN_CHAT_ID,
          name: "owner",
          priority: 1000,
          isSystem: true,
          isDefault: false,
          permissions: BASE_OWNER_PERMISSIONS
        },
        update: {
          chatId: MAIN_CHAT_ID,
          isSystem: true,
          permissions: BASE_OWNER_PERMISSIONS
        }
      });
      await tx.role.upsert({
        where: { id: MAIN_ADMIN_ROLE_ID },
        create: {
          id: MAIN_ADMIN_ROLE_ID,
          chatId: MAIN_CHAT_ID,
          name: "admin",
          priority: 900,
          isSystem: true,
          isDefault: false,
          permissions: BASE_ADMIN_PERMISSIONS
        },
        update: {
          chatId: MAIN_CHAT_ID,
          isSystem: true
        }
      });
      await tx.role.upsert({
        where: { id: MAIN_MEMBER_ROLE_ID },
        create: {
          id: MAIN_MEMBER_ROLE_ID,
          chatId: MAIN_CHAT_ID,
          name: "member",
          priority: 100,
          isSystem: true,
          isDefault: true,
          permissions: BASE_MEMBER_PERMISSIONS
        },
        update: {
          chatId: MAIN_CHAT_ID,
          isSystem: true,
          permissions: BASE_MEMBER_PERMISSIONS
        }
      });
      await tx.role.upsert({
        where: { id: MAIN_LEGIT_ROLE_ID },
        create: {
          id: MAIN_LEGIT_ROLE_ID,
          chatId: MAIN_CHAT_ID,
          name: "legit",
          priority: 120,
          isSystem: true,
          isDefault: false,
          permissions: BASE_LEGIT_PERMISSIONS
        },
        update: {
          chatId: MAIN_CHAT_ID,
          isSystem: true,
          permissions: BASE_LEGIT_PERMISSIONS
        }
      });
      await tx.role.upsert({
        where: { id: MAIN_READONLY_ROLE_ID },
        create: {
          id: MAIN_READONLY_ROLE_ID,
          chatId: MAIN_CHAT_ID,
          name: "readonly",
          priority: 10,
          isSystem: true,
          isDefault: false,
          permissions: ["chat.view", "chat.join", "chat.leave"]
        },
        update: {
          chatId: MAIN_CHAT_ID,
          isSystem: true
        }
      });

      await tx.roleLimit.upsert({
        where: { roleId: MAIN_OWNER_ROLE_ID },
        create: { roleId: MAIN_OWNER_ROLE_ID, chatId: MAIN_CHAT_ID },
        update: { chatId: MAIN_CHAT_ID }
      });
      await tx.roleLimit.upsert({
        where: { roleId: MAIN_ADMIN_ROLE_ID },
        create: { roleId: MAIN_ADMIN_ROLE_ID, chatId: MAIN_CHAT_ID },
        update: { chatId: MAIN_CHAT_ID }
      });
      await tx.roleLimit.upsert({
        where: { roleId: MAIN_MEMBER_ROLE_ID },
        create: { roleId: MAIN_MEMBER_ROLE_ID, chatId: MAIN_CHAT_ID },
        update: { chatId: MAIN_CHAT_ID }
      });
      await tx.roleLimit.upsert({
        where: { roleId: MAIN_LEGIT_ROLE_ID },
        create: {
          roleId: MAIN_LEGIT_ROLE_ID,
          chatId: MAIN_CHAT_ID,
          messagesPerDay: 3,
          exceedAction: PrismaLimitExceedAction.reject
        },
        update: {
          chatId: MAIN_CHAT_ID,
          messagesPerDay: 3,
          exceedAction: PrismaLimitExceedAction.reject
        }
      });
      await tx.roleLimit.upsert({
        where: { roleId: MAIN_READONLY_ROLE_ID },
        create: { roleId: MAIN_READONLY_ROLE_ID, chatId: MAIN_CHAT_ID },
        update: { chatId: MAIN_CHAT_ID }
      });
    });
  }

  private mapUser(saved: {
    id: string;
    telegramId: bigint;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    createdAt: Date;
  }): User {
    return {
      id: saved.id,
      telegramId: Number(saved.telegramId),
      username: saved.username ?? undefined,
      firstName: saved.firstName ?? undefined,
      lastName: saved.lastName ?? undefined,
      createdAt: saved.createdAt.toISOString()
    };
  }

  private mapChat(saved: { id: string; name: string; mode: "chat_mode" | "channel_mode" | "hybrid_mode"; defaultRoleId: string; createdAt: Date }): Chat {
    return {
      id: saved.id,
      name: saved.name,
      mode: saved.mode,
      defaultRoleId: saved.defaultRoleId,
      createdAt: saved.createdAt.toISOString()
    };
  }

  private mapRole(saved: {
    id: string;
    chatId: string;
    name: string;
    priority: number;
    isSystem: boolean;
    isDefault: boolean;
    permissions: string[];
    createdAt: Date;
  }): Role {
    return {
      id: saved.id,
      chatId: saved.chatId,
      name: saved.name,
      priority: saved.priority,
      isSystem: saved.isSystem,
      isDefault: saved.isDefault,
      permissions: saved.permissions,
      createdAt: saved.createdAt.toISOString()
    };
  }

  private mapMember(saved: {
    id: string;
    chatId: string;
    userId: string;
    roleId: string;
    status: PrismaMemberStatus;
    mutedUntil: Date | null;
    bannedUntil: Date | null;
    joinedAt: Date;
  }): ChatMember {
    return {
      id: saved.id,
      chatId: saved.chatId,
      userId: saved.userId,
      roleId: saved.roleId,
      status: saved.status as MemberStatus,
      mutedUntil: saved.mutedUntil ? saved.mutedUntil.toISOString() : null,
      bannedUntil: saved.bannedUntil ? saved.bannedUntil.toISOString() : null,
      joinedAt: saved.joinedAt.toISOString()
    };
  }

  private mapInvite(saved: {
    id: string;
    chatId: string;
    code: string;
    createdBy: string;
    approvalMode: PrismaJoinApprovalMode;
    targetRoleId: string | null;
    maxUses: number | null;
    usesCount: number;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Invite {
    return {
      id: saved.id,
      chatId: saved.chatId,
      code: saved.code,
      createdBy: saved.createdBy,
      approvalMode: this.mapJoinApprovalModeFromDb(saved.approvalMode),
      targetRoleId: saved.targetRoleId ?? null,
      maxUses: saved.maxUses ?? null,
      usesCount: saved.usesCount,
      expiresAt: saved.expiresAt ? saved.expiresAt.toISOString() : null,
      revokedAt: saved.revokedAt ? saved.revokedAt.toISOString() : null,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapJoinRequest(saved: {
    id: string;
    chatId: string;
    userId: string;
    inviteCode: string | null;
    note: string | null;
    status: PrismaJoinRequestStatus;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    rejectReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): JoinRequest {
    return {
      id: saved.id,
      chatId: saved.chatId,
      userId: saved.userId,
      inviteCode: saved.inviteCode ?? null,
      note: saved.note ?? null,
      status: this.mapJoinRequestStatusFromDb(saved.status),
      reviewedBy: saved.reviewedBy ?? null,
      reviewedAt: saved.reviewedAt ? saved.reviewedAt.toISOString() : null,
      rejectReason: saved.rejectReason ?? null,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapJoinPolicy(saved: {
    chatId: string;
    defaultApprovalMode: PrismaJoinApprovalMode;
    defaultTargetRoleId: string | null;
    updatedBy: string;
    updatedAt: Date;
  }): JoinPolicy {
    return {
      chatId: saved.chatId,
      defaultApprovalMode: this.mapJoinApprovalModeFromDb(saved.defaultApprovalMode),
      defaultTargetRoleId: saved.defaultTargetRoleId ?? null,
      updatedBy: saved.updatedBy,
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapIdentity(saved: {
    id: string;
    chatId: string;
    name: string;
    type: string;
    isActive: boolean;
    createdBy: string;
    createdAt: Date;
  }): ChatIdentity {
    return {
      id: saved.id,
      chatId: saved.chatId,
      name: saved.name,
      type: saved.type as "group" | "role_profile",
      isActive: saved.isActive,
      createdBy: saved.createdBy,
      createdAt: saved.createdAt.toISOString()
    };
  }

  private mapJoinRequestStatus(status: JoinRequestStatus): PrismaJoinRequestStatus {
    if (status === "approved") {
      return PrismaJoinRequestStatus.approved;
    }
    if (status === "rejected") {
      return PrismaJoinRequestStatus.rejected;
    }
    return PrismaJoinRequestStatus.pending;
  }

  private mapJoinRequestStatusFromDb(status: PrismaJoinRequestStatus): JoinRequestStatus {
    if (status === PrismaJoinRequestStatus.approved) {
      return "approved";
    }
    if (status === PrismaJoinRequestStatus.rejected) {
      return "rejected";
    }
    return "pending";
  }

  private mapJoinApprovalMode(mode: JoinApprovalMode): PrismaJoinApprovalMode {
    if (mode === "auto") {
      return PrismaJoinApprovalMode.auto;
    }
    return PrismaJoinApprovalMode.manual;
  }

  private mapJoinApprovalModeFromDb(mode: PrismaJoinApprovalMode): JoinApprovalMode {
    if (mode === PrismaJoinApprovalMode.auto) {
      return "auto";
    }
    return "manual";
  }

  private mapMessage(saved: {
    id: string;
    chatId: string;
    authorId: string;
    actorUserId: string;
    displayAuthorType: "user" | "group" | "role_profile";
    displayAuthorId: string;
    senderMode: "as_user" | "as_group" | "as_role_profile";
    text: string | null;
    media: unknown;
    signatureMode: "system" | "hidden" | "custom" | null;
    customSignature: string | null;
    replyToId: string | null;
    isEncrypted: boolean;
    encryptedPayload: unknown;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Message {
    return {
      id: saved.id,
      chatId: saved.chatId,
      authorId: saved.authorId,
      actorUserId: saved.actorUserId,
      displayAuthorType: saved.displayAuthorType,
      displayAuthorId: saved.displayAuthorId,
      senderMode: saved.senderMode,
      text: saved.text ?? undefined,
      media: (saved.media as Message["media"]) ?? null,
      signatureMode: saved.signatureMode ?? undefined,
      customSignature: saved.customSignature ?? null,
      replyToId: saved.replyToId ?? null,
      isEncrypted: saved.isEncrypted,
      encryptedPayload: (saved.encryptedPayload as Message["encryptedPayload"]) ?? null,
      isDeleted: saved.isDeleted,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapMessageReaction(saved: {
    id: string;
    chatId: string;
    messageId: string;
    userId: string;
    reaction: string;
    createdAt: Date;
    updatedAt: Date;
  }): MessageReaction {
    return {
      id: saved.id,
      chatId: saved.chatId,
      messageId: saved.messageId,
      userId: saved.userId,
      reaction: saved.reaction,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapMessageTranslation(saved: {
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
    createdAt: Date;
    updatedAt: Date;
  }): MessageTranslation {
    return {
      id: saved.id,
      chatId: saved.chatId,
      messageId: saved.messageId,
      targetLanguage: saved.targetLanguage,
      sourceLanguage: saved.sourceLanguage,
      sourceText: saved.sourceText,
      translatedText: saved.translatedText,
      provider: saved.provider,
      createdBy: saved.createdBy,
      updatedBy: saved.updatedBy,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapScheduledMessage(saved: {
    id: string;
    chatId: string;
    userId: string;
    payload: unknown;
    scheduledAt: Date;
    status: PrismaScheduledMessageStatus;
    sentMessageId: string | null;
    sentAt: Date | null;
    canceledAt: Date | null;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ScheduledMessage {
    return {
      id: saved.id,
      chatId: saved.chatId,
      userId: saved.userId,
      payload: (saved.payload as ScheduledMessagePayload) ?? { sender_mode: "as_user" },
      scheduledAt: saved.scheduledAt.toISOString(),
      status: this.mapScheduledStatusFromDb(saved.status),
      sentMessageId: saved.sentMessageId ?? null,
      sentAt: saved.sentAt ? saved.sentAt.toISOString() : null,
      canceledAt: saved.canceledAt ? saved.canceledAt.toISOString() : null,
      error: saved.error ?? null,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapAudit(saved: {
    id: string;
    chatId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    payload: unknown;
    createdAt: Date;
  }): AuditLog {
    return {
      id: saved.id,
      chatId: saved.chatId,
      actorId: saved.actorId,
      action: saved.action,
      targetType: saved.targetType,
      targetId: saved.targetId,
      payload: (saved.payload as Record<string, unknown>) ?? {},
      createdAt: saved.createdAt.toISOString()
    };
  }

  private async ensureRoleLimits(chatId: string, roleId: string): Promise<RoleLimits> {
    await this.getRole(chatId, roleId);

    const existing = await this.prisma.roleLimit.findUnique({
      where: { roleId }
    });
    if (existing && existing.chatId === chatId) {
      return this.mapRoleLimits(existing);
    }

    const created = await this.prisma.roleLimit.upsert({
      where: { roleId },
      create: {
        roleId,
        chatId
      },
      update: {}
    });
    return this.mapRoleLimits(created);
  }

  private mapRoleLimits(saved: {
    roleId: string;
    chatId: string;
    slowmodeSeconds: number;
    messagesPerDay: number | null;
    messagesPerHour: number | null;
    mediaPerDay: number | null;
    linksPerDay: number | null;
    mentionsPerDay: number | null;
    burstCount: number | null;
    burstWindowSeconds: number | null;
    exceedAction: PrismaLimitExceedAction;
    exceedMuteSeconds: number | null;
    updatedAt: Date;
  }): RoleLimits {
    return {
      roleId: saved.roleId,
      chatId: saved.chatId,
      slowmodeSeconds: saved.slowmodeSeconds,
      messagesPerDay: saved.messagesPerDay,
      messagesPerHour: saved.messagesPerHour,
      mediaPerDay: saved.mediaPerDay,
      linksPerDay: saved.linksPerDay,
      mentionsPerDay: saved.mentionsPerDay,
      burstCount: saved.burstCount,
      burstWindowSeconds: saved.burstWindowSeconds,
      exceedAction: this.mapRoleLimitsExceedActionFromDb(saved.exceedAction),
      exceedMuteSeconds: saved.exceedMuteSeconds,
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapRoleLimitsWritePatch(patch: RoleLimitsPatch): RoleLimitsWritePatch {
    return {
      slowmodeSeconds: patch.slowmodeSeconds,
      messagesPerDay: patch.messagesPerDay !== undefined ? patch.messagesPerDay : undefined,
      messagesPerHour: patch.messagesPerHour !== undefined ? patch.messagesPerHour : undefined,
      mediaPerDay: patch.mediaPerDay !== undefined ? patch.mediaPerDay : undefined,
      linksPerDay: patch.linksPerDay !== undefined ? patch.linksPerDay : undefined,
      mentionsPerDay: patch.mentionsPerDay !== undefined ? patch.mentionsPerDay : undefined,
      burstCount: patch.burstCount !== undefined ? patch.burstCount : undefined,
      burstWindowSeconds: patch.burstWindowSeconds !== undefined ? patch.burstWindowSeconds : undefined,
      exceedAction: patch.exceedAction ? this.mapRoleLimitsExceedAction(patch.exceedAction) : undefined,
      exceedMuteSeconds: patch.exceedMuteSeconds !== undefined ? patch.exceedMuteSeconds : undefined
    };
  }

  private mapRoleLimitsExceedAction(action: "warn" | "mute" | "reject"): PrismaLimitExceedAction {
    if (action === "warn") {
      return PrismaLimitExceedAction.warn;
    }
    if (action === "mute") {
      return PrismaLimitExceedAction.mute;
    }
    return PrismaLimitExceedAction.reject;
  }

  private mapRoleLimitsExceedActionFromDb(action: PrismaLimitExceedAction): "warn" | "mute" | "reject" {
    if (action === PrismaLimitExceedAction.warn) {
      return "warn";
    }
    if (action === PrismaLimitExceedAction.mute) {
      return "mute";
    }
    return "reject";
  }

  private mapScheduledStatus(status: ScheduledMessage["status"]): PrismaScheduledMessageStatus {
    if (status === "sent") {
      return PrismaScheduledMessageStatus.sent;
    }
    if (status === "failed") {
      return PrismaScheduledMessageStatus.failed;
    }
    if (status === "canceled") {
      return PrismaScheduledMessageStatus.canceled;
    }
    return PrismaScheduledMessageStatus.scheduled;
  }

  private mapScheduledStatusFromDb(status: PrismaScheduledMessageStatus): ScheduledMessage["status"] {
    if (status === PrismaScheduledMessageStatus.sent) {
      return "sent";
    }
    if (status === PrismaScheduledMessageStatus.failed) {
      return "failed";
    }
    if (status === PrismaScheduledMessageStatus.canceled) {
      return "canceled";
    }
    return "scheduled";
  }

  private mapKnowledgeArticleStatus(status: KnowledgeArticle["status"]): PrismaKnowledgeArticleStatus {
    if (status === "review") {
      return PrismaKnowledgeArticleStatus.review;
    }
    if (status === "published") {
      return PrismaKnowledgeArticleStatus.published;
    }
    if (status === "archived") {
      return PrismaKnowledgeArticleStatus.archived;
    }
    return PrismaKnowledgeArticleStatus.draft;
  }

  private mapKnowledgeArticleStatusFromDb(status: PrismaKnowledgeArticleStatus): KnowledgeArticle["status"] {
    if (status === PrismaKnowledgeArticleStatus.review) {
      return "review";
    }
    if (status === PrismaKnowledgeArticleStatus.published) {
      return "published";
    }
    if (status === PrismaKnowledgeArticleStatus.archived) {
      return "archived";
    }
    return "draft";
  }

  private mapPollStatus(status: Poll["status"]): PrismaPollStatus {
    if (status === "closed") {
      return PrismaPollStatus.closed;
    }
    return PrismaPollStatus.open;
  }

  private mapPollStatusFromDb(status: PrismaPollStatus): Poll["status"] {
    if (status === PrismaPollStatus.closed) {
      return "closed";
    }
    return "open";
  }

  private mapReminderType(type: Reminder["reminderType"]): PrismaReminderType {
    if (type === "team") {
      return PrismaReminderType.team;
    }
    if (type === "moderator") {
      return PrismaReminderType.moderator;
    }
    return PrismaReminderType.personal;
  }

  private mapReminderTypeFromDb(type: PrismaReminderType): Reminder["reminderType"] {
    if (type === PrismaReminderType.team) {
      return "team";
    }
    if (type === PrismaReminderType.moderator) {
      return "moderator";
    }
    return "personal";
  }

  private mapReminderStatus(status: Reminder["status"]): PrismaReminderStatus {
    if (status === "sent") {
      return PrismaReminderStatus.sent;
    }
    if (status === "failed") {
      return PrismaReminderStatus.failed;
    }
    if (status === "canceled") {
      return PrismaReminderStatus.canceled;
    }
    return PrismaReminderStatus.scheduled;
  }

  private mapReminderStatusFromDb(status: PrismaReminderStatus): Reminder["status"] {
    if (status === PrismaReminderStatus.sent) {
      return "sent";
    }
    if (status === PrismaReminderStatus.failed) {
      return "failed";
    }
    if (status === PrismaReminderStatus.canceled) {
      return "canceled";
    }
    return "scheduled";
  }

  private mapReadReceiptMode(mode: ReadReceiptMode): PrismaReadReceiptMode {
    if (mode === "off") {
      return PrismaReadReceiptMode.off;
    }
    if (mode === "role_visible") {
      return PrismaReadReceiptMode.role_visible;
    }
    if (mode === "global") {
      return PrismaReadReceiptMode.global;
    }
    return PrismaReadReceiptMode.private;
  }

  private mapReadReceiptModeFromDb(mode: PrismaReadReceiptMode): ReadReceiptMode {
    if (mode === PrismaReadReceiptMode.off) {
      return "off";
    }
    if (mode === PrismaReadReceiptMode.role_visible) {
      return "role_visible";
    }
    if (mode === PrismaReadReceiptMode.global) {
      return "global";
    }
    return "private";
  }

  private mapThreadSubscriptionType(type: ThreadSubscriptionType): PrismaThreadSubscriptionType {
    if (type === "message") {
      return PrismaThreadSubscriptionType.message;
    }
    return PrismaThreadSubscriptionType.thread;
  }

  private mapThreadSubscriptionTypeFromDb(type: PrismaThreadSubscriptionType): ThreadSubscriptionType {
    if (type === PrismaThreadSubscriptionType.message) {
      return "message";
    }
    return "thread";
  }

  private mapTicketStatus(status: Ticket["status"]): PrismaTicketStatus {
    if (status === "in_progress") {
      return PrismaTicketStatus.in_progress;
    }
    if (status === "waiting") {
      return PrismaTicketStatus.waiting;
    }
    if (status === "resolved") {
      return PrismaTicketStatus.resolved;
    }
    if (status === "closed") {
      return PrismaTicketStatus.closed;
    }
    return PrismaTicketStatus.open;
  }

  private mapTicketStatusFromDb(status: PrismaTicketStatus): Ticket["status"] {
    if (status === PrismaTicketStatus.in_progress) {
      return "in_progress";
    }
    if (status === PrismaTicketStatus.waiting) {
      return "waiting";
    }
    if (status === PrismaTicketStatus.resolved) {
      return "resolved";
    }
    if (status === PrismaTicketStatus.closed) {
      return "closed";
    }
    return "open";
  }

  private mapTicketPriority(priority: Ticket["priority"]): PrismaTicketPriority {
    if (priority === "low") {
      return PrismaTicketPriority.low;
    }
    if (priority === "high") {
      return PrismaTicketPriority.high;
    }
    if (priority === "urgent") {
      return PrismaTicketPriority.urgent;
    }
    return PrismaTicketPriority.normal;
  }

  private mapTicketPriorityFromDb(priority: PrismaTicketPriority): Ticket["priority"] {
    if (priority === PrismaTicketPriority.low) {
      return "low";
    }
    if (priority === PrismaTicketPriority.high) {
      return "high";
    }
    if (priority === PrismaTicketPriority.urgent) {
      return "urgent";
    }
    return "normal";
  }

  private mapAutomationTriggerType(type: AutomationRule["triggerType"]): PrismaAutomationTriggerType {
    if (type === "member.joined") {
      return PrismaAutomationTriggerType.member_joined;
    }
    if (type === "ticket.overdue") {
      return PrismaAutomationTriggerType.ticket_overdue;
    }
    if (type === "limit.hit") {
      return PrismaAutomationTriggerType.limit_hit;
    }
    return PrismaAutomationTriggerType.message_created;
  }

  private mapAutomationTriggerTypeFromDb(type: PrismaAutomationTriggerType): AutomationRule["triggerType"] {
    if (type === PrismaAutomationTriggerType.member_joined) {
      return "member.joined";
    }
    if (type === PrismaAutomationTriggerType.ticket_overdue) {
      return "ticket.overdue";
    }
    if (type === PrismaAutomationTriggerType.limit_hit) {
      return "limit.hit";
    }
    return "message.created";
  }

  private mapAutomationExecutionStatus(status: AutomationExecution["status"]): PrismaAutomationExecutionStatus {
    if (status === "failed") {
      return PrismaAutomationExecutionStatus.failed;
    }
    if (status === "skipped") {
      return PrismaAutomationExecutionStatus.skipped;
    }
    return PrismaAutomationExecutionStatus.success;
  }

  private mapAutomationExecutionStatusFromDb(status: PrismaAutomationExecutionStatus): AutomationExecution["status"] {
    if (status === PrismaAutomationExecutionStatus.failed) {
      return "failed";
    }
    if (status === PrismaAutomationExecutionStatus.skipped) {
      return "skipped";
    }
    return "success";
  }

  private mapBroadcastCampaign(saved: {
    id: string;
    chatId: string;
    name: string;
    broadcastType: PrismaBroadcastType;
    audience: unknown;
    content: unknown;
    schedule: unknown;
    senderMode: "as_user" | "as_group" | "as_role_profile";
    identityId: string | null;
    requiresApproval: boolean;
    rateLimitPerMinute: number | null;
    status: PrismaBroadcastStatus;
    createdBy: string;
    approvedBy: string | null;
    approvedAt: Date | null;
    scheduledAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    canceledAt: Date | null;
    pausedAt: Date | null;
    targetCount: number;
    sentCount: number;
    failedCount: number;
    lastRunAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): BroadcastCampaign {
    return {
      id: saved.id,
      chatId: saved.chatId,
      name: saved.name,
      broadcastType: this.mapBroadcastTypeFromDb(saved.broadcastType),
      audience: (saved.audience as BroadcastAudience) ?? {},
      content: (saved.content as BroadcastContent) ?? {},
      schedule: (saved.schedule as BroadcastSchedule) ?? { timezone: "UTC" },
      senderMode: saved.senderMode,
      identityId: saved.identityId ?? null,
      requiresApproval: saved.requiresApproval,
      rateLimitPerMinute: saved.rateLimitPerMinute ?? null,
      status: this.mapBroadcastStatusFromDb(saved.status),
      createdBy: saved.createdBy,
      approvedBy: saved.approvedBy ?? null,
      approvedAt: saved.approvedAt ? saved.approvedAt.toISOString() : null,
      scheduledAt: saved.scheduledAt ? saved.scheduledAt.toISOString() : null,
      startedAt: saved.startedAt ? saved.startedAt.toISOString() : null,
      completedAt: saved.completedAt ? saved.completedAt.toISOString() : null,
      canceledAt: saved.canceledAt ? saved.canceledAt.toISOString() : null,
      pausedAt: saved.pausedAt ? saved.pausedAt.toISOString() : null,
      targetCount: saved.targetCount,
      sentCount: saved.sentCount,
      failedCount: saved.failedCount,
      lastRunAt: saved.lastRunAt ? saved.lastRunAt.toISOString() : null,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapBroadcastType(type: "scheduled" | "recurring" | "event_triggered" | "digest"): PrismaBroadcastType {
    if (type === "recurring") {
      return PrismaBroadcastType.recurring;
    }
    if (type === "event_triggered") {
      return PrismaBroadcastType.event_triggered;
    }
    if (type === "digest") {
      return PrismaBroadcastType.digest;
    }
    return PrismaBroadcastType.scheduled;
  }

  private mapBroadcastTypeFromDb(type: PrismaBroadcastType): "scheduled" | "recurring" | "event_triggered" | "digest" {
    if (type === PrismaBroadcastType.recurring) {
      return "recurring";
    }
    if (type === PrismaBroadcastType.event_triggered) {
      return "event_triggered";
    }
    if (type === PrismaBroadcastType.digest) {
      return "digest";
    }
    return "scheduled";
  }

  private mapBroadcastStatus(status: BroadcastCampaign["status"]): PrismaBroadcastStatus {
    if (status === "review") {
      return PrismaBroadcastStatus.review;
    }
    if (status === "approved") {
      return PrismaBroadcastStatus.approved;
    }
    if (status === "scheduled") {
      return PrismaBroadcastStatus.scheduled;
    }
    if (status === "running") {
      return PrismaBroadcastStatus.running;
    }
    if (status === "paused") {
      return PrismaBroadcastStatus.paused;
    }
    if (status === "completed") {
      return PrismaBroadcastStatus.completed;
    }
    if (status === "canceled") {
      return PrismaBroadcastStatus.canceled;
    }
    return PrismaBroadcastStatus.draft;
  }

  private mapBroadcastStatusFromDb(status: PrismaBroadcastStatus): BroadcastCampaign["status"] {
    if (status === PrismaBroadcastStatus.review) {
      return "review";
    }
    if (status === PrismaBroadcastStatus.approved) {
      return "approved";
    }
    if (status === PrismaBroadcastStatus.scheduled) {
      return "scheduled";
    }
    if (status === PrismaBroadcastStatus.running) {
      return "running";
    }
    if (status === PrismaBroadcastStatus.paused) {
      return "paused";
    }
    if (status === PrismaBroadcastStatus.completed) {
      return "completed";
    }
    if (status === PrismaBroadcastStatus.canceled) {
      return "canceled";
    }
    return "draft";
  }

  private mapChannelNotify(saved: {
    chatId: string;
    enabled: boolean;
    mode: ChannelNotifyMode;
    template: string;
    digestIntervalMinutes: number;
    updatedBy: string;
    updatedAt: Date;
  }): ChannelNotifyConfig {
    return {
      chatId: saved.chatId,
      enabled: saved.enabled,
      mode: this.mapChannelNotifyModeFromDb(saved.mode),
      template: saved.template,
      digestIntervalMinutes: saved.digestIntervalMinutes,
      updatedBy: saved.updatedBy,
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapSavedMessageView(saved: {
    id: string;
    chatId: string;
    userId: string;
    name: string;
    filters: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): SavedMessageView {
    return {
      id: saved.id,
      chatId: saved.chatId,
      userId: saved.userId,
      name: saved.name,
      filters: (saved.filters as Record<string, unknown>) ?? {},
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapKnowledgeArticle(saved: {
    id: string;
    chatId: string;
    title: string;
    content: string;
    status: PrismaKnowledgeArticleStatus;
    category: string | null;
    tags: string[];
    version: number;
    createdBy: string;
    updatedBy: string;
    publishedAt: Date | null;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): KnowledgeArticle {
    return {
      id: saved.id,
      chatId: saved.chatId,
      title: saved.title,
      content: saved.content,
      status: this.mapKnowledgeArticleStatusFromDb(saved.status),
      category: saved.category ?? null,
      tags: saved.tags,
      version: saved.version,
      createdBy: saved.createdBy,
      updatedBy: saved.updatedBy,
      publishedAt: saved.publishedAt ? saved.publishedAt.toISOString() : null,
      archivedAt: saved.archivedAt ? saved.archivedAt.toISOString() : null,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapPoll(saved: {
    id: string;
    chatId: string;
    question: string;
    options: string[];
    allowMultiple: boolean;
    isAnonymous: boolean;
    isQuiz: boolean;
    correctOptionIndexes: number[];
    allowedRoleIds: string[];
    closesAt: Date | null;
    status: PrismaPollStatus;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }): Poll {
    return {
      id: saved.id,
      chatId: saved.chatId,
      question: saved.question,
      options: saved.options,
      allowMultiple: saved.allowMultiple,
      isAnonymous: saved.isAnonymous,
      isQuiz: saved.isQuiz,
      correctOptionIndexes: saved.correctOptionIndexes,
      allowedRoleIds: saved.allowedRoleIds,
      closesAt: saved.closesAt ? saved.closesAt.toISOString() : null,
      status: this.mapPollStatusFromDb(saved.status),
      createdBy: saved.createdBy,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapPollVote(saved: {
    id: string;
    chatId: string;
    pollId: string;
    userId: string;
    optionIndexes: number[];
    createdAt: Date;
    updatedAt: Date;
  }): PollVote {
    return {
      id: saved.id,
      chatId: saved.chatId,
      pollId: saved.pollId,
      userId: saved.userId,
      optionIndexes: saved.optionIndexes,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapReminder(saved: {
    id: string;
    chatId: string;
    userId: string;
    messageId: string;
    reminderType: PrismaReminderType;
    targetRoleId: string | null;
    note: string | null;
    remindAt: Date;
    telegramNotify: boolean;
    status: PrismaReminderStatus;
    sentAt: Date | null;
    canceledAt: Date | null;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Reminder {
    return {
      id: saved.id,
      chatId: saved.chatId,
      userId: saved.userId,
      messageId: saved.messageId,
      reminderType: this.mapReminderTypeFromDb(saved.reminderType),
      targetRoleId: saved.targetRoleId ?? null,
      note: saved.note ?? null,
      remindAt: saved.remindAt.toISOString(),
      telegramNotify: saved.telegramNotify,
      status: this.mapReminderStatusFromDb(saved.status),
      sentAt: saved.sentAt ? saved.sentAt.toISOString() : null,
      canceledAt: saved.canceledAt ? saved.canceledAt.toISOString() : null,
      error: saved.error ?? null,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapBookmark(saved: {
    id: string;
    chatId: string;
    userId: string;
    messageId: string;
    collection: string;
    tags: string[];
    note: string | null;
    isShared: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Bookmark {
    return {
      id: saved.id,
      chatId: saved.chatId,
      userId: saved.userId,
      messageId: saved.messageId,
      collection: saved.collection,
      tags: saved.tags,
      note: saved.note ?? null,
      isShared: saved.isShared,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapMemberTag(saved: {
    id: string;
    chatId: string;
    userId: string;
    tag: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }): MemberTag {
    return {
      id: saved.id,
      chatId: saved.chatId,
      userId: saved.userId,
      tag: saved.tag,
      createdBy: saved.createdBy,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapMemberProfileField(saved: {
    id: string;
    chatId: string;
    userId: string;
    key: string;
    value: string;
    createdBy: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
  }): MemberProfileField {
    return {
      id: saved.id,
      chatId: saved.chatId,
      userId: saved.userId,
      key: saved.key,
      value: saved.value,
      createdBy: saved.createdBy,
      updatedBy: saved.updatedBy,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapKeywordAlert(saved: {
    id: string;
    chatId: string;
    userId: string;
    keyword: string;
    normalizedKeyword: string;
    isRegex: boolean;
    caseSensitive: boolean;
    dedupWindowSeconds: number;
    isActive: boolean;
    lastTriggeredAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): KeywordAlert {
    return {
      id: saved.id,
      chatId: saved.chatId,
      userId: saved.userId,
      keyword: saved.keyword,
      normalizedKeyword: saved.normalizedKeyword,
      isRegex: saved.isRegex,
      caseSensitive: saved.caseSensitive,
      dedupWindowSeconds: saved.dedupWindowSeconds,
      isActive: saved.isActive,
      lastTriggeredAt: saved.lastTriggeredAt ? saved.lastTriggeredAt.toISOString() : null,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapThreadSubscription(saved: {
    id: string;
    chatId: string;
    userId: string;
    messageId: string;
    subscriptionType: PrismaThreadSubscriptionType;
    telegramNotify: boolean;
    dedupWindowSeconds: number;
    isActive: boolean;
    lastTriggeredAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ThreadSubscription {
    return {
      id: saved.id,
      chatId: saved.chatId,
      userId: saved.userId,
      messageId: saved.messageId,
      subscriptionType: this.mapThreadSubscriptionTypeFromDb(saved.subscriptionType),
      telegramNotify: saved.telegramNotify,
      dedupWindowSeconds: saved.dedupWindowSeconds,
      isActive: saved.isActive,
      lastTriggeredAt: saved.lastTriggeredAt ? saved.lastTriggeredAt.toISOString() : null,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapReadReceipt(saved: {
    id: string;
    chatId: string;
    messageId: string;
    userId: string;
    readAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }): ReadReceipt {
    return {
      id: saved.id,
      chatId: saved.chatId,
      messageId: saved.messageId,
      userId: saved.userId,
      readAt: saved.readAt.toISOString(),
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapReadReceiptPreference(saved: {
    chatId: string;
    userId: string;
    mode: PrismaReadReceiptMode;
    updatedAt: Date;
  }): ReadReceiptPreference {
    return {
      chatId: saved.chatId,
      userId: saved.userId,
      mode: this.mapReadReceiptModeFromDb(saved.mode),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapReadReceiptPolicy(saved: {
    chatId: string;
    allowCrossRoleView: boolean;
    updatedBy: string;
    updatedAt: Date;
  }): ReadReceiptPolicy {
    return {
      chatId: saved.chatId,
      allowCrossRoleView: saved.allowCrossRoleView,
      updatedBy: saved.updatedBy,
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapE2EDevice(saved: {
    id: string;
    chatId: string;
    userId: string;
    deviceId: string;
    algorithm: string;
    identityKey: string;
    signedPreKey: string;
    oneTimePreKeys: string[];
    fallbackKey: string | null;
    isActive: boolean;
    lastPreKeyRotationAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): E2EDevice {
    return {
      id: saved.id,
      chatId: saved.chatId,
      userId: saved.userId,
      deviceId: saved.deviceId,
      algorithm: saved.algorithm,
      identityKey: saved.identityKey,
      signedPreKey: saved.signedPreKey,
      oneTimePreKeys: saved.oneTimePreKeys,
      fallbackKey: saved.fallbackKey ?? null,
      isActive: saved.isActive,
      lastPreKeyRotationAt: saved.lastPreKeyRotationAt ? saved.lastPreKeyRotationAt.toISOString() : null,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapTicket(saved: {
    id: string;
    chatId: string;
    sourceMessageId: string;
    status: PrismaTicketStatus;
    priority: PrismaTicketPriority;
    assigneeId: string | null;
    slaDueAt: Date | null;
    slaBreachedAt: Date | null;
    labels: string[];
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }): Ticket {
    return {
      id: saved.id,
      chatId: saved.chatId,
      sourceMessageId: saved.sourceMessageId,
      status: this.mapTicketStatusFromDb(saved.status),
      priority: this.mapTicketPriorityFromDb(saved.priority),
      assigneeId: saved.assigneeId ?? null,
      slaDueAt: saved.slaDueAt ? saved.slaDueAt.toISOString() : null,
      slaBreachedAt: saved.slaBreachedAt ? saved.slaBreachedAt.toISOString() : null,
      labels: saved.labels,
      createdBy: saved.createdBy,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapAutomationRule(saved: {
    id: string;
    chatId: string;
    name: string;
    triggerType: PrismaAutomationTriggerType;
    conditions: unknown;
    actions: unknown;
    isEnabled: boolean;
    createdBy: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
  }): AutomationRule {
    return {
      id: saved.id,
      chatId: saved.chatId,
      name: saved.name,
      triggerType: this.mapAutomationTriggerTypeFromDb(saved.triggerType),
      conditions: Array.isArray(saved.conditions) ? saved.conditions : [],
      actions: Array.isArray(saved.actions) ? saved.actions : [],
      isEnabled: saved.isEnabled,
      createdBy: saved.createdBy,
      updatedBy: saved.updatedBy,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapAutomationExecution(saved: {
    id: string;
    chatId: string;
    ruleId: string;
    triggerType: PrismaAutomationTriggerType;
    inputPayload: unknown;
    status: PrismaAutomationExecutionStatus;
    actionsCount: number;
    error: string | null;
    executedBy: string;
    startedAt: Date;
    finishedAt: Date;
    createdAt: Date;
  }): AutomationExecution {
    return {
      id: saved.id,
      chatId: saved.chatId,
      ruleId: saved.ruleId,
      triggerType: this.mapAutomationTriggerTypeFromDb(saved.triggerType),
      inputPayload: (saved.inputPayload as Record<string, unknown>) ?? {},
      status: this.mapAutomationExecutionStatusFromDb(saved.status),
      actionsCount: saved.actionsCount,
      error: saved.error ?? null,
      executedBy: saved.executedBy,
      startedAt: saved.startedAt.toISOString(),
      finishedAt: saved.finishedAt.toISOString(),
      createdAt: saved.createdAt.toISOString()
    };
  }

  private mapTempRoom(saved: {
    id: string;
    chatId: string;
    name: string;
    description: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    status: PrismaTempRoomStatus;
    inheritPermissions: boolean;
    permissionOverrides: unknown;
    createdBy: string;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): TempRoom {
    return {
      id: saved.id,
      chatId: saved.chatId,
      name: saved.name,
      description: saved.description ?? null,
      startsAt: saved.startsAt ? saved.startsAt.toISOString() : null,
      endsAt: saved.endsAt ? saved.endsAt.toISOString() : null,
      status: this.mapTempRoomStatusFromDb(saved.status),
      inheritPermissions: saved.inheritPermissions,
      permissionOverrides: (saved.permissionOverrides as Record<string, unknown>) ?? {},
      createdBy: saved.createdBy,
      archivedAt: saved.archivedAt ? saved.archivedAt.toISOString() : null,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapTempRoomStatus(status: TempRoom["status"]): PrismaTempRoomStatus {
    if (status === "archived") {
      return PrismaTempRoomStatus.archived;
    }
    return PrismaTempRoomStatus.active;
  }

  private mapTempRoomStatusFromDb(status: PrismaTempRoomStatus): TempRoom["status"] {
    if (status === PrismaTempRoomStatus.archived) {
      return "archived";
    }
    return "active";
  }

  private mapReputationEvent(saved: {
    id: string;
    chatId: string;
    userId: string;
    delta: number;
    reason: string;
    sourceType: string;
    sourceId: string | null;
    actorId: string;
    createdAt: Date;
  }): ReputationEvent {
    return {
      id: saved.id,
      chatId: saved.chatId,
      userId: saved.userId,
      delta: saved.delta,
      reason: saved.reason,
      sourceType: saved.sourceType,
      sourceId: saved.sourceId ?? null,
      actorId: saved.actorId,
      createdAt: saved.createdAt.toISOString()
    };
  }

  private mapIncidentModeLog(saved: {
    id: string;
    chatId: string;
    enabledBy: string;
    enabledAt: Date;
    disabledAt: Date | null;
    policySnapshot: unknown;
    reason: string;
  }): IncidentModeLog {
    return {
      id: saved.id,
      chatId: saved.chatId,
      enabledBy: saved.enabledBy,
      enabledAt: saved.enabledAt.toISOString(),
      disabledAt: saved.disabledAt ? saved.disabledAt.toISOString() : null,
      policySnapshot: (saved.policySnapshot as Record<string, unknown>) ?? {},
      reason: saved.reason
    };
  }

  private mapIntegrationWebhook(saved: {
    id: string;
    chatId: string;
    name: string;
    url: string;
    secret: string;
    events: string[];
    enabled: boolean;
    createdBy: string;
    updatedBy: string;
    lastDeliveredAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): IntegrationWebhook {
    return {
      id: saved.id,
      chatId: saved.chatId,
      name: saved.name,
      url: saved.url,
      secret: saved.secret,
      events: saved.events as IntegrationWebhook["events"],
      enabled: saved.enabled,
      createdBy: saved.createdBy,
      updatedBy: saved.updatedBy,
      lastDeliveredAt: saved.lastDeliveredAt ? saved.lastDeliveredAt.toISOString() : null,
      lastError: saved.lastError ?? null,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    };
  }

  private mapChannelNotifyMode(mode: "off" | "instant" | "digest"): ChannelNotifyMode {
    if (mode === "instant") {
      return ChannelNotifyMode.instant;
    }
    if (mode === "digest") {
      return ChannelNotifyMode.digest;
    }
    return ChannelNotifyMode.off;
  }

  private mapChannelNotifyModeFromDb(mode: ChannelNotifyMode): "off" | "instant" | "digest" {
    if (mode === ChannelNotifyMode.instant) {
      return "instant";
    }
    if (mode === ChannelNotifyMode.digest) {
      return "digest";
    }
    return "off";
  }
}
