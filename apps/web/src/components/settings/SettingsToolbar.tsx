import type { ReactNode } from "react";

/**
 * Primary actions for settings — stacks on small screens, aligns end on desktop.
 * Uses plain layout utilities (no global @apply).
 */
export function SettingsToolbar(props: {
  primary: ReactNode;
  secondary?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-white/[0.12] pt-6">
      <div className="order-2 text-xs text-malv-muted leading-relaxed sm:order-1 sm:max-w-md">{props.hint}</div>
      <div className="order-1 flex flex-col gap-2 sm:order-2 sm:flex-row sm:justify-end sm:gap-3 w-full sm:w-auto">
        {props.secondary}
        {props.primary}
      </div>
    </div>
  );
}
