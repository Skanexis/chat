import { type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { Avatar, Badge, cn } from "@/design-system/primitives";

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
const LINK_DETECT_REGEX =
  /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|t\.me\/[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/gi;

function isBareDomainCandidate(value: string): boolean {
  return !/^https?:\/\//i.test(value) && !/^www\./i.test(value) && !/^t\.me\//i.test(value);
}

function hasSafeDomainBoundary(text: string, start: number, end: number): boolean {
  const prev = start > 0 ? text[start - 1] ?? "" : "";
  const next = end < text.length ? text[end] ?? "" : "";

  if (prev && /[@\w/]/.test(prev)) {
    return false;
  }
  if (next && /[\w]/.test(next)) {
    return false;
  }
  return true;
}

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
    const end = start + raw.length;
    if (isBareDomainCandidate(raw) && !hasSafeDomainBoundary(text, start, end)) {
      nodes.push(raw);
      lastIndex = end;
      continue;
    }
    const parsed = parseLinkCandidate(raw);
    if (!parsed) {
      nodes.push(raw);
      lastIndex = end;
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
    lastIndex = end;
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
  const SWIPE_REPLY_THRESHOLD = 62;
  const SWIPE_REPLY_MAX_OFFSET = 96;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const swipeWasDraggingRef = useRef(false);
  const swipeProgressRef = useRef(0);
  const [showDeletedContent, setShowDeletedContent] = useState(false);
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const [swipeCueProgress, setSwipeCueProgress] = useState(0);

  const swipeReady = swipeCueProgress >= 0.985;
  const swipeActive = Math.abs(swipeOffsetX) > 0.5;

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

  function resetSwipeState(): void {
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
    swipeWasDraggingRef.current = false;
    swipeProgressRef.current = 0;
    setSwipeOffsetX(0);
    setSwipeCueProgress(0);
  }

  return (
    <article
      className={cn(
        "ds-bubble-wrap",
        item.own ? "is-own" : undefined,
        selected ? "is-selected" : undefined,
        swipeActive ? "is-swiping" : undefined
      )}
    >
      {!item.own ? <Avatar size="sm" name={item.authorName} className="ds-bubble-avatar" /> : null}
      <div
        className={cn(
          "ds-bubble",
          item.own ? "ds-bubble-own" : "ds-bubble-guest",
          swipeActive ? "is-dragging" : undefined,
          swipeReady ? "is-reply-ready" : undefined
        )}
        style={
          swipeActive
            ? {
                transform: `translateX(${swipeOffsetX}px)`
              }
            : undefined
        }
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
          if (swipeWasDraggingRef.current) {
            swipeWasDraggingRef.current = false;
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
          swipeWasDraggingRef.current = false;
          swipeProgressRef.current = 0;
          setSwipeOffsetX(0);
          setSwipeCueProgress(0);
          const touch = event.touches[0];
          swipeStartXRef.current = touch?.clientX ?? null;
          swipeStartYRef.current = touch?.clientY ?? null;
          longPressTimerRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            (onOpenActions ?? onSelect)?.();
          }, 360);
        }}
        onTouchMove={(event) => {
          if (!onReply) {
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

          const horizontalIntent = Math.abs(dx) > Math.abs(dy) * 1.15;
          if (!horizontalIntent) {
            return;
          }

          const directionalDx = item.own ? -dx : dx;
          if (directionalDx <= 0) {
            if (swipeActive) {
              swipeProgressRef.current = 0;
              setSwipeOffsetX(0);
              setSwipeCueProgress(0);
            }
            return;
          }

          const clampedOffset = Math.max(0, Math.min(SWIPE_REPLY_MAX_OFFSET, directionalDx));
          const normalizedProgress = Math.min(1, clampedOffset / SWIPE_REPLY_THRESHOLD);
          swipeWasDraggingRef.current = true;
          swipeProgressRef.current = normalizedProgress;
          setSwipeOffsetX(item.own ? -clampedOffset : clampedOffset);
          setSwipeCueProgress(normalizedProgress);
        }}
        onTouchEnd={() => {
          clearLongPressTimer();
          if (swipeProgressRef.current >= 0.985 && onReply) {
            longPressTriggeredRef.current = true;
            onReply();
          }
          resetSwipeState();
        }}
        onTouchCancel={() => {
          clearLongPressTimer();
          resetSwipeState();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect?.();
          }
        }}
      >
        <div className={cn("ds-reply-swipe-cue", swipeActive ? "is-visible" : undefined, swipeReady ? "is-ready" : undefined)}>
          <span className="ds-reply-swipe-cue-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none">
              <path
                d="M8.3 5.2 4.5 9l3.8 3.8M4.8 9h7.1a4.1 4.1 0 0 1 0 8.2h-2"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
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

// Curated set limited to Unicode 12.0 (2019) and older so every emoji renders
// on older iOS/Android clients too.
const EMOJI_GROUPS: Array<{ label: string; emojis: string[] }> = [
  {
    label: "Smileys",
    emojis: [
      "😀", "😁", "😂", "🤣", "😊", "😇", "🙂", "🙃",
      "😉", "😍", "🥰", "😘", "😋", "😜", "🤪", "😝",
      "🤑", "🤗", "🤭", "🤫", "🤔", "😐", "😶", "🙄",
      "😏", "😴", "🥱", "😪", "😷", "🤒", "🤢", "🤮",
      "🥵", "🥶", "😵", "🤯", "🤠", "🥳", "😎", "🤓",
      "🥺", "😢", "😭", "😱", "😤", "😡", "🤬", "😈"
    ]
  },
  {
    label: "Creatures",
    emojis: [
      "💀", "👻", "👽", "🤖", "👾", "🤡", "👹", "👺",
      "🎃", "😺", "😹", "😻", "🙈", "🙉", "🙊", "🦄",
      "🐙", "🦑", "🦀", "🦞", "🐳", "🦈", "🐸", "🐼",
      "🦊", "🐯", "🦁", "🐵", "🦜", "🦩", "🦚", "🦥"
    ]
  },
  {
    label: "Gestures",
    emojis: [
      "👍", "👎", "👌", "🤏", "✌️", "🤞", "🤟", "🤘",
      "🤙", "👈", "👉", "👆", "👇", "☝️", "✋", "🖖",
      "👋", "🤝", "👏", "🙌", "👐", "🙏", "💪", "🤳"
    ]
  },
  {
    label: "Hearts",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
      "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘"
    ]
  },
  {
    label: "Food & Drink",
    emojis: [
      "🍕", "🍝", "🍔", "🍟", "🌭", "🌮", "🌯", "🥙",
      "🥪", "🍣", "🍱", "🍜", "🍲", "🥘", "🥗", "🍳",
      "🥩", "🥓", "🍗", "🧀", "🥖", "🥐", "🥨", "🧇",
      "🥞", "🍅", "🥑", "🥦", "🌽", "🌶️", "🍄", "🧄",
      "🍋", "🍊", "🍎", "🍓", "🍇", "🍉", "🍒", "🥭",
      "🍍", "🥥", "🍰", "🎂", "🧁", "🥧", "🍮", "🍦",
      "🍩", "🍪", "🍫", "🍿", "☕", "🍵", "🥤", "🍷",
      "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🍾", "🍶"
    ]
  },
  {
    label: "Nature",
    emojis: [
      "🌸", "🌹", "🌻", "🌴", "🌵", "🍀", "🍁", "🌙",
      "🌚", "🌝", "☀️", "🌈", "⭐", "✨", "☄️", "🔥",
      "💧", "🌊", "⚡", "❄️", "☃️", "🌪️", "🌍", "🪐"
    ]
  },
  {
    label: "Fun & Objects",
    emojis: [
      "🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "🎯", "🎲",
      "🎮", "🕹️", "🎭", "🎨", "🎤", "🎧", "🎸", "🥁",
      "🎬", "📸", "🔮", "🧿", "🛸", "🚀", "🧨", "💣",
      "💎", "🔔", "💡", "🔑", "⏰", "📌", "📞", "🧸"
    ]
  },
  {
    label: "Symbols",
    emojis: [
      "💯", "✅", "❌", "⚠️", "❗", "❓", "💤", "💬",
      "♻️", "🔝", "🆗", "🔒", "🔓", "➕", "➖", "🚫"
    ]
  }
];

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
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const emojiPanelRef = useRef<HTMLDivElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    if (!emojiOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent): void {
      const target = event.target instanceof Node ? event.target : null;
      if (target && (emojiPanelRef.current?.contains(target) || emojiButtonRef.current?.contains(target))) {
        return;
      }
      setEmojiOpen(false);
    }

    function handleEscape(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") {
        setEmojiOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [emojiOpen]);

  useEffect(() => {
    if (disabled) {
      setEmojiOpen(false);
    }
  }, [disabled]);

  function insertEmoji(emoji: string): void {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.length;
    const end = textarea?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    if (next.length > 4000) {
      return;
    }
    onChange(next);
    onTyping();
    requestAnimationFrame(() => {
      if (!textarea) {
        return;
      }
      textarea.focus();
      const caret = start + emoji.length;
      textarea.setSelectionRange(caret, caret);
    });
  }

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
      {emojiOpen ? (
        <div className="ds-emoji-panel" ref={emojiPanelRef} role="dialog" aria-label="Emoji picker">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label} className="ds-emoji-group">
              <span className="ds-emoji-group-label">{group.label}</span>
              <div className="ds-emoji-grid">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="ds-emoji-option"
                    onClick={() => insertEmoji(emoji)}
                    aria-label={`Insert ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="ds-composer-glass">
        <button
          ref={emojiButtonRef}
          type="button"
          className={cn("ds-composer-icon ds-composer-icon-emoji", emojiOpen ? "is-active" : undefined)}
          aria-label="Emoji"
          aria-expanded={emojiOpen}
          disabled={disabled || sending}
          onClick={() => setEmojiOpen((open) => !open)}
        />
        <label className="ds-composer-field">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            rows={2}
            maxLength={4000}
            placeholder="Message"
            disabled={disabled || sending}
          />
        </label>
        <div className="ds-composer-side-actions">
          <button type="button" className="ds-composer-icon ds-composer-icon-attach" aria-label="Attachment" disabled />
          <button type="button" className="ds-composer-icon ds-composer-icon-camera" aria-label="Camera" disabled />
          <button
            type="submit"
            className="ds-send-button"
            disabled={disabled || sending || draft.trim().length === 0}
            aria-label="Send message"
          >
            {sending ? <span className="ds-spinner" aria-hidden="true" /> : <span className="ds-send-glyph" aria-hidden="true" />}
          </button>
        </div>
      </div>
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
