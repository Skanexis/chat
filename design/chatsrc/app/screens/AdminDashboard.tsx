import React, { useState } from "react";
import { Cpu, Users, MessageSquare, Shield, Activity, Save, Settings } from "lucide-react";
import { ADMIN_STATS } from "../mock";
import { Card, Button, Avatar, FilterBar, FormSection, Select, Input, PermissionGate, PolicyImpactPreview } from "../components/ui";
import { RoleMatrix, PermissionMatrix, AuditViewer } from "../components/kits/AdminKit";
import { BroadcastWizard, ExecutionLogTable, IncidentModeSwitch } from "../components/kits/BroadcastKit";

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "limits" | "roles" | "audit" | "broadcasts" | "automation">("overview");

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-y-auto font-sans tracking-wide">
      <header className="bg-zinc-950/80 backdrop-blur-xl px-5 py-6 flex flex-col gap-4 border-b border-zinc-800 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <Cpu className="text-violet-500 animate-pulse shrink-0" size={28} />
            Control Panel
          </h1>
          <div className="relative">
            <Avatar src="https://images.unsplash.com/photo-1707396172424-f3293f788364?crop=entropy&cs=tinysrgb&fit=facearea&facepad=2&w=256&h=256&q=80" alt="Admin" size="md" isOnline />
          </div>
        </div>
        
        <FilterBar className="bg-transparent border-0 p-0 shadow-none">
          <Button variant={activeTab === "overview" ? "primary" : "secondary"} size="sm" onClick={() => setActiveTab("overview")} className="rounded-full">Overview</Button>
          <Button variant={activeTab === "limits" ? "primary" : "secondary"} size="sm" onClick={() => setActiveTab("limits")} className="rounded-full">Limits</Button>
          <Button variant={activeTab === "roles" ? "primary" : "secondary"} size="sm" onClick={() => setActiveTab("roles")} className="rounded-full">Roles</Button>
          <Button variant={activeTab === "audit" ? "primary" : "secondary"} size="sm" onClick={() => setActiveTab("audit")} className="rounded-full">Audit</Button>
          <Button variant={activeTab === "broadcasts" ? "primary" : "secondary"} size="sm" onClick={() => setActiveTab("broadcasts")} className="rounded-full">Broadcasts</Button>
          <Button variant={activeTab === "automation" ? "primary" : "secondary"} size="sm" onClick={() => setActiveTab("automation")} className="rounded-full">Automation</Button>
        </FilterBar>
      </header>

      <div className="flex-1 p-5 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed bg-opacity-5 pb-20">
        
        {activeTab === "overview" && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={<Users />} label="Active Users" value={ADMIN_STATS.activeUsers} trend="+12%" color="violet" />
              <StatCard icon={<MessageSquare />} label="Messages Today" value={ADMIN_STATS.messagesToday} trend="+5%" color="fuchsia" />
              <StatCard icon={<Activity />} label="Open Tickets" value={ADMIN_STATS.openTickets} color="amber" />
              <StatCard icon={<Shield />} label="Rejected Msgs" value={ADMIN_STATS.rejectedMessages} color="rose" />
            </div>

            <FormSection title="Emergency Controls">
              <IncidentModeSwitch active={true} onToggle={console.log} />
            </FormSection>
          </div>
        )}

        {activeTab === "limits" && (
          <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <FormSection title="Global Chat Speed" description="Configure slowmode and rate limits for standard members.">
              <div className="flex flex-col gap-3 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">Message Cooldown</span>
                  <Select className="w-32 h-9 text-xs">
                    <option>10 seconds</option>
                    <option>30 seconds</option>
                    <option>1 minute</option>
                  </Select>
                </div>
              </div>
            </FormSection>

            <FormSection title="Join Policy" description="Rules for new users entering the workspace.">
              <div className="flex flex-col gap-3 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
                <div className="flex flex-col gap-1 mb-2">
                  <span className="text-sm font-bold text-white">Default Role Assignment</span>
                  <Input defaultValue="Member" disabled className="bg-zinc-950/50 border-zinc-800 text-zinc-500" />
                </div>
                
                <PermissionGate hasPermission={true} actionName="edit policies">
                  <PolicyImpactPreview 
                    changes={[
                      { role: "member", affectedUsers: 1432, willHaveAccess: true },
                      { role: "guest", affectedUsers: 56, willHaveAccess: false },
                    ]}
                  />
                </PermissionGate>
              </div>
            </FormSection>

            <Button className="w-full gap-2 py-6 text-sm"><Save size={18} /> Apply Changes</Button>
          </div>
        )}

        {activeTab === "roles" && (
          <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <FormSection title="Roles Management">
              <RoleMatrix 
                roles={[
                  { id: "1", name: "Super Admin", usersCount: 2, isSystem: true },
                  { id: "2", name: "Moderator", usersCount: 14, isSystem: false },
                  { id: "3", name: "Member", usersCount: 14205, isSystem: true }
                ]}
                onEdit={console.log} onDelete={console.log}
              />
            </FormSection>
            <FormSection title="Permissions Matrix" className="overflow-hidden">
              <PermissionMatrix 
                currentRoles={["Super Admin", "Moderator", "Member"]}
                scopes={[
                  { name: "Chat", permissions: [{ id: "c1", name: "Send Messages" }, { id: "c2", name: "Embed Links" }] },
                  { name: "Moderation", permissions: [{ id: "m1", name: "Ban Users" }, { id: "m2", name: "Delete Messages" }] }
                ]}
              />
            </FormSection>
          </div>
        )}

        {activeTab === "audit" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <AuditViewer logs={[
              { action: "ROLE_UPDATED", actor: "alex_admin", details: "Added permission: send_links to Moderator", timestamp: "10m ago", ip: "192.168.1.1", sessionId: "s_9f8a2" },
              { action: "MEMBER_BANNED", actor: "sarah_mod", details: "Banned user: spammer_99 (Reason: NSFW)", timestamp: "1h ago" },
              { action: "SETTINGS_CHANGED", actor: "system", details: "Enabled incident mode (Trigger: Raid detected)", timestamp: "2h ago" }
            ]} />
          </div>
        )}

        {activeTab === "broadcasts" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <BroadcastWizard onStart={() => alert("Broadcast Started")} />
          </div>
        )}

        {activeTab === "automation" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-6">
            <FormSection title="Execution Logs">
              <ExecutionLogTable logs={[
                { ruleName: "Auto-Ban Spammers", trigger: "User reported 5x", time: "2m ago", status: "success" },
                { ruleName: "Welcome Message", trigger: "User joined", time: "15m ago", status: "success" },
                { ruleName: "Sync Members", trigger: "CRON 1h", time: "Now", status: "running" },
                { ruleName: "Webhook Alert", trigger: "Mention @admin", time: "1d ago", status: "failed" }
              ]} />
            </FormSection>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, trend, color }: any) {
  const colors = {
    violet: "bg-violet-500/10 text-violet-400 border-violet-500/20 shadow-[0_0_15px_rgba(124,58,237,0.1)]",
    fuchsia: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20 shadow-[0_0_15px_rgba(217,70,239,0.1)]",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]",
    rose: "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]",
  }[color as string] || "bg-zinc-900 text-zinc-400 border-zinc-800";

  return (
    <Card hoverable className={`p-5 rounded-2xl border ${colors} flex flex-col relative overflow-hidden group transition-all duration-300`}>
      <div className="absolute -right-3 -top-3 transform scale-[2] rotate-12 transition-transform group-hover:scale-[2.5] group-hover:rotate-[25deg] opacity-10">
        {icon}
      </div>
      <div className="mb-3 w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center shadow-inner relative z-10 text-white">
        {React.cloneElement(icon, { size: 18 })}
      </div>
      <span className="text-3xl font-black text-white tracking-tighter z-10">{value.toLocaleString()}</span>
      <span className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-90 z-10 flex items-center gap-1.5 text-zinc-400">
        {label}
        {trend && <span className="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[8px] ml-auto font-black shadow-[0_0_10px_rgba(16,185,129,0.2)]">{trend}</span>}
      </span>
    </Card>
  );
}
