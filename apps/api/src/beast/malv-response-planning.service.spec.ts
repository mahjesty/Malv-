import { MalvResponsePlanningService } from "./malv-response-planning.service";
import type { MalvSemanticInterpretation } from "./semantic-interpretation.types";

function baseInterpretation(overrides?: Partial<MalvSemanticInterpretation>): MalvSemanticInterpretation {
  return {
    normalizedUserMessage: "Explain event loops with an example",
    intentSurface: "knowledge_or_casual_qa",
    delegationLevel: "none",
    ambiguity: {
      fromClassifier: { isAmbiguous: false },
      forExecution: { isAmbiguous: false },
      isBlocking: false,
      missingTopic: false
    },
    constraints: {
      wantsStepByStep: false,
      wantsDepth: false
    },
    riskLevel: "low",
    confidence: 0.78,
    broadPromptPolicy: {
      action: "proceed",
      reason: "default",
      bestCandidate: null,
      workerGuidance: null
    },
    signals: {
      clarificationReliefCandidate: false,
      highRiskOrDestructiveHeuristic: false
    },
    ...(overrides ?? {})
  };
}

describe("MalvResponsePlanningService", () => {
  const svc = new MalvResponsePlanningService();

  it("builds structured educational plan for exploratory prompts", () => {
    const plan = svc.buildPlan({
      interpretation: baseInterpretation(),
      decision: { mode: "answer", answerPlan: ["audit", "plan", "implement"] }
    });
    expect(plan.structure).toBe("sectioned");
    expect(plan.steps.map((s) => s.type)).toEqual(
      expect.arrayContaining(["intro", "core_explanation", "breakdown", "example", "summary"])
    );
  });

  it("enforces step-by-step structure when requested", () => {
    const plan = svc.buildPlan({
      interpretation: baseInterpretation({
        normalizedUserMessage: "Teach me step by step how closures work",
        constraints: { wantsStepByStep: true, wantsDepth: false }
      }),
      decision: { mode: "answer", answerPlan: null }
    });
    expect(plan.structure).toBe("step_by_step");
  });

  it("uses direct plan for simple factual questions", () => {
    const plan = svc.buildPlan({
      interpretation: baseInterpretation({
        normalizedUserMessage: "What is 2+2?",
        constraints: { wantsStepByStep: false, wantsDepth: false }
      }),
      decision: { mode: "answer", answerPlan: null }
    });
    expect(plan.structure).toBe("direct");
    expect(plan.steps).toEqual([{ type: "direct_answer" }]);
  });

  it("returns clarification-only plan in clarify mode", () => {
    const plan = svc.buildPlan({
      interpretation: baseInterpretation({
        normalizedUserMessage: "update this",
        ambiguity: {
          fromClassifier: { isAmbiguous: true, reason: "short_low_signal" },
          forExecution: { isAmbiguous: true, reason: "short_low_signal" },
          isBlocking: true,
          missingTopic: true
        }
      }),
      decision: { mode: "clarify", answerPlan: null }
    });
    expect(plan.responseType).toBe("clarification");
    expect(plan.steps).toEqual([{ type: "clarification" }]);
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      interpretation: baseInterpretation({
        normalizedUserMessage: "Explain API rate limiting deeply",
        constraints: { wantsStepByStep: false, wantsDepth: true }
      }),
      decision: { mode: "answer" as const, answerPlan: ["audit", "plan", "review"] as const }
    };
    const a = svc.buildPlan(input);
    const b = svc.buildPlan(input);
    expect(a).toEqual(b);
  });
});
