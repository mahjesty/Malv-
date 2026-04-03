import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { formatCallDuration } from "./malvCallFormat";

/**
 * Premium top strip for voice/video sessions — transport labels come from props.
 */
export function MalvCallStatusBar(props: {
  title: string;
  durationSeconds: number;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "relative flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.08]",
        props.className ?? ""
      ].join(" ")}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-1.5 shrink-0">
          <motion.div
            className="h-2 w-2 rounded-full bg-emerald-400/90"
            animate={{ opacity: [1, 0.45, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="text-xs font-medium text-malv-text/85 truncate">{props.title}</span>
        </div>
        <div className="h-3 w-px bg-white/10 shrink-0" />
        <span className="text-xs font-mono text-malv-text/50 tabular-nums">{formatCallDuration(props.durationSeconds)}</span>
        {props.leftSlot}
      </div>
      <div className="flex items-center gap-2 shrink-0">{props.rightSlot}</div>
    </div>
  );
}
