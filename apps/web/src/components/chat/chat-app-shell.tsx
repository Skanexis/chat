"use client";

import { type CSSProperties, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge, ErrorSurface, RolePill, StateBlock, SystemBanner, cn } from "@/design-system";
import { useChatRuntime } from "@/components/chat/runtime-context";

type ChatAppShellProps = {
  children: React.ReactNode;
};

type MaintenanceScene = "diagnostics" | "reindex" | "resync";

const MAINTENANCE_SCENES: MaintenanceScene[] = ["diagnostics", "reindex", "resync"];
const MAINTENANCE_SCENE_LABELS: Record<MaintenanceScene, string> = {
  diagnostics: "Node Diagnostics",
  reindex: "Message Reindex",
  resync: "Realtime Resync"
};
const MAINTENANCE_STEPS = [
  {
    title: "Queue freeze",
    detail: "New message queue paused and isolated."
  },
  {
    title: "History scan",
    detail: "Message index integrity verification running."
  },
  {
    title: "Socket calibration",
    detail: "WebSocket channels rebalanced and reattached."
  },
  {
    title: "State warmup",
    detail: "Cache layers warmed before public reopen."
  }
] as const;
const MAINTENANCE_LOG_LINES = [
  "scan://threads/main -> checksum stable",
  "queue://message-dispatch -> paused by maintenance lock",
  "ws://gateway -> retry topology rebuild",
  "audit://incident-mode -> protection policy synced",
  "cache://chat-bootstrap -> hot lanes primed",
  "role://access-control -> owner/admin bypass active",
  "notify://broadcast -> deferred until reopen"
] as const;

function mapStateFromError(code?: number): string {
  if (code === 401) return "Unauthorized";
  if (code === 403) return "Forbidden";
  if (code === 404) return "Not Found";
  if (code === 429) return "Rate Limited";
  return "Runtime Error";
}

function isMaintenanceLockError(message?: string): boolean {
  const text = (message ?? "").toLowerCase();
  return text.includes("maintenance mode");
}

function MaintenanceLockScreen({
  reason,
  onRefresh
}: {
  reason: string;
  onRefresh: () => void;
}) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [telemetryTick, setTelemetryTick] = useState(0);
  const [logIndex, setLogIndex] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const [pointer, setPointer] = useState({ x: 50, y: 32 });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSceneIndex((prev) => (prev + 1) % MAINTENANCE_SCENES.length);
    }, 6200);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIntroDone(true);
    }, 2800);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const telemetryTimer = window.setInterval(() => {
      setTelemetryTick((prev) => prev + 1);
    }, 880);
    const logTimer = window.setInterval(() => {
      setLogIndex((prev) => (prev + 1) % MAINTENANCE_LOG_LINES.length);
    }, 1600);
    return () => {
      window.clearInterval(telemetryTimer);
      window.clearInterval(logTimer);
    };
  }, []);

  const scene = MAINTENANCE_SCENES[sceneIndex] ?? "diagnostics";
  const activeStep = telemetryTick % MAINTENANCE_STEPS.length;
  const progress = ((telemetryTick * 11) % 94) + 5;

  return (
    <section
      className={`maintenance-shell ${introDone ? "is-loop" : "is-intro"}`}
      data-scene={scene}
      style={
        {
          "--mx": `${pointer.x}%`,
          "--my": `${pointer.y}%`,
          "--dx": String((pointer.x - 50) / 50),
          "--dy": String((pointer.y - 50) / 50),
          "--progress": `${progress}%`
        } as CSSProperties
      }
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        setPointer({
          x: Math.max(0, Math.min(100, x)),
          y: Math.max(0, Math.min(100, y))
        });
      }}
      onPointerLeave={() => {
        setPointer({ x: 50, y: 32 });
      }}
      onClick={() => {
        setSceneIndex((prev) => (prev + 1) % MAINTENANCE_SCENES.length);
        setTelemetryTick((prev) => prev + 1);
      }}
    >
      <div className="maintenance-backdrop" aria-hidden="true" />
      <div className="maintenance-stage" aria-hidden="true">
        <div className="maintenance-intro-veil" />
        <div className="maintenance-stage-grid" />
        <div className="maintenance-stream maintenance-stream-a" />
        <div className="maintenance-stream maintenance-stream-b" />
        <div className="maintenance-core">
          <span className="maintenance-core-ring maintenance-core-ring-a" />
          <span className="maintenance-core-ring maintenance-core-ring-b" />
          <span className="maintenance-core-dot" />
        </div>
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={`pod-${index}`}
            className="maintenance-chat-pod"
            data-lane={index % 2 === 0 ? "in" : "out"}
            style={
              {
                "--pod-delay": `${index * 0.48}s`
              } as CSSProperties
            }
          >
            <i />
            <i />
            <i />
          </div>
        ))}
      </div>
      <div className="maintenance-hudline" aria-hidden="true">
        <span>Maintenance</span>
        <span>{MAINTENANCE_SCENE_LABELS[scene]}</span>
        <span>Phase {activeStep + 1}/4</span>
      </div>
      <div className="maintenance-card">
        <span className="maintenance-chip">Maintenance Mode</span>
        <h2>Ristoranti Chat is under technical work</h2>
        <p>{reason}</p>
        <div className="maintenance-progress-wrap" aria-hidden="true">
          <div className="maintenance-progress-bar">
            <i />
          </div>
          <span>{progress}%</span>
        </div>
        <div className="maintenance-steps" aria-hidden="true">
          {MAINTENANCE_STEPS.map((step, index) => (
            <article
              key={step.title}
              className={
                index === activeStep ? "is-active" : index < activeStep ? "is-done" : undefined
              }
            >
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>
        <div className="maintenance-log" aria-hidden="true">
          {MAINTENANCE_LOG_LINES[logIndex]}
        </div>
        <div className="maintenance-actions">
          <button type="button" onClick={onRefresh}>
            Check again
          </button>
          <small>Tap screen to switch repair sequence</small>
        </div>
      </div>
    </section>
  );
}

export function ChatAppShell({ children }: ChatAppShellProps) {
  const runtime = useChatRuntime();
  const pathname = usePathname();

  const rootPath = `/chat/${encodeURIComponent(runtime.chatId)}`;
  const normalizedPathname = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const memberRestrictedPaths = new Set([
    `${rootPath}/search`,
    `${rootPath}/pinned`,
    `${rootPath}/drafts`,
    `${rootPath}/bookmarks`,
    `${rootPath}/reminders`,
    `${rootPath}/read-receipts`,
    `${rootPath}/thread-subscriptions`,
    `${rootPath}/polls`,
    `${rootPath}/reputation`,
    `${rootPath}/knowledge`,
    `${rootPath}/translations`,
    `${rootPath}/e2e-devices`
  ]);
  const showMainNav = runtime.isAdmin || runtime.isModerator;
  const mainNavItems = showMainNav
    ? runtime.isAdmin
      ? [
          { label: "Chat", href: rootPath },
          { label: "Admin", href: `${rootPath}/admin` }
        ]
      : [{ label: "Chat", href: rootPath }]
    : [];
  const workspaceNavItems: Array<{ label: string; href: string }> = [];
  const adminNavItems: Array<{ label: string; href: string }> = [];

  if (!runtime.isAdmin && runtime.isModerator) {
    workspaceNavItems.push({ label: "Search", href: `${rootPath}/search` });
    workspaceNavItems.push({ label: "Pinned", href: `${rootPath}/pinned` });
    workspaceNavItems.push({ label: "Drafts", href: `${rootPath}/drafts` });
    workspaceNavItems.push({ label: "Bookmarks", href: `${rootPath}/bookmarks` });
    workspaceNavItems.push({ label: "Reminders", href: `${rootPath}/reminders` });
    workspaceNavItems.push({ label: "Receipts", href: `${rootPath}/read-receipts` });
    workspaceNavItems.push({ label: "Threads", href: `${rootPath}/thread-subscriptions` });
    workspaceNavItems.push({ label: "Polls", href: `${rootPath}/polls` });
    workspaceNavItems.push({ label: "Reputation", href: `${rootPath}/reputation` });
  }

  if (!runtime.isAdmin && runtime.isModerator) {
    adminNavItems.push({ label: "Moderation", href: `${rootPath}/admin` });
  }

  const showFooterNav = mainNavItems.length > 0 || workspaceNavItems.length > 0 || adminNavItems.length > 0;

  if (runtime.state === "initializing") {
    return (
      <section className="app-shell">
        <StateBlock
          state="loading"
          title="Initializing Mini App session"
          description="Authenticating Telegram user and loading chat bootstrap payload."
        />
      </section>
    );
  }

  if (runtime.state === "error") {
    if (isMaintenanceLockError(runtime.error?.message)) {
      return <MaintenanceLockScreen reason={runtime.error?.message ?? "Maintenance mode is active."} onRefresh={runtime.reload} />;
    }
    return (
      <section className="app-shell">
        <ErrorSurface
          code={runtime.error?.statusCode ?? "BOOTSTRAP"}
          title="Frontend bootstrap failed"
          message={runtime.error?.message ?? "Unknown error"}
          actionLabel="Retry bootstrap"
          onAction={runtime.reload}
        />
      </section>
    );
  }

  if (runtime.maintenanceEnabled && !runtime.isMaintenanceBypass) {
    return (
      <MaintenanceLockScreen
        reason={runtime.maintenanceReason ?? "Temporary service window. Please try again in a few minutes."}
        onRefresh={runtime.reload}
      />
    );
  }

  if (!runtime.isModerator && memberRestrictedPaths.has(normalizedPathname)) {
    return (
      <section className="app-shell">
        <ErrorSurface
          code={403}
          title="Forbidden"
          message="This section is available only for moderator and admin roles."
          actionLabel="Go to Chat"
          onAction={runtime.reload}
        />
      </section>
    );
  }

  return (
    <section className="app-shell">
      <header className="app-topbar">
        <div>
          <h1>Ristoranti Chat</h1>
        </div>
        <div className="app-meta">
          <RolePill role={runtime.roleName} />
          <Badge variant={runtime.wsConnected ? "success" : "warning"}>
            {runtime.wsConnected ? "WS online" : "WS reconnecting"}
          </Badge>
        </div>
      </header>

      <main className={cn("app-body", normalizedPathname === rootPath ? "app-body-chat" : undefined)}>{children}</main>

      {runtime.liveIncidentMode?.enabled ? (
        <SystemBanner
          title="Incident Mode Active"
          variant="danger"
          message={`${runtime.liveIncidentMode.reason}. Elevated moderation policy is enabled across this chat.`}
        />
      ) : null}

      {runtime.error ? (
        <ErrorSurface
          code={runtime.error.statusCode ?? "RUNTIME"}
          title={mapStateFromError(runtime.error.statusCode)}
          message={runtime.error.message}
          actionLabel="Dismiss"
          onAction={runtime.dismissError}
        />
      ) : null}

      {showFooterNav ? (
        <footer className="app-footer">
          {mainNavItems.length > 0 ? (
            <nav className="ds-bottom-tabs" aria-label="Main section">
              {mainNavItems.map((item) => {
                const active = normalizedPathname === item.href;
                return (
                  <Link key={item.href} className={cn("ds-tab-btn", active ? "is-active" : undefined)} href={item.href}>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          ) : null}
          {workspaceNavItems.length > 0 ? (
            <nav className="ds-bottom-tabs ds-bottom-tabs-secondary" aria-label="Workspace sections">
              {workspaceNavItems.map((item) => {
                const active = normalizedPathname === item.href;
                return (
                  <Link key={item.href} className={cn("ds-tab-btn", active ? "is-active" : undefined)} href={item.href}>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          ) : null}
          {adminNavItems.length > 0 ? (
            <nav className="ds-bottom-tabs ds-bottom-tabs-admin" aria-label="Admin sections">
              {adminNavItems.map((item) => {
                const active = normalizedPathname === item.href;
                return (
                  <Link key={item.href} className={cn("ds-tab-btn", active ? "is-active" : undefined)} href={item.href}>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}
