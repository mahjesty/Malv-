import type { ReactNode } from "react";

const tones: Record<"cyan" | "violet" | "emerald" | "amber" | "neutral", string> = {
  cyan: "border-accent-cyan/40 bg-accent-cyan/12 text-cyan-50",
  violet: "border-violet-400/40 bg-violet-500/14 text-violet-50",
  emerald: "border-emerald-400/40 bg-emerald-500/14 text-emerald-50",
  amber: "border-amber-400/40 bg-amber-500/14 text-amber-50",
  neutral: "border-white/[0.14] bg-surface-overlay text-malv-text"
};

/**
 * Compact telemetry / state pill — distinct from StatusChip (less “badge”, more “signal”).
 */
export function SignalPill(props: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  const t = props.tone ?? "neutral";
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        tones[t],
        props.className
      ].filter(Boolean).join(" ")}
    >
      {props.children}
    </span>
  );
}
