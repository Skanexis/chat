"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge, ErrorSurface, RolePill, StateBlock, SystemBanner, cn } from "@/design-system";
import { useChatRuntime } from "@/components/chat/runtime-context";

type ChatAppShellProps = {
  children: ReactNode;
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

function wsBadgeLabel(
  status: ReturnType<typeof useChatRuntime>["wsStatus"],
  attempt: number | null,
  reconnectSeconds: number | null
): string {
  if (status === "online") {
    return "WS online";
  }
  if (status === "connecting") {
    return "WS connecting";
  }
  if (status === "syncing") {
    return "WS syncing";
  }
  if (status === "reconnecting") {
    if (reconnectSeconds !== null) {
      return `WS reconnecting ${reconnectSeconds}s`;
    }
    return attempt && attempt > 0 ? `WS reconnect ${attempt}` : "WS reconnecting";
  }
  return "WS offline";
}

function MaintenanceLockScreen({
  reason
}: {
  reason: string;
}) {
  return (
    <section className="maintenance-simple" aria-label={reason}>
      <div className="maintenance-simple-bg" aria-hidden="true" />
      <div className="maintenance-simple-stage" aria-hidden="true">
        <div className="maintenance-gears">
          <div className="maintenance-gear maintenance-gear-lg">
            <i />
          </div>
          <div className="maintenance-gear maintenance-gear-md">
            <i />
          </div>
          <div className="maintenance-gear maintenance-gear-sm">
            <i />
          </div>
        </div>

        <div className="maintenance-liquid-orb">
          <div className="maintenance-orb-water">
            <b className="wave wave-a" />
            <b className="wave wave-b" />
          </div>
          <div className="maintenance-orb-bubbles">
            {Array.from({ length: 12 }).map((_, index) => (
              <span key={`orb-bubble-${index}`} />
            ))}
          </div>
          <div className="maintenance-orb-glass" />
          <strong>80%</strong>
        </div>

        <p>In development</p>
      </div>
    </section>
  );
}

export function ChatAppShell({ children }: ChatAppShellProps) {
  const runtime = useChatRuntime();
  const pathname = usePathname();
  const [reconnectTick, setReconnectTick] = useState(() => Date.now());

  const rootPath = `/chat/${encodeURIComponent(runtime.chatId)}`;
  const normalizedPathname = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const devOnlyPaths = new Set([
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
  const memberRestrictedPaths = new Set<string>([]);
  const showMainNav = runtime.isAdmin || runtime.isModerator;
  const mainNavItems = showMainNav
    ? runtime.isDeveloper
      ? [
          { label: "Chat", href: rootPath },
          { label: "DEV", href: `${rootPath}/admin` }
        ]
      : runtime.isAdmin
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

  useEffect(() => {
    if (runtime.wsStatus !== "reconnecting" || !runtime.wsReconnectStartedAt) {
      return;
    }
    setReconnectTick(Date.now());
    const timer = window.setInterval(() => {
      setReconnectTick(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [runtime.wsStatus, runtime.wsReconnectStartedAt]);

  const reconnectSeconds = useMemo(() => {
    if (!runtime.wsReconnectStartedAt || runtime.wsStatus !== "reconnecting") {
      return null;
    }
    const startedAtMs = Date.parse(runtime.wsReconnectStartedAt);
    if (!Number.isFinite(startedAtMs)) {
      return null;
    }
    return Math.max(1, Math.floor((reconnectTick - startedAtMs) / 1000));
  }, [runtime.wsReconnectStartedAt, runtime.wsStatus, reconnectTick]);

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

  if (!runtime.isDeveloper && devOnlyPaths.has(normalizedPathname)) {
    return (
      <section className="app-shell">
        <ErrorSurface
          code={403}
          title="Forbidden"
          message="This section is available only for Developer role."
          actionLabel="Go to Chat"
          onAction={runtime.reload}
        />
      </section>
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
          <Badge
            variant={runtime.wsStatus === "online" ? "success" : runtime.wsStatus === "offline" ? "danger" : "warning"}
          >
            {wsBadgeLabel(runtime.wsStatus, runtime.wsReconnectAttempt, reconnectSeconds)}
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
