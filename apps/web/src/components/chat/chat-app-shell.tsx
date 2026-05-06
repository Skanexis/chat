"use client";

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
  const mainNavItems = [{ label: "Chat", href: rootPath }];
  const workspaceNavItems: Array<{ label: string; href: string }> = [];
  const adminNavItems: Array<{ label: string; href: string }> = [];

  if (runtime.isModerator) {
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

  if (runtime.isModerator) {
    adminNavItems.push({ label: "Admin Hub", href: `${rootPath}/admin` });
    adminNavItems.push({ label: "Members", href: `${rootPath}/admin/members` });
    adminNavItems.push({ label: "Member Meta", href: `${rootPath}/admin/member-meta` });
    adminNavItems.push({ label: "Temp Rooms", href: `${rootPath}/admin/temp-rooms` });
    adminNavItems.push({ label: "Tickets", href: `${rootPath}/admin/tickets` });
  }

  if (runtime.isAdmin) {
    adminNavItems.push({ label: "Roles", href: `${rootPath}/admin/roles` });
    adminNavItems.push({ label: "Limits", href: `${rootPath}/admin/limits` });
    adminNavItems.push({ label: "Invites", href: `${rootPath}/admin/invites` });
    adminNavItems.push({ label: "Notify", href: `${rootPath}/admin/channel-notify` });
    adminNavItems.push({ label: "Broadcasts", href: `${rootPath}/admin/broadcasts` });
    adminNavItems.push({ label: "Webhooks", href: `${rootPath}/admin/webhooks` });
    adminNavItems.push({ label: "Automation", href: `${rootPath}/admin/automation` });
    adminNavItems.push({ label: "Incident", href: `${rootPath}/admin/incident` });
    adminNavItems.push({ label: "Audit", href: `${rootPath}/admin/audit` });
  }

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

      <footer className="app-footer">
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
    </section>
  );
}
