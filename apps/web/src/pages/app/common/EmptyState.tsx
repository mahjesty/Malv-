import type { ReactNode } from "react";
import { LogoMark, StatusChip } from "@malv/ui";

export function EmptyState(props: {
  title: string;
  description: string;
  chip?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.12] bg-surface-raised px-5 py-8 sm:px-8 ring-1 ring-inset ring-white/[0.05]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="shrink-0">
          <LogoMark size={44} variant="full" className="text-malv-text/92" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {props.chip ? (
            <div>
              <StatusChip label={props.chip} status="neutral" />
            </div>
          ) : null}
          <div>
            <div className="font-display text-xl font-bold tracking-tight text-malv-text">{props.title}</div>
            <div className="text-malv-muted text-sm mt-2 leading-relaxed max-w-prose">{props.description}</div>
          </div>
          {props.action ? <div className="pt-1">{props.action}</div> : null}
        </div>
      </div>
    </div>
  );
}
