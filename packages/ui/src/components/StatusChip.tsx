export type SemanticStatus =
  | "ok"
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "running"
  | "queued"
  | "failed";

const styles = {
  success: "bg-emerald-500/18 border border-emerald-400/40 text-emerald-50",
  warning: "bg-amber-500/16 border border-amber-400/40 text-amber-50",
  danger: "bg-red-500/18 border border-red-400/45 text-red-50",
  failed: "bg-red-500/20 border border-red-400/50 text-red-50",
  neutral: "bg-surface-overlay border border-white/[0.14] text-malv-text",
  running: "bg-accent-cyan/14 border border-accent-cyan/40 text-cyan-50",
  queued: "bg-violet-500/16 border border-violet-400/45 text-violet-50"
} as const;

type StyleKey = keyof typeof styles;

function normalize(s: SemanticStatus): StyleKey {
  if (s === "ok") return "success";
  return s as StyleKey;
}

export function StatusChip(props: {
  status?: SemanticStatus;
  label: string;
  className?: string;
  pulse?: boolean;
}) {
  const raw = props.status ?? "neutral";
  const key = normalize(raw);
  const pulse = props.pulse || key === "running";

  return (
    <div
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase",
        styles[key],
        pulse ? "animate-pulse-soft" : "",
        props.className
      ].join(" ")}
    >
      {key === "running" ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-cyan/50 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-cyan" />
        </span>
      ) : null}
      {props.label}
    </div>
  );
}
