import { motion } from "framer-motion";
import { malvActivityLabel } from "../../lib/chat/malvActivityLabels";
import type { MalvActivityPhase } from "../../lib/chat/types";

export function MalvTypingIndicator(props: { phase?: MalvActivityPhase; streaming?: boolean }) {
  const { phase, streaming } = props;
  const activity = malvActivityLabel(phase);
  const title = streaming ? "Live reply" : activity ?? "Thinking";

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <div className="relative flex h-1.5 w-1.5 shrink-0">
        <motion.span
          className="absolute inline-flex h-full w-full rounded-full"
          style={{ background: "oklch(0.7 0.18 200 / 0.35)" }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.26, 0.07, 0.26] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{
            background: "oklch(0.72 0.16 200)",
            boxShadow: "0 0 10px oklch(0.7 0.2 200 / 0.35)"
          }}
        />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium tracking-tight text-malv-text/[0.76]">{title}</p>
        <p className="text-[11px] text-malv-text/40">Working</p>
      </div>
    </div>
  );
}
