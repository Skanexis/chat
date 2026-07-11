"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar, ErrorSurface, RolePill, StateBlock, SystemBanner, cn } from "@/design-system";
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
  const adminSurfacePermissions = [
    "member.view_list",
    "role.create",
    "role.update",
    "role.assign",
    "role.unassign",
    "permission.grant",
    "permission.revoke",
    "limit.view",
    "limit.update.role",
    "slowmode.view",
    "slowmode.update",
    "chat.invite.create",
    "chat.invite.revoke",
    "member.approve_join",
    "member.reject_join",
    "channel.notify.enable",
    "channel.notify.disable",
    "channel.notify.frequency.edit",
    "channel.notify.template.edit",
    "ticket.create",
    "ticket.assign",
    "ticket.close",
    "ticket.sla.manage",
    "room.temp.create",
    "room.temp.archive",
    "room.temp.restore",
    "broadcast.create",
    "broadcast.update",
    "broadcast.delete",
    "broadcast.publish.now",
    "broadcast.schedule",
    "broadcast.pause",
    "broadcast.resume",
    "broadcast.cancel",
    "broadcast.audience.manage",
    "broadcast.template.manage",
    "broadcast.stats.view",
    "integration.webhook.create",
    "integration.webhook.rotate_secret",
    "integration.webhook.disable",
    "automation.rule.create",
    "automation.rule.update",
    "automation.rule.execute",
    "incident_mode.enable",
    "incident_mode.disable",
    "incident_mode.policy.edit",
    "audit.view",
    "audit.export"
  ];
  const devSurfacePermissions = [
    "message.search",
    "message.pin.view",
    "draft.create",
    "draft.update",
    "draft.delete",
    "draft.schedule_send",
    "bookmark.create",
    "bookmark.collection.manage",
    "thread.subscription.manage",
    "message.send.poll",
    "poll.quiz.create",
    "poll.quiz.close",
    "poll.quiz.results.view",
    "e2e.device.register",
    "e2e.device.view"
  ];
  const canOpenAdminByPermissions = runtime.hasAnyPermission(adminSurfacePermissions);
  const canOpenDevByPermissions = runtime.isDeveloper && runtime.hasAnyPermission(devSurfacePermissions);
  const showMainNav = canOpenAdminByPermissions || canOpenDevByPermissions;
  const chatTitle = runtime.chat?.name ?? "Ristoranti Chat";
  const isLive = runtime.wsStatus === "online" || runtime.wsStatus === "syncing";
  const topbarStatus =
    runtime.typingUsers.length > 0
      ? `${runtime.typingUsers.length} typing`
      : runtime.wsStatus === "online"
        ? "Online"
        : runtime.wsStatus === "syncing"
          ? "Updating"
          : runtime.wsStatus === "connecting"
            ? "Connecting"
          : runtime.wsStatus === "reconnecting"
            ? "Reconnecting"
            : "Offline";
  const mainNavItems = showMainNav
    ? [
        { label: "Chats", href: rootPath, icon: "chat" },
        { label: canOpenDevByPermissions ? "Studio" : "Tools", href: `${rootPath}/admin`, icon: "settings" }
      ]
    : [];
  const workspaceNavItems: Array<{ label: string; href: string }> = [];
  const adminNavItems: Array<{ label: string; href: string }> = [];

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
          title="Connection setup failed"
          message={runtime.error?.message ?? "Unknown error"}
          actionLabel="Try again"
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

  if (!runtime.hasPermission("member.view_list") && memberRestrictedPaths.has(normalizedPathname)) {
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
        <div className="app-chat-titlebar">
          <Avatar name={chatTitle} size="md" online={isLive} className="app-chat-avatar" />
          <div className="app-title-copy">
            <h1>{chatTitle}</h1>
            <p>{topbarStatus}</p>
          </div>
        </div>
        <div className="app-meta">
          <RolePill role={runtime.roleName} />
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
                  <Link
                    key={item.href}
                    className={cn("ds-tab-btn", active ? "is-active" : undefined)}
                    href={item.href}
                    data-tab-icon={item.icon}
                  >
                    <span className="ds-tab-icon" aria-hidden="true" />
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
