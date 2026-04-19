import { motion } from "framer-motion";
import { malvActivityLabel } from "../../lib/chat/malvActivityLabels";
import type { MalvActivityPhase } from "../../lib/chat/types";
import type { MalvAssistantTypingBand } from "../../lib/chat/malvAssistantUiState";

function phaseAccent(phase: MalvActivityPhase | undefined) {
  switch (phase) {
    case "analyzing_context":
    case "accessing_memory":
      return { dotColor: "rgb(var(--malv-accent-cyan-rgb))", pulse: true };
    case "planning_next_step":
    case "building_response":
    case "super_fix_execute":
      return { dotColor: "rgb(var(--malv-brand-rgb))", pulse: true };
    case "reasoning_chain":
      return { dotColor: "rgb(var(--malv-accent-violet-rgb))", pulse: true };
    case "secure_operator":
      return { dotColor: "rgb(251 191 36)", pulse: false };
    default:
      if (typeof phase === "string" && phase.startsWith("server_phase:")) {
        return { dotColor: "rgb(var(--malv-accent-cyan-rgb))", pulse: true };
      }
      return { dotColor: "rgb(var(--malv-brand-rgb))", pulse: true };
  }
}

function bandLabel(band: MalvAssistantTypingBand, phase: MalvActivityPhase | undefined): string {
  const phaseLabel = malvActivityLabel(phase);
  if (band === "preparing") {
    return phaseLabel ?? "Thinking";
  }
  if (band === "thinking") {
    return phaseLabel ?? "Thinking";
  }
  /* stream_pending — no stream bytes buffered or painted yet (see malvStreamCanonicalActive + raw content length) */
  return "Writing the reply";
}

/**
 * In-bubble status row for assistant turns before/without streamed bytes (buffer or paint).
 * `band` must match {@link deriveMalvAssistantTypingBand}.
 */
export function MalvTypingIndicator(props: { phase?: MalvActivityPhase; band: MalvAssistantTypingBand }) {
  const { phase, band } = props;
  const label = bandLabel(band, phase);
  const { dotColor, pulse } = phaseAccent(phase);

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <div className="relative flex h-[7px] w-[7px] shrink-0">
        {pulse ? (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full"
            style={{ background: dotColor, opacity: 0.25 }}
            animate={{ scale: [1, 1.9, 1], opacity: [0.25, 0, 0.25] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : null}
        <span
          className="relative inline-flex h-[7px] w-[7px] rounded-full"
          style={{ background: dotColor, boxShadow: `0 0 8px ${dotColor}55` }}
        />
      </div>
      <div className="min-w-0 flex items-baseline gap-1.5">
        <span
          className="text-[13px] font-medium tracking-[-0.01em]"
          style={{ color: "rgb(var(--malv-text-rgb) / 0.72)" }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
