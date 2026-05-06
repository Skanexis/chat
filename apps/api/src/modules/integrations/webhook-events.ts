import type { WebhookEvent } from "../../core/types.js";

export const WEBHOOK_SUPPORTED_EVENTS: WebhookEvent[] = [
  "message.created",
  "message.updated",
  "message.deleted",
  "member.updated",
  "member.banned",
  "broadcast.state.changed",
  "broadcast.delivery.progress"
];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return WEBHOOK_SUPPORTED_EVENTS.includes(value as WebhookEvent);
}
