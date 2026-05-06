import React from "react";
import { Avatar, Badge, Button, cn } from "../ui";
import { AlertOctagon, Ban, Calendar, Clock, EyeOff, Flag, MoreVertical, ShieldAlert, Trash2 } from "lucide-react";

// ViolationBadge
export function ViolationBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge variant={count > 2 ? "danger" : "warning"} className="gap-1 px-1.5 h-5 flex items-center">
      <Flag size={10} />
      {count}
    </Badge>
  );
}

// ModerationActionMenu
export function ModerationActionMenu({ onAction }: { onAction: (action: string) => void }) {
  return (
    <div className="absolute right-0 top-10 mt-1 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1 z-50 flex flex-col min-w-max animate-in fade-in slide-in-from-top-2">
      <ActionItem icon={<EyeOff />} label="Mute 24h" onClick={() => onAction("mute")} />
      <ActionItem icon={<Clock />} label="Timeout 1w" onClick={() => onAction("timeout")} />
      <ActionItem icon={<Trash2 />} label="Delete Recent" onClick={() => onAction("delete")} danger />
      <div className="h-px bg-zinc-800 my-1 mx-2" />
      <ActionItem icon={<Ban />} label="Ban User" onClick={() => onAction("ban")} danger />
    </div>
  );
}

function ActionItem({ icon, label, onClick, danger }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-zinc-800/50",
        danger ? "text-rose-400 hover:text-rose-300" : "text-zinc-300 hover:text-white"
      )}
    >
      {React.cloneElement(icon, { size: 16 })}
      {label}
    </button>
  );
}

// MemberCard
export function MemberCard({ user, onAction }: { user: any, onAction: (id: string, action: string) => void }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  
  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50 hover:border-violet-500/30 transition-colors group relative">
      <Avatar src={user.avatar} alt={user.name} size="md" isOnline={user.isOnline} />
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white truncate">{user.name}</span>
          <ViolationBadge count={user.violations || 0} />
          {user.role && user.role !== "member" && (
            <Badge variant="outline" className="text-[9px] py-0 px-1">{user.role}</Badge>
          )}
        </div>
        <span className="text-xs text-zinc-500 truncate flex items-center gap-1">
          <Calendar size={10} className="opacity-50" /> Joined {user.joinedAt}
        </span>
      </div>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8 text-zinc-500 hover:text-violet-400"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <MoreVertical size={16} />
      </Button>
      {menuOpen && (
        <ModerationActionMenu onAction={(action) => { setMenuOpen(false); onAction(user.id, action); }} />
      )}
    </div>
  );
}

// AutoSanctionTimeline
export function AutoSanctionTimeline({ history }: { history: any[] }) {
  return (
    <div className="flex flex-col gap-0 border-l-2 border-zinc-800/50 ml-4 py-2">
      {history.map((event, idx) => (
        <div key={idx} className="relative pl-6 pb-6 last:pb-0">
          <div className="absolute left-[-5px] top-1 w-2 h-2 rounded-full bg-rose-500 ring-4 ring-zinc-950 shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
          <div className="bg-rose-500/5 border border-rose-500/10 p-3 rounded-xl flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-widest text-rose-400 flex items-center gap-1.5">
              <ShieldAlert size={12} /> {event.action}
            </span>
            <span className="text-sm text-zinc-300 font-medium">{event.reason}</span>
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{event.date} • by {event.actor}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// CaseLogPanel
export function CaseLogPanel({ cases }: { cases: any[] }) {
  return (
    <div className="flex flex-col gap-3">
      {cases.map((c, i) => (
        <div key={i} className="flex gap-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800/50 relative overflow-hidden">
          <div className={cn("absolute left-0 top-0 bottom-0 w-1", c.status === "open" ? "bg-amber-500" : "bg-emerald-500")} />
          <div className="w-10 h-10 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0">
            <AlertOctagon size={18} className={c.status === "open" ? "text-amber-500" : "text-emerald-500"} />
          </div>
          <div className="flex flex-col flex-1 gap-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-white">Case #{c.id}</span>
              <Badge variant={c.status === "open" ? "warning" : "success"}>{c.status}</Badge>
            </div>
            <span className="text-xs text-zinc-400 leading-relaxed font-medium">{c.description}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
