import { motion } from "framer-motion";

type VoicePresenceState = "idle" | "listening" | "transcribing";

export function VoicePresenceOrb(props: { state: VoicePresenceState }) {
  const { state } = props;
  const listening = state === "listening";
  const transcribing = state === "transcribing";

  return (
    <div className="relative flex h-7 w-7 items-center justify-center">
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        animate={
          listening
            ? { opacity: [0.25, 0.5, 0.25], scale: [1, 1.08, 1] }
            : transcribing
              ? { opacity: [0.2, 0.42, 0.2], scale: [1, 1.05, 1] }
              : { opacity: [0.14, 0.26, 0.14], scale: [1, 1.03, 1] }
        }
        transition={{ duration: listening ? 1.1 : transcribing ? 0.95 : 2.4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: transcribing
            ? "radial-gradient(circle at 50% 50%, rgba(139,179,255,0.45), transparent 68%)"
            : "radial-gradient(circle at 50% 50%, rgba(96,165,250,0.42), transparent 68%)"
        }}
      />
      <motion.span
        aria-hidden
        className="absolute h-[18px] w-[18px] rounded-full border"
        animate={transcribing ? { rotate: 360 } : { rotate: 0 }}
        transition={transcribing ? { duration: 3, repeat: Infinity, ease: "linear" } : { duration: 0.4 }}
        style={{
          borderColor: transcribing ? "rgba(160,185,255,0.42)" : "rgba(117,176,255,0.34)",
          borderTopColor: transcribing ? "rgba(182,219,255,0.9)" : "rgba(117,176,255,0.5)"
        }}
      />
      <motion.span
        aria-hidden
        className="relative z-10 h-[8px] w-[8px] rounded-full"
        animate={
          listening
            ? { scale: [1, 1.28, 1], opacity: [0.8, 1, 0.8] }
            : transcribing
              ? { scale: [1, 1.15, 1], opacity: [0.72, 0.95, 0.72] }
              : { scale: [1, 1.12, 1], opacity: [0.62, 0.88, 0.62] }
        }
        transition={{ duration: listening ? 0.95 : transcribing ? 0.85 : 2.1, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: "linear-gradient(160deg, rgba(164,228,255,0.95), rgba(132,164,255,0.92))",
          boxShadow: "0 0 10px rgba(96,165,250,0.45)"
        }}
      />
    </div>
  );
}

