import { AnimatePresence, motion } from "motion/react";
import { Loader2, Sparkles, Volume2, Waves, WandSparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { malvTheme } from "@/styles/malv-theme";
import { VoiceIntelligenceCore, liveAvatarCorePhase, type VoiceCorePhase } from "@/components/avatar/VoiceIntelligenceCore";

export type LiveAvatarState = "live" | "generating" | "switching";

export interface LiveAvatarPanelProps {
  name?: string;
  state?: LiveAvatarState;
  speaking?: boolean;
  className?: string;
}

function stateMeta(state: LiveAvatarState) {
  if (state === "generating") {
    return { label: "Generating new avatar", icon: WandSparkles };
  }
  if (state === "switching") {
    return { label: "Switching avatar", icon: Sparkles };
  }
  return { label: "Connected live", icon: Waves };
}

function voiceSurfaceCopy(state: LiveAvatarState, speaking: boolean, phase: VoiceCorePhase): { headline: string; detail: string } {
  if (state === "switching") {
    return {
      headline: "Link stabilizing",
      detail: "Handoff to the new identity profile. Voice stays encrypted end-to-end."
    };
  }
  if (state === "generating") {
    return {
      headline: "Rendering in background",
      detail: "Your current operator remains live. MALV is updating the visual layer without dropping the session."
    };
  }
  if (speaking || phase === "speaking") {
    return {
      headline: "MALV output",
      detail: "Synthesized speech on the private channel. Mic capture is gated while MALV speaks."
    };
  }
  return {
    headline: "Awaiting your voice",
    detail: "Low-latency capture is open. Speak when ready — transcription stays on your channel only."
  };
}

export function LiveAvatarPanel({
  name = "MALV Operator",
  state = "live",
  speaking = false,
  className
}: LiveAvatarPanelProps) {
  const meta = stateMeta(state);
  const MetaIcon = meta.icon;
  const corePhase = liveAvatarCorePhase(state, speaking);
  const energy =
    speaking ? 0.58 + (state === "live" ? 0.12 : 0) : state === "live" ? 0.34 : 0.42;
  const { headline, detail } = voiceSurfaceCopy(state, speaking, corePhase);
  const statusKey = `${state}-${speaking}-${corePhase}`;

  return (
    <motion.section
      layout
      className={cn(
        "relative w-full overflow-hidden px-5 pb-6 pt-7 sm:px-7 sm:pb-7 sm:pt-8",
        malvTheme.radius.lg,
        malvTheme.surfaces.glassStrong,
        className
      )}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-cyan-400/[0.05] via-transparent to-transparent" />
        <div className="absolute bottom-0 left-1/2 h-36 w-[min(100%,26rem)] -translate-x-1/2 bg-violet-500/[0.035] blur-[52px]" />
      </div>

      <div className="relative flex flex-col items-center text-center">
        <div className="relative mb-6 flex aspect-square w-[min(48vw,14rem)] items-center justify-center sm:mb-7 sm:w-56">
          <VoiceIntelligenceCore phase={corePhase} energy={energy} coreLabel={name.slice(0, 1)} className="h-full w-full" />

          <AnimatePresence mode="wait">
            {state === "generating" ? (
              <motion.div
                key="generating-overlay"
                className="absolute inset-0 flex items-center justify-center rounded-3xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <div className="absolute inset-0 rounded-3xl bg-slate-950/40 backdrop-blur-[2px]" />
                <div className="relative flex flex-col items-center gap-2.5 px-4">
                  <motion.div
                    animate={{ opacity: [0.45, 1, 0.45], scale: [0.96, 1, 0.96] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
                  >
                    <Loader2 className="h-5 w-5 text-cyan-200/90" aria-hidden />
                  </motion.div>
                  <p className="max-w-[13rem] text-center text-[11px] font-medium leading-snug tracking-wide text-slate-200/92">
                    Preparing render…
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {state === "switching" ? (
              <motion.div
                key="switching-overlay"
                className="absolute inset-0 rounded-3xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <div className="absolute inset-0 rounded-3xl bg-violet-950/28 backdrop-blur-[1px]" />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div
            className={cn(
              "absolute bottom-0 left-1/2 z-20 inline-flex -translate-x-1/2 translate-y-1/2 items-center gap-2 rounded-full border border-white/[0.11] px-3 py-1.5",
              malvTheme.surfaces.overlay
            )}
          >
            <motion.span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                speaking ? "bg-cyan-300" : "bg-slate-300"
              )}
              animate={{
                opacity: speaking ? [0.55, 1, 0.55] : [0.4, 0.85, 0.4],
                scale: speaking ? [1, 1.2, 1] : [1, 1.08, 1]
              }}
              transition={{
                duration: speaking ? 1.15 : 2.2,
                repeat: Infinity,
                ease: [0.45, 0, 0.55, 1]
              }}
              aria-hidden
            />
            <span
              className={cn(
                "text-[10px] font-semibold tracking-[0.08em] uppercase",
                speaking ? "text-cyan-100/95" : "text-slate-200/92"
              )}
            >
              {speaking ? "Speaking" : "Listening"}
            </span>
            <Volume2 className="h-3 w-3 opacity-80" aria-hidden />
          </div>
        </div>

        <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 sm:min-h-[4.75rem]">
          <h2
            className={cn(
              "max-w-[18rem] text-xl font-semibold leading-tight tracking-[-0.02em] sm:text-2xl",
              malvTheme.text.title
            )}
          >
            {name}
          </h2>
          <AnimatePresence mode="wait">
            <motion.div
              key={statusKey}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-sm space-y-1"
            >
              <p className={cn("text-[13px] font-medium leading-snug text-slate-700 dark:text-slate-200/95 sm:text-sm")}>
                {headline}
              </p>
              <p className={cn("text-[12px] leading-relaxed sm:text-[13px]", malvTheme.text.muted)}>{detail}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="relative mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:items-stretch sm:justify-center sm:gap-4">
        <div
          className={cn(
            "flex flex-1 items-center gap-3 rounded-2xl border border-white/[0.08] px-4 py-3.5 sm:max-w-xs sm:flex-none",
            "bg-black/[0.22] dark:bg-black/[0.28]"
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
            <MetaIcon className="h-4 w-4 text-cyan-200/95" aria-hidden />
          </div>
          <div className="min-w-0 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">Session</p>
            <p className="truncate text-sm font-medium text-slate-100">{meta.label}</p>
          </div>
        </div>

        <div
          className={cn(
            "flex flex-1 items-center gap-3 rounded-2xl border border-white/[0.08] px-4 py-3.5 sm:max-w-xs sm:flex-none",
            "bg-black/[0.22] dark:bg-black/[0.28]"
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
            {state === "live" ? (
              <motion.span
                className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]"
                animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.18, 1] }}
                transition={{ duration: 1.85, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
              />
            ) : (
              <motion.div
                animate={{ opacity: [0.35, 1, 0.35] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Loader2 className="h-4 w-4 text-emerald-200/90" aria-hidden />
              </motion.div>
            )}
          </div>
          <div className="min-w-0 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">Voice core</p>
            <p className="truncate text-sm text-slate-200/95">
              {state === "switching"
                ? "Negotiating handoff"
                : state === "generating"
                  ? "Render pipeline active"
                  : speaking
                    ? "Output stream live"
                    : "Capture armed"}
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
