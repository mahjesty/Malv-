import { classifyMalvQuestionAnswerShape } from "./malv-intent-first-answer-shape.util";
import type { MalvSemanticInterpretation } from "./semantic-interpretation.types";

export type MalvResponsePlanType = "explanatory" | "task" | "clarification" | "mixed";
export type MalvResponsePlanStructure = "step_by_step" | "sectioned" | "direct" | "adaptive";
export type MalvResponsePlanDepth = "light" | "medium" | "deep";
export type MalvResponsePlanStepType =
  | "clarification"
  | "intro"
  | "direct_answer"
  | "core_explanation"
  | "breakdown"
  | "example"
  | "safety_guardrail"
  | "summary";

export type MalvResponsePlanStep = {
  type: MalvResponsePlanStepType;
};

export type MalvDecisionMode = "answer" | "clarify" | "guarded";

export type MalvResponsePlanningDecision = {
  mode: MalvDecisionMode;
  answerPlan?: readonly string[] | null;
};

export type MalvResponsePlan = {
  responseType: MalvResponsePlanType;
  structure: MalvResponsePlanStructure;
  steps: MalvResponsePlanStep[];
  depth: MalvResponsePlanDepth;
};

export type BuildMalvResponsePlanInput = {
  interpretation: MalvSemanticInterpretation;
  decision: MalvResponsePlanningDecision;
};

function includesStep(steps: readonly MalvResponsePlanStep[], type: MalvResponsePlanStepType): boolean {
  return steps.some((s) => s.type === type);
}

function deriveDepth(interpretation: MalvSemanticInterpretation): MalvResponsePlanDepth {
  if (interpretation.constraints.wantsDepth || interpretation.riskLevel === "high") return "deep";
  if (interpretation.confidence < 0.45 || interpretation.ambiguity.forExecution.isAmbiguous) return "light";
  return "medium";
}

function deriveResponseType(
  interpretation: MalvSemanticInterpretation,
  questionShape: ReturnType<typeof classifyMalvQuestionAnswerShape>
): MalvResponsePlanType {
  if (
    interpretation.intentSurface === "software_engineering" ||
    interpretation.intentSurface === "delegated_topic_choice"
  ) {
    return "task";
  }
  if (questionShape === "exploratory" || questionShape === "deep_analysis") {
    return "explanatory";
  }
  if (interpretation.intentSurface === "open_broad_or_explore") return "mixed";
  return "explanatory";
}

function deriveStructure(args: {
  interpretation: MalvSemanticInterpretation;
  questionShape: ReturnType<typeof classifyMalvQuestionAnswerShape>;
  responseType: MalvResponsePlanType;
}): MalvResponsePlanStructure {
  if (args.interpretation.constraints.wantsStepByStep) return "step_by_step";
  if (args.questionShape === "yes_no" || args.questionShape === "factual") return "direct";
  if (args.responseType === "mixed" || args.interpretation.intentSurface === "open_broad_or_explore") return "adaptive";
  return "sectioned";
}

export function buildMalvResponsePlan(input: BuildMalvResponsePlanInput): MalvResponsePlan {
  const { interpretation, decision } = input;
  if (decision.mode === "clarify") {
    return {
      responseType: "clarification",
      structure: "direct",
      steps: [{ type: "clarification" }],
      depth: "light"
    };
  }

  if (decision.mode === "guarded") {
    return {
      responseType: "task",
      structure: interpretation.constraints.wantsStepByStep ? "step_by_step" : "direct",
      steps: [{ type: "direct_answer" }, { type: "safety_guardrail" }],
      depth: "light"
    };
  }

  const questionShape = classifyMalvQuestionAnswerShape(interpretation.normalizedUserMessage);
  const responseType = deriveResponseType(interpretation, questionShape);
  let structure = deriveStructure({ interpretation, questionShape, responseType });
  const depth = deriveDepth(interpretation);

  const steps: MalvResponsePlanStep[] = [];
  const educationalSignal =
    /\b(explain|walk me through|teach me|break down|with an example|example)\b/i.test(
      interpretation.normalizedUserMessage
    ) || interpretation.constraints.wantsDepth;
  const educationalOrExploratory =
    interpretation.intentSurface === "open_broad_or_explore" ||
    questionShape === "exploratory" ||
    questionShape === "deep_analysis" ||
    educationalSignal;
  if (educationalOrExploratory && structure === "direct" && !interpretation.constraints.wantsStepByStep) {
    structure = "sectioned";
  }
  const simpleQuestion =
    (questionShape === "yes_no" || questionShape === "factual") &&
    !interpretation.constraints.wantsDepth &&
    !interpretation.constraints.wantsStepByStep &&
    !educationalSignal &&
    interpretation.normalizedUserMessage.length < 140;

  if (simpleQuestion && !includesStep(steps, "direct_answer")) {
    steps.push({ type: "direct_answer" });
  } else {
    steps.push({ type: "intro" });
    if (educationalOrExploratory) {
      steps.push({ type: "core_explanation" }, { type: "breakdown" }, { type: "example" });
    } else {
      steps.push({ type: "core_explanation" });
    }
  }

  if (decision.answerPlan && decision.answerPlan.length >= 3 && !includesStep(steps, "breakdown")) {
    steps.push({ type: "breakdown" });
  }

  if (depth === "deep" && !includesStep(steps, "breakdown")) {
    steps.push({ type: "breakdown" });
  }

  if (!simpleQuestion && !includesStep(steps, "summary")) {
    steps.push({ type: "summary" });
  }

  return {
    responseType,
    structure,
    steps,
    depth
  };
}

export function buildMalvResponsePlanPromptSection(plan: MalvResponsePlan): string {
  const steps = plan.steps.map((s, idx) => `${idx + 1}. ${s.type}`).join("\n");
  return `### Response plan (internal)
responseType: ${plan.responseType}
structure: ${plan.structure}
depth: ${plan.depth}
steps:
${steps}
- Keep this order unless user constraints conflict.
- This plan is internal guidance; do not mention it directly.`;
}
