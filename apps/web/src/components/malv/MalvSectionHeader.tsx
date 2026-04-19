import * as React from "react";

import { cn } from "@/lib/utils";

export type MalvSectionHeaderProps = React.ComponentProps<"div"> & {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Trailing actions (buttons, tabs, meta) */
  actions?: React.ReactNode;
  /** Visually de-emphasize the divider below */
  divider?: boolean;
};

function MalvSectionHeader({
  className,
  title,
  subtitle,
  actions,
  divider = true,
  ...props
}: MalvSectionHeaderProps) {
  return (
    <div
      data-malv-foundation="section-header"
      className={cn("space-y-4", className)}
      {...props}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="font-display text-display-lg text-malv-text tracking-tight">
            {title}
          </h2>
          {subtitle ? (
            <p className="max-w-prose text-sm leading-relaxed text-[color:var(--malv-color-text-secondary)]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
      {divider ? (
        <div
          className="h-px w-full bg-gradient-to-r from-transparent via-malv-f-gold/18 to-transparent"
          aria-hidden
        />
      ) : null}
    </div>
  );
}

export { MalvSectionHeader };
