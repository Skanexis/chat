import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn("ds-btn", `ds-btn-${variant}`, `ds-btn-${size}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="ds-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

type BadgeVariant = "default" | "neutral" | "success" | "warning" | "danger";

export function Badge({
  className,
  variant = "default",
  children
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span className={cn("ds-badge", `ds-badge-${variant}`, className)}>{children}</span>;
}

type AvatarSize = "sm" | "md" | "lg";

function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (words.length === 0) {
    return "?";
  }
  return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
}

type AvatarProps = {
  name: string;
  src?: string;
  size?: AvatarSize;
  online?: boolean;
  className?: string;
};

export function Avatar({ name, src, size = "md", online, className }: AvatarProps) {
  return (
    <span className={cn("ds-avatar", `ds-avatar-${size}`, className)}>
      {src ? <img src={src} alt={name} loading="lazy" /> : <span>{getInitials(name)}</span>}
      {online !== undefined ? <span className={cn("ds-presence", online ? "is-online" : "is-offline")} /> : null}
    </span>
  );
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ds-card", className)} {...props}>
      {children}
    </div>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="ds-section-head">
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

export function IconCircle({ children }: { children: ReactNode }) {
  return <span className="ds-icon-circle">{children}</span>;
}
