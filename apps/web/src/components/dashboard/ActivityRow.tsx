import type { ReactNode } from "react";

const dot: Record<"live" | "idle" | "warn" | "muted", string> = {
  live: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]",
  idle: "bg-malv-muted",
  warn: "bg-amber-400",
  muted: "bg-white/25"
};

export function ActivityRow(props: {
  title: string;
  meta?: string;
  tone?: keyof typeof dot;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const t = props.tone ?? "muted";
  return (
    <div className="group flex gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-white/[0.1] hover:bg-surface-void/80">
      <span className={["mt-1.5 h-2 w-2 shrink-0 rounded-full", dot[t]].join(" ")} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-malv-text leading-snug">{props.title}</div>
            {props.meta ? <div className="text-xs text-malv-muted mt-0.5 font-mono tabular-nums">{props.meta}</div> : null}
          </div>
          {props.right ? <div className="shrink-0">{props.right}</div> : null}
        </div>
        {props.children ? <div className="mt-2 text-sm text-malv-muted leading-relaxed">{props.children}</div> : null}
      </div>
    </div>
  );
}
