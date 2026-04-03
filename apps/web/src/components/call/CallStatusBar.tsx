import { motion } from "motion/react";
import { Loader2, Sparkles, Wifi } from "lucide-react";
import { cn } from "@/lib/cn";
import { malvTheme } from "@/styles/malv-theme";
import type { LiveAvatarState } from "@/components/avatar/LiveAvatarPanel";

export interface CallStatusBarProps {
  title?: string;
  status?: LiveAvatarState;
  className?: string;
}

function statusLabel(status: LiveAvatarState): string {
  if (status === "generating") return "Generating avatar";
  if (status === "switching") return "Switching avatar";
  return "Connected";
}

export function CallStatusBar({ title = "MALV Live Session", status = "live", className }: CallStatusBarProps) {
  const Icon = status === "live" ? Wifi : status === "generating" ? Loader2 : Sparkles;

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative flex w-full items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3",
        malvTheme.radius.md,
        malvTheme.surfaces.glass,
        className
      )}
    >
      <div className="min-w-0">
        <p className={cn("truncate text-sm font-semibold tracking-tight sm:text-base", malvTheme.text.title)}>{title}</p>
        <p className={cn("mt-0.5 truncate text-[11px] sm:text-xs", malvTheme.text.muted)}>Private cinematic call surface</p>
      </div>

      <div className={cn("inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[11px] sm:text-xs", malvTheme.surfaces.overlay)}>
        {status === "live" ? (
          <motion.span
            className="h-2 w-2 rounded-full bg-emerald-300"
            animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.2, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : null}
        <Icon className={cn("h-3.5 w-3.5 text-cyan-200", status === "generating" && "animate-spin")} />
        <span className="font-medium text-slate-100">{statusLabel(status)}</span>
      </div>
    </motion.header>
  );
}
