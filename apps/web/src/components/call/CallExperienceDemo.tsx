import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveAvatarPanel, type LiveAvatarState } from "@/components/avatar/LiveAvatarPanel";
import { CallControlDock } from "@/components/call/CallControlDock";
import { CallScreenShell } from "@/components/call/CallScreenShell";
import { CallStatusBar } from "@/components/call/CallStatusBar";
import { CallSafeArea } from "@/components/layout/CallSafeArea";
import { cn } from "@/lib/cn";
import { malvTheme } from "@/styles/malv-theme";

type DemoMode = "idle" | "speaking" | "generating" | "switching";

function modeToAvatarState(mode: DemoMode): LiveAvatarState {
  if (mode === "generating") return "generating";
  if (mode === "switching") return "switching";
  return "live";
}

export function CallExperienceDemo() {
  const [mode, setMode] = useState<DemoMode>("idle");
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  const avatarState = modeToAvatarState(mode);
  const speaking = mode === "speaking" || mode === "generating";

  const timelineLabel = useMemo(() => {
    if (mode === "generating") return "Generation started: current avatar remains active";
    if (mode === "switching") return "Generation complete: transition to new avatar";
    if (mode === "speaking") return "Live speaking stream";
    return "Live connected and listening";
  }, [mode]);

  return (
    <CallScreenShell>
      <CallSafeArea>
        <CallStatusBar title="MALV Operator // Maya Chen" status={avatarState} />

        <div className="grid flex-1 grid-cols-1 gap-3 sm:gap-4 md:grid-cols-[1fr_260px]">
          <LiveAvatarPanel name="Maya Chen" state={avatarState} speaking={speaking} />

          <motion.aside
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "flex h-fit flex-col gap-2.5 p-3 sm:p-3.5",
              malvTheme.radius.md,
              malvTheme.surfaces.glass
            )}
          >
            <p className={cn("text-xs font-semibold uppercase tracking-[0.16em]", malvTheme.text.accent)}>Session State</p>
            <p className={cn("text-xs leading-relaxed", malvTheme.text.body)}>{timelineLabel}</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["idle", "speaking", "generating", "switching"] as const).map((nextMode) => (
                <Button
                  key={nextMode}
                  size="sm"
                  type="button"
                  onClick={() => setMode(nextMode)}
                  className={cn(
                    "h-9 rounded-xl border text-[11px] capitalize tracking-wide transition",
                    mode === nextMode
                      ? "border-cyan-300/40 bg-cyan-300/20 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.26)]"
                      : "border-white/14 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                  )}
                >
                  {nextMode}
                </Button>
              ))}
            </div>
            <div className={cn("mt-1 flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11px]", malvTheme.surfaces.overlay)}>
              <Sparkles className="h-3.5 w-3.5 text-emerald-200" />
              <span className="text-slate-100">Avatar rendering can run while user keeps talking.</span>
            </div>
          </motion.aside>
        </div>

        <CallControlDock
          micOn={micOn}
          cameraOn={cameraOn}
          onMicToggle={() => setMicOn((prev) => !prev)}
          onCameraToggle={() => setCameraOn((prev) => !prev)}
          onEndCall={() => setMode("idle")}
          onAvatarAction={() => setMode((prev) => (prev === "generating" ? "switching" : "generating"))}
          state={avatarState}
        />
      </CallSafeArea>
    </CallScreenShell>
  );
}
