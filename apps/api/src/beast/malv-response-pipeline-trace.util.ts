import type { MalvResponsePlan } from "./malv-response-planning.util";
import type { MalvSemanticInterpretation } from "./semantic-interpretation.types";

export type MalvResponsePipelineTrace = {
  interpretation: {
    intentSurface: MalvSemanticInterpretation["intentSurface"];
    delegationLevel: MalvSemanticInterpretation["delegationLevel"];
    ambiguity: {
      fromClassifier: boolean;
      forExecution: boolean;
      isBlocking: boolean;
      missingTopic: boolean;
    };
    constraints: {
      wantsStepByStep: boolean;
      wantsDepth: boolean;
    };
    riskLevel: MalvSemanticInterpretation["riskLevel"];
    confidence: number;
    broadPromptPolicy: {
      action: MalvSemanticInterpretation["broadPromptPolicy"]["action"];
      reason: string;
    };
  };
  decision: {
    mode: "answer" | "clarify" | "guarded";
    replySource: string;
    requiredClarification: boolean;
    clarificationReliefApplied: boolean;
    guarded: boolean;
  };
  planning: {
    responseType: MalvResponsePlan["responseType"];
    structure: MalvResponsePlan["structure"];
    depth: MalvResponsePlan["depth"];
    stepCount: number;
    stepTypes: string[];
  };
  shaping: {
    applied: boolean;
    structure: MalvResponsePlan["structure"] | "unknown";
    guardedBypass: boolean;
  };
  final: {
    outcome: string;
    responseLength: number;
    persisted: boolean | null;
    returned: boolean | null;
    transport: string | null;
  };
};

function normalizeConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  if (confidence < 0) return 0;
  if (confidence > 1) return 1;
  return Number(confidence.toFixed(4));
}

function trimReason(reason: unknown): string {
  if (typeof reason !== "string") return "unknown";
  const normalized = reason.trim();
  return normalized.length > 0 ? normalized : "unknown";
}

export function summarizeMalvInterpretationForTrace(
  interpretation: MalvSemanticInterpretation
): MalvResponsePipelineTrace["interpretation"] {
  return {
    intentSurface: interpretation.intentSurface,
    delegationLevel: interpretation.delegationLevel,
    ambiguity: {
      fromClassifier: interpretation.ambiguity.fromClassifier.isAmbiguous,
      forExecution: interpretation.ambiguity.forExecution.isAmbiguous,
      isBlocking: interpretation.ambiguity.isBlocking,
      missingTopic: interpretation.ambiguity.missingTopic
    },
    constraints: {
      wantsStepByStep: interpretation.constraints.wantsStepByStep,
      wantsDepth: interpretation.constraints.wantsDepth
    },
    riskLevel: interpretation.riskLevel,
    confidence: normalizeConfidence(interpretation.confidence),
    broadPromptPolicy: {
      action: interpretation.broadPromptPolicy.action,
      reason: trimReason(interpretation.broadPromptPolicy.reason)
    }
  };
}

export function buildMalvResponsePipelineTrace(args: {
  interpretation: MalvSemanticInterpretation;
  decisionMode: "answer" | "clarify" | "guarded";
  replySource?: string | null;
  clarificationReliefApplied: boolean;
  plan: MalvResponsePlan;
  shapingApplied: boolean;
  shapingGuardedBypass: boolean;
  finalOutcome?: string | null;
  finalResponse: string;
  persisted?: boolean | null;
  returned?: boolean | null;
  transport?: string | null;
}): MalvResponsePipelineTrace {
  const requiredClarification = args.decisionMode === "clarify";
  const guarded = args.decisionMode === "guarded";
  return {
    interpretation: summarizeMalvInterpretationForTrace(args.interpretation),
    decision: {
      mode: args.decisionMode,
      replySource: typeof args.replySource === "string" ? args.replySource : "",
      requiredClarification,
      clarificationReliefApplied: args.clarificationReliefApplied,
      guarded
    },
    planning: {
      responseType: args.plan.responseType,
      structure: args.plan.structure,
      depth: args.plan.depth,
      stepCount: args.plan.steps.length,
      stepTypes: args.plan.steps.map((s) => s.type)
    },
    shaping: {
      applied: args.shapingApplied,
      structure: args.shapingApplied ? args.plan.structure : "unknown",
      guardedBypass: args.shapingGuardedBypass
    },
    final: {
      outcome: typeof args.finalOutcome === "string" && args.finalOutcome.trim() ? args.finalOutcome : "unknown",
      responseLength: args.finalResponse.length,
      persisted: args.persisted ?? null,
      returned: args.returned ?? null,
      transport: typeof args.transport === "string" && args.transport.trim() ? args.transport : null
    }
  };
}
