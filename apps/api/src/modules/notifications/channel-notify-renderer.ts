import type { Message } from "../../core/types.js";

type RenderInput = {
  template: string;
  chatName: string;
  authorName: string;
  messagePreview: string;
  timestamp?: string;
};

export function renderChannelNotifyTemplate(input: RenderInput): string {
  return input.template
    .replaceAll("{chat_name}", input.chatName)
    .replaceAll("{author_name}", input.authorName)
    .replaceAll("{message_preview}", input.messagePreview)
    .replaceAll("{timestamp}", input.timestamp ?? new Date().toISOString());
}

export function buildMessagePreview(message: Pick<Message, "text" | "media">, maxLength = 200): string {
  if (message.text && message.text.trim().length > 0) {
    return message.text.slice(0, maxLength);
  }
  if (message.media) {
    return `[media:${message.media.type}] ${message.media.url}`.slice(0, maxLength);
  }
  return "[empty message]";
}

export function buildInstantChannelNotifyText(authorName: string): string {
  return `${authorName} posted a new message.\nTap the button below to view.`;
}
