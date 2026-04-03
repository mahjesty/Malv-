import type { ReactNode } from "react";

/**
 * Grouped settings block — consistent hierarchy for preferences / operator controls.
 */
export function SettingsSection(props: {
  title: string;
  description?: string;
  children: ReactNode;
  /** e.g. StatusChip */
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "rounded-2xl border border-white/[0.12] bg-surface-raised shadow-panel ring-1 ring-inset ring-white/[0.05]",
        "transition-shadow duration-200 hover:shadow-lift hover:border-brand/20",
        props.className
      ].filter(Boolean).join(" ")}
    >
      <header className="flex flex-col gap-2 border-b border-white/[0.1] px-4 py-4 sm:px-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 bg-surface-void/50">
        <div className="min-w-0 space-y-1">
          <h2 className="font-display text-base font-bold tracking-tight text-malv-text">{props.title}</h2>
          {props.description ? <p className="text-sm text-malv-muted leading-relaxed">{props.description}</p> : null}
        </div>
        {props.badge ? <div className="shrink-0">{props.badge}</div> : null}
      </header>
      <div className="p-4 sm:p-5 space-y-3 bg-surface-raised">{props.children}</div>
    </section>
  );
}
