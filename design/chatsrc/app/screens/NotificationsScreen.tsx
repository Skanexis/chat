import React from "react";
import { Bell, Sparkles, AtSign, Settings2, Info, CheckCircle, ShieldAlert } from "lucide-react";
import { Badge, Card, Button } from "../components/ui";

export function NotificationsScreen() {
  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 font-sans tracking-wide">
      <header className="bg-zinc-950/80 backdrop-blur-xl px-5 py-6 flex items-center justify-between border-b border-zinc-800 sticky top-0 z-40 shadow-sm shrink-0">
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
          <Bell className="text-violet-500 animate-bounce-slow shrink-0" size={28} />
          Alerts
        </h1>
        <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:text-white"><Settings2 size={22} /></Button>
      </header>

      <div className="flex-1 p-5 flex flex-col gap-6 overflow-y-auto bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed bg-opacity-5">
        
        {/* Smart Summary */}
        <Card hoverable className="shrink-0 p-6 bg-gradient-to-br from-violet-950 to-zinc-950 border-violet-900 shadow-[0_0_30px_rgba(124,58,237,0.1)] overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-48 h-48 bg-violet-600/20 blur-3xl rounded-full mix-blend-screen pointer-events-none" />
          <div className="absolute top-4 right-4 opacity-20 transform rotate-12 scale-150 text-violet-400 group-hover:scale-125 transition-transform duration-700">
            <Sparkles size={64} />
          </div>
          
          <h2 className="text-[18px] font-black mb-1 flex items-center gap-2 relative z-10 text-white tracking-tight">
            <Sparkles size={20} className="text-violet-400" />
            AI Summary
          </h2>
          <p className="text-violet-200/70 text-[13px] font-medium mb-5 relative z-10 tracking-wide">
            12 unread messages • Last 24h
          </p>
          
          <div className="bg-zinc-950/60 backdrop-blur-xl border border-violet-500/20 rounded-2xl p-4 flex flex-col gap-4 relative z-10 shadow-inner">
            <SummaryItem icon={<AtSign size={18} />} title="Mentions" desc="Alex requested your review on the Q2 policy thread in #general." />
            <SummaryItem icon={<Info size={18} />} title="Announcements" desc="New compliance guidelines published by HQ." color="fuchsia" />
          </div>
          
          <Button variant="primary" className="w-full mt-5 relative z-10 shadow-[0_0_20px_rgba(124,58,237,0.3)] border-none bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500">
            Acknowledge all
          </Button>
        </Card>

        <div className="flex flex-col gap-2">
          <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest px-1">Log</h2>
          <AlertItem type="system" content="Your profile role was updated to 'Super Admin' by system automation." time="2 days ago" />
          <AlertItem type="mention" content="Elena M. tagged you: '@Admin Alex could you check the limits?'" time="2 days ago" />
          <AlertItem type="moderation" content="Message flagged by duplicate detector." time="3 days ago" />
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ icon, title, desc, color = "violet" }: any) {
  const bgColors = {
    violet: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    fuchsia: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30",
  }[color as string];

  return (
    <div className="flex items-start gap-4 border-b border-zinc-800/50 pb-4 last:border-0 last:pb-0">
      <div className={`shrink-0 p-2.5 rounded-xl shadow-inner border ${bgColors}`}>
        {icon}
      </div>
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div className="font-black text-[14px] leading-tight tracking-wide text-white truncate">{title}</div>
        <div className="text-zinc-400 text-[12px] font-medium leading-snug break-words">{desc}</div>
      </div>
    </div>
  );
}

function AlertItem({ type, content, time }: any) {
  const icons = {
    system: <Settings2 size={18} />,
    mention: <AtSign size={18} />,
    moderation: <ShieldAlert size={18} />,
  }[type as string];

  const colors = {
    system: "bg-zinc-800 text-zinc-400 border-zinc-700",
    mention: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    moderation: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  }[type as string];

  return (
    <Card className="shrink-0 p-4 flex items-start gap-4 group cursor-pointer hover:bg-zinc-900/50 transition-colors">
      <div className={`shrink-0 p-2.5 rounded-xl shadow-inner border ${colors} mt-1`}>
        {icons}
      </div>
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <span className="text-[14px] font-bold text-zinc-200 leading-snug group-hover:text-white transition-colors break-words">{content}</span>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">{time}</span>
          {type === "mention" && <Badge variant="outline" className="text-[9px] py-0">Needs Reply</Badge>}
        </div>
      </div>
    </Card>
  );
}
