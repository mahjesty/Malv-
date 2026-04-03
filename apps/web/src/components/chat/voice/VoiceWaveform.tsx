import { AnimatePresence, motion } from "framer-motion";
import type { VoiceAssistantPhase } from "@/lib/voice/voiceAssistantTypes";
import { useAudioWaveform } from "./useAudioWaveform";

function isListeningLike(phase: VoiceAssistantPhase) {
  return phase === "arming" || phase === "listening" || phase === "speech_detected" || phase === "waiting_for_pause";
}

export function VoiceWaveform(props: { phase: VoiceAssistantPhase }) {
  const { phase } = props;
  const active = isListeningLike(phase);
  const { levels } = useAudioWaveform(active, { barCount: 12, updateHz: 28 });

  return (
    <AnimatePresence initial={false}>
      {active ? (
        <motion.div
          key="voice-waveform"
          initial={{ opacity: 0, y: 3, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 2, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden
          className="flex items-end justify-center rounded-lg px-1"
          style={{ width: 30, height: 26 }}
        >
          <div className="flex items-end gap-[3px]">
            {levels.map((lvl, i) => {
              const hMin = 4;
              const hMax = 18;
              const t = Math.max(0, Math.min(1, lvl));
              const h = hMin + (hMax - hMin) * t;
              const isEven = i % 2 === 0;
              return (
                // eslint-disable-next-line react/no-array-index-key
                <div
                  key={i}
                  className="inline-block rounded-full"
                  style={{
                    width: 2,
                    height: h,
                    background: "rgba(96,165,250,0.88)",
                    boxShadow: isEven ? "0 0 18px rgba(96,165,250,0.22)" : "0 0 12px rgba(96,165,250,0.16)"
                  }}
                />
              );
            })}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

