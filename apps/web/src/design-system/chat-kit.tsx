import { type ChangeEvent, type FormEvent } from "react";

import { Avatar, Badge, Button, cn } from "@/design-system/primitives";

export type MessageReaction = {
  reaction: string;
  count: number;
};

export type MessageItem = {
  id: string;
  authorName: string;
  authorId: string;
  text: string;
  createdAtLabel: string;
  own: boolean;
  deleted?: boolean;
  encrypted?: boolean;
  edited?: boolean;
  failed?: boolean;
  status?: "pending" | "sent" | "read";
  reactions?: MessageReaction[];
};

type MessageBubbleProps = {
  item: MessageItem;
  onAddReaction: () => void;
  onRemoveReaction: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function MessageBubble({ item, onAddReaction, onRemoveReaction, onEdit, onDelete }: MessageBubbleProps) {
  return (
    <article className={cn("ds-bubble-wrap", item.own ? "is-own" : undefined)}>
      {!item.own ? <Avatar size="sm" name={item.authorName} className="ds-bubble-avatar" /> : null}
      <div className={cn("ds-bubble", item.own ? "ds-bubble-own" : "ds-bubble-guest")}>
        <header className="ds-bubble-head">
          <span>{item.own ? "You" : item.authorName}</span>
          <time>{item.createdAtLabel}</time>
        </header>
        <p className={cn("ds-bubble-text", item.failed ? "is-failed" : undefined)}>{item.text}</p>
        <footer className="ds-bubble-foot">
          <div className="ds-meta-row">
            {item.edited ? <Badge variant="neutral">edited</Badge> : null}
            {item.encrypted ? <Badge variant="warning">encrypted</Badge> : null}
            {item.deleted ? <Badge variant="danger">deleted</Badge> : null}
            {item.status === "pending" ? <Badge variant="neutral">sending</Badge> : null}
          </div>
          <div className="ds-action-row">
            <button type="button" onClick={onAddReaction} disabled={item.deleted}>
              +👍
            </button>
            <button type="button" onClick={onRemoveReaction} disabled={item.deleted}>
              -👍
            </button>
            {item.own && !item.deleted && !item.encrypted ? (
              <>
                <button type="button" onClick={onEdit}>
                  edit
                </button>
                <button type="button" onClick={onDelete}>
                  delete
                </button>
              </>
            ) : null}
          </div>
          {item.reactions && item.reactions.length > 0 ? (
            <div className="ds-reaction-row">
              {item.reactions.map((reaction) => (
                <span key={`${item.id}:${reaction.reaction}`} className="ds-reaction-pill">
                  {reaction.reaction} {reaction.count}
                </span>
              ))}
            </div>
          ) : null}
        </footer>
      </div>
    </article>
  );
}

export function PinnedBanner({ message }: { message: string }) {
  return (
    <div className="ds-pinned-banner">
      <span className="ds-pinned-flag">PINNED</span>
      <p>{message}</p>
    </div>
  );
}

export function TypingIndicator({ users }: { users: string[] }) {
  if (users.length === 0) {
    return null;
  }

  return (
    <div className="ds-typing" aria-live="polite">
      <span className="ds-typing-dot" />
      <span className="ds-typing-dot" />
      <span className="ds-typing-dot" />
      <span>{users.join(", ")} typing...</span>
    </div>
  );
}

export type SenderModeValue = "as_user" | "as_group" | "as_role_profile";

type SenderOption = {
  value: SenderModeValue;
  label: string;
  disabled?: boolean;
};

type ComposerProps = {
  draft: string;
  sending: boolean;
  disabled?: boolean;
  senderMode: SenderModeValue;
  senderOptions: SenderOption[];
  onSenderModeChange: (value: SenderModeValue) => void;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTyping: () => void;
};

export function Composer({
  draft,
  sending,
  disabled = false,
  senderMode,
  senderOptions,
  onSenderModeChange,
  onChange,
  onSubmit,
  onTyping
}: ComposerProps) {
  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange(event.target.value);
    onTyping();
  }

  return (
    <form className="ds-composer" onSubmit={onSubmit}>
      <div className="ds-mode-switch" role="tablist" aria-label="Sender mode">
        {senderOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={senderMode === option.value}
            className={cn("ds-mode-btn", senderMode === option.value ? "is-active" : undefined)}
            disabled={option.disabled || disabled}
            onClick={() => onSenderModeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="ds-composer-field">
        <textarea
          value={draft}
          onChange={handleChange}
          rows={2}
          maxLength={4000}
          placeholder="Write a message..."
          disabled={disabled || sending}
        />
      </label>
      <Button type="submit" loading={sending} disabled={disabled || draft.trim().length === 0}>
        Send
      </Button>
    </form>
  );
}

export type AppTab = "chat" | "saved" | "alerts" | "moderation" | "admin";

type TabItem = {
  value: AppTab;
  label: string;
  badge?: number;
};

export function BottomTabs({
  items,
  active,
  onChange
}: {
  items: TabItem[];
  active: AppTab;
  onChange: (value: AppTab) => void;
}) {
  return (
    <nav className="ds-bottom-tabs" aria-label="App sections">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={cn("ds-tab-btn", active === item.value ? "is-active" : undefined)}
          onClick={() => onChange(item.value)}
        >
          <span>{item.label}</span>
          {item.badge && item.badge > 0 ? <i>{item.badge}</i> : null}
        </button>
      ))}
    </nav>
  );
}
