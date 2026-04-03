type Mode = "live" | "processing" | "idle";

const copy: Record<Mode, { label: string; width: string; bar: string }> = {
  live: { label: "Live", width: "w-[88%]", bar: "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.45)]" },
  processing: { label: "Processing", width: "w-[62%]", bar: "bg-gradient-to-r from-brand via-accent-cyan to-brand animate-pulse-soft" },
  idle: { label: "Idle", width: "w-[22%]", bar: "bg-white/35" }
};

export function ActivityIndicator(props: { mode: Mode; className?: string }) {
  const c = copy[props.mode];
  return (
    <div className={["flex items-center gap-2", props.className].filter(Boolean).join(" ")}>
      <div className="h-1.5 w-16 rounded-full bg-white/[0.12] overflow-hidden ring-1 ring-inset ring-white/[0.08]">
        <div className={["h-full rounded-full transition-all duration-500", c.width, c.bar].join(" ")} />
      </div>
      <span className="text-[11px] font-mono uppercase tracking-wider text-malv-muted">{c.label}</span>
    </div>
  );
}
