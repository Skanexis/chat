"use client";

import { type CSSProperties, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge, ErrorSurface, RolePill, StateBlock, SystemBanner, cn } from "@/design-system";
import { useChatRuntime } from "@/components/chat/runtime-context";

type ChatAppShellProps = {
  children: React.ReactNode;
};

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

function wsBadgeLabel(status: ReturnType<typeof useChatRuntime>["wsStatus"], attempt: number | null): string {
  if (status === "online") {
    return "WS online";
  }
  if (status === "connecting") {
    return "WS connecting";
  }
  if (status === "reconnecting") {
    return attempt && attempt > 0 ? `WS reconnect ${attempt}` : "WS reconnecting";
  }
  return "WS offline";
}

function MaintenanceLockScreen({
  reason
}: {
  reason: string;
}) {
  const [pulseIndex, setPulseIndex] = useState(0);
  const [pointer, setPointer] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPulseIndex((prev) => (prev + 1) % 8);
    }, 1800);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section
      className="maintenance-studio"
      aria-label={reason}
      style={
        {
          "--mx": `${pointer.x}%`,
          "--my": `${pointer.y}%`,
          "--dx": String((pointer.x - 50) / 50),
          "--dy": String((pointer.y - 50) / 50)
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
        setPointer({ x: 50, y: 50 });
      }}
    >
      <div className="maintenance-studio-ambience" aria-hidden="true" />
      <div className="maintenance-studio-vignette" aria-hidden="true" />
      <div className={`maintenance-factory pulse-${pulseIndex}`} aria-hidden="true">
        <div className="maintenance-factory-glow" />

        <div className="maintenance-arm maintenance-arm-top">
          <span className="seg seg-1" />
          <span className="seg seg-2" />
          <span className="tool">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="maintenance-arm maintenance-arm-left">
          <span className="seg seg-1" />
          <span className="seg seg-2" />
          <span className="tool">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="maintenance-arm maintenance-arm-right">
          <span className="seg seg-1" />
          <span className="seg seg-2" />
          <span className="tool">
            <i />
            <i />
            <i />
          </span>
        </div>

        <div className="maintenance-device">
          <div className="maintenance-screen">
            <div className="maintenance-screen-grid" />
            <div className="maintenance-scanline scan-a" />
            <div className="maintenance-scanline scan-b" />
            <div className="maintenance-scanline scan-c" />

            <div className="maintenance-thread thread-a" />
            <div className="maintenance-thread thread-b" />
            <div className="maintenance-thread thread-c" />

            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={`bubble-${index}`}
                className="maintenance-message-bubble"
                data-side={index % 2 === 0 ? "left" : "right"}
                style={{ "--delay": `${index * 0.34}s` } as CSSProperties}
              >
                <span />
                <span />
                <span />
              </div>
            ))}

            <div className="maintenance-spark-cloud">
              {Array.from({ length: 14 }).map((_, index) => (
                <i key={`spark-${index}`} style={{ "--spark-delay": `${index * 0.22}s` } as CSSProperties} />
              ))}
            </div>
          </div>
          <div className="maintenance-screen-glass" />
        </div>

        <div className="maintenance-data-stream">
          {Array.from({ length: 6 }).map((_, index) => (
            <em key={`stream-${index}`} style={{ "--stream-delay": `${index * 0.45}s` } as CSSProperties} />
          ))}
        </div>

        <div className="maintenance-floor">
          <div className="maintenance-floor-lane lane-a" />
          <div className="maintenance-floor-lane lane-b" />
          <div className="maintenance-floor-lane lane-c" />
        </div>

        <div className="maintenance-status-mark">
          <span>In development</span>
          <div className="status-pulse">
            <i />
            <i />
            <i />
          </div>
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
      return <MaintenanceLockScreen reason={runtime.error?.message ?? "Maintenance mode is active."} />;
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
          <Badge variant={runtime.wsStatus === "online" ? "success" : runtime.wsStatus === "offline" ? "danger" : "warning"}>
            {wsBadgeLabel(runtime.wsStatus, runtime.wsReconnectAttempt)}
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
