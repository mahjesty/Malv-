import React from "react";
import { motion } from "framer-motion";
import { LoadingSpinner } from "./LoadingSpinner";

type ButtonVariant = "primary" | "ghost" | "danger" | "secondary";
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
    "relative inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/55 focus-visible:ring-offset-2 focus-visible:ring-offset-malv-canvas " +
    "disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none select-none " +
    "active:scale-[0.98]";

  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-gradient-to-br from-brand via-brand to-indigo-600 text-white shadow-glow-sm " +
      "hover:shadow-glow hover:brightness-[1.05] border border-white/15",
    secondary:
      "bg-surface-raised text-malv-text border border-white/[0.12] shadow-panel " +
      "hover:bg-surface-overlay hover:border-brand/30 hover:shadow-lift",
    ghost:
      "bg-transparent text-malv-text border border-white/[0.08] " +
      "hover:bg-white/[0.06] hover:border-white/[0.14]",
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
