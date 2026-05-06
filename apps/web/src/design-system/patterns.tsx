import { type ReactNode } from "react";

import { Button, Card, cn } from "@/design-system/primitives";

export type GlobalUiState =
  | "loading"
  | "empty"
  | "ready"
  | "updating"
  | "error"
  | "forbidden"
  | "unauthorized"
  | "rate_limited"
  | "not_found";

type StateBlockProps = {
  state: GlobalUiState;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
};

const ICON_BY_STATE: Record<Exclude<GlobalUiState, "ready" | "updating">, string> = {
  loading: "◌",
  empty: "○",
  error: "!",
  forbidden: "⛔",
  unauthorized: "🔒",
  rate_limited: "⏱",
  not_found: "?"
};

export function StateBlock({ state, title, description, actionLabel, onAction, children }: StateBlockProps) {
  if (state === "ready" || state === "updating") {
    return (
      <div className={cn("ds-state-ready", state === "updating" ? "is-updating" : undefined)}>
        {children}
        {state === "updating" ? (
          <div className="ds-state-overlay" aria-live="polite">
            <span className="ds-spinner" /> Updating...
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Card className="ds-state-card">
      <span className={cn("ds-state-icon", state === "loading" ? "is-loading" : undefined)}>{ICON_BY_STATE[state]}</span>
      <h3>{title ?? state.replace("_", " ")}</h3>
      {description ? <p>{description}</p> : null}
      {onAction ? (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel ?? "Retry"}
        </Button>
      ) : null}
    </Card>
  );
}

export function ErrorSurface({
  code,
  title,
  message,
  actionLabel = "Retry",
  onAction
}: {
  code: number | string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card className="ds-error-surface" role="alert">
      <span className="ds-error-code">{code}</span>
      <h3>{title}</h3>
      <p>{message}</p>
      {onAction ? (
        <Button variant="danger" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </Card>
  );
}

export function RolePill({ role }: { role: string }) {
  const normalized = role.trim().toLowerCase();
  const variant =
    normalized.includes("admin") ? "default" : normalized.includes("moderator") ? "warning" : "neutral";
  return <span className={cn("ds-role-pill", `ds-role-pill-${variant}`)}>{role}</span>;
}

export function RestrictionHint({ message, variant = "warning" }: { message: string; variant?: "warning" | "danger" | "info" }) {
  return <div className={cn("ds-restriction", `ds-restriction-${variant}`)}>{message}</div>;
}

export function SystemBanner({
  title,
  message,
  variant = "info"
}: {
  title: string;
  message: string;
  variant?: "info" | "warning" | "danger" | "success";
}) {
  return (
    <div className={cn("ds-system-banner", `ds-system-banner-${variant}`)} role="status" aria-live="polite">
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

export function PermissionGate({
  allowed,
  hint,
  children
}: {
  allowed: boolean;
  hint?: string;
  children: ReactNode;
}) {
  if (allowed) {
    return <>{children}</>;
  }
  return <RestrictionHint message={hint ?? "Permission required for this action."} variant="danger" />;
}

export function AdminPageScaffold({
  title,
  subtitle,
  actions,
  children
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="app-tab-card">
      <div className="ds-admin-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="ds-admin-actions">{actions}</div> : null}
      </div>
      <div className="ds-admin-body">{children}</div>
    </Card>
  );
}
