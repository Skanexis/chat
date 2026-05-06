import React, { useState } from "react";
import { MessageSquare } from "lucide-react";
import { MESSAGES, USERS } from "../mock";
import { Composer, MessageBubble, PinnedBanner, TypingIndicator } from "../components/kits/ChatKit";

export function ChatScreen() {
  const [messages, setMessages] = useState(MESSAGES);
  
  return (
    <div className="flex flex-col h-full bg-zinc-950 font-sans relative">
      <header className="bg-zinc-950/90 backdrop-blur-xl px-5 py-4 flex items-center justify-between border-b border-zinc-800 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-[2px] shadow-[0_0_20px_rgba(124,58,237,0.3)]">
            <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center">
              <MessageSquare className="text-violet-400" size={20} />
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-lg font-black text-white tracking-tight leading-none">Phantom Lab</h1>
            <span className="text-[11px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" /> 
              1,248 Online
            </span>
          </div>
        </div>
      </header>

      <PinnedBanner message="Welcome to Phantom Lab. Please read the community guidelines before posting." />

      <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed bg-opacity-5 scrollbar-none">
        {messages.map((msg, i) => (
          <MessageBubble 
            key={msg.id}
            message={{
              content: msg.content,
              time: msg.time,
              isEdited: i === 1,
              isEncrypted: i === 2,
              reactions: i === 0 ? [{ emoji: "🚀", count: 12, reacted: true }, { emoji: "👀", count: 4, reacted: false }] : []
            }}
            isOwn={msg.author.id === USERS.current.id}
            author={msg.author}
          />
        ))}
      </div>

      <TypingIndicator users={["Alex", "Sarah"]} />
      <Composer onSend={(text) => console.log(text)} />
    </div>
  );
}
