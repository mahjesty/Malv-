import type { LegacyRef, ReactNode, RefObject } from "react";

/**
 * Scroll surface + ambient field for the operator transcript.
 */
export function MalvMessageList(props: {
  listRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.07] shadow-panel-deep", props.className ?? ""].join(" ")}>
      <div className="relative flex items-center justify-between gap-3 border-b border-white/[0.06] bg-gradient-to-r from-surface-base/80 via-surface-base/40 to-transparent px-4 py-3 backdrop-blur-md sm:px-5">
        <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-malv-text/50">Live transcript</div>
        <div className="hidden text-[10px] font-mono text-malv-text/35 sm:block">policy-aware memory</div>
      </div>
      <div ref={props.listRef as LegacyRef<HTMLDivElement>} className="relative flex-1 overflow-auto px-3 py-5 scroll-smooth sm:px-6 sm:py-6">
        <div className="pointer-events-none absolute inset-0 opacity-[0.5] bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(96,165,250,0.07),transparent_55%)]" aria-hidden />
        <div className="relative space-y-5 sm:space-y-6">{props.children}</div>
      </div>
    </div>
  );
}
