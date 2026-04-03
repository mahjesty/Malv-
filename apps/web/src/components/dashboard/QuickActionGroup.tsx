import type { ReactNode } from "react";

/** Wraps primary operator actions with consistent spacing and touch targets. */
export function QuickActionGroup(props: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center",
        props.className
      ].filter(Boolean).join(" ")}
    >
      {props.children}
    </div>
  );
}
