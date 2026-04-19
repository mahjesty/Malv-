import type { MalvActivityPhase } from "./types";

const LABELS: Partial<Record<MalvActivityPhase, string>> = {
  thinking: "Thinking",
  analyzing_context: "Reviewing your request",
  building_response: "Shaping the reply",
  planning_next_step: "Planning next steps",
  accessing_memory: "Using your context",
  secure_operator: "Safety check",
  reasoning_chain: "Working through the details",
  super_fix_execute: "Refining the answer"
};

/**
 * Maps Beast internal phase ids (suffix of `server_phase:<id>`) to concise, honest UI copy.
 * Kept in sync with {@link apps/api/src/beast/execution-strategy.service} phase ids.
 */
const SERVER_PHASE_SUFFIX_UX: Record<string, string> = {
  audit: "Reviewing constraints",
  plan: "Planning the approach",
  implement: "Shaping the reply",
  verify: "Checking the details",
  review: "Reviewing risks and next steps",
  architecture: "Outlining structure",
  core_backend: "Working through backend details",
  core_frontend: "Working through interface details",
  feature_modules: "Connecting the pieces",
  ux_polish: "Refining the experience",
  optimization: "Tuning reliability and performance"
};

function labelForServerPhase(phase: string): string | null {
  if (!phase.startsWith("server_phase:")) return null;
  const suffix = phase.slice("server_phase:".length).trim();
  if (!suffix) return "Working on your request";
  return SERVER_PHASE_SUFFIX_UX[suffix] ?? "Working on your request";
}

export function malvActivityLabel(phase: MalvActivityPhase | undefined): string | null {
  if (!phase) return null;
  const direct = LABELS[phase];
  if (direct) return direct;
  const server = labelForServerPhase(phase);
  if (server) return server;
  return null;
}
