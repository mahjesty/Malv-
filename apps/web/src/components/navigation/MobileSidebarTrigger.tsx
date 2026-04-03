import { Menu } from "lucide-react";
import { useMalvAppShellOptional } from "../../lib/context/MalvAppShellContext";

/** Opens the shell sidebar. Use `alwaysVisible` on immersive routes (e.g. voice) where the desktop sidebar is hidden. */
export function MobileSidebarTrigger(props: { className?: string; alwaysVisible?: boolean }) {
  const shell = useMalvAppShellOptional();
  const { alwaysVisible, className } = props;
  return (
    <button
      type="button"
      className={[
        "rounded-lg p-2 text-malv-text/80 transition-colors hover:bg-white/[0.06] hover:text-malv-text",
        alwaysVisible ? "" : "lg:hidden",
        className ?? ""
      ].join(" ")}
      onClick={() => shell?.setMobileSidebarOpen(true)}
      aria-label="Open navigation"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
