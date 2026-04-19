import React from "react";
import { motion } from "framer-motion";
import { LoadingSpinner } from "./LoadingSpinner";

/**
 * MALV global button hierarchy (aligned with `MalvButton` in apps/web):
 * - primary: live accent — send, submit, confirm, continue
 * - premium: gold — rare high-value / premium CTAs only
 * - secondary: dark surface + subtle border — cancel, back, low emphasis
 * - ghost: minimal text-style
 * - danger: destructive
 */
type ButtonVariant = "primary" | "premium" | "ghost" | "danger" | "secondary";
type ButtonSize = "sm" | "md" | "lg";

export function Button(props: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  type?: "button" | "submit";
}) {
  const variant = props.variant ?? "primary";
  const size = props.size ?? "md";
  const loading = Boolean(props.loading);
  const disabled = props.disabled || loading;

  const base =
    "relative inline-flex items-center justify-center gap-2 rounded-xl font-medium tracking-tight transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--malv-f-ring-live-rgb)/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-malv-canvas " +
    "disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none select-none " +
    "active:scale-[0.98]";

  const variants: Record<ButtonVariant, string> = {
    primary:
      "border border-[rgb(var(--malv-f-live-rgb)/0.25)] bg-[rgb(var(--malv-f-live-rgb)/0.15)] text-malv-text " +
      "shadow-[inset_0_1px_0_rgb(var(--malv-f-live-rgb)/0.1),0_0_22px_rgb(var(--malv-f-live-rgb)/0.08)] " +
      "hover:border-[rgb(var(--malv-f-live-rgb)/0.35)] hover:bg-[rgb(var(--malv-f-live-rgb)/0.22)] hover:shadow-[inset_0_1px_0_rgb(var(--malv-f-live-rgb)/0.14),0_0_30px_rgb(var(--malv-f-live-rgb)/0.12)] " +
      "active:bg-[rgb(var(--malv-f-live-rgb)/0.12)]",
    premium:
      "border-[color:var(--malv-color-gold-ring)] bg-gradient-to-b from-malv-f-gold/20 to-malv-f-gold/10 text-[rgb(245_240_232)] " +
      "shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_0_24px_var(--malv-color-gold-glow)] " +
      "hover:border-malv-f-gold/48 hover:from-malv-f-gold/26 hover:to-malv-f-gold/14",
    secondary:
      "border border-white/10 bg-surface-raised/80 text-malv-text shadow-sm " +
      "hover:border-white/14 hover:bg-surface-overlay/90",
    ghost:
      "border border-transparent bg-transparent text-malv-muted " +
      "hover:border-white/8 hover:bg-white/[0.04] hover:text-malv-text",
    danger:
      "bg-red-600/25 text-red-50 border border-red-500/45 hover:bg-red-600/35 hover:border-red-400/55"
  };

  const sizes: Record<ButtonSize, string> = {
    sm: "text-xs px-3 py-2 min-h-[36px]",
    md: "text-sm px-4 py-2.5 min-h-[42px]",
    lg: "text-base px-6 py-3 min-h-[48px]"
  };

  return (
    <motion.button
      type={props.type ?? "button"}
      data-malv-ui-button
      data-variant={variant}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      className={[base, variants[variant], sizes[size], props.className].filter(Boolean).join(" ")}
      onClick={disabled ? undefined : props.onClick}
      disabled={disabled}
      aria-busy={loading || undefined}
    >
      {loading ? <LoadingSpinner size={16} /> : null}
      <span className={loading ? "opacity-90" : undefined}>{props.children}</span>
    </motion.button>
  );
}
