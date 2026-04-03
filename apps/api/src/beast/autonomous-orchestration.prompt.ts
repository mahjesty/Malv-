import type { ClassifiedIntent } from "./intent-understanding.types";
import type { ExecutionStrategyResult, InternalPhaseId } from "./execution-strategy.service";

export const INTERNAL_PHASE_LABELS: Record<InternalPhaseId, string> = {
  audit: "Audit — constraints, context, unknowns",
  plan: "Plan — smallest verifiable steps and scope",
  implement: "Implement — concrete changes or instructions",
  verify: "Verify — tests, checks, acceptance criteria",
  review: "Review — risks, rollbacks, what to watch",
  architecture: "Architecture — boundaries, data flow, key decisions",
  core_backend: "Core backend — APIs, persistence, services",
  core_frontend: "Core frontend — structure, routing, state",
  feature_modules: "Feature modules — vertical slices and integration",
  ux_polish: "UX polish — flows, accessibility, consistency",
  optimization: "Optimization — performance, reliability, cost"
};

function phaseLines(ids: readonly InternalPhaseId[]): string[] {
  return ids.map((id, i) => `${i + 1}. ${INTERNAL_PHASE_LABELS[id]}`);
}

/**
 * User-facing clarification when strategy is require_clarification (deterministic; no model).
 */
export function buildAutonomousClarificationReply(classified: ClassifiedIntent): string {
  const reason = classified.ambiguity.reason ?? "ambiguous_prompt";
  const lines = [
    "I understand you want help — I need one concrete detail before I run the full pipeline.",
    reason === "message_too_vague"
      ? "What exactly should change (file area, feature name, error message, or goal)?"
      : reason === "short_low_signal"
        ? "Your message is very short. What outcome do you want (e.g. fix a bug, add a feature, explain something)?"
        : "A couple of intents are equally likely from this message — what is the main goal (build, fix, refactor, or design)?",
    "Once you specify that, I will handle structure, phases, and verification internally."
  ];
  return lines.join("\n\n");
}

/**
 * Injected into the worker prompt — internal phases are not presented as user homework.
 */
export function buildAutonomousOrchestrationBlock(args: {
  classified: ClassifiedIntent;
  strategy: ExecutionStrategyResult;
}): string | null {
  const { classified, strategy } = args;
  if (strategy.mode === "require_clarification") return null;

  const intentLine = `Classified intent (internal): ${classified.primaryIntent}; scope=${classified.scopeSize}; complexity=${classified.complexity}; domains=${classified.domains.join(", ") || "general"}.`;
  const risk = `Risk tier (internal): ${strategy.riskTier}. Large or high-risk work stays phased and grounded — no invented telemetry or repo facts.`;

  if (strategy.mode === "single_step") {
    return [
      "### Autonomous execution (internal)",
      intentLine,
      risk,
      "Execute in one pass using this engineering loop (narrate briefly as you go — user should not need to micromanage):",
      ...phaseLines(strategy.internalPhases).map((l) => `  ${l}`),
      "Open with a short acknowledgment of the request (e.g. I understand you want…), then move through the loop in order.",
      "End with verification and review. Do not ask the user to define phases or a project plan unless ambiguity is critical or risk is high."
    ].join("\n");
  }

  return [
    "### Autonomous execution (internal — phased)",
    intentLine,
    risk,
    "This request is phased internally for safety. Work through ALL phases below in one answer, in order, with clear mini-headings the user can skim.",
    "Use a conversational lead-in for each major block (e.g. I’m starting with architecture, then core backend…).",
    "Phases:",
    ...phaseLines(strategy.internalPhases).map((l) => `  ${l}`),
    "Stay concise per phase; prefer decisions and checklists over prose. Do not expose this as a template the user must fill in.",
    "If and only if a critical ambiguity or high-risk irreversible action would appear, pause and ask one focused question."
  ].join("\n");
}
