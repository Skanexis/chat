import React from "react";
import { ShieldAlert, Lock, AlertOctagon, CheckCircle } from "lucide-react";
import { Badge, Card, cn } from "./Primitives";

interface PermissionGateProps {
  hasPermission: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  actionName?: string;
}

export function PermissionGate({ hasPermission, children, fallback, actionName = "action" }: PermissionGateProps) {
  if (hasPermission) return <>{children}</>;
  
  if (fallback) return <>{fallback}</>;
  
  return (
    <Card className="p-4 border-dashed border-zinc-700 bg-zinc-900/30 flex items-center justify-center gap-2 opacity-50 select-none">
      <Lock size={16} className="text-zinc-500" />
      <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
        Permission required for {actionName}
      </span>
    </Card>
  );
}

export function RolePill({ role }: { role: string }) {
  const roleStyles: Record<string, string> = {
    super_admin: "bg-violet-600/20 text-violet-300 border-violet-500/50 shadow-[0_0_10px_rgba(124,58,237,0.3)]",
    admin: "bg-fuchsia-600/20 text-fuchsia-300 border-fuchsia-500/50 shadow-[0_0_10px_rgba(217,70,239,0.3)]",
    moderator: "bg-blue-600/20 text-blue-300 border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.3)]",
    member: "bg-zinc-800 text-zinc-300 border-zinc-700",
    system: "bg-amber-600/20 text-amber-300 border-amber-500/50",
  };

  const style = roleStyles[role.toLowerCase()] || roleStyles.member;
  
  return (
    <Badge variant="outline" className={cn("px-2 py-0.5 border text-[9px] font-black leading-none", style)}>
      {role.replace("_", " ")}
    </Badge>
  );
}

export function RestrictionHint({ reason, type = "warning" }: { reason: string, type?: "warning" | "danger" | "info" }) {
  const colors = {
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]",
    danger: "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]",
    info: "bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]",
  };
  
  const icons = {
    warning: AlertOctagon,
    danger: ShieldAlert,
    info: Lock,
  };

  const Icon = icons[type];

  return (
    <div className={cn("flex items-start gap-3 p-3 rounded-xl border text-sm font-medium", colors[type])}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <span className="leading-snug">{reason}</span>
    </div>
  );
}

export function PolicyImpactPreview({ changes }: { changes: { role: string, affectedUsers: number, willHaveAccess: boolean }[] }) {
  return (
    <div className="flex flex-col gap-2 mt-4 bg-zinc-950 p-4 rounded-xl border border-zinc-800 shadow-inner">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2 mb-2">
        <ShieldAlert size={12} className="text-violet-500" />
        Impact Preview
      </h4>
      
      {changes.map((c, i) => (
        <div key={i} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
          <div className="flex items-center gap-2">
            <RolePill role={c.role} />
            <span className="text-xs text-zinc-400 font-medium">({c.affectedUsers} users)</span>
          </div>
          {c.willHaveAccess ? (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              <CheckCircle size={10} /> Allowed
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
              <Lock size={10} /> Revoked
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
