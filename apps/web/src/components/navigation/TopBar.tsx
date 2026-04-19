import { useContext, type ReactNode } from "react";
import { ThemeContext } from "../../lib/theme/ThemeProvider";

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function ActivityDot({ mode }: { mode: "live" | "processing" | "idle" }) {
  if (mode === "live") {
    return (
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
    );
  }
  if (mode === "processing") {
    return (
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-40" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand/80" />
      </span>
    );
  }
  return <span className="h-2 w-2 shrink-0 rounded-full bg-malv-text/20" />;
}

export function TopBar(props: {
  title?: string;
  subtitle?: string;
  activity?: "live" | "processing" | "idle";
  right?: ReactNode;
  /** Tighter row + typography (e.g. Explore routes). */
  dense?: boolean;
  /** No bottom rule — blends with page chrome. */
  edgeless?: boolean;
}) {
  const themeCtx = useContext(ThemeContext);
  if (!themeCtx) return null;

  const toggle = () => themeCtx.setTheme(themeCtx.theme === "dark" ? "light" : "dark");
  const activity = props.activity ?? "idle";
  const isDark = themeCtx.theme === "dark";
  const dense = Boolean(props.dense);
  const edgeless = Boolean(props.edgeless);

  return (
    <header
      className={["sticky top-0 z-20", edgeless ? "" : "border-b"].join(" ")}
      style={{
        background: "rgb(var(--malv-canvas-rgb) / 0.9)",
        borderColor: edgeless ? "transparent" : "rgb(var(--malv-border-rgb) / 0.08)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        transition: "background-color 220ms ease, border-color 220ms ease"
      }}
    >
      <div
        className={[
          "relative mx-auto flex w-full max-w-[1600px] items-center justify-between gap-2",
          dense ? "h-8 px-2.5" : "h-12 gap-3 px-4"
        ].join(" ")}
      >
        <div className={["flex min-w-0 flex-1 items-center", dense ? "gap-1.5" : "gap-3"].join(" ")}>
          <div className={["flex min-w-0 items-center", dense ? "gap-1" : "gap-2"].join(" ")}>
            <ActivityDot mode={activity} />
            <div className="min-w-0 leading-tight">
              {dense ? (
                <>
                  <span className="block truncate text-[11px] font-semibold tracking-tight text-malv-text">
                    {props.title ?? "MALV"}
                  </span>
                  {props.subtitle ? (
                    <span className="mt-0.5 block truncate text-[9px] text-malv-text/38 sm:mt-0 sm:inline sm:ml-1 sm:text-[10px]">
                      {props.subtitle}
                    </span>
                  ) : null}
                </>
              ) : (
                <div className="min-w-0">
                  <span className="truncate text-[13px] font-semibold tracking-tight text-malv-text">
                    {props.title ?? "MALV"}
                  </span>
                  {props.subtitle ? (
                    <span className="hidden lg:inline lg:ml-2 text-[12px] text-malv-text/38 truncate">
                      {props.subtitle}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={["flex shrink-0 items-center", dense ? "gap-1" : "gap-1.5"].join(" ")}>
          {props.right}
          <button
            type="button"
            onClick={toggle}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className={[
              "flex items-center justify-center rounded-md text-malv-text/50 transition-colors hover:bg-malv-text/[0.06] hover:text-malv-text/80 focus-visible:outline-none",
              dense ? "h-7 w-7" : "h-8 w-8 rounded-lg"
            ].join(" ")}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </header>
  );
}
