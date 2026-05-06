import React from "react";
import { Shield, Users, AlertTriangle } from "lucide-react";
import { Badge, FilterBar, Button } from "../components/ui";
import { MemberCard, AutoSanctionTimeline, CaseLogPanel, ViolationBadge } from "../components/kits/ModerationKit";

export function ModDashboard() {
  const [tab, setTab] = React.useState<"members" | "cases">("members");

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-y-auto font-sans">
      <header className="bg-zinc-950/80 backdrop-blur-xl px-5 py-6 flex flex-col gap-4 border-b border-zinc-800 sticky top-0 z-40">
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
          <Shield className="text-rose-500" size={28} />
          Moderation
        </h1>
        <FilterBar className="bg-transparent border-0 p-0 shadow-none">
          <Button variant={tab === "members" ? "primary" : "secondary"} size="sm" onClick={() => setTab("members")} className="rounded-full gap-2">
            <Users size={14} /> Members
          </Button>
          <Button variant={tab === "cases" ? "primary" : "secondary"} size="sm" onClick={() => setTab("cases")} className="rounded-full gap-2">
            <AlertTriangle size={14} /> Active Cases
          </Button>
        </FilterBar>
      </header>

      <div className="flex-1 p-4 flex flex-col gap-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed bg-opacity-5">
        {tab === "members" && (
          <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2">
            <MemberCard 
              user={{ id: "1", name: "CyberPunk99", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?crop=entropy&cs=tinysrgb&fit=facearea&facepad=2&w=256&h=256&q=80", violations: 3, isOnline: true, joinedAt: "2 weeks ago" }} 
              onAction={console.log} 
            />
            <MemberCard 
              user={{ id: "2", name: "GlitchMaster", avatar: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?crop=entropy&cs=tinysrgb&fit=facearea&facepad=2&w=256&h=256&q=80", violations: 0, isOnline: false, joinedAt: "1 year ago", role: "moderator" }} 
              onAction={console.log} 
            />
            <MemberCard 
              user={{ id: "3", name: "NewUser123", avatar: "https://images.unsplash.com/photo-1527980965255-d3b416303d12?crop=entropy&cs=tinysrgb&fit=facearea&facepad=2&w=256&h=256&q=80", violations: 1, isOnline: true, joinedAt: "Today" }} 
              onAction={console.log} 
            />
          </div>
        )}

        {tab === "cases" && (
          <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h2 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-4">Requires Attention</h2>
              <CaseLogPanel cases={[
                { id: "C-942", status: "open", description: "Multiple users reported NSFW content in #general channel." },
                { id: "C-941", status: "resolved", description: "Spam bot wave detected and banned." }
              ]} />
            </div>

            <div>
              <h2 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-4">Auto-Sanction Log</h2>
              <AutoSanctionTimeline history={[
                { action: "User Muted", reason: "Spam threshold exceeded (15 msgs/min)", date: "10 mins ago", actor: "System" },
                { action: "User Banned", reason: "Phishing link detected in bio", date: "2 hours ago", actor: "System" }
              ]} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
