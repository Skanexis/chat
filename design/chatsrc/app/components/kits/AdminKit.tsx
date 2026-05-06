import React from "react";
import { Badge, Button, cn } from "../ui";
import { Activity, Check, Edit2, Plus, Shield, ShieldAlert, Sliders, Trash2, X } from "lucide-react";

// RoleMatrix
export function RoleMatrix({ roles, onEdit, onDelete }: { roles: any[], onEdit: (id: string) => void, onDelete: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {roles.map(r => (
        <div key={r.id} className="flex items-center justify-between p-4 bg-zinc-900 rounded-xl border border-zinc-800 hover:border-violet-500/30 transition-all group">
          <div className="flex items-center gap-3">
            <Shield className={r.isSystem ? "text-amber-500" : "text-violet-500"} size={20} />
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white capitalize">{r.name}</span>
                {r.isSystem && <Badge variant="outline" className="text-[8px] py-0">SYSTEM</Badge>}
              </div>
              <span className="text-xs text-zinc-500 font-medium">{r.usersCount} users assigned</span>
            </div>
          </div>
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="icon" variant="ghost" onClick={() => onEdit(r.id)}><Edit2 size={14} /></Button>
            {!r.isSystem && (
              <Button size="icon" variant="danger" className="text-rose-500" onClick={() => onDelete(r.id)}><Trash2 size={14} /></Button>
            )}
          </div>
        </div>
      ))}
      <Button variant="outline" className="border-dashed border-zinc-700 text-zinc-400 hover:border-violet-500 hover:text-violet-400 py-6 gap-2">
        <Plus size={18} /> Create New Role
      </Button>
    </div>
  );
}

// PermissionMatrix
export function PermissionMatrix({ scopes, currentRoles }: { scopes: { name: string, permissions: { id: string, name: string }[] }[], currentRoles: string[] }) {
  return (
    <div className="w-full overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-950 scrollbar-none">
      <table className="w-full text-left text-sm border-collapse min-w-[600px]">
        <thead className="bg-zinc-900 border-b border-zinc-800">
          <tr>
            <th className="p-3 font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Permission</th>
            {currentRoles.map(r => (
              <th key={r} className="p-3 font-black text-white text-center capitalize">{r}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {scopes.map(scope => (
            <React.Fragment key={scope.name}>
              <tr className="bg-zinc-900/30">
                <td colSpan={currentRoles.length + 1} className="px-3 py-1 text-[10px] font-black text-violet-400 uppercase tracking-widest border-t border-zinc-800">{scope.name}</td>
              </tr>
              {scope.permissions.map(p => (
                <tr key={p.id} className="hover:bg-zinc-900/50 transition-colors">
                  <td className="p-3 text-xs font-medium text-zinc-300">{p.name}</td>
                  {currentRoles.map(r => (
                    <td key={r} className="p-3 text-center border-l border-zinc-800/50">
                      <button className="w-6 h-6 rounded flex items-center justify-center mx-auto hover:bg-zinc-800 transition-colors group">
                        {Math.random() > 0.3 ? (
                          <Check size={16} className="text-emerald-500 group-hover:scale-110 transition-transform" />
                        ) : (
                          <X size={16} className="text-zinc-600 group-hover:text-rose-500 group-hover:scale-110 transition-colors" />
                        )}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// AuditViewer
export function AuditViewer({ logs }: { logs: any[] }) {
  return (
    <div className="flex flex-col gap-2 font-mono text-xs">
      {logs.map((log, i) => (
        <div key={i} className="flex flex-col gap-1 p-3 bg-zinc-900 rounded-lg border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-widest">
              <Activity size={12} className="text-violet-500" />
              {log.action}
            </span>
            <span>{log.timestamp}</span>
          </div>
          <div className="text-zinc-300 flex items-center gap-2 break-all">
            <span className="font-bold text-violet-400">{log.actor}</span>
            <span className="text-zinc-600">→</span>
            <span>{log.details}</span>
          </div>
          {log.ip && (
            <div className="mt-1 text-[10px] text-zinc-600">IP: {log.ip} | Session: {log.sessionId}</div>
          )}
        </div>
      ))}
    </div>
  );
}
