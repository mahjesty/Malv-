import type { ReactNode } from "react";

export function SectionHeader(props: {
  title: string;
  description?: string;
  action?: ReactNode;
  kicker?: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {props.kicker ? (
          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-brand">{props.kicker}</div>
        ) : null}
        <h2 className="font-display text-display-lg text-malv-text">{props.title}</h2>
        {props.description ? <p className="text-sm text-malv-muted max-w-prose leading-relaxed">{props.description}</p> : null}
      </div>
      {props.action ? <div className="shrink-0 flex flex-wrap gap-2 justify-end">{props.action}</div> : null}
    </div>
  );
}
