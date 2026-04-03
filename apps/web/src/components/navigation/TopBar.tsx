import { useContext, type ReactNode } from "react";
import { ThemeContext } from "../../lib/theme/ThemeProvider";
import { Button } from "@malv/ui";
import { LogoMark } from "@malv/ui";
import { ActivityIndicator } from "@malv/ui";

function activityLabel(mode: "live" | "processing" | "idle") {
  switch (mode) {
    case "live":
      return "Live";
    case "processing":
      return "Processing";
    default:
      return "Idle";
  }
}

export function TopBar(props: {
  title?: string;
  subtitle?: string;
  activity?: "live" | "processing" | "idle";
  right?: ReactNode;
}) {
  const themeCtx = useContext(ThemeContext);
  if (!themeCtx) return null;

  const toggle = () => themeCtx.setTheme(themeCtx.theme === "dark" ? "light" : "dark");
  const activity = props.activity ?? "idle";

  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.1] bg-surface-void/90 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent opacity-90"
          aria-hidden
        />
        <div className="relative flex items-start sm:items-center justify-between gap-3 sm:gap-4 px-4 py-3 sm:py-3.5 max-w-[1600px] mx-auto w-full min-h-[3.25rem]">
          <div className="flex min-w-0 flex-1 items-start gap-3 lg:hidden">
            <LogoMark size={34} className="shrink-0 mt-0.5 text-malv-text/94" />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="font-display text-base font-bold tracking-tight text-malv-text truncate">MALV</div>
              {props.title ? (
                <div className="text-[11px] font-mono text-malv-muted truncate uppercase tracking-[0.14em] mt-0.5">{props.title}</div>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
              <span className="text-[9px] font-mono uppercase tracking-wider text-malv-muted">{activityLabel(activity)}</span>
              <ActivityIndicator mode={activity} />
            </div>
          </div>

          <div className="hidden lg:flex min-w-0 flex-1 items-center gap-5">
            <div className="min-w-0 border-l-[3px] border-brand pl-4 -ml-1">
              {props.title ? (
                <h1 className="font-display text-lg xl:text-xl font-bold tracking-tight text-malv-text truncate">{props.title}</h1>
              ) : (
                <h1 className="font-display text-lg xl:text-xl font-bold tracking-tight text-malv-text">Command surface</h1>
              )}
              {props.subtitle ? (
                <p className="text-sm text-malv-muted mt-1 max-w-2xl leading-relaxed line-clamp-2">{props.subtitle}</p>
              ) : null}
            </div>
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <div className="hidden xl:flex flex-col items-end gap-0.5 pr-1">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand">Runtime</span>
                <span className="text-[11px] font-mono text-malv-muted">{activityLabel(activity)}</span>
              </div>
              <ActivityIndicator mode={activity} />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 lg:ml-0">
            {props.right}
            <Button
              size="sm"
              variant="ghost"
              onClick={toggle}
              className="!px-3 !py-2 text-[10px] font-mono uppercase tracking-[0.15em]"
            >
              {themeCtx.theme === "dark" ? "Day" : "Night"}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
