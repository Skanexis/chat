import React, { useState } from "react";
import { Badge, Button, Card, cn } from "../ui";
import { AlertCircle, CalendarClock, Edit3, MessageSquare, Plus, Save, Sparkles, Trash2, X, Check, ChevronDown, ChevronUp } from "lucide-react";

// DraftPanel
export function DraftPanel({ drafts, onResume, onDelete }: { drafts: any[], onResume: (id: string) => void, onDelete: (id: string) => void }) {
  if (!drafts.length) return <div className="text-zinc-500 text-sm italic py-4">No saved drafts.</div>;
  return (
    <div className="flex flex-col gap-2">
      {drafts.map(d => (
        <Card key={d.id} className="p-3 bg-zinc-900 border border-zinc-800 flex gap-3 hover:border-violet-500/50 transition-colors group">
          <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0 text-violet-400">
            <Edit3 size={14} />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest mb-0.5">Saved {d.timeAgo}</span>
            <span className="text-sm text-zinc-300 truncate">{d.content}</span>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="icon" variant="primary" onClick={() => onResume(d.id)} className="h-8 w-8"><Edit3 size={14} /></Button>
            <Button size="icon" variant="danger" onClick={() => onDelete(d.id)} className="h-8 w-8"><Trash2 size={14} /></Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ScheduledQueue
export function ScheduledQueue({ items, onCancel }: { items: any[], onCancel: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map(item => (
        <Card key={item.id} className="p-4 bg-zinc-900 border-l-4 border-blue-500 flex justify-between items-start group hover:bg-zinc-800/50 transition-colors">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <CalendarClock size={16} className="text-blue-400" />
              <span className="text-sm font-bold text-white">{item.time}</span>
              <Badge variant="info" className="py-0 uppercase tracking-widest">Scheduled</Badge>
            </div>
            <span className="text-sm text-zinc-400 font-medium">{item.content}</span>
          </div>
          <Button variant="danger" size="sm" onClick={() => onCancel(item.id)} className="opacity-0 group-hover:opacity-100 transition-opacity gap-1.5 h-8">
            <Trash2 size={12} /> Cancel
          </Button>
        </Card>
      ))}
      <Button variant="outline" className="border-dashed py-6 text-zinc-500 hover:text-blue-400 hover:border-blue-500 gap-2">
        <Plus size={18} /> Schedule New Message
      </Button>
    </div>
  );
}

// UnreadSummaryCard
export function UnreadSummaryCard({ summary, count }: { summary: string, count: number }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = summary.length > 120;

  return (
    <Card className="p-4 bg-gradient-to-br from-violet-900/40 to-fuchsia-900/20 border border-violet-500/30 shadow-[0_10px_30px_rgba(124,58,237,0.15)] relative overflow-hidden transition-all duration-300">
      <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4 pointer-events-none">
        <Sparkles size={120} />
      </div>
      <div className="flex items-center justify-between mb-3 relative z-10">
        <h3 className="text-xs font-black uppercase tracking-widest text-violet-300 flex items-center gap-1.5">
          <Sparkles size={14} className="text-fuchsia-400" /> Catch Up Summary
        </h3>
        <Badge variant="default" className="bg-violet-500 text-white font-bold h-5 px-1.5 shadow-[0_0_10px_rgba(124,58,237,0.5)]">
          {count} unread
        </Badge>
      </div>
      <div className="relative z-10">
        <p className={cn("text-sm text-zinc-200 leading-relaxed font-medium transition-all duration-300", !expanded && isLong && "line-clamp-3")}>
          {summary}
        </p>
        {isLong && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs font-bold text-violet-400 mt-2 hover:text-violet-300 flex items-center gap-1 transition-colors">
            {expanded ? <><ChevronUp size={14} /> Show less</> : <><ChevronDown size={14} /> Read more</>}
          </button>
        )}
      </div>
      <div className="mt-4 flex justify-end relative z-10 pt-3 border-t border-violet-500/20">
        <Button variant="secondary" size="sm" className="h-8 gap-2 bg-zinc-900/80 hover:bg-violet-600 border-zinc-700 hover:border-violet-500 text-zinc-300 hover:text-white transition-colors">
          <MessageSquare size={14} /> Jump to first unread
        </Button>
      </div>
    </Card>
  );
}

// KeywordAlertManager
export function KeywordAlertManager({ keywords, onToggle, onRemove, onAdd }: { keywords: any[], onToggle: (id: string) => void, onRemove: (id: string) => void, onAdd: (word: string) => void }) {
  const [newKeyword, setNewKeyword] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {keywords.map(k => (
          <div key={k.id} className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium transition-colors group cursor-pointer",
            k.active ? "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:border-amber-500/60" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700"
          )} onClick={() => onToggle(k.id)}>
            <AlertCircle size={14} className={k.active ? "text-amber-500" : "opacity-50"} />
            {k.word}
            <div className="w-px h-4 bg-current opacity-20 mx-1" />
            <span className="text-xs font-bold bg-black/20 px-1.5 py-0.5 rounded">{k.hits}</span>
            <button onClick={(e) => { e.stopPropagation(); onRemove(k.id); }} className="ml-1 opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-all p-0.5 rounded hover:bg-rose-500/10">
              <X size={14} />
            </button>
          </div>
        ))}
        
        {isAdding ? (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl border bg-zinc-900 border-zinc-700 focus-within:border-amber-500/50 transition-colors">
             <input 
               autoFocus 
               value={newKeyword} 
               onChange={e => setNewKeyword(e.target.value)} 
               onKeyDown={e => {
                 if (e.key === 'Enter' && newKeyword.trim()) {
                   onAdd(newKeyword.trim());
                   setNewKeyword("");
                   setIsAdding(false);
                 } else if (e.key === 'Escape') {
                   setIsAdding(false);
                   setNewKeyword("");
                 }
               }} 
               className="bg-transparent text-sm text-zinc-200 outline-none w-24 placeholder:text-zinc-600" 
               placeholder="keyword..."
             />
             <button onClick={() => {
                 if(newKeyword.trim()) {
                     onAdd(newKeyword.trim());
                 }
                 setNewKeyword("");
                 setIsAdding(false);
             }} className="hover:bg-zinc-800 p-1 rounded-md transition-colors text-zinc-400 hover:text-green-400">
               <Check size={14} />
             </button>
             <button onClick={() => {
                 setIsAdding(false);
                 setNewKeyword("");
             }} className="hover:bg-zinc-800 p-1 rounded-md transition-colors text-zinc-400 hover:text-rose-400">
               <X size={14} />
             </button>
          </div>
        ) : (
          <Button variant="outline" className="border-dashed py-1.5 h-auto rounded-xl text-zinc-500 hover:text-amber-400 hover:border-amber-500/50 gap-2 px-3 transition-colors bg-transparent hover:bg-amber-500/5" onClick={() => setIsAdding(true)}>
            <Plus size={16} /> Add Keyword
          </Button>
        )}
      </div>
    </div>
  );
}
