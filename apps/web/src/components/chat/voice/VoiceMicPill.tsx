import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import type { MicInteractionMode, VoiceAssistantPhase } from "@/lib/voice/voiceAssistantTypes";
import { useAudioWaveform } from "./useAudioWaveform";

function isListeningLike(phase: VoiceAssistantPhase) {
  return phase === "arming" || phase === "listening" || phase === "speech_detected" || phase === "waiting_for_pause";
}

function isActiveLike(phase: VoiceAssistantPhase) {
  return isListeningLike(phase) || phase === "finalizing" || phase === "transcribing";
}

export function VoiceMicPill(props: {
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

  const listening = isListeningLike(phase) || (micInteraction === "press" && pressDown);
  const processing = phase === "finalizing" || phase === "transcribing";
  const error = phase === "error";
  const active = isActiveLike(phase) || listening;

  const { levels } = useAudioWaveform(listening, { barCount: 10, updateHz: 28, fftSize: 1024, smoothingTimeConstant: 0.86 });

  const ariaLabel =
    error
      ? "Voice error — retry"
      : processing
        ? "Processing voice input"
        : micInteraction === "press"
          ? listening
            ? "Recording… release to stop"
            : "Hold to speak"
          : micInteraction === "continuous"
            ? listening
              ? "Listening"
              : "Voice ready"
            : listening
              ? "Tap to stop"
              : "Tap to speak";

  const disabledByPhase = phase === "finalizing" || phase === "transcribing" || phase === "committed";

  return (
    <motion.div className="relative shrink-0" layout>
      {/* Under-glow: premium but restrained, only when active/error. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-1 rounded-full"
        style={{
          background: error
            ? "radial-gradient(circle at 50% 50%, rgba(248,113,113,0.18), transparent 62%)"
            : "radial-gradient(circle at 50% 50%, rgba(96,165,250,0.18), transparent 62%)"
        }}
        animate={
          listening
            ? { opacity: [0.16, 0.05, 0.16], scale: [1, 1.03, 1] }
            : processing
              ? { opacity: [0.10, 0.18, 0.10], scale: 1 }
              : error
                ? { opacity: [0.12, 0.22, 0.12], scale: 1 }
                : { opacity: 0, scale: 1 }
        }
        transition={
          listening
            ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
            : processing
              ? { duration: 1.0, repeat: Infinity, ease: "easeInOut" }
              : error
                ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.2 }
        }
      />

      <motion.button
        type="button"
        layout
        whileHover={disabled ? undefined : { scale: 1.02 }}
        whileTap={disabled ? undefined : { scale: 0.98 }}
        aria-label={ariaLabel}
        aria-pressed={micInteraction === "toggle" || micInteraction === "continuous" ? listening : undefined}
        disabled={Boolean(disabled || disabledByPhase)}
        onClick={micInteraction === "toggle" ? onClickToggle : undefined}
        onPointerDown={(e) => {
          if (micInteraction !== "press" || disabled || disabledByPhase) return;
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
        className={[
          "inline-flex items-center justify-center gap-2",
          "h-9 sm:h-8",
          active ? "px-2.5 sm:px-2.5 rounded-full" : "w-9 sm:w-8 rounded-lg px-0",
          "border transition-[border-color,background-color,box-shadow,color] duration-200",
          "focus:outline-none focus-visible:outline-none",
          "active:bg-white/[0.04] disabled:opacity-100"
        ].join(" ")}
        style={{
          touchAction: micInteraction === "press" ? "none" : undefined,
          background: active ? "rgba(255,255,255,0.03)" : "transparent",
          borderColor: error
            ? "rgba(248,113,113,0.22)"
            : listening
              ? "rgba(96,165,250,0.26)"
              : processing
                ? "rgba(160,170,255,0.20)"
                : "rgba(255,255,255,0.0)",
          boxShadow: error
            ? "inset 0 0 0 1px rgba(248,113,113,0.20), 0 0 22px rgba(248,113,113,0.12)"
            : listening
              ? "inset 0 0 0 1px rgba(96,165,250,0.16), 0 0 18px rgba(96,165,250,0.10)"
              : processing
                ? "inset 0 0 0 1px rgba(160,170,255,0.14)"
                : "none",
          color: error
            ? "oklch(0.78 0.14 25)"
            : listening
              ? "oklch(0.82 0.18 200)"
              : processing
                ? "oklch(0.75 0.10 235)"
                : "rgba(255,255,255,0.62)"
        }}
      >
        <Mic className="h-[18px] w-[18px] sm:h-4 sm:w-4" />

        {/* Compact inline waveform (listening only). */}
        {listening ? (
          <span aria-hidden className="flex items-end gap-[3px]" style={{ width: 34, height: 18 }}>
            {levels.map((lvl, i) => {
              const hMin = 3;
              const hMax = 16;
              const t = Math.max(0, Math.min(1, lvl));
              const h = hMin + (hMax - hMin) * t;
              const isEven = i % 2 === 0;
              return (
                // eslint-disable-next-line react/no-array-index-key
                <span
                  key={i}
                  className="inline-block rounded-full"
                  style={{
                    width: 2,
                    height: h,
                    background: "rgba(96,165,250,0.82)",
                    boxShadow: isEven ? "0 0 14px rgba(96,165,250,0.18)" : "0 0 10px rgba(96,165,250,0.12)"
                  }}
                />
              );
            })}
          </span>
        ) : processing ? (
          <motion.span
            aria-hidden
            className="inline-flex items-center gap-1 pr-0.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-1 w-1 rounded-full"
                style={{ background: "rgba(160,170,255,0.55)" }}
                animate={{ opacity: [0.25, 0.9, 0.25] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
              />
            ))}
          </motion.span>
        ) : null}
      </motion.button>
    </motion.div>
  );
}

