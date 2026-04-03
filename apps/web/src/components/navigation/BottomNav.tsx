import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

/** Mobile primary nav — premium surface; see `src/lib/ui/premiumUiBoundary.ts`. */

type Item = {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  /** Primary CTA — e.g. New Chat: elevated surface, glow, stronger hover feedback. */
  variant?: "default" | "primary";
};

export function BottomNav(props: { items: Item[] }) {
  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-30 pointer-events-none pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3"
      aria-label="Primary"
    >
      <div className="pointer-events-auto mx-auto max-w-[400px] w-full">
        <div className="rounded-[1.35rem] border border-white/[0.12] bg-surface-void/95 backdrop-blur-xl shadow-panel-deep ring-1 ring-inset ring-white/[0.06]">
          <div
            className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-brand/55 to-transparent rounded-full opacity-90"
            aria-hidden
          />
          <div className="grid grid-cols-5 gap-0.5 p-1.5">
            {props.items.slice(0, 5).map((it) => {
              const primary = it.variant === "primary";
              return (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  className={({ isActive }) =>
                    primary
                      ? [
                          "group relative flex flex-col items-center justify-center overflow-hidden rounded-[1rem] py-2 min-h-[3.35rem] transition-all duration-200 z-0",
                          "border border-white/10 bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_18px_-6px_rgba(96,165,250,0.2)]",
                          "hover:scale-[1.04] hover:z-[1] hover:border-white/[0.14] hover:bg-white/[0.08] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_26px_-4px_rgba(96,165,250,0.35)]",
                          "active:scale-[0.97]",
                          isActive
                            ? "text-malv-text ring-1 ring-inset ring-brand/45"
                            : "text-malv-muted hover:text-malv-text"
                        ].join(" ")
                      : [
                          "flex flex-col items-center justify-center rounded-[1rem] py-2 min-h-[3.35rem] transition-all duration-200",
                          "active:scale-[0.97]",
                          isActive
                            ? "bg-gradient-to-b from-surface-raised to-surface-raised/90 text-malv-text ring-1 ring-inset ring-brand/40 shadow-glow-sm"
                            : "text-malv-muted hover:text-malv-text hover:bg-surface-raised/65"
                        ].join(" ")
                  }
                >
                  {primary ? (
                    <span
                      className="pointer-events-none absolute inset-0 opacity-45 transition-opacity duration-200 group-hover:opacity-75"
                      style={{
                        background:
                          "radial-gradient(ellipse 90% 70% at 50% 0%, rgba(96, 165, 250, 0.22), transparent 58%)"
                      }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="relative mb-0.5 [&_svg]:stroke-[1.6]">{it.icon}</span>
                  <span
                    className={
                      primary
                        ? "relative text-[10px] font-semibold tracking-tight leading-none text-malv-text/90"
                        : "text-[9px] font-bold uppercase tracking-[0.07em] leading-none"
                    }
                  >
                    {it.label}
                  </span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
