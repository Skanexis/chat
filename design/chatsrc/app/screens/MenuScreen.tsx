import React from "react";
import { Link } from "react-router";
import { 
  User, 
  Settings, 
  ShieldAlert, 
  BookOpen, 
  LogOut, 
  Ticket, 
  ChevronRight, 
  Layers,
  Award,
  BellRing
} from "lucide-react";
import { USERS } from "../mock";
import { Avatar, Badge, Card } from "../components/ui";

export function MenuScreen() {
  const isAdmin = USERS.current.role === "super_admin" || USERS.current.role === "admin";
  const isMod = isAdmin || USERS.current.role === "moderator";

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-y-auto font-sans tracking-wide">
      <header className="bg-zinc-950/80 backdrop-blur-xl px-5 py-6 border-b border-zinc-800 sticky top-0 z-40 shadow-sm">
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
          App Menu
        </h1>
      </header>

      <div className="p-5 flex flex-col gap-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed bg-opacity-5">
        
        {/* User Card */}
        <Card hoverable className="p-5 flex items-center gap-5 relative group cursor-pointer border-zinc-800 bg-zinc-900 shadow-xl overflow-hidden transition-all duration-300">
          <div className="absolute right-0 top-0 w-32 h-32 bg-violet-600/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-125 blur-2xl" />
          <div className="relative">
            <Avatar src={USERS.current.avatar} alt="Profile" size="lg" role={USERS.current.role} />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-zinc-900 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
          </div>
          <div className="flex flex-col relative z-10">
            <span className="text-xl font-black text-white tracking-tight">{USERS.current.name}</span>
            <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mt-1 bg-violet-500/10 px-2 py-0.5 rounded-md border border-violet-500/20 inline-block w-max">
              {USERS.current.role.replace("_", " ")}
            </span>
          </div>
        </Card>

        {/* Admin/Mod Settings Group */}
        {(isAdmin || isMod) && (
          <div className="flex flex-col gap-2">
            <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest px-1">Management</h2>
            <Card className="border border-zinc-800 shadow-lg overflow-hidden group">
              {isAdmin && <MenuItem to="/admin" icon={<Settings />} label="Control Panel" desc="Roles, Rules, Limits, Analytics" />}
              {isMod && <MenuItem to="/mod" icon={<ShieldAlert />} label="Moderation HQ" desc="Queue, Cases, Auto-actions" />}
            </Card>
          </div>
        )}

        {/* General Settings Group */}
        <div className="flex flex-col gap-2">
          <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest px-1">Workspace</h2>
          <Card className="border border-zinc-800 shadow-lg overflow-hidden group">
            <MenuItem to="#" icon={<User />} label="Profile & Limits" desc="View your daily usage and tags" />
            <MenuItem to="#" icon={<Award />} label="Reputation" desc="Badges and points: 1,450 XP" />
            <MenuItem to="#" icon={<BookOpen />} label="Knowledge Base" desc="Enterprise guidelines and rules" />
            <MenuItem to="#" icon={<Ticket />} label="Support Tickets" desc="Active requests: 1 Open" />
            <MenuItem to="#" icon={<Layers />} label="Temporary Rooms" desc="Active events and breakouts" />
            <MenuItem to="#" icon={<BellRing />} label="Keyword Alerts" desc="Manage thread subscriptions" />
          </Card>
        </div>

        <div className="mt-4 flex justify-center pb-8">
          <button className="flex items-center gap-2 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 font-bold px-6 py-3 rounded-full transition-all uppercase tracking-widest text-[11px] border border-transparent hover:border-rose-500/20">
            <LogOut size={16} /> Sign out session
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuItem({ to, icon, label, desc }: any) {
  return (
    <Link to={to} className="flex items-center gap-4 p-4 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/50 transition-colors group relative overflow-hidden">
      <div className="absolute left-0 top-0 w-1 h-full bg-violet-500 opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_15px_rgba(124,58,237,0.5)]" />
      <div className="p-3 bg-zinc-950 border border-zinc-800 text-zinc-400 rounded-xl group-hover:bg-violet-500/20 group-hover:text-violet-400 group-hover:border-violet-500/30 transition-all shadow-inner">
        {React.cloneElement(icon, { size: 20 })}
      </div>
      <div className="flex-1 flex flex-col gap-0.5">
        <span className="text-[15px] font-bold text-white tracking-tight group-hover:text-violet-100 transition-colors">{label}</span>
        <span className="text-[12px] font-medium text-zinc-500 group-hover:text-violet-300/70 transition-colors">{desc}</span>
      </div>
      <ChevronRight size={18} className="text-zinc-600 group-hover:text-violet-400 group-hover:translate-x-1 transition-all" />
    </Link>
  );
}
