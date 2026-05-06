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
  const navItems = [
    { label: "Chat", href: rootPath },
    { label: "Search", href: `${rootPath}/search` },
    { label: "Pinned", href: `${rootPath}/pinned` },
    { label: "Drafts", href: `${rootPath}/drafts` },
    { label: "Bookmarks", href: `${rootPath}/bookmarks` },
    { label: "Reminders", href: `${rootPath}/reminders` },
    { label: "Receipts", href: `${rootPath}/read-receipts` },
    { label: "Threads", href: `${rootPath}/thread-subscriptions` },
    { label: "Polls", href: `${rootPath}/polls` },
    { label: "Knowledge", href: `${rootPath}/knowledge` },
    { label: "Translate", href: `${rootPath}/translations` },
    { label: "E2E", href: `${rootPath}/e2e-devices` },
    { label: "Reputation", href: `${rootPath}/reputation` }
  ];

  if (runtime.isModerator) {
    navItems.push({ label: "Members", href: `${rootPath}/admin/members` });
    navItems.push({ label: "TempRooms", href: `${rootPath}/admin/temp-rooms` });
  }
  if (runtime.isAdmin) {
    navItems.push({ label: "Roles", href: `${rootPath}/admin/roles` });
    navItems.push({ label: "Notify", href: `${rootPath}/admin/channel-notify` });
    navItems.push({ label: "Incident", href: `${rootPath}/admin/incident` });
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

  return (
    <section className="app-shell">
      <header className="app-topbar">
        <div>
          <h1>{runtime.chat?.name ?? "Phantom Lab"}</h1>
          <p>
            chat_id: <code>{runtime.chatId}</code>
          </p>
        </div>
        <div className="app-meta">
          <RolePill role={runtime.roleName} />
          <Badge variant={runtime.wsConnected ? "success" : "warning"}>
            {runtime.wsConnected ? "WS online" : "WS reconnecting"}
          </Badge>
        </div>
      </header>

      <main className="app-body">{children}</main>

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
        <div className="app-session-line">
          <span>
            user: <code>{runtime.session?.user.id ?? "-"}</code>
          </span>
          <span>
            tg: <code>{runtime.session?.user.telegramId ?? "-"}</code>
          </span>
          <span>
            identities: <code>{runtime.identities.length}</code>
          </span>
          <span>
            mode: <code>{runtime.chat?.mode ?? "-"}</code>
          </span>
          <span>
            ws_event: <code>{runtime.wsLastEventAt ? new Date(runtime.wsLastEventAt).toLocaleTimeString() : "-"}</code>
          </span>
        </div>
        <nav className="ds-bottom-tabs" aria-label="Chat sections">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} className={cn("ds-tab-btn", active ? "is-active" : undefined)} href={item.href}>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </footer>
    </section>
  );
}
