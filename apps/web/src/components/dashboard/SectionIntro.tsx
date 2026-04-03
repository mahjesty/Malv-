import type { ReactNode } from "react";

export function SectionIntro(props: {
  kicker: string;
  title: string;
  description?: string;
  action?: ReactNode;
  /** For `aria-labelledby` on parent `<section>`. */
  titleId?: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 lg:mb-5">
      <div className="min-w-0 space-y-1.5">
        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-brand">{props.kicker}</p>
        <h2 id={props.titleId} className="font-display text-lg sm:text-xl font-bold tracking-tight text-malv-text">
          {props.title}
        </h2>
        {props.description ? <p className="text-sm text-malv-muted max-w-2xl leading-relaxed">{props.description}</p> : null}
      </div>
      {props.action ? <div className="shrink-0">{props.action}</div> : null}
    </div>
  );
}
