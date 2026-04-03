import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import type { MicInteractionMode, VoiceAssistantPhase } from "@/lib/voice/voiceAssistantTypes";

export function VoiceMicButton(props: {
  phase: VoiceAssistantPhase;
  micInteraction: MicInteractionMode;
  pressDown: boolean;
  disabled?: boolean;
  onClickToggle: () => void;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
}) {
  const { phase, micInteraction, pressDown, disabled, onClickToggle, onPointerDown, onPointerUp, onPointerLeave } = props;

  const isListening =
    phase === "arming" ||
    phase === "listening" ||
    phase === "speech_detected" ||
    phase === "waiting_for_pause" ||
    (micInteraction === "press" && pressDown);
  const isFinalizing = phase === "finalizing" || phase === "transcribing";
  const isError = phase === "error";

  const label = isError
    ? "Voice error — retry"
    : isFinalizing
      ? "Finalizing…"
      : micInteraction === "press"
        ? isListening
          ? "Recording… release to stop"
          : "Hold to speak"
        : micInteraction === "continuous"
          ? isListening
            ? "Listening"
            : "Voice ready"
          : isListening
            ? "Tap to stop"
            : "Tap to speak";

  const primaryColorFinalizing = isError
    ? "oklch(0.78 0.14 25)"
    : isFinalizing
      ? "oklch(0.72 0.14 220)"
      : "oklch(0.8 0.18 200)";

  return (
    <div className="relative shrink-0">
      {/* Premium mic glow + ring (listening), spinner ring (processing), red alert ring (error). */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-1 rounded-xl"
        style={{
          background: isError ? "radial-gradient(circle at 50% 50%, rgba(248,113,113,0.22), transparent 60%)" : "radial-gradient(circle at 50% 50%, rgba(96,165,250,0.22), transparent 60%)"
        }}
        animate={
          isListening
            ? { opacity: [0.22, 0.06, 0.22], scale: [1, 1.04, 1] }
            : isFinalizing
              ? { opacity: [0.14, 0.26, 0.14], scale: 1 }
              : isError
                ? { opacity: [0.18, 0.35, 0.18], scale: 1 }
                : { opacity: 0, scale: 1 }
        }
        transition={
          isListening
            ? { duration: 1.55, repeat: Infinity, ease: "easeInOut" }
            : isFinalizing
              ? { duration: 1.0, repeat: Infinity, ease: "easeInOut" }
              : isError
                ? { duration: 0.75, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.2 }
        }
      />

      {isListening ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-1 rounded-xl border border-white/[0.10]"
          animate={{ scale: [1, 1.08, 1], opacity: [0.7, 0.24, 0.7] }}
          transition={{ duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
          style={{ boxShadow: "0 0 0 1px rgba(96,165,250,0.18), 0 0 28px rgba(96,165,250,0.20) inset" }}
        />
      ) : null}

      {isFinalizing ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-1 rounded-xl"
          style={{ borderRadius: 12 }}
        >
          <motion.span
            className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.10]"
            style={{
              borderColor: "rgba(160,170,255,0.22)",
              borderTopColor: "rgba(96,165,250,0.85)"
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }}
          />
        </motion.span>
      ) : null}

      {isError ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-1 rounded-xl"
          animate={{ x: [0, 1, -1, 1, 0], opacity: [1, 0.85, 1] }}
          transition={{ duration: 0.45, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" }}
          style={{
            boxShadow: "inset 0 0 0 1px rgba(248,113,113,0.25), 0 0 26px rgba(248,113,113,0.18)"
          }}
        />
      ) : null}

      <motion.button
        type="button"
        whileHover={disabled ? undefined : { scale: 1.03 }}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        aria-label={label}
        aria-pressed={micInteraction === "toggle" || micInteraction === "continuous" ? isListening : undefined}
        disabled={Boolean(disabled || phase === "finalizing" || phase === "transcribing" || phase === "committed")}
        onClick={micInteraction === "toggle" ? onClickToggle : undefined}
        onPointerDown={(e) => {
          if (micInteraction !== "press" || disabled || phase === "finalizing" || phase === "transcribing") return;
          e.preventDefault();
          onPointerDown();
        }}
        onPointerUp={(e) => {
          if (micInteraction !== "press") return;
          e.preventDefault();
          onPointerUp();
        }}
        onPointerCancel={micInteraction === "press" ? onPointerUp : undefined}
        onPointerLeave={micInteraction === "press" ? onPointerLeave : undefined}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-malv-text/62 transition-colors hover:text-malv-text/90 focus:outline-none active:bg-white/[0.04] disabled:opacity-100 sm:h-8 sm:w-8"
        style={{
          color: isListening || isFinalizing || isError ? primaryColorFinalizing : undefined,
          touchAction: micInteraction === "press" ? "none" : undefined
        }}
      >
        <Mic className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
      </motion.button>
    </div>
  );
}
