import React from "react";
import { AlertTriangle, Loader2, CheckCircle2, AlertOctagon, RefreshCw, XCircle } from "lucide-react";
import { cn, Button, Card } from "./Primitives";

// 5. Global UX States: StateBlock
export type StateType = "loading" | "empty" | "ready" | "updating" | "error" | "forbidden" | "unauthorized" | "rate_limited" | "not_found";

interface StateBlockProps {
  state: StateType;
  title?: string;
  description?: string;
  onRetry?: () => void;
  children?: React.ReactNode;
}

export function StateBlock({ state, title, description, onRetry, children }: StateBlockProps) {
  if (state === "ready" || state === "updating") {
    return (
      <div className="relative">
        {state === "updating" && (
          <div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-inherit">
            <Loader2 className="animate-spin text-violet-500" size={24} />
          </div>
        )}
        {children}
      </div>
    );
  }

  const stateConfig = {
    loading: { icon: Loader2, color: "text-violet-500", animate: "animate-spin" },
    empty: { icon: CheckCircle2, color: "text-zinc-500" },
    error: { icon: AlertOctagon, color: "text-rose-500" },
    forbidden: { icon: XCircle, color: "text-rose-500" },
    unauthorized: { icon: AlertTriangle, color: "text-amber-500" },
    rate_limited: { icon: AlertTriangle, color: "text-amber-500" },
    not_found: { icon: AlertOctagon, color: "text-zinc-500" },
  };

  const config = stateConfig[state as keyof typeof stateConfig] || stateConfig.empty;
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-zinc-900/30 border border-zinc-800/50 rounded-2xl min-h-[200px]">
      <div className={cn("p-4 rounded-full bg-zinc-900 shadow-inner mb-4", config.color)}>
        <Icon size={32} className={cn(config.animate)} />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{title || state.replace("_", " ")}</h3>
      {description && <p className="text-sm text-zinc-400 max-w-sm mb-6">{description}</p>}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="gap-2 text-xs h-9">
          <RefreshCw size={14} /> Retry action
        </Button>
      )}
    </div>
  );
}

// Specialized ErrorSurface from spec
export function ErrorSurface({ code, message, onAction, actionLabel = "Retry" }: { code: number | string, message: string, onAction?: () => void, actionLabel?: string }) {
  return (
    <Card className="p-6 border-rose-500/20 bg-rose-500/5 flex flex-col items-center text-center max-w-sm mx-auto my-8">
      <AlertOctagon size={48} className="text-rose-500 mb-4 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]" />
      <h2 className="text-xl font-black text-rose-50 text-white mb-1">Error {code}</h2>
      <p className="text-sm text-rose-200/70 mb-6 font-medium">{message}</p>
      {onAction && (
        <Button variant="danger" className="w-full" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Card>
  );
}

// Patterns: FormSection
export function FormSection({ title, description, children, className }: { title: React.ReactNode, description?: React.ReactNode, children: React.ReactNode, className?: string }) {
  return (
    <div className={cn("mb-8 last:mb-0", className)}>
      <div className="mb-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest">{title}</h3>
        {description && <p className="text-xs text-zinc-500 mt-1 font-medium">{description}</p>}
      </div>
      <div className="flex flex-col gap-4">
        {children}
      </div>
    </div>
  );
}

// Patterns: FilterBar
export function FilterBar({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 p-2 bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto scrollbar-none", className)}>
      {children}
    </div>
  );
}

// Patterns: DataTable (simplified for mobile/webview)
export function DataTable({ headers, data, renderRow }: { headers: string[], data: any[], renderRow: (item: any, idx: number) => React.ReactNode }) {
  if (!data.length) return <StateBlock state="empty" title="No records found" />;
  
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50">
      <table className="w-full text-left border-collapse text-sm">
        <thead className="bg-zinc-900/80 border-b border-zinc-800 text-xs uppercase tracking-widest text-zinc-500 font-black">
          <tr>
            {headers.map((h, i) => <th key={i} className="p-3 whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {data.map((item, i) => renderRow(item, i))}
        </tbody>
      </table>
    </div>
  );
}

// Patterns: EventTimeline
export function EventTimeline({ events }: { events: { title: string, time: string, desc?: string, type?: "info" | "success" | "warning" | "danger" }[] }) {
  const typeColors = {
    info: "bg-violet-500 shadow-[0_0_10px_rgba(124,58,237,0.5)] border-zinc-950",
    success: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] border-zinc-950",
    warning: "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)] border-zinc-950",
    danger: "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)] border-zinc-950",
  };

  return (
    <div className="flex flex-col gap-4 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-zinc-800">
      {events.map((e, i) => (
        <div key={i} className="relative flex items-start gap-4">
          <div className="absolute left-0 w-6 flex items-center justify-center mt-1">
            <div className={cn("w-2.5 h-2.5 rounded-full border-2", typeColors[e.type || "info"])} />
          </div>
          <div className="pl-8 flex flex-col min-w-0 flex-1 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50 ml-6">
            <div className="flex justify-between items-center gap-2 mb-1">
              <span className="font-bold text-white text-sm truncate">{e.title}</span>
              <span className="text-[10px] font-black tracking-widest text-zinc-500 uppercase shrink-0 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">{e.time}</span>
            </div>
            {e.desc && <p className="text-xs text-zinc-400 font-medium break-words leading-relaxed">{e.desc}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
