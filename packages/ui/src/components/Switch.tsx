import { useId, type ReactNode } from "react";

/**
 * Accessible toggle — styles use theme utilities only (no fragile @apply in global CSS).
 */
export function Switch(props: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  /** Optional slot for status chip / meta on the right (before the switch) */
  aside?: ReactNode;
}) {
  const reactId = useId();
  const autoId = props.id ?? `switch-${reactId.replace(/:/g, "")}`;
  const descId = props.description ? `${autoId}-desc` : undefined;

  return (
    <div
      className={[
        "flex w-full items-start justify-between gap-4 rounded-2xl border border-white/[0.12] bg-surface-base p-3.5 sm:p-4",
        "transition-colors duration-200",
        props.disabled ? "opacity-45 pointer-events-none" : "hover:border-brand/25 hover:bg-surface-raised"
      ].join(" ")}
    >
      <div className="min-w-0 flex-1 pt-0.5">
        <label htmlFor={autoId} className="text-sm font-semibold text-malv-text leading-snug cursor-pointer">
          {props.label}
        </label>
        {props.description ? (
          <p id={descId} className="text-sm text-malv-muted mt-1.5 leading-relaxed">
            {props.description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {props.aside}
        <button
          id={autoId}
          type="button"
          role="switch"
          aria-checked={props.checked}
          aria-describedby={descId}
          disabled={props.disabled}
          onClick={() => props.onChange(!props.checked)}
          className={[
            "relative h-9 w-14 shrink-0 rounded-full border transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/55 focus-visible:ring-offset-2 focus-visible:ring-offset-malv-canvas",
            props.checked
              ? "border-brand/55 bg-gradient-to-r from-brand/55 to-indigo-600/50 shadow-glow-sm"
              : "border-white/[0.14] bg-surface-overlay"
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-1 left-1 h-7 w-7 rounded-full shadow-md transition-transform duration-200 ease-out",
              props.checked ? "translate-x-5 bg-white shadow-md" : "translate-x-0 bg-white/35"
            ].join(" ")}
          />
        </button>
      </div>
    </div>
  );
}
