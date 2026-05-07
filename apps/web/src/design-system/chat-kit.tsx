import { type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { Avatar, Badge, Button, cn } from "@/design-system/primitives";

export type MessageReaction = {
  reaction: string;
  count: number;
};

export type MessageItem = {
  id: string;
  authorName: string;
  authorId: string;
  roleBadgeText?: string;
  replyTo?: {
    author: string;
    text: string;
  } | null;
  text: string;
  deletedOriginalText?: string;
  canRevealDeletedContent?: boolean;
  createdAtLabel: string;
  own: boolean;
  deleted?: boolean;
  encrypted?: boolean;
  edited?: boolean;
  failed?: boolean;
  canDelete?: boolean;
  status?: "pending" | "sent" | "read";
  reactions?: MessageReaction[];
};

type MessageBubbleProps = {
  item: MessageItem;
  selected?: boolean;
  selectedReaction?: string;
  onSelect?: () => void;
  onOpenActions?: () => void;
  onReply?: () => void;
  onAddReaction: (reaction: string) => void | Promise<void>;
  onRemoveReaction: () => void | Promise<void>;
  onEdit?: () => void;
  onDelete?: () => void;
};

const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "😮", "👏"] as const;
const LINK_DETECT_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|t\.me\/[^\s<>"']+)/gi;

function parseLinkCandidate(raw: string): { href: string; label: string; suffix: string } | null {
  let label = raw;
  let suffix = "";
  while (label.length > 0) {
    const last = label.at(-1);
    if (!last || !".,!?;:)]}".includes(last)) {
      break;
    }
    if (last === ")") {
      const openCount = (label.match(/\(/g) ?? []).length;
      const closeCount = (label.match(/\)/g) ?? []).length;
      if (closeCount <= openCount) {
        break;
      }
    }
    label = label.slice(0, -1);
    suffix = `${last}${suffix}`;
  }
  if (label.length === 0) {
    return null;
  }
  const href = /^https?:\/\//i.test(label) ? label : `https://${label}`;
  if (!/^https?:\/\//i.test(href)) {
    return null;
  }
  return { href, label, suffix };
}

function renderTextWithLinks(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(LINK_DETECT_REGEX)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }
    const raw = match[0] ?? "";
    const parsed = parseLinkCandidate(raw);
    if (!parsed) {
      nodes.push(raw);
      lastIndex = start + raw.length;
      continue;
    }
    nodes.push(
      <a
        key={`lnk:${start}:${parsed.href}`}
        className="ds-inline-link"
        href={parsed.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {parsed.label}
      </a>
    );
    if (parsed.suffix) {
      nodes.push(parsed.suffix);
    }
    lastIndex = start + raw.length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export function MessageBubble({
  item,
  selected = false,
  selectedReaction,
  onSelect,
  onOpenActions,
  onReply,
  onAddReaction,
  onRemoveReaction,
  onEdit,
  onDelete
}: MessageBubbleProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const swipeTriggeredRef = useRef(false);
  const [showDeletedContent, setShowDeletedContent] = useState(false);

  function clearLongPressTimer(): void {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function isCoarsePointer(): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(pointer: coarse)").matches;
  }

  return (
    <article className={cn("ds-bubble-wrap", item.own ? "is-own" : undefined, selected ? "is-selected" : undefined)}>
      {!item.own ? <Avatar size="sm" name={item.authorName} className="ds-bubble-avatar" /> : null}
      <div
        className={cn("ds-bubble", item.own ? "ds-bubble-own" : "ds-bubble-guest")}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (isCoarsePointer()) {
            return;
          }
          if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
          }
          onSelect?.();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          (onOpenActions ?? onSelect)?.();
        }}
        onTouchStart={(event) => {
          clearLongPressTimer();
          longPressTriggeredRef.current = false;
          swipeTriggeredRef.current = false;
          const touch = event.touches[0];
          swipeStartXRef.current = touch?.clientX ?? null;
          swipeStartYRef.current = touch?.clientY ?? null;
          longPressTimerRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            (onOpenActions ?? onSelect)?.();
          }, 360);
        }}
        onTouchMove={(event) => {
          if (swipeTriggeredRef.current || !onReply) {
            return;
          }
          const touch = event.touches[0];
          if (!touch) {
            return;
          }
          if (swipeStartXRef.current === null || swipeStartYRef.current === null) {
            return;
          }
          const dx = touch.clientX - swipeStartXRef.current;
          const dy = touch.clientY - swipeStartYRef.current;
          if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            clearLongPressTimer();
          }
          const directionMatch = item.own ? dx <= -62 : dx >= 62;
          if (directionMatch && Math.abs(dx) > Math.abs(dy) * 1.3) {
            swipeTriggeredRef.current = true;
            longPressTriggeredRef.current = true;
            clearLongPressTimer();
            onReply();
          }
        }}
        onTouchEnd={() => {
          clearLongPressTimer();
          swipeStartXRef.current = null;
          swipeStartYRef.current = null;
        }}
        onTouchCancel={() => {
          clearLongPressTimer();
          swipeStartXRef.current = null;
          swipeStartYRef.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect?.();
          }
        }}
      >
        {selected && !item.deleted ? (
          <div
            className="ds-bubble-popover"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="ds-reaction-picker ds-selected-tools">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={`${item.id}:quick:${emoji}`}
                  type="button"
                  className={cn("ds-reaction-btn", selectedReaction === emoji ? "is-active" : undefined)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (selectedReaction === emoji) {
                      void onRemoveReaction();
                      return;
                    }
                    void onAddReaction(emoji);
                  }}
                  aria-label={`React ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {(item.own && !item.encrypted) || item.canDelete ? (
              <div className="ds-action-row ds-selected-tools ds-popover-actions">
                {item.own && !item.encrypted ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit?.();
                    }}
                  >
                    Edit
                  </button>
                ) : null}
                {item.canDelete ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete?.();
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <header className="ds-bubble-head">
          <div className="ds-bubble-author-line">
            <span className="ds-author-name">{item.own ? "You" : item.authorName}</span>
            {item.roleBadgeText ? <span className="ds-role-tag">{item.roleBadgeText}</span> : null}
          </div>
          <time className="ds-bubble-time">{item.createdAtLabel}</time>
        </header>
        {item.replyTo ? (
          <div className="ds-bubble-reply">
            <strong>{item.replyTo.author}</strong>
            <p>{renderTextWithLinks(item.replyTo.text)}</p>
          </div>
        ) : null}
        {item.deleted ? (
          <div className="ds-bubble-deleted">
            <button
              type="button"
              className="ds-bubble-deleted-toggle"
              onClick={(event) => {
                event.stopPropagation();
                if (!item.canRevealDeletedContent) {
                  return;
                }
                setShowDeletedContent((prev) => !prev);
              }}
              aria-expanded={item.canRevealDeletedContent ? showDeletedContent : undefined}
            >
              {item.text}
            </button>
            {item.canRevealDeletedContent ? (
              <p className="ds-bubble-deleted-hint">
                {showDeletedContent ? "Nascondi testo originale" : "Tocca per vedere il testo originale"}
              </p>
            ) : null}
            {item.canRevealDeletedContent && showDeletedContent && item.deletedOriginalText ? (
              <p className="ds-bubble-text ds-bubble-text-deleted-original">{renderTextWithLinks(item.deletedOriginalText)}</p>
            ) : null}
          </div>
        ) : (
          <p className={cn("ds-bubble-text", item.failed ? "is-failed" : undefined)}>{renderTextWithLinks(item.text)}</p>
        )}
        <footer className="ds-bubble-foot">
          <div className="ds-meta-row">
            {item.edited ? <Badge variant="neutral">edited</Badge> : null}
            {item.encrypted ? <Badge variant="warning">encrypted</Badge> : null}
            {item.deleted ? <Badge variant="danger">deleted</Badge> : null}
            {item.status === "pending" ? <Badge variant="neutral">sending</Badge> : null}
          </div>
          {item.reactions && item.reactions.length > 0 ? (
            <div className="ds-reaction-row">
              {item.reactions.map((reaction) => (
                <button
                  key={`${item.id}:${reaction.reaction}`}
                  type="button"
                  className={cn("ds-reaction-pill", selectedReaction === reaction.reaction ? "is-active" : undefined)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (selectedReaction === reaction.reaction) {
                      void onRemoveReaction();
                      return;
                    }
                    void onAddReaction(reaction.reaction);
                  }}
                >
                  {reaction.reaction} {reaction.count}
                </button>
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
  replyPreview?: {
    author: string;
    text: string;
  } | null;
  onCancelReply?: () => void;
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
  replyPreview = null,
  onCancelReply,
  senderMode,
  senderOptions,
  onSenderModeChange,
  onChange,
  onSubmit,
  onTyping
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function resizeTextarea(): void {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "0px";
    const maxHeight = Math.floor(window.innerHeight * 0.33);
    const next = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${Math.max(56, next)}px`;
  }

  useEffect(() => {
    resizeTextarea();
  }, [draft]);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange(event.target.value);
    onTyping();
    resizeTextarea();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    if (isTouchDevice) {
      return;
    }

    event.preventDefault();
    if (disabled || sending || draft.trim().length === 0) {
      return;
    }
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form className="ds-composer" onSubmit={onSubmit}>
      {replyPreview ? (
        <div className="ds-reply-preview">
          <div className="ds-reply-preview-body">
            <strong>Reply to {replyPreview.author}</strong>
            <p>{replyPreview.text}</p>
          </div>
          <button type="button" className="ds-reply-preview-cancel" onClick={onCancelReply}>
            Cancel
          </button>
        </div>
      ) : null}
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
          ref={textareaRef}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
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
