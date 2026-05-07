import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { ChatIdentity, ChatMember, Message, RequestUser, SavedMessageView } from "../../core/types.js";
import { AntiAbuseViolationError, ChatAntiAbuseService } from "./chat-anti-abuse.service.js";
import {
  ChatBootstrapQueryDto,
  CreateIdentityDto,
  ListMessagesQueryDto,
  CreateMessageDto,
  CreateSavedMessageViewDto,
  SearchMessagesQueryDto,
  SetMessageReactionDto,
  UpdateIdentityDto,
  UpdateMessageDto
} from "./chat.dto.js";

type MessageView = Message & {
  displayAuthorName?: string;
  displayAuthorUsername?: string;
  authorRoleName?: string;
  authorRoleBadgeEnabled?: boolean;
};

const ROLE_BADGE_PERMISSION = "ui.role.badge.show";
const MESSAGE_DELETED_VIEW_PERMISSION = "message.deleted.view";

@Injectable()
export class ChatService {
  private readonly antiAbuseWindowSeconds: number;
  private readonly allowedE2EMessageAlgorithms: Set<string>;
  private readonly requireEncryptedMessages: boolean;

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly eventBus: EventBusService,
    private readonly antiAbuse: ChatAntiAbuseService,
    private readonly configService: ConfigService
  ) {
    this.antiAbuseWindowSeconds = this.resolveAntiAbuseWindowSeconds();
    this.allowedE2EMessageAlgorithms = this.parseCsvSet(
      this.configService.get<string>("E2E_ALLOWED_MESSAGE_ALGORITHMS"),
      ["xchacha20-poly1305", "aes-256-gcm"]
    );
    this.requireEncryptedMessages =
      (this.configService.get<string>("CHAT_REQUIRE_ENCRYPTED_MESSAGES", "false") ?? "false").toLowerCase() === "true";
  }

  async getChat(chatId: string, requestUser: RequestUser) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "chat.view");
    const role = await this.db.getRole(chatId, member.roleId);
    await this.assertMaintenanceAccess(chatId, role.permissions);
    return {
      ...(await this.db.getChat(chatId)),
      member: {
        id: member.id,
        status: member.status,
        role: {
          id: role.id,
          name: role.name,
          permissions: role.permissions
        }
      }
    };
  }

  async getBootstrap(
    chatId: string,
    requestUser: RequestUser,
    query: ChatBootstrapQueryDto = {}
  ): Promise<{
    chat: Awaited<ReturnType<ChatService["getChat"]>>;
    messages: MessageView[];
    identities: ChatIdentity[];
    pagination: { before: string | null; limit: number };
    ws: { namespace: "/ws" };
    serverTime: string;
  }> {
    const limit = query.messages_limit ?? 100;
    const [chat, messages, identities] = await Promise.all([
      this.getChat(chatId, requestUser),
      this.listMessages(chatId, requestUser, { limit }),
      this.listIdentities(chatId, requestUser)
    ]);
    return {
      chat,
      messages,
      identities,
      pagination: {
        before: messages.length > 0 ? messages[0]!.createdAt : null,
        limit
      },
      ws: {
        namespace: "/ws"
      },
      serverTime: new Date().toISOString()
    };
  }

  async listMessages(chatId: string, requestUser: RequestUser, query: ListMessagesQueryDto = {}): Promise<MessageView[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "chat.view");
    const beforeTs = query.before ? this.parseDateQuery(query.before, "before") : null;
    const messages = await this.db.listMessages(chatId, {
      before: beforeTs === null ? undefined : new Date(beforeTs).toISOString(),
      limit: query.limit,
      includeDeleted: true
    });
    const enriched = await this.enrichMessagesWithAuthorInfo(chatId, messages);
    return Promise.all(enriched.map((message) => this.sanitizeDeletedMessageForMember(chatId, member, message)));
  }

  async searchMessages(chatId: string, requestUser: RequestUser, query: SearchMessagesQueryDto): Promise<MessageView[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "message.search");
    const canViewDeletedContent = await this.policy.hasPermission(chatId, member, MESSAGE_DELETED_VIEW_PERMISSION);

    const fromTs = this.parseDateQuery(query.from, "from");
    const toTs = this.parseDateQuery(query.to, "to");
    if (fromTs !== null && toTs !== null && fromTs > toTs) {
      throw new BadRequestException("from must be less than or equal to to.");
    }

    const normalizedText = query.q?.trim().toLowerCase();
    const contentType = query.content_type ?? "any";
    const limit = query.limit ?? 100;
    const fromIso = fromTs !== null ? new Date(fromTs).toISOString() : null;
    const toIso = toTs !== null ? new Date(toTs).toISOString() : null;

    const messages = await this.db.listMessages(chatId, { includeDeleted: true });
    const filtered = messages.filter((message) => {
      if (query.author_id && message.authorId !== query.author_id) {
        return false;
      }

      if (fromIso !== null && message.createdAt < fromIso) {
        return false;
      }
      if (toIso !== null && message.createdAt > toIso) {
        return false;
      }

      const visibleText = message.isDeleted && !canViewDeletedContent ? "" : (message.text ?? "");
      if (normalizedText && !visibleText.toLowerCase().includes(normalizedText)) {
        return false;
      }

      if (contentType === "text" && !message.text) {
        return false;
      }
      if (contentType === "media" && !message.media) {
        return false;
      }
      if (query.media_type && message.media?.type !== query.media_type) {
        return false;
      }

      return true;
    });

    const result = filtered.slice(0, limit);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.search",
      targetType: "chat",
      targetId: chatId,
      payload: {
        q: query.q ?? null,
        author_id: query.author_id ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
        content_type: contentType,
        media_type: query.media_type ?? null,
        limit,
        result_count: result.length
      }
    });

    const enriched = await this.enrichMessagesWithAuthorInfo(chatId, result);
    return Promise.all(enriched.map((message) => this.sanitizeDeletedMessageForMember(chatId, member, message)));
  }

  async createMessage(chatId: string, requestUser: RequestUser, dto: CreateMessageDto): Promise<MessageView> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    if (this.isPurgeCommand(dto)) {
      return this.purgeChat(chatId, requestUser, member);
    }
    await this.ensureCanSend(chatId, member, dto, requestUser.userId);

    let identity: ChatIdentity | null = null;
    if (dto.sender_mode !== "as_user") {
      if (!dto.identity_id) {
        throw new BadRequestException("identity_id is required for as_group/as_role_profile mode.");
      }
      identity = await this.db.getIdentity(chatId, dto.identity_id);
      if (!identity.isActive) {
        throw new BadRequestException("Identity is inactive.");
      }
      if (dto.sender_mode === "as_group" && identity.type !== "group") {
        throw new BadRequestException("as_group mode requires a group identity.");
      }
      if (dto.sender_mode === "as_role_profile" && identity.type !== "role_profile") {
        throw new BadRequestException("as_role_profile mode requires a role_profile identity.");
      }
    }

    const isEncrypted = Boolean(dto.encrypted_payload);
    const message = await this.db.createMessage({
      chatId,
      authorId: requestUser.userId,
      actorUserId: requestUser.userId,
      displayAuthorType:
        dto.sender_mode === "as_user" ? "user" : dto.sender_mode === "as_group" ? "group" : "role_profile",
      displayAuthorId: dto.sender_mode === "as_user" ? requestUser.userId : (identity?.id ?? requestUser.userId),
      senderMode: dto.sender_mode,
      text: isEncrypted ? undefined : dto.text,
      media: isEncrypted ? null : (dto.media ?? null),
      signatureMode: dto.signature_mode,
      customSignature: dto.custom_signature ?? null,
      replyToId: dto.reply_to_id ?? null,
      isEncrypted,
      encryptedPayload: dto.encrypted_payload
        ? {
            version: dto.encrypted_payload.version,
            algorithm: dto.encrypted_payload.algorithm,
            ciphertext: dto.encrypted_payload.ciphertext,
            nonce: dto.encrypted_payload.nonce,
            aad: dto.encrypted_payload.aad ?? null,
            keyId: dto.encrypted_payload.key_id ?? null,
            recipientKeyIds: dto.encrypted_payload.recipient_key_ids ?? null
          }
        : null
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.send",
      targetType: "message",
      targetId: message.id,
      payload: {
        senderMode: dto.sender_mode,
        identityId: identity?.id ?? null,
        signatureMode: dto.signature_mode ?? null,
        isEncrypted,
        e2eAlgorithm: dto.encrypted_payload?.algorithm ?? null
      }
    });
    const enriched = await this.enrichMessageWithAuthorInfo(chatId, message);
    this.eventBus.emit("message.created", enriched);
    return enriched;
  }

  async updateMessage(chatId: string, messageId: string, requestUser: RequestUser, dto: UpdateMessageDto): Promise<MessageView> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    const message = await this.db.getMessage(chatId, messageId);
    if (message.isEncrypted) {
      throw new BadRequestException("Encrypted messages cannot be edited.");
    }
    await this.ensureCanEdit(chatId, member, message, requestUser.userId);

    const updated = await this.db.updateMessage(chatId, messageId, {
      text: dto.text,
      customSignature: dto.custom_signature
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.update",
      targetType: "message",
      targetId: messageId,
      payload: {
        fields: Object.keys(dto)
      }
    });
    const enriched = await this.enrichMessageWithAuthorInfo(chatId, updated);
    this.eventBus.emit("message.updated", enriched);
    return enriched;
  }

  async deleteMessage(chatId: string, messageId: string, requestUser: RequestUser): Promise<MessageView> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    const message = await this.db.getMessage(chatId, messageId);
    await this.ensureCanDelete(chatId, member, message, requestUser.userId);

    const deleted = await this.db.softDeleteMessage(chatId, messageId);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.delete",
      targetType: "message",
      targetId: messageId,
      payload: {
        deletedAuthorId: message.authorId,
        deletedDisplayAuthorId: message.displayAuthorId,
        deletedText: message.isEncrypted ? null : (message.text ?? null),
        deletedMediaType: message.media?.type ?? null,
        deletedMediaUrl: message.media?.url ?? null,
        deletedCreatedAt: message.createdAt
      }
    });
    const enriched = await this.enrichMessageWithAuthorInfo(chatId, deleted);
    this.eventBus.emit("message.deleted", enriched);
    return this.sanitizeDeletedMessageForMember(chatId, member, enriched);
  }

  async pinMessage(chatId: string, messageId: string, requestUser: RequestUser): Promise<{ ok: true; messageId: string; pinnedAt: string }> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "message.pin");
    await this.db.getMessage(chatId, messageId);

    const pinnedAt = new Date().toISOString();
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.pin",
      targetType: "message",
      targetId: messageId,
      payload: {
        pinnedAt
      }
    });

    return {
      ok: true,
      messageId,
      pinnedAt
    };
  }

  async unpinMessage(chatId: string, messageId: string, requestUser: RequestUser): Promise<{ ok: true; messageId: string }> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "message.unpin");
    await this.db.getMessage(chatId, messageId);

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.unpin",
      targetType: "message",
      targetId: messageId,
      payload: {}
    });

    return {
      ok: true,
      messageId
    };
  }

  async listPinnedMessages(
    chatId: string,
    requestUser: RequestUser
  ): Promise<Array<{ pinnedAt: string; message: MessageView }>> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "message.pin.view");

    const [messages, audits] = await Promise.all([this.db.listMessages(chatId), this.db.listAudit(chatId)]);
    const messageById = new Map(messages.map((message) => [message.id, message]));
    const pinnedAtByMessageId = new Map<string, string>();

    for (const audit of audits) {
      if (audit.targetType !== "message") {
        continue;
      }
      if (audit.action === "message.pin") {
        pinnedAtByMessageId.set(audit.targetId, audit.createdAt);
        continue;
      }
      if (audit.action === "message.unpin") {
        pinnedAtByMessageId.delete(audit.targetId);
      }
    }

    const entries = Array.from(pinnedAtByMessageId.entries())
      .map(([messageId, pinnedAt]) => {
        const message = messageById.get(messageId);
        if (!message) {
          return null;
        }
        return {
          pinnedAt,
          message
        };
      })
      .filter((entry): entry is { pinnedAt: string; message: Message } => entry !== null)
      .sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt));
    const enrichedMessages = await this.enrichMessagesWithAuthorInfo(
      chatId,
      entries.map((entry) => entry.message)
    );
    const enrichedById = new Map(enrichedMessages.map((message) => [message.id, message]));
    return entries.map((entry) => ({
      pinnedAt: entry.pinnedAt,
      message: enrichedById.get(entry.message.id) ?? entry.message
    }));
  }

  async listSavedViews(chatId: string, requestUser: RequestUser): Promise<SavedMessageView[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "chat.view");
    return this.db.listSavedMessageViews(chatId, requestUser.userId);
  }

  async createSavedView(chatId: string, requestUser: RequestUser, dto: CreateSavedMessageViewDto): Promise<SavedMessageView> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "chat.view");

    const created = await this.db.createSavedMessageView({
      chatId,
      userId: requestUser.userId,
      name: dto.name.trim(),
      filters: dto.filters ?? {}
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.saved_view.create",
      targetType: "saved_message_view",
      targetId: created.id,
      payload: {
        name: created.name
      }
    });

    return created;
  }

  async deleteSavedView(chatId: string, viewId: string, requestUser: RequestUser): Promise<{ ok: true; viewId: string }> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "chat.view");
    await this.db.deleteSavedMessageView(chatId, requestUser.userId, viewId);

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.saved_view.delete",
      targetType: "saved_message_view",
      targetId: viewId,
      payload: {}
    });

    return {
      ok: true,
      viewId
    };
  }

  async listMessageReactions(
    chatId: string,
    messageId: string,
    requestUser: RequestUser
  ): Promise<{ messageId: string; summary: Array<{ reaction: string; count: number }> }> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "chat.view");
    const reactions = await this.db.listMessageReactions(chatId, messageId);
    return {
      messageId,
      summary: this.buildReactionSummary(reactions)
    };
  }

  async setMessageReaction(
    chatId: string,
    messageId: string,
    requestUser: RequestUser,
    dto: SetMessageReactionDto
  ): Promise<{ ok: true; messageId: string; reaction: string; summary: Array<{ reaction: string; count: number }> }> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "message.react");

    const reaction = dto.reaction.trim();
    if (reaction.length === 0) {
      throw new BadRequestException("Reaction must not be empty.");
    }

    await this.db.upsertMessageReaction(chatId, messageId, requestUser.userId, reaction);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.reaction.set",
      targetType: "message",
      targetId: messageId,
      payload: {
        reaction
      }
    });

    const reactions = await this.db.listMessageReactions(chatId, messageId);
    const summary = this.buildReactionSummary(reactions);
    this.eventBus.emit("message.reaction.updated", {
      chatId,
      messageId,
      summary
    });
    return {
      ok: true,
      messageId,
      reaction,
      summary
    };
  }

  async removeMessageReaction(chatId: string, messageId: string, requestUser: RequestUser): Promise<{
    ok: true;
    messageId: string;
    summary: Array<{ reaction: string; count: number }>;
  }> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "message.react");

    await this.db.deleteMessageReaction(chatId, messageId, requestUser.userId);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.reaction.remove",
      targetType: "message",
      targetId: messageId,
      payload: {}
    });

    const reactions = await this.db.listMessageReactions(chatId, messageId);
    const summary = this.buildReactionSummary(reactions);
    this.eventBus.emit("message.reaction.updated", {
      chatId,
      messageId,
      summary
    });
    return {
      ok: true,
      messageId,
      summary
    };
  }

  async listIdentities(chatId: string, requestUser: RequestUser): Promise<ChatIdentity[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "chat.view");
    return this.db.listIdentities(chatId);
  }

  async createIdentity(chatId: string, requestUser: RequestUser, dto: CreateIdentityDto): Promise<ChatIdentity> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "role.update");
    const created = await this.db.createIdentity({
      chatId,
      name: dto.name,
      type: dto.type,
      createdBy: requestUser.userId
    });
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "identity.create",
      targetType: "chat_identity",
      targetId: created.id,
      payload: {
        name: dto.name,
        type: dto.type
      }
    });
    return created;
  }

  async updateIdentity(chatId: string, identityId: string, requestUser: RequestUser, dto: UpdateIdentityDto): Promise<ChatIdentity> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "role.update");
    const updated = await this.db.updateIdentity(chatId, identityId, dto);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "identity.update",
      targetType: "chat_identity",
      targetId: identityId,
      payload: {
        fields: Object.keys(dto)
      }
    });
    return updated;
  }

  private async ensureCanSend(chatId: string, member: ChatMember, dto: CreateMessageDto, userId: string): Promise<void> {
    const normalizedMember = await this.resolveMemberMute(chatId, member);
    const hasEncryptedPayload = Boolean(dto.encrypted_payload);
    const hasPlainPayload = Boolean(dto.text || dto.media);

    if (!hasPlainPayload && !hasEncryptedPayload) {
      throw new BadRequestException("Message must contain text/media or encrypted_payload.");
    }
    if (hasPlainPayload && hasEncryptedPayload) {
      throw new BadRequestException("encrypted_payload cannot be combined with text/media.");
    }
    if (this.requireEncryptedMessages && !hasEncryptedPayload) {
      throw new ForbiddenException("Encrypted-only mode is enabled. Plain text/media messages are not allowed.");
    }

    if (normalizedMember.status === "banned") {
      throw new ForbiddenException("You are banned in this chat.");
    }
    if (normalizedMember.status === "readonly") {
      throw new ForbiddenException("Your role is readonly.");
    }
    if (normalizedMember.status === "muted") {
      throw new ForbiddenException("You are muted.");
    }
    if (normalizedMember.mutedUntil && new Date(normalizedMember.mutedUntil).getTime() > Date.now()) {
      throw new ForbiddenException("You are muted until " + normalizedMember.mutedUntil);
    }

    if (dto.text) {
      await this.policy.assertCan(chatId, normalizedMember, "message.send.text");
    }
    if (dto.media) {
      await this.policy.assertCan(chatId, normalizedMember, `message.send.media.${dto.media.type}`);
    }
    if (hasEncryptedPayload) {
      const canSendEncrypted = await this.policy.hasPermission(chatId, normalizedMember, "message.send.encrypted");
      if (!canSendEncrypted) {
        await this.policy.assertCan(chatId, normalizedMember, "message.send.text");
      }
      this.assertEncryptedPayloadPolicy(dto);
    }
    if (dto.reply_to_id) {
      const replyTarget = await this.db.getMessage(chatId, dto.reply_to_id);
      if (!replyTarget || replyTarget.isDeleted) {
        throw new NotFoundException("Reply target not found.");
      }
      await this.policy.assertCan(chatId, normalizedMember, "message.send.reply");
    }

    if (dto.sender_mode !== "as_user") {
      await this.policy.assertCan(chatId, normalizedMember, "message.send.as_group");
      if (dto.sender_mode === "as_role_profile") {
        await this.policy.assertCan(chatId, normalizedMember, "message.send.as_group.profile.select");
      }
      if (dto.signature_mode === "hidden") {
        await this.policy.assertCan(chatId, normalizedMember, "message.send.as_group.signature.hide");
      }
      if (dto.signature_mode === "custom") {
        await this.policy.assertCan(chatId, normalizedMember, "message.send.as_group.signature.custom");
      }
    }

    const role = await this.db.getRole(chatId, normalizedMember.roleId);

    try {
      this.antiAbuse.assertMaxLengthByRole(dto.text, role.name);
      if (!hasEncryptedPayload) {
        this.antiAbuse.assertBlockedContentPolicy(dto.text);
        this.antiAbuse.assertMediaPolicy(dto.media ?? null);
        this.antiAbuse.assertTextDomainPolicy(dto.text);
      }
      const recentOwnMessages = await this.db.listMessagesByAuthorSince(
        chatId,
        userId,
        new Date(Date.now() - this.antiAbuseWindowSeconds * 1000).toISOString()
      );
      this.antiAbuse.assertDuplicateAndFlood(userId, dto.text, recentOwnMessages, {
        encryptedFingerprint: dto.encrypted_payload ? this.buildEncryptedFingerprint(dto.encrypted_payload) : undefined
      });
    } catch (error) {
      if (error instanceof AntiAbuseViolationError) {
        await this.applyAutoSanction(chatId, normalizedMember, error);
      }
      throw error;
    }

    await this.assertRoleLimits(chatId, normalizedMember, userId, dto);
  }

  private async ensureCanEdit(chatId: string, member: ChatMember, message: Message, userId: string): Promise<void> {
    if (message.authorId === userId) {
      if (await this.policy.hasPermission(chatId, member, "message.edit.own")) {
        return;
      }
    }
    await this.policy.assertCan(chatId, member, "message.edit.any");
  }

  private async ensureCanDelete(chatId: string, member: ChatMember, message: Message, userId: string): Promise<void> {
    if (message.authorId === userId) {
      if (await this.policy.hasPermission(chatId, member, "message.delete.own")) {
        return;
      }
    }
    await this.policy.assertCan(chatId, member, "message.delete.any");
  }

  private isPurgeCommand(dto: CreateMessageDto): boolean {
    if (dto.media || dto.encrypted_payload || !dto.text) {
      return false;
    }
    const normalized = dto.text.trim();
    return /^\/pur(?:ge|e)(?:@[a-zA-Z0-9_]+)?(?:\s+(?:\*|all))?$/i.test(normalized);
  }

  private async purgeChat(chatId: string, requestUser: RequestUser, member: ChatMember): Promise<MessageView> {
    this.policy.assertMemberCanAccess(member);
    const role = await this.db.getRole(chatId, member.roleId);
    const isOwnerRole = role.id === "role_main_owner" || (role.isSystem && role.permissions.includes("*"));
    if (!isOwnerRole) {
      throw new ForbiddenException("Only owner can purge chat.");
    }

    const deletedMessageIds = await this.db.hardDeleteMessages(chatId);

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.purge",
      targetType: "chat",
      targetId: chatId,
      payload: {
        deletedCount: deletedMessageIds.length
      }
    });

    this.eventBus.emit("message.purged", {
      chatId,
      messageIds: deletedMessageIds
    });

    const confirmation = await this.db.createMessage({
      chatId,
      authorId: requestUser.userId,
      actorUserId: requestUser.userId,
      displayAuthorType: "user",
      displayAuthorId: requestUser.userId,
      senderMode: "as_user",
      text: `Chat purged: ${deletedMessageIds.length} messages.`,
      media: null,
      signatureMode: undefined,
      customSignature: null,
      replyToId: null
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "message.send",
      targetType: "message",
      targetId: confirmation.id,
      payload: {
        senderMode: "as_user",
        identityId: null,
        signatureMode: null,
        isEncrypted: false,
        e2eAlgorithm: null,
        viaCommand: "purge"
      }
    });

    const enriched = await this.enrichMessageWithAuthorInfo(chatId, confirmation);
    this.eventBus.emit("message.created", enriched);
    return enriched;
  }

  private async resolveMemberMute(chatId: string, member: ChatMember): Promise<ChatMember> {
    if (!member.mutedUntil) {
      return member;
    }

    const mutedUntilTs = Date.parse(member.mutedUntil);
    if (!Number.isFinite(mutedUntilTs)) {
      return member;
    }

    if (mutedUntilTs > Date.now()) {
      return member;
    }

    return this.db.updateMemberStatus(chatId, member.userId, member.status === "muted" ? "active" : member.status, null);
  }

  private async assertMaintenanceAccess(chatId: string, rolePermissions: string[]): Promise<void> {
    const active = await this.db.getActiveIncidentMode(chatId);
    if (!active) {
      return;
    }
    const permissionSet = new Set(rolePermissions);
    const isBypassRole =
      permissionSet.has("*") ||
      (permissionSet.has("incident_mode.enable") && permissionSet.has("incident_mode.disable"));
    if (!isBypassRole) {
      throw new ForbiddenException(
        "Maintenance mode is active. Access is temporarily limited to roles with maintenance permissions."
      );
    }
  }

  private async assertRoleLimits(chatId: string, member: ChatMember, userId: string, dto: CreateMessageDto): Promise<void> {
    const limits = await this.db.getRoleLimits(chatId, member.roleId);
    const hasAnyLimit =
      limits.slowmodeSeconds > 0 ||
      limits.messagesPerDay !== null ||
      limits.messagesPerHour !== null ||
      limits.mediaPerDay !== null ||
      limits.linksPerDay !== null ||
      limits.mentionsPerDay !== null ||
      (limits.burstCount !== null && limits.burstWindowSeconds !== null);

    if (!hasAnyLimit) {
      return;
    }

    const nowTs = Date.now();
    const dayWindowMs = 24 * 60 * 60 * 1000;
    const hourWindowMs = 60 * 60 * 1000;
    const dayStartTs = nowTs - dayWindowMs;
    const hourStartTs = nowTs - hourWindowMs;
    const needsMessagesPerDay = limits.messagesPerDay !== null;
    const needsMessagesPerHour = limits.messagesPerHour !== null;
    const needsMediaPerDay = Boolean(dto.media && limits.mediaPerDay !== null);
    const needsLinksPerDay = Boolean(dto.text && limits.linksPerDay !== null);
    const needsMentionsPerDay = Boolean(dto.text && limits.mentionsPerDay !== null);
    const hasBurstLimit = limits.burstCount !== null && limits.burstWindowSeconds !== null;
    const burstWindowMs = hasBurstLimit ? limits.burstWindowSeconds! * 1000 : 0;
    const burstWindowStartTs = hasBurstLimit ? nowTs - burstWindowMs : null;
    const requiredHistoryWindowMs = Math.max(
      needsMessagesPerDay || needsMediaPerDay || needsLinksPerDay || needsMentionsPerDay ? dayWindowMs : 0,
      needsMessagesPerHour ? hourWindowMs : 0,
      hasBurstLimit ? burstWindowMs : 0
    );
    const dayStartIso = new Date(dayStartTs).toISOString();
    const hourStartIso = new Date(hourStartTs).toISOString();
    const burstWindowStartIso = burstWindowStartTs !== null ? new Date(burstWindowStartTs).toISOString() : null;
    const historyStartIso = requiredHistoryWindowMs > 0 ? new Date(nowTs - requiredHistoryWindowMs).toISOString() : null;
    const [lastOwnMessage, ownMessages24h]: [Message | undefined, Message[]] = await Promise.all([
      limits.slowmodeSeconds > 0 ? this.db.getLastMessageByAuthor(chatId, userId) : Promise.resolve(undefined),
      historyStartIso ? this.db.listMessagesByAuthorSince(chatId, userId, historyStartIso) : Promise.resolve([])
    ]);

    if (limits.slowmodeSeconds > 0 && lastOwnMessage) {
      const elapsedMs = nowTs - Date.parse(lastOwnMessage.createdAt);
      const requiredMs = limits.slowmodeSeconds * 1000;
      if (elapsedMs < requiredMs) {
        const waitSeconds = Math.ceil((requiredMs - elapsedMs) / 1000);
        throw new HttpException(`Slowmode enabled. Retry in ${waitSeconds}s.`, HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    let hourMessagesCount = 0;
    let dayMessagesCount = 0;
    let mediaTodayCount = 0;
    let linksTodayCount = 0;
    let mentionsTodayCount = 0;
    let burstCountFrom24h = 0;
    for (const message of ownMessages24h) {
      if (needsMessagesPerDay && message.createdAt >= dayStartIso) {
        dayMessagesCount += 1;
      }
      if (needsMessagesPerHour && message.createdAt >= hourStartIso) {
        hourMessagesCount += 1;
      }
      if (needsMediaPerDay && message.media && message.createdAt >= dayStartIso) {
        mediaTodayCount += 1;
      }
      if ((needsLinksPerDay || needsMentionsPerDay) && message.text && message.createdAt >= dayStartIso) {
        if (needsLinksPerDay) {
          linksTodayCount += this.countLinks(message.text);
        }
        if (needsMentionsPerDay) {
          mentionsTodayCount += this.countMentions(message.text);
        }
      }
      if (hasBurstLimit && burstWindowStartIso !== null && message.createdAt >= burstWindowStartIso) {
        burstCountFrom24h += 1;
      }
    }

    if (limits.messagesPerDay !== null && dayMessagesCount + 1 > limits.messagesPerDay) {
      await this.applyExceededLimitAction(chatId, userId, limits, "messages_per_day");
    }
    if (limits.messagesPerHour !== null && hourMessagesCount + 1 > limits.messagesPerHour) {
      await this.applyExceededLimitAction(chatId, userId, limits, "messages_per_hour");
    }
    if (dto.media && limits.mediaPerDay !== null) {
      if (mediaTodayCount + 1 > limits.mediaPerDay) {
        await this.applyExceededLimitAction(chatId, userId, limits, "media_per_day");
      }
    }
    const inputLinksCount = needsLinksPerDay ? this.countLinks(dto.text) : 0;
    if (dto.text && limits.linksPerDay !== null) {
      if (linksTodayCount + inputLinksCount > limits.linksPerDay) {
        await this.applyExceededLimitAction(chatId, userId, limits, "links_per_day");
      }
    }
    const inputMentionsCount = needsMentionsPerDay ? this.countMentions(dto.text) : 0;
    if (dto.text && limits.mentionsPerDay !== null) {
      if (mentionsTodayCount + inputMentionsCount > limits.mentionsPerDay) {
        await this.applyExceededLimitAction(chatId, userId, limits, "mentions_per_day");
      }
    }
    if (limits.burstCount !== null && hasBurstLimit && burstWindowStartTs !== null) {
      if (burstCountFrom24h + 1 > limits.burstCount) {
        await this.applyExceededLimitAction(chatId, userId, limits, "burst_limit");
      }
    }
  }

  private async enrichMessageWithAuthorInfo(chatId: string, message: Message): Promise<MessageView> {
    const [enriched] = await this.enrichMessagesWithAuthorInfo(chatId, [message]);
    return enriched ?? message;
  }

  async sanitizeDeletedMessageForUser(chatId: string, requestUser: RequestUser, message: MessageView): Promise<MessageView> {
    if (!message.isDeleted) {
      return message;
    }

    const member = await this.db.getMember(chatId, requestUser.userId);
    if (!member) {
      return this.maskDeletedMessageContent(message);
    }

    return this.sanitizeDeletedMessageForMember(chatId, member, message);
  }

  private async sanitizeDeletedMessageForMember(chatId: string, member: ChatMember, message: MessageView): Promise<MessageView> {
    if (!message.isDeleted) {
      return message;
    }
    const canViewDeletedContent = await this.policy.hasPermission(chatId, member, MESSAGE_DELETED_VIEW_PERMISSION);
    if (canViewDeletedContent) {
      return message;
    }
    return this.maskDeletedMessageContent(message);
  }

  private maskDeletedMessageContent(message: MessageView): MessageView {
    if (!message.isDeleted) {
      return message;
    }

    return {
      ...message,
      text: undefined,
      media: null,
      customSignature: null,
      encryptedPayload: null
    };
  }

  private async enrichMessagesWithAuthorInfo(chatId: string, messages: Message[]): Promise<MessageView[]> {
    if (messages.length === 0) {
      return [];
    }

    const userIds = new Set<string>();
    const identityIds = new Set<string>();

    for (const message of messages) {
      if (message.displayAuthorType === "user") {
        userIds.add(message.displayAuthorId);
        userIds.add(message.authorId);
      } else {
        identityIds.add(message.displayAuthorId);
      }
    }

    const usersById = new Map<string, Awaited<ReturnType<DatabaseService["getUserById"]>>>();
    await Promise.all(
      Array.from(userIds).map(async (userId) => {
        usersById.set(userId, await this.db.getUserById(userId));
      })
    );

    let identityNameById = new Map<string, string>();
    if (identityIds.size > 0) {
      const identities = await this.db.listIdentities(chatId);
      identityNameById = new Map(identities.map((identity) => [identity.id, identity.name]));
    }

    const members = await this.db.listMembers(chatId);
    const memberByUserId = new Map(members.map((entry) => [entry.userId, entry] as const));
    const roleIds = Array.from(new Set(members.map((entry) => entry.roleId)));
    const roles = await Promise.all(
      roleIds.map(async (roleId) => {
        try {
          return await this.db.getRole(chatId, roleId);
        } catch {
          return null;
        }
      })
    );
    const roleById = new Map(roles.filter((entry): entry is NonNullable<typeof entry> => entry !== null).map((entry) => [entry.id, entry]));

    return messages.map((message) => {
      const member = memberByUserId.get(message.authorId);
      const role = member ? roleById.get(member.roleId) : undefined;
      const authorRoleName = role?.name;
      const authorRoleBadgeEnabled = Boolean(
        role && (role.permissions.includes("*") || role.permissions.includes(ROLE_BADGE_PERMISSION))
      );

      if (message.displayAuthorType === "user") {
        const user = usersById.get(message.displayAuthorId) ?? usersById.get(message.authorId);
        const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
        const displayAuthorName = user?.username ? `@${user.username}` : (fullName || undefined);
        return {
          ...message,
          displayAuthorName,
          displayAuthorUsername: user?.username,
          authorRoleName,
          authorRoleBadgeEnabled
        };
      }

      const identityName = identityNameById.get(message.displayAuthorId);
      return {
        ...message,
        displayAuthorName: identityName,
        authorRoleName,
        authorRoleBadgeEnabled
      };
    });
  }

  private resolveAntiAbuseWindowSeconds(): number {
    const floodWindow = this.parsePositiveInt(this.configService.get<string>("CHAT_FLOOD_WINDOW_SECONDS"), 10);
    const duplicateWindow = this.parsePositiveInt(this.configService.get<string>("CHAT_DUPLICATE_WINDOW_SECONDS"), 120);
    return Math.max(floodWindow, duplicateWindow, 1);
  }

  private assertEncryptedPayloadPolicy(dto: CreateMessageDto): void {
    const payload = dto.encrypted_payload;
    if (!payload) {
      return;
    }

    const normalizedAlgorithm = payload.algorithm.trim().toLowerCase();
    if (!this.allowedE2EMessageAlgorithms.has(normalizedAlgorithm)) {
      throw new BadRequestException(`Unsupported encrypted payload algorithm: ${payload.algorithm}`);
    }

    this.assertBase64Like(payload.ciphertext, "encrypted_payload.ciphertext");
    this.assertBase64Like(payload.nonce, "encrypted_payload.nonce");
    if (payload.aad) {
      this.assertBase64Like(payload.aad, "encrypted_payload.aad");
    }
  }

  private buildEncryptedFingerprint(payload: NonNullable<CreateMessageDto["encrypted_payload"]>): string {
    return [payload.version, payload.algorithm, payload.key_id ?? "", payload.nonce, payload.ciphertext].join("|");
  }

  private assertBase64Like(value: string, fieldName: string): void {
    const normalized = value.trim();
    if (!/^[A-Za-z0-9+/=_-]+$/.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be base64/base64url encoded.`);
    }
  }

  private parseCsvSet(raw: string | undefined, fallback: string[]): Set<string> {
    const list = raw
      ? raw
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter((item) => item.length > 0)
      : fallback;
    return new Set(list);
  }

  private async applyExceededLimitAction(
    chatId: string,
    userId: string,
    limits: { exceedAction: "warn" | "mute" | "reject"; exceedMuteSeconds: number | null },
    limitKey: string
  ): Promise<never> {
    if (limits.exceedAction === "mute") {
      const muteSeconds = limits.exceedMuteSeconds ?? 300;
      const mutedUntil = new Date(Date.now() + muteSeconds * 1000).toISOString();
      await this.db.updateMemberStatus(chatId, userId, "muted", mutedUntil);
      await this.db.addAuditLog({
        chatId,
        actorId: userId,
        action: "limit.auto_mute",
        targetType: "member",
        targetId: userId,
        payload: {
          limitKey,
          mutedUntil
        }
      });
      throw new ForbiddenException(`Rate limit exceeded (${limitKey}). You are muted until ${mutedUntil}.`);
    }

    if (limits.exceedAction === "warn") {
      await this.db.addAuditLog({
        chatId,
        actorId: userId,
        action: "limit.warn",
        targetType: "member",
        targetId: userId,
        payload: {
          limitKey
        }
      });
      throw new HttpException(`Limit reached (${limitKey}). Warning issued.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    throw new HttpException(`Rate limit exceeded (${limitKey}).`, HttpStatus.TOO_MANY_REQUESTS);
  }

  private countLinks(text?: string): number {
    if (!text) {
      return 0;
    }
    const matches = text.match(/\bhttps?:\/\/[^\s]+/gi);
    return matches ? matches.length : 0;
  }

  private countMentions(text?: string): number {
    if (!text) {
      return 0;
    }
    const matches = text.match(/(^|\s)@[a-zA-Z0-9_]{3,}/g);
    return matches ? matches.length : 0;
  }

  private async applyAutoSanction(chatId: string, member: ChatMember, violation: AntiAbuseViolationError): Promise<never> {
    const enabled = (this.configService.get<string>("CHAT_AUTOSANCTION_ENABLED", "true") ?? "true").toLowerCase() === "true";
    if (!enabled) {
      await this.db.addAuditLog({
        chatId,
        actorId: member.userId,
        action: "anti_abuse.violation",
        targetType: "member",
        targetId: member.userId,
        payload: {
          code: violation.code,
          message: violation.message,
          sanction: "none"
        }
      });
      throw new HttpException(violation.message, violation.statusCode);
    }

    const windowHours = this.parsePositiveInt(this.configService.get<string>("CHAT_AUTOSANCTION_WINDOW_HOURS"), 24);
    const windowStartIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const recentViolationCount = await this.db.countAudit(chatId, {
      action: "anti_abuse.violation",
      targetType: "member",
      targetId: member.userId,
      since: windowStartIso
    });
    const strike = recentViolationCount + 1;
    const sanctionAction = this.resolveSanctionAction(strike);
    const basePayload: Record<string, unknown> = {
      code: violation.code,
      message: violation.message,
      strike,
      sanction: sanctionAction
    };

    if (sanctionAction === "warn") {
      await this.db.addAuditLog({
        chatId,
        actorId: member.userId,
        action: "anti_abuse.violation",
        targetType: "member",
        targetId: member.userId,
        payload: basePayload
      });
      throw new HttpException(`Policy warning: ${violation.message}`, HttpStatus.TOO_MANY_REQUESTS);
    }

    if (sanctionAction === "short_mute" || sanctionAction === "long_mute") {
      const seconds =
        sanctionAction === "short_mute"
          ? this.parsePositiveInt(this.configService.get<string>("CHAT_AUTOSANCTION_SHORT_MUTE_SECONDS"), 300)
          : this.parsePositiveInt(this.configService.get<string>("CHAT_AUTOSANCTION_LONG_MUTE_SECONDS"), 3600);
      const mutedUntil = new Date(Date.now() + seconds * 1000).toISOString();
      const updatedMember = await this.db.updateMemberStatus(chatId, member.userId, "muted", mutedUntil);
      await this.db.addAuditLog({
        chatId,
        actorId: member.userId,
        action: "anti_abuse.violation",
        targetType: "member",
        targetId: member.userId,
        payload: {
          ...basePayload,
          mutedUntil
        }
      });
      this.eventBus.emit("member.updated", updatedMember);
      throw new ForbiddenException(`Anti-abuse sanction applied: muted until ${mutedUntil}.`);
    }

    if (sanctionAction === "ban") {
      const updatedMember = await this.db.updateMemberStatus(chatId, member.userId, "banned", null);
      await this.db.addAuditLog({
        chatId,
        actorId: member.userId,
        action: "anti_abuse.violation",
        targetType: "member",
        targetId: member.userId,
        payload: basePayload
      });
      this.eventBus.emit("member.updated", updatedMember);
      this.eventBus.emit("member.banned", updatedMember);
      throw new ForbiddenException("Anti-abuse sanction applied: banned.");
    }

    await this.db.addAuditLog({
      chatId,
      actorId: member.userId,
      action: "anti_abuse.violation",
      targetType: "member",
      targetId: member.userId,
      payload: basePayload
    });
    throw new ForbiddenException("Anti-abuse violation escalated to manual review.");
  }

  private resolveSanctionAction(strike: number): "warn" | "short_mute" | "long_mute" | "ban" | "manual_review" {
    const step1 = this.parseSanctionAction(this.configService.get<string>("CHAT_AUTOSANCTION_STEP1"), "warn");
    const step2 = this.parseSanctionAction(this.configService.get<string>("CHAT_AUTOSANCTION_STEP2"), "short_mute");
    const step3 = this.parseSanctionAction(this.configService.get<string>("CHAT_AUTOSANCTION_STEP3"), "long_mute");
    const step4 = this.parseSanctionAction(this.configService.get<string>("CHAT_AUTOSANCTION_STEP4"), "ban");

    if (strike <= 1) {
      return step1;
    }
    if (strike === 2) {
      return step2;
    }
    if (strike === 3) {
      return step3;
    }
    return step4;
  }

  private parseSanctionAction(
    rawValue: string | undefined,
    fallback: "warn" | "short_mute" | "long_mute" | "ban" | "manual_review"
  ): "warn" | "short_mute" | "long_mute" | "ban" | "manual_review" {
    const normalized = (rawValue ?? fallback).toLowerCase();
    if (normalized === "warn") {
      return "warn";
    }
    if (normalized === "short_mute") {
      return "short_mute";
    }
    if (normalized === "long_mute") {
      return "long_mute";
    }
    if (normalized === "ban") {
      return "ban";
    }
    if (normalized === "manual_review") {
      return "manual_review";
    }
    return fallback;
  }

  private parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private parseDateQuery(raw: string | undefined, field: "from" | "to" | "before"): number | null {
    if (!raw) {
      return null;
    }
    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(`Invalid ${field} datetime format.`);
    }
    return parsed;
  }

  private buildReactionSummary(
    reactions: Array<{
      reaction: string;
    }>
  ): Array<{ reaction: string; count: number }> {
    const counts = new Map<string, number>();
    for (const entry of reactions) {
      counts.set(entry.reaction, (counts.get(entry.reaction) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([reaction, count]) => ({
        reaction,
        count
      }))
      .sort((a, b) => b.count - a.count || a.reaction.localeCompare(b.reaction));
  }
}

