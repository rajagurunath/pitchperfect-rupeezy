"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ---------- Card ----------

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-ink-line bg-ink-card shadow-card",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 border-b border-ink-line", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-medium text-ink-text", className)} {...rest} />;
}

export function CardContent({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...rest} />;
}

// ---------- Button ----------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes: Record<ButtonSize, string> = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
  };
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-accent text-ink hover:opacity-90",
    secondary: "bg-ink-line text-ink-text hover:bg-[#2c313a]",
    ghost: "text-ink-text hover:bg-ink-line",
    danger: "bg-hot text-white hover:opacity-90",
  };
  return <button className={cn(base, sizes[size], variants[variant], className)} {...rest} />;
}

// ---------- Score / status badge ----------

export function ScoreBadge({ score }: { score: "HOT" | "WARM" | "COLD" | null }) {
  if (!score) return <span className="text-ink-mute text-xs">—</span>;
  const styles: Record<string, string> = {
    HOT: "bg-hot-soft text-hot border border-hot/30",
    WARM: "bg-warm-soft text-warm border border-warm/30",
    COLD: "bg-cold-soft text-cold border border-cold/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide",
        styles[score],
      )}
    >
      {score}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-ink-line text-ink-mute",
    calling: "bg-accent-soft text-accent border border-accent/30",
    "in-progress": "bg-accent-soft text-accent border border-accent/30",
    ringing: "bg-accent-soft text-accent border border-accent/30",
    completed: "bg-ink-line text-ink-text",
    failed: "bg-hot-soft text-hot border border-hot/30",
    "no-answer": "bg-warm-soft text-warm border border-warm/30",
    dnd: "bg-hot-soft text-hot border border-hot/30",
    done: "bg-ink-line text-ink-text",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium",
        styles[status] ?? "bg-ink-line text-ink-text",
      )}
    >
      {status}
    </span>
  );
}

// ---------- Input / Label ----------

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-sm text-ink-text outline-none focus:border-accent",
        props.className,
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-sm text-ink-text outline-none focus:border-accent",
        props.className,
      )}
    />
  );
}

export function Label({ className, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-ink-mute", className)} {...rest} />;
}
