import { BadRequestException, Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { EventBusService } from "../../core/event-bus.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { Message, RequestUser, ThreadSubscription } from "../../core/types.js";
import type { CreateThreadSubscriptionDto } from "./thread-subscriptions.dto.js";

@Injectable()
export class ThreadSubscriptionsService implements OnModuleDestroy {
  private readonly detachMessageCreated: () => void;
  private triggerChain: Promise<void> = Promise.resolve();

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly eventBus: EventBusService,
    private readonly configService: ConfigService
  ) {
    this.detachMessageCreated = this.eventBus.on("message.created", (message) => {
      this.triggerChain = this.triggerChain.then(() => this.handleMessageCreated(message)).catch(() => undefined);
    });
  }

  onModuleDestroy(): void {
    this.detachMessageCreated();
  }

  async createThreadSubscription(
    chatId: string,
    requestUser: RequestUser,
    dto: CreateThreadSubscriptionDto
  ): Promise<ThreadSubscription> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "thread.subscription.manage");

    const message = await this.db.getMessage(chatId, dto.message_id);
    if (message.isDeleted) {
      throw new BadRequestException("Cannot subscribe to deleted message.");
    }

    const subscriptionType = dto.subscription_type ?? "thread";
    const dedupWindowSeconds = dto.dedup_window_seconds ?? this.parsePositiveInt(this.configService.get<string>("THREAD_SUBSCRIPTION_DEDUP_SECONDS"), 300);
    const telegramNotify = dto.telegram_notify ?? false;

    const existing = await this.db.getThreadSubscriptionByKey(chatId, requestUser.userId, dto.message_id, subscriptionType);
    if (existing) {
      const updated = await this.db.updateThreadSubscription(chatId, existing.id, {
        isActive: true,
        telegramNotify,
        dedupWindowSeconds
      });
      await this.db.addAuditLog({
        chatId,
        actorId: requestUser.userId,
        action: "thread.subscription.update",
        targetType: "thread_subscription",
        targetId: updated.id,
        payload: {
          messageId: updated.messageId,
          subscriptionType: updated.subscriptionType,
          dedup_window_seconds: updated.dedupWindowSeconds,
          telegram_notify: updated.telegramNotify
        }
      });
      return updated;
    }

    const created = await this.db.createThreadSubscription({
      chatId,
      userId: requestUser.userId,
      messageId: dto.message_id,
      subscriptionType,
      telegramNotify,
      dedupWindowSeconds,
      isActive: true
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "thread.subscription.create",
      targetType: "thread_subscription",
      targetId: created.id,
      payload: {
        messageId: created.messageId,
        subscriptionType: created.subscriptionType,
        dedup_window_seconds: created.dedupWindowSeconds,
        telegram_notify: created.telegramNotify
      }
    });

    return created;
  }

  async listThreadSubscriptions(chatId: string, requestUser: RequestUser): Promise<ThreadSubscription[]> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "thread.subscription.manage");
    return this.db.listThreadSubscriptions(chatId, requestUser.userId);
  }

  async deleteThreadSubscription(
    chatId: string,
    subscriptionId: string,
    requestUser: RequestUser
  ): Promise<{ ok: true; subscriptionId: string }> {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanAccess(member);
    await this.policy.assertCan(chatId, member, "thread.subscription.manage");

    const subscription = await this.db.getThreadSubscription(chatId, subscriptionId);
    if (subscription.userId !== requestUser.userId) {
      await this.policy.assertCan(chatId, member, "member.view_list");
    }

    await this.db.deleteThreadSubscription(chatId, subscriptionId);
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "thread.subscription.delete",
      targetType: "thread_subscription",
      targetId: subscriptionId,
      payload: {}
    });

    return {
      ok: true,
      subscriptionId
    };
  }

  private async handleMessageCreated(message: Message): Promise<void> {
    if (!message.replyToId) {
      return;
    }

    const subscriptions = await this.db.listActiveThreadSubscriptionsForChat(message.chatId);
    if (subscriptions.length === 0) {
      return;
    }

    for (const subscription of subscriptions) {
      if (!this.matchesSubscription(message, subscription)) {
        continue;
      }
      if (subscription.userId === message.authorId) {
        continue;
      }
      if (!this.passesDedup(subscription)) {
        continue;
      }

      const now = new Date().toISOString();
      await this.db.updateThreadSubscription(subscription.chatId, subscription.id, {
        lastTriggeredAt: now
      });

      await this.db.addAuditLog({
        chatId: message.chatId,
        actorId: message.actorUserId,
        action: "thread.subscription.trigger",
        targetType: "thread_subscription",
        targetId: subscription.id,
        payload: {
          subscriberUserId: subscription.userId,
          sourceMessageId: subscription.messageId,
          triggerMessageId: message.id,
          telegram_notify: subscription.telegramNotify
        }
      });

      this.eventBus.emit("thread.subscription.triggered", {
        chatId: message.chatId,
        subscriptionId: subscription.id,
        subscriberUserId: subscription.userId,
        sourceMessageId: subscription.messageId,
        triggerMessageId: message.id
      });
    }
  }

  private matchesSubscription(message: Message, subscription: ThreadSubscription): boolean {
    if (!message.replyToId) {
      return false;
    }
    if (message.replyToId !== subscription.messageId) {
      return false;
    }

    if (subscription.subscriptionType === "message") {
      return true;
    }
    return this.matchesThreadSubscription(message, subscription.messageId);
  }

  private matchesThreadSubscription(message: Message, sourceMessageId: string): boolean {
    return message.replyToId === sourceMessageId;
  }

  private passesDedup(subscription: ThreadSubscription): boolean {
    if (!subscription.lastTriggeredAt) {
      return true;
    }

    const lastTs = Date.parse(subscription.lastTriggeredAt);
    if (!Number.isFinite(lastTs)) {
      return true;
    }

    return Date.now() - lastTs >= subscription.dedupWindowSeconds * 1000;
  }

  private parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}
