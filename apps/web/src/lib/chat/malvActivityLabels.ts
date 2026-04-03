import type { MalvActivityPhase } from "./types";

const LABELS: Record<MalvActivityPhase, string> = {
  thinking: "Thinking",
  analyzing_context: "Reviewing your request",
  building_response: "Shaping the reply",
  planning_next_step: "Planning next steps",
  accessing_memory: "Using your context",
  secure_operator: "Safety check",
  reasoning_chain: "Working through the details"
};

export function malvActivityLabel(phase: MalvActivityPhase | undefined): string | null {
  if (!phase) return null;
  return LABELS[phase] ?? null;
}
