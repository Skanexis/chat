import { Injectable } from "@nestjs/common";
import { EventEmitter } from "node:events";

import type { AutomationExecution, ChatMember, IncidentModeLog, Message, Ticket } from "./types.js";

type DomainEvents = {
  "message.created": Message;
  "message.updated": Message;
  "message.deleted": Message;
  "message.reaction.updated": {
    chatId: string;
    messageId: string;
    summary: Array<{ reaction: string; count: number }>;
  };
  "member.updated": ChatMember;
  "member.banned": ChatMember;
  "ticket.updated": Ticket;
  "automation.rule.executed": AutomationExecution;
  "incident_mode.changed": {
    chatId: string;
    enabled: boolean;
    reason: string;
    state: IncidentModeLog | null;
  };
  "reputation.updated": {
    chatId: string;
    userId: string;
    delta: number;
    score: number;
    reason: string;
    actorId: string;
    eventId: string;
  };
  "thread.subscription.triggered": {
    chatId: string;
    subscriptionId: string;
    subscriberUserId: string;
    triggerMessageId: string;
    sourceMessageId: string;
  };
  "broadcast.state.changed": { chatId: string; campaignId: string; status: string };
  "broadcast.delivery.progress": {
    chatId: string;
    campaignId: string;
    targetCount: number;
    sentCount: number;
    failedCount: number;
  };
};

@Injectable()
export class EventBusService {
  private readonly emitter = new EventEmitter();

  emit<T extends keyof DomainEvents>(event: T, payload: DomainEvents[T]): void {
    this.emitter.emit(event, payload);
  }

  on<T extends keyof DomainEvents>(event: T, listener: (payload: DomainEvents[T]) => void): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }
}
