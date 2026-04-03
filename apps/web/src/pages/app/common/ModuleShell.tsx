import type { ReactNode } from "react";
import { Card } from "@malv/ui";

export function ModuleShell(props: {
  title: string;
  subtitle?: string;
  kicker?: string;
  right?: ReactNode;
  children: ReactNode;
  /** Skip outer glass card — use for dense layouts (e.g. settings) that manage their own surfaces. */
  flush?: boolean;
  /** Narrow column for form-like pages (mobile-first). */
  maxWidth?: "default" | "narrow";
  /**
   * `chat` — tighter chrome, wider canvas, smaller hero title: keeps Operator immersive
   * without sacrificing ModuleShell semantics. See `../lib/ui/premiumUiBoundary.ts`.
   */
  density?: "default" | "chat";
  /** Extra classes on the outer page container (spacing with shell). */
  className?: string;
}) {
  const density = props.density ?? "default";
  const maxClass =
    props.maxWidth === "narrow"
      ? "max-w-[400px] sm:max-w-3xl"
      : density === "chat"
        ? "max-w-[min(100%,1420px)]"
        : "max-w-[1200px]";

  const headerMb = density === "chat" ? "mb-5 sm:mb-6" : "mb-7 lg:mb-9";
  const titleClass =
    density === "chat"
      ? "font-display text-[1.35rem] sm:text-display-lg text-malv-text tracking-tight"
      : "font-display text-display-xl text-malv-text";
  const pyClass = density === "chat" ? "py-4 sm:py-6 lg:py-8" : "py-6 sm:py-8 lg:py-10";

  return (
    <div className={["relative w-full mx-auto px-4 sm:px-6 lg:px-8", pyClass, maxClass, props.className].filter(Boolean).join(" ")}>
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.22] bg-[size:40px_40px] bg-malv-grid"
        style={{ maskImage: "radial-gradient(ellipse at 50% 0%, black, transparent 72%)" }}
      />

      <header className={headerMb}>
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1.5 sm:space-y-2 max-w-3xl">
            {props.kicker ? (
              <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-brand">{props.kicker}</div>
            ) : null}
            <h1 className={titleClass}>{props.title}</h1>
            {props.subtitle ? (
              <p
                className={[
                  "text-malv-muted leading-relaxed",
                  density === "chat" ? "text-sm sm:text-[15px] max-w-2xl" : "text-[15px] sm:text-base"
                ].join(" ")}
              >
                {props.subtitle}
              </p>
            ) : null}
          </div>
          {props.right ? <div className="shrink-0 flex flex-wrap gap-2 justify-end">{props.right}</div> : null}
        </div>
      </header>

      {props.flush ? (
        <div>{props.children}</div>
      ) : (
        <Card variant="glass" elevation="raised" className="p-0 overflow-hidden">
          <div className="p-5 sm:p-6 lg:p-8">{props.children}</div>
        </Card>
      )}
    </div>
  );
}
