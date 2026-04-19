import { motion } from "framer-motion";
import { Mic } from "lucide-react";

type VoiceActionVisualState = "idle" | "listening" | "transcribing" | "error";

export function VoiceActionButton(props: {
  state: VoiceActionVisualState;
  disabled?: boolean;
  onClick?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
  pressMode?: boolean;
}) {
  const { state, disabled, onClick, onPointerDown, onPointerUp, onPointerLeave, pressMode = false } = props;
  const listening = state === "listening";
  const transcribing = state === "transcribing";
  const error = state === "error";

  return (
    <motion.button
      type="button"
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      disabled={Boolean(disabled)}
      onClick={!pressMode ? onClick : undefined}
      onPointerDown={(e) => {
        if (!pressMode || disabled) return;
        e.preventDefault();
        onPointerDown?.();
      }}
      onPointerUp={(e) => {
        if (!pressMode) return;
        e.preventDefault();
        onPointerUp?.();
      }}
      onPointerCancel={pressMode ? onPointerUp : undefined}
      onPointerLeave={pressMode ? onPointerLeave : undefined}
      aria-label="Voice assistant"
      className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full sm:h-9 sm:w-9"
      style={{
        background:
          "radial-gradient(120% 120% at 30% 18%, oklch(0.25 0.05 235 / 0.35), transparent 56%), oklch(0.12 0.02 260 / 0.92)",
        border: error ? "1px solid oklch(0.68 0.18 25 / 0.5)" : "1px solid oklch(0.42 0.08 230 / 0.32)",
        boxShadow: error
          ? "0 0 0 1px rgba(248,113,113,0.24), 0 0 20px rgba(248,113,113,0.22), inset 0 1px 0 rgba(255,255,255,0.06)"
          : listening
            ? "0 0 0 1px rgba(96,165,250,0.24), 0 0 24px rgba(96,165,250,0.2), inset 0 1px 0 rgba(255,255,255,0.08)"
            : transcribing
              ? "0 0 0 1px rgba(120,170,255,0.24), 0 0 26px rgba(120,170,255,0.2), inset 0 1px 0 rgba(255,255,255,0.08)"
              : "0 0 0 1px rgba(96,165,250,0.14), inset 0 1px 0 rgba(255,255,255,0.06)"
      }}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        animate={
          listening
            ? { opacity: [0.2, 0.55, 0.2] }
            : transcribing
              ? { opacity: [0.15, 0.42, 0.15] }
              : error
                ? { opacity: [0.24, 0.5, 0.24] }
                : { opacity: [0.12, 0.18, 0.12] }
        }
        transition={{ duration: listening ? 1.4 : transcribing ? 1.1 : error ? 0.42 : 2.8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: error
            ? "radial-gradient(circle at 50% 50%, rgba(248,113,113,0.38), transparent 62%)"
            : "radial-gradient(circle at 50% 50%, rgba(96,165,250,0.35), transparent 64%)"
        }}
      />

      {listening ? (
        <span aria-hidden className="relative z-10 flex h-4 items-end gap-[1.5px]">
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              className="w-[2px] rounded-full"
              animate={{ height: [4 + (i % 2), 11 - (i % 2), 5 + ((i + 1) % 2)] }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.09, ease: "easeInOut" }}
              style={{
                background: "rgba(146,213,255,0.9)",
                boxShadow: "0 0 8px rgba(96,165,250,0.45)"
              }}
            />
          ))}
        </span>
      ) : transcribing ? (
        <motion.span
          aria-hidden
          className="relative z-10 h-4 w-4 rounded-full border"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.15, repeat: Infinity, ease: "linear" }}
          style={{
            borderColor: "rgba(148,181,255,0.2)",
            borderTopColor: "rgba(156,216,255,0.92)",
            boxShadow: "0 0 10px rgba(116,178,255,0.34)"
          }}
        />
      ) : (
        <span className="relative z-10">
          <Mic
            className="h-[16px] w-[16px] sm:h-[14px] sm:w-[14px]"
            style={{ color: error ? "oklch(0.84 0.16 25)" : "oklch(0.88 0.12 220)" }}
          />
        </span>
      )}
    </motion.button>
  );
}

