import { MALV_RESPONSE_EVALUATION_CASES } from "./malv-response-evaluation-cases";
import { buildMalvResponsePipelineTrace, summarizeMalvInterpretationForTrace } from "./malv-response-pipeline-trace.util";
import type { MalvResponsePlan } from "./malv-response-planning.util";
import type { MalvSemanticInterpretation } from "./semantic-interpretation.types";

function interpretation(overrides?: Partial<MalvSemanticInterpretation>): MalvSemanticInterpretation {
  return {
    normalizedUserMessage: "Explain rate limiting with examples",
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
    confidence: 0.87123,
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

function plan(structure: MalvResponsePlan["structure"], stepTypes: MalvResponsePlan["steps"]): MalvResponsePlan {
  return {
    responseType: "explanatory",
    structure,
    depth: "medium",
    steps: stepTypes
  };
}

describe("malv response pipeline trace", () => {
  it("produces trace for normal answer path", () => {
    const trace = buildMalvResponsePipelineTrace({
      interpretation: interpretation(),
      decisionMode: "answer",
      replySource: "beast_worker",
      clarificationReliefApplied: false,
      plan: plan("sectioned", [{ type: "intro" }, { type: "core_explanation" }, { type: "summary" }]),
      shapingApplied: true,
      shapingGuardedBypass: false,
      finalOutcome: "complete",
      finalResponse: "Rate limiting controls request volume.",
      transport: "beast_worker"
    });
    expect(trace.decision).toMatchObject({
      mode: "answer",
      requiredClarification: false,
      guarded: false
    });
    expect(trace.planning).toMatchObject({
      structure: "sectioned",
      stepCount: 3,
      stepTypes: ["intro", "core_explanation", "summary"]
    });
    expect(trace.shaping).toEqual({
      applied: true,
      structure: "sectioned",
      guardedBypass: false
    });
    expect(trace.final).toMatchObject({
      outcome: "complete",
      transport: "beast_worker"
    });
  });

  it("records clarify path decision and planning summary", () => {
    const trace = buildMalvResponsePipelineTrace({
      interpretation: interpretation({
        ambiguity: {
          fromClassifier: { isAmbiguous: true, reason: "short_low_signal" },
          forExecution: { isAmbiguous: true, reason: "short_low_signal" },
          isBlocking: true,
          missingTopic: true
        }
      }),
      decisionMode: "clarify",
      replySource: "malv_autonomous_clarification",
      clarificationReliefApplied: false,
      plan: {
        responseType: "clarification",
        structure: "direct",
        depth: "light",
        steps: [{ type: "clarification" }]
      },
      shapingApplied: true,
      shapingGuardedBypass: false,
      finalOutcome: "complete",
      finalResponse: "Could you clarify the target file?"
    });
    expect(trace.decision.requiredClarification).toBe(true);
    expect(trace.planning).toMatchObject({
      responseType: "clarification",
      structure: "direct",
      stepTypes: ["clarification"]
    });
  });

  it("records guarded path and shaping bypass", () => {
    const trace = buildMalvResponsePipelineTrace({
      interpretation: interpretation({ riskLevel: "high" }),
      decisionMode: "guarded",
      replySource: "beast_worker",
      clarificationReliefApplied: false,
      plan: {
        responseType: "task",
        structure: "direct",
        depth: "light",
        steps: [{ type: "direct_answer" }, { type: "safety_guardrail" }]
      },
      shapingApplied: true,
      shapingGuardedBypass: true,
      finalOutcome: "complete",
      finalResponse: "I can't help with that unsafe request."
    });
    expect(trace.decision.guarded).toBe(true);
    expect(trace.shaping.guardedBypass).toBe(true);
  });

  it("captures step-by-step planning shape", () => {
    const trace = buildMalvResponsePipelineTrace({
      interpretation: interpretation({ constraints: { wantsStepByStep: true, wantsDepth: false } }),
      decisionMode: "answer",
      replySource: "beast_worker",
      clarificationReliefApplied: false,
      plan: plan("step_by_step", [{ type: "intro" }, { type: "breakdown" }, { type: "summary" }]),
      shapingApplied: true,
      shapingGuardedBypass: false,
      finalOutcome: "complete",
      finalResponse: "1. Check logs\n2. Restart service\n3. Verify health"
    });
    expect(trace.planning.structure).toBe("step_by_step");
    expect(trace.planning.stepTypes).toEqual(["intro", "breakdown", "summary"]);
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      interpretation: interpretation(),
      decisionMode: "answer" as const,
      replySource: "beast_worker",
      clarificationReliefApplied: false,
      plan: plan("adaptive", [{ type: "intro" }, { type: "core_explanation" }, { type: "summary" }]),
      shapingApplied: true,
      shapingGuardedBypass: false,
      finalOutcome: "complete",
      finalResponse: "Answer body",
      transport: "beast_worker"
    };
    const a = buildMalvResponsePipelineTrace(input);
    const b = buildMalvResponsePipelineTrace(input);
    expect(a).toEqual(b);
  });

  it("keeps interpretation summary concise and normalized", () => {
    const out = summarizeMalvInterpretationForTrace(
      interpretation({
        confidence: 1.2399999,
        broadPromptPolicy: {
          action: "guarded",
          reason: "  ",
          bestCandidate: null,
          workerGuidance: null
        }
      })
    );
    expect(out.confidence).toBe(1);
    expect(out.broadPromptPolicy.reason).toBe("unknown");
  });
});

describe("malv response evaluation fixtures", () => {
  it("covers all major prompt classes exactly once", () => {
    const categories = new Set(MALV_RESPONSE_EVALUATION_CASES.map((c) => c.category));
    expect(categories).toEqual(
      new Set([
        "broad_educational",
        "delegation",
        "vague_clarify_needed",
        "risky_guarded",
        "short_follow_up_after_clarification",
        "direct_factual",
        "step_by_step",
        "task_oriented"
      ])
    );
    expect(MALV_RESPONSE_EVALUATION_CASES).toHaveLength(8);
  });
});
