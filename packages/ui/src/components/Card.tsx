import React from "react";

export type PanelElevation = "flat" | "raised" | "deep";

export function Card(props: {
  className?: string;
  children: React.ReactNode;
  variant?: "default" | "glass";
  elevation?: PanelElevation;
  interactive?: boolean;
}) {
  const variant = props.variant ?? "default";
  const elevation = props.elevation ?? "raised";

  /* "glass" = premium solid panel — no blur; readability-first (used across app + marketing). */
  const glass =
    "bg-surface-raised border border-white/[0.12] shadow-panel " +
    "ring-1 ring-inset ring-white/[0.06]";

  const solid = {
    flat: "bg-surface-base border border-white/[0.1]",
    raised: "bg-surface-raised border border-white/[0.12] shadow-panel ring-1 ring-inset ring-white/[0.05]",
    deep: "bg-surface-overlay border border-white/[0.14] shadow-panel-deep ring-1 ring-inset ring-white/[0.07]"
  };

  const cls = variant === "glass" ? glass : solid[elevation];

  const interactive =
    props.interactive === true
      ? " transition-all duration-200 hover:border-brand/35 hover:shadow-lift hover:-translate-y-0.5"
      : "";

  return (
    <div className={["rounded-2xl p-4", cls, interactive, props.className].filter(Boolean).join(" ")}>{props.children}</div>
  );
}
