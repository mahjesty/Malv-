export function SegmentedControl<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
}) {
  return (
    <div
      className={[
        "inline-flex flex-wrap rounded-xl border border-white/[0.12] bg-surface-void p-1 shadow-inner gap-1",
        props.className
      ].filter(Boolean).join(" ")}
      role="tablist"
    >
      {props.options.map((o) => {
        const active = o.value === props.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => props.onChange(o.value)}
            className={[
              "rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200",
              active
                ? "bg-surface-raised text-malv-text shadow-panel border border-brand/35 ring-1 ring-inset ring-white/[0.06]"
                : "text-malv-muted hover:text-malv-text"
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
