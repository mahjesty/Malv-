import type { ReactNode } from "react";

type Accent = "gradient" | "edge" | "none";

/**
 * Modular dashboard surface — optional top gradient or left edge accent.
 */
export function DashboardPanel(props: {
  children: ReactNode;
  accent?: Accent;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}) {
  const accent = props.accent ?? "none";
  const pad = props.padding ?? "md";
  const padCls = { none: "", sm: "p-4 sm:p-5", md: "p-5 sm:p-6", lg: "p-6 sm:p-8" }[pad];

  return (
    <div
      className={[
        "relative rounded-2xl border border-white/[0.12] bg-surface-raised shadow-panel ring-1 ring-inset ring-white/[0.05] overflow-hidden",
        "transition-all duration-300 hover:border-brand/25 hover:shadow-lift",
        props.className
      ].filter(Boolean).join(" ")}
    >
      {accent === "gradient" ? (
        <div className="h-[2px] w-full bg-gradient-to-r from-brand via-accent-cyan to-accent-violet" />
      ) : null}
      {accent === "edge" ? (
        <div className="pointer-events-none absolute left-0 top-4 bottom-4 w-0.5 rounded-full bg-gradient-to-b from-brand to-accent-cyan/70" />
      ) : null}
      <div className={[padCls, accent === "edge" ? "pl-5 sm:pl-6" : ""].filter(Boolean).join(" ")}>{props.children}</div>
    </div>
  );
}
