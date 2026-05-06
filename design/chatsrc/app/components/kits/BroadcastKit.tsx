import React from "react";
import { Badge, Button, Card, cn, StateBlock } from "../ui";
import { AlertOctagon, CheckCircle2, ChevronRight, Clock, FastForward, Megaphone, PlayCircle, RefreshCw, Send, ShieldAlert, SkipForward, XCircle } from "lucide-react";

// BroadcastWizard
export function BroadcastWizard({ onStart }: { onStart: (config: any) => void }) {
  const [step, setStep] = React.useState(1);

  return (
    <Card className="flex flex-col border border-zinc-800 shadow-2xl bg-zinc-950 overflow-hidden">
      <div className="flex bg-zinc-900 border-b border-zinc-800">
        {[1, 2, 3].map(s => (
          <div key={s} className={cn(
            "flex-1 p-3 text-center text-xs font-black uppercase tracking-widest transition-colors relative",
            s === step ? "text-violet-400 bg-violet-500/5" : s < step ? "text-emerald-500" : "text-zinc-600",
            s !== 3 && "border-r border-zinc-800/50"
          )}>
            {s < step && <CheckCircle2 size={14} className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 opacity-20" />}
            Step {s}
          </div>
        ))}
      </div>
      
      <div className="p-6">
        {step === 1 && (
          <div className="flex flex-col gap-4 animate-in slide-in-from-right-4">
            <h3 className="text-lg font-bold text-white mb-2">Audience Selection</h3>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-violet-500 text-violet-400 bg-violet-500/10">All Members</Button>
              <Button variant="outline" className="flex-1 text-zinc-500 border-zinc-800">Specific Roles</Button>
            </div>
            <p className="text-xs text-zinc-500 font-medium">Estimated reach: 14,205 users</p>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4 animate-in slide-in-from-right-4">
            <h3 className="text-lg font-bold text-white mb-2">Message Content</h3>
            <textarea className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-300 min-h-[100px] resize-none focus:outline-none focus:border-violet-500 transition-colors" placeholder="Type your broadcast message..." />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" className="h-8 gap-1"><Clock size={14} /> TTL</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4 animate-in slide-in-from-right-4">
            <h3 className="text-lg font-bold text-white mb-2">Review & Send</h3>
            <Card className="p-4 bg-zinc-900/50 border border-zinc-800/50 flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-500 font-medium">Target</span>
                <span className="font-bold text-white">All Members (~14.2k)</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-500 font-medium">Content length</span>
                <span className="font-bold text-white">124 chars</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-500 font-medium">Speed</span>
                <Badge variant="warning" className="uppercase tracking-widest text-[9px] py-0">Safe (30 msg/s)</Badge>
              </div>
            </Card>
          </div>
        )}
      </div>

      <div className="p-4 bg-zinc-900/50 border-t border-zinc-800 flex justify-between items-center">
        <Button variant="ghost" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="text-sm px-3 opacity-70 hover:opacity-100">Back</Button>
        {step < 3 ? (
          <Button variant="primary" onClick={() => setStep(step + 1)} className="gap-2">Continue <ChevronRight size={16} /></Button>
        ) : (
          <Button variant="primary" onClick={() => onStart({})} className="gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-[0_0_20px_rgba(217,70,239,0.3)] border-fuchsia-500/50"><Megaphone size={16} /> Start Broadcast</Button>
        )}
      </div>
    </Card>
  );
}

// ExecutionLogTable
export function ExecutionLogTable({ logs }: { logs: any[] }) {
  if (!logs.length) return <StateBlock state="empty" title="No executions yet" />;
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 scrollbar-none">
      <table className="w-full text-left text-sm whitespace-nowrap min-w-[600px]">
        <thead className="bg-zinc-900/80 border-b border-zinc-800">
          <tr>
            <th className="p-3 text-xs font-black text-zinc-500 uppercase tracking-widest">Rule</th>
            <th className="p-3 text-xs font-black text-zinc-500 uppercase tracking-widest">Trigger</th>
            <th className="p-3 text-xs font-black text-zinc-500 uppercase tracking-widest">Time</th>
            <th className="p-3 text-xs font-black text-zinc-500 uppercase tracking-widest">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {logs.map((log, i) => (
            <tr key={i} className="hover:bg-zinc-900/30 transition-colors group">
              <td className="p-3 font-bold text-white flex items-center gap-2">
                <FastForward size={14} className="text-violet-500" /> {log.ruleName}
              </td>
              <td className="p-3 text-zinc-400 font-mono text-xs">{log.trigger}</td>
              <td className="p-3 text-zinc-500 font-medium">{log.time}</td>
              <td className="p-3">
                {log.status === "success" && <Badge variant="success" className="gap-1 px-1.5 py-0 h-5"><CheckCircle2 size={10} /> Success</Badge>}
                {log.status === "failed" && <Badge variant="danger" className="gap-1 px-1.5 py-0 h-5"><XCircle size={10} /> Failed</Badge>}
                {log.status === "running" && <Badge variant="warning" className="gap-1 px-1.5 py-0 h-5 animate-pulse"><RefreshCw size={10} className="animate-spin" /> Running</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// IncidentModeSwitch
export function IncidentModeSwitch({ active, onToggle }: { active: boolean, onToggle: (active: boolean) => void }) {
  return (
    <Card className={cn(
      "p-5 flex flex-col gap-4 relative overflow-hidden transition-colors border-2",
      active ? "bg-rose-500/10 border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.15)]" : "bg-zinc-900 border-zinc-800 hover:border-rose-500/20"
    )}>
      {active && (
        <div className="absolute right-[-20px] top-[-20px] opacity-10 animate-pulse pointer-events-none">
          <ShieldAlert size={120} className="text-rose-500" />
        </div>
      )}
      
      <div className="flex justify-between items-start relative z-10">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-inner transition-colors",
            active ? "bg-rose-500/20 text-rose-500 border-rose-500/50" : "bg-zinc-950 text-zinc-500 border-zinc-800"
          )}>
            <AlertOctagon size={24} className={active ? "animate-pulse" : ""} />
          </div>
          <div className="flex flex-col gap-0.5">
            <h3 className={cn("text-lg font-black tracking-tight", active ? "text-rose-400" : "text-white")}>
              Incident Mode
            </h3>
            <p className="text-xs text-zinc-400 font-medium max-w-[200px] leading-snug">
              {active ? "Strict moderation rules are active. Only verified members can send media." : "Activate during raids or spam attacks to apply strict limits."}
            </p>
          </div>
        </div>
        
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" checked={active} onChange={(e) => onToggle(e.target.checked)} />
          <div className="w-14 h-7 bg-zinc-950 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-rose-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-800 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-rose-600 shadow-inner border border-zinc-800"></div>
        </label>
      </div>

      {active && (
        <div className="bg-rose-950/40 rounded-xl p-3 border border-rose-500/20 flex flex-col gap-2 relative z-10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1">
              <Clock size={12} /> Auto-disable in
            </span>
            <span className="font-mono text-sm text-rose-200 font-bold bg-rose-500/20 px-2 py-0.5 rounded">02:59:14</span>
          </div>
        </div>
      )}
    </Card>
  );
}
