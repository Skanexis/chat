import React from "react";
import { Outlet, NavLink } from "react-router";
import { MessageSquare, Bookmark, Bell, Menu, Shield, Settings2 } from "lucide-react";
import { USERS } from "../mock";

export function Layout() {
  const isAdmin = USERS.current.role === "super_admin" || USERS.current.role === "admin";
  const isMod = isAdmin || USERS.current.role === "moderator";

  return (
    <div className="w-full h-[100dvh] mx-auto sm:max-w-[480px] bg-zinc-950 flex flex-col relative overflow-hidden font-sans sm:shadow-2xl sm:border-x border-zinc-800 text-zinc-100 selection:bg-violet-500/30">
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative scrollbar-none">
        <Outlet />
      </main>
      
      <nav className="shrink-0 bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-800 flex items-center justify-around px-2 pt-2 pb-[env(safe-area-inset-bottom,0.75rem)] z-50">
        <NavItem to="/" icon={<MessageSquare size={22} />} label="Chat" />
        <NavItem to="/bookmarks" icon={<Bookmark size={22} />} label="Saved" />
        <NavItem to="/notifications" icon={<Bell size={22} />} label="Alerts" badge={2} />
        {isMod && (
          <NavItem to="/mod" icon={<Shield size={22} />} label="Mod" badge={1} />
        )}
        {isAdmin ? (
          <NavItem to="/admin" icon={<Settings2 size={22} />} label="Admin" />
        ) : (
          <NavItem to="/menu" icon={<Menu size={22} />} label="Menu" />
        )}
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label, badge }: { to: string, icon: React.ReactNode, label: string, badge?: number }) {
  return (
    <NavLink 
      to={to} 
      className={({ isActive }) => 
        `flex flex-col items-center justify-center p-2 rounded-2xl transition-all relative min-w-[64px] ${
          isActive ? "text-violet-400 font-bold scale-105" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <div className="relative mb-1">
            {icon}
            {isActive && (
              <div className="absolute inset-0 bg-violet-500/20 blur-md rounded-full -z-10"></div>
            )}
            {badge !== undefined && badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-violet-600 text-white text-[10px] font-black h-[18px] min-w-[18px] flex items-center justify-center rounded-full px-1 shadow-[0_0_10px_rgba(124,58,237,0.5)] border border-zinc-950">
                {badge}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-widest uppercase">{label}</span>
          {isActive && (
            <div className="absolute -bottom-2 w-1 h-1 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(124,58,237,0.8)]"></div>
          )}
        </>
      )}
    </NavLink>
  );
}
