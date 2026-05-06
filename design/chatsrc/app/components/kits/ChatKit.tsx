import React from "react";
import { Avatar, Badge, Button, cn } from "../ui";
import { Check, CheckCheck, Clock, Edit2, Lock, MoreHorizontal, Paperclip, Pin, Send, User, Users } from "lucide-react";

// MessageMeta
export function MessageMeta({ status, time, isEncrypted, isEdited, isScheduled }: { status: "sent" | "delivered" | "read", time: string, isEncrypted?: boolean, isEdited?: boolean, isScheduled?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-medium ml-2 shrink-0 mt-auto">
      {isEdited && <Edit2 size={10} className="opacity-70" />}
      {isEncrypted && <Lock size={10} className="text-amber-500/70" />}
      {isScheduled && <Clock size={10} className="text-blue-500/70" />}
      {time}
      {status === "sent" && <Check size={12} />}
      {status === "delivered" && <CheckCheck size={12} className="opacity-70" />}
      {status === "read" && <CheckCheck size={12} className="text-violet-400" />}
    </span>
  );
}

// ReactionBar
export function ReactionBar({ reactions, onReact }: { reactions: { emoji: string, count: number, reacted: boolean }[], onReact?: (emoji: string) => void }) {
  if (!reactions || reactions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {reactions.map(r => (
        <button
          key={r.emoji}
          onClick={() => onReact?.(r.emoji)}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors",
            r.reacted 
              ? "bg-violet-500/20 border-violet-500/30 text-violet-300" 
              : "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
          )}
        >
          <span>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
    </div>
  );
}

// MessageBubble
export function MessageBubble({ message, isOwn, author, showAvatar = true }: { message: any, isOwn: boolean, author: any, showAvatar?: boolean }) {
  return (
    <div className={cn("flex gap-3 max-w-[85%]", isOwn ? "self-end flex-row-reverse" : "self-start")}>
      {!isOwn && showAvatar && (
        <Avatar src={author.avatar} alt={author.name} size="sm" className="mt-auto shrink-0 mb-1" />
      )}
      {!isOwn && !showAvatar && <div className="w-8 shrink-0" />}
      
      <div className={cn("flex flex-col gap-1 min-w-0", isOwn ? "items-end" : "items-start")}>
        {!isOwn && showAvatar && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-[12px] font-bold text-violet-400">{author.name}</span>
            {author.role && author.role !== "member" && (
              <Badge variant="outline" className="text-[8px] py-0 px-1.5 leading-tight">{author.role}</Badge>
            )}
          </div>
        )}
        
        <div className={cn(
          "px-4 py-2.5 rounded-2xl relative group break-words text-sm leading-relaxed",
          isOwn 
            ? "bg-violet-600 text-white rounded-br-sm shadow-[0_4px_15px_rgba(124,58,237,0.2)] border border-violet-500/50" 
            : "bg-zinc-900 text-zinc-100 rounded-bl-sm border border-zinc-800 shadow-sm"
        )}>
          {message.content}
          
          <div className="flex justify-end mt-1 -mr-1">
            <MessageMeta 
              time={message.time} 
              status={isOwn ? "read" : "sent"} 
              isEdited={message.isEdited}
              isEncrypted={message.isEncrypted}
            />
          </div>

          <button className={cn(
            "absolute top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-zinc-800 rounded-full border border-zinc-700 text-zinc-300 hover:text-white",
            isOwn ? "-left-10" : "-right-10"
          )}>
            <MoreHorizontal size={14} />
          </button>
        </div>
        
        <ReactionBar reactions={message.reactions} />
      </div>
    </div>
  );
}

// IdentitySwitcher
export function IdentitySwitcher({ currentMode, onChange }: { currentMode: "as_user" | "as_group", onChange: (mode: "as_user" | "as_group") => void }) {
  return (
    <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 shrink-0">
      <button 
        onClick={() => onChange("as_user")}
        className={cn("p-1.5 rounded-lg transition-colors", currentMode === "as_user" ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-zinc-300")}
      >
        <User size={14} />
      </button>
      <button 
        onClick={() => onChange("as_group")}
        className={cn("p-1.5 rounded-lg transition-colors", currentMode === "as_group" ? "bg-fuchsia-600 text-white" : "text-zinc-500 hover:text-zinc-300")}
      >
        <Users size={14} />
      </button>
    </div>
  );
}

// Composer
export function Composer({ onSend }: { onSend?: (text: string, mode: "as_user" | "as_group") => void }) {
  const [text, setText] = React.useState("");
  const [mode, setMode] = React.useState<"as_user" | "as_group">("as_user");

  return (
    <div className="flex flex-col gap-2 p-3 bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-800">
      <div className="flex items-end gap-2">
        <button className="p-3 text-zinc-500 hover:text-violet-400 transition-colors shrink-0">
          <Paperclip size={20} />
        </button>
        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center pr-2 focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/50 transition-all">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Write a message..."
            className="flex-1 bg-transparent border-0 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none resize-none max-h-[120px] min-h-[44px] scrollbar-none"
            rows={1}
          />
          <IdentitySwitcher currentMode={mode} onChange={setMode} />
        </div>
        <Button 
          size="icon" 
          className={cn("rounded-2xl shrink-0 transition-transform", text.trim() ? "scale-100" : "scale-95 opacity-50")}
          onClick={() => {
            if(text.trim()) { onSend?.(text, mode); setText(""); }
          }}
        >
          <Send size={18} />
        </Button>
      </div>
    </div>
  );
}

// PinnedBanner
export function PinnedBanner({ message, onClick }: { message: string, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2 bg-zinc-900/90 border-b border-zinc-800 backdrop-blur-md cursor-pointer hover:bg-zinc-800/80 transition-colors"
    >
      <div className="w-1 h-8 bg-violet-500 rounded-full" />
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-[10px] font-black text-violet-400 uppercase tracking-widest flex items-center gap-1">
          <Pin size={10} /> Pinned Message
        </span>
        <span className="text-xs text-zinc-300 truncate font-medium">{message}</span>
      </div>
    </div>
  );
}

// TypingIndicator
export function TypingIndicator({ users }: { users: string[] }) {
  if (!users || users.length === 0) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-500 font-medium">
      <div className="flex items-center gap-1 bg-zinc-900 px-2 py-1 rounded-full border border-zinc-800">
        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      {users.join(", ")} {users.length > 1 ? "are" : "is"} typing...
    </div>
  );
}
