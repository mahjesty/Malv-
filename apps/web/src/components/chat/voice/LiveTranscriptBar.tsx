import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, X } from "lucide-react";
import type { VoiceAssistantPhase } from "@/lib/voice/voiceAssistantTypes";

const phaseLabel = (p: VoiceAssistantPhase): string => {
  switch (p) {
    case "arming":
      return "Allow microphone access…";
    case "listening":
      return "Listening…";
    case "speech_detected":
      return "Hearing you…";
    case "waiting_for_pause":
      return "Listening (pause)…";
    case "finalizing":
      return "Transcribing…";
    case "transcribing":
      return "Transcribing…";
    case "committed":
      return "Committed";
    case "error":
      return "Voice error";
    default:
      return "";
  }
};

export function LiveTranscriptBar(props: {
  visible: boolean;
  phase: VoiceAssistantPhase;
  partialTranscript: string;
  stableTranscript?: string;
  errorMessage: string | null;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const { visible, phase, partialTranscript, stableTranscript, errorMessage, onCancel, onRetry } = props;
  const show = visible && phase !== "idle";

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="live-transcript"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mb-2 rounded-xl border border-white/[0.08] bg-[oklch(0.1_0.02_260/0.85)] px-3 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-md sm:px-3.5 sm:py-2.5"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.12 0.025 260 / 0.92), oklch(0.09 0.02 260 / 0.88))"
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-malv-text/40">{phaseLabel(phase)}</p>
              {errorMessage ? (
                <p className="mt-1 text-[13px] leading-snug text-[oklch(0.78_0.14_25)]">{errorMessage}</p>
              ) : partialTranscript ? (
                <p className="mt-1 text-[13px] leading-snug text-malv-text/[0.88] sm:text-sm">{partialTranscript}</p>
              ) : stableTranscript && (phase === "finalizing" || phase === "committed") ? (
                <p className="mt-1 text-[13px] leading-snug text-malv-text/[0.88] sm:text-sm">{stableTranscript}</p>
              ) : phase === "listening" || phase === "speech_detected" || phase === "waiting_for_pause" || phase === "finalizing" || phase === "transcribing" ? (
                <div className="mt-2 flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-1 w-1 rounded-full bg-[oklch(0.65_0.14_220)]"
                      animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {phase === "error" ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-lg p-1.5 text-malv-text/55 transition-colors hover:bg-white/[0.06] hover:text-malv-text/85"
                  aria-label="Retry voice"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.2} />
                </button>
              ) : null}
              {phase !== "error" && phase !== "finalizing" && phase !== "committed" ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg p-1.5 text-malv-text/50 transition-colors hover:bg-white/[0.06] hover:text-malv-text/85"
                  aria-label="Cancel voice input"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                </button>
              ) : null}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
