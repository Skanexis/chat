import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { X } from "lucide-react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Button
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline" | "warning" | "success";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, disabled, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";
    
    const variants = {
      primary: "bg-violet-600 text-white hover:bg-violet-700 shadow-[0_0_15px_rgba(124,58,237,0.3)] border border-violet-500",
      secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700",
      danger: "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/20",
      warning: "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/20",
      success: "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20",
      ghost: "hover:bg-zinc-800 text-zinc-300 hover:text-white",
      outline: "border-2 border-zinc-700 text-zinc-300 hover:border-violet-500 hover:text-white bg-transparent",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs",
      md: "h-11 px-4 py-2 text-sm",
      lg: "h-14 px-8 text-base",
      icon: "h-10 w-10",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ? <span className="animate-spin mr-2 border-2 border-current border-t-transparent rounded-full w-4 h-4" /> : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

// Badge
export function Badge({ children, variant = "default", className }: { children: React.ReactNode, variant?: "default" | "success" | "danger" | "warning" | "info" | "outline", className?: string }) {
  const variants = {
    default: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
    success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    danger: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
    warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    info: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    outline: "bg-transparent text-zinc-400 border border-zinc-700",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider inline-flex items-center", variants[variant], className)}>
      {children}
    </span>
  );
}

// Avatar
export function Avatar({ src, alt, size = "md", isOnline, className }: { src: string, alt: string, size?: "sm" | "md" | "lg", isOnline?: boolean, className?: string }) {
  const sizes = { sm: "w-8 h-8", md: "w-10 h-10", lg: "w-16 h-16" };
  return (
    <div className={cn("relative inline-block rounded-full shrink-0", sizes[size], className)}>
      <img src={src} alt={alt} className="rounded-full object-cover w-full h-full bg-zinc-800 border border-zinc-700" />
      {isOnline !== undefined && (
        <span className={cn(
          "absolute bottom-0 right-0 rounded-full border-2 border-zinc-950",
          isOnline ? "bg-emerald-500" : "bg-zinc-500",
          size === "sm" ? "w-2.5 h-2.5" : size === "md" ? "w-3 h-3" : "w-4 h-4"
        )} />
      )}
    </div>
  );
}

// Input
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

// Textarea
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[80px] w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-y",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

// Select
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={cn(
            "flex h-11 w-full appearance-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-500">
          <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
        </div>
      </div>
    );
  }
);
Select.displayName = "Select";

// Modal (simplified for React Router/state usage)
export function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[70vh]">
          {children}
        </div>
      </div>
    </div>
  );
}

// Tooltip (CSS based for simplicity in this environment)
export function Tooltip({ children, content, position = "top" }: { children: React.ReactNode, content: React.ReactNode, position?: "top" | "bottom" | "left" | "right" }) {
  return (
    <div className="group relative inline-flex">
      {children}
      <div className={cn(
        "absolute hidden group-hover:block z-50 px-2 py-1 bg-zinc-800 text-xs text-white rounded shadow-lg whitespace-nowrap border border-zinc-700",
        position === "top" && "bottom-full left-1/2 -translate-x-1/2 mb-2",
        position === "bottom" && "top-full left-1/2 -translate-x-1/2 mt-2",
        position === "left" && "right-full top-1/2 -translate-y-1/2 mr-2",
        position === "right" && "left-full top-1/2 -translate-y-1/2 ml-2"
      )}>
        {content}
      </div>
    </div>
  );
}

// Card
export function Card({ children, className, hoverable = false }: { children: React.ReactNode, className?: string, hoverable?: boolean }) {
  return (
    <div className={cn(
      "bg-zinc-900/80 border border-zinc-800 rounded-2xl shadow-lg overflow-hidden relative backdrop-blur-md",
      hoverable && "hover:border-violet-500/50 hover:shadow-[0_0_20px_rgba(124,58,237,0.1)] transition-all",
      className
    )}>
      {children}
    </div>
  );
}
