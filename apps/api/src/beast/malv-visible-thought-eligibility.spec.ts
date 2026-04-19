import { shouldShowVisibleThought } from "./malv-visible-thought-eligibility";
import type { VisibleThoughtEligibilityInput } from "./malv-visible-thought-eligibility";
import type { ClassifiedIntent } from "./intent-understanding.types";
import type { MalvSemanticInterpretation } from "./semantic-interpretation.types";
import type { MalvResponsePlan, MalvDecisionMode } from "./malv-response-planning.util";
import type { ExecutionStrategyResult } from "./execution-strategy.service";

// ─── Fixtures ──────────────────────────────────────────────────────────────

function baseClassified(overrides?: Partial<ClassifiedIntent>): ClassifiedIntent {
  return {
    primaryIntent: "knowledge_or_casual_qa" as any,
    scores: {
      full_product_build: 0,
      feature_build: 0,
      bug_fix: 0,
      improvement_refactor: 0,
      frontend_design: 0,
      backend_logic: 0,
      system_upgrade: 0
    },
    scopeSize: "small",
    complexity: "low",
    domains: [],
    ambiguity: { isAmbiguous: false },
    ...(overrides ?? {})
  };
}

function baseInterpretation(overrides?: Partial<MalvSemanticInterpretation>): MalvSemanticInterpretation {
  return {
    normalizedUserMessage: "hello",
    intentSurface: "knowledge_or_casual_qa",
    delegationLevel: "none",
    ambiguity: {
      fromClassifier: { isAmbiguous: false },
      forExecution: { isAmbiguous: false },
      isBlocking: false,
      missingTopic: false
    },
    constraints: { wantsStepByStep: false, wantsDepth: false },
    riskLevel: "low",
    confidence: 0.8,
    broadPromptPolicy: { action: "proceed", reason: "default", bestCandidate: null, workerGuidance: null },
    signals: { clarificationReliefCandidate: false, highRiskOrDestructiveHeuristic: false },
    ...(overrides ?? {})
  };
}

function basePlan(overrides?: Partial<MalvResponsePlan>): MalvResponsePlan {
  return {
    responseType: "explanatory",
    structure: "direct",
    steps: [{ type: "direct_answer" }],
    depth: "light",
    ...(overrides ?? {})
  };
}

function baseStrategy(overrides?: Partial<ExecutionStrategyResult>): ExecutionStrategyResult {
  return {
    mode: "single_step",
    internalPhases: [],
    preferBeastWorker: false,
    riskTier: "low",
    ...(overrides ?? {})
  };
}

function make(
  rawUserMessage: string,
  decisionMode: MalvDecisionMode,
  classified: Partial<ClassifiedIntent> = {},
  interpretation: Partial<MalvSemanticInterpretation> = {},
  plan: Partial<MalvResponsePlan> = {},
  strategy: Partial<ExecutionStrategyResult> = {}
): VisibleThoughtEligibilityInput {
  return {
    rawUserMessage,
    decisionMode,
    classified: baseClassified(classified),
    interpretation: baseInterpretation(interpretation),
    plan: basePlan(plan),
    strategy: baseStrategy(strategy)
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("shouldShowVisibleThought — eligibility policy", () => {
  // ── Hard exclusions ──────────────────────────────────────────────────────

  it("excludes guarded decision mode", () => {
    const result = shouldShowVisibleThought(
      make("Delete all user data", "guarded", { complexity: "high" })
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/guarded/);
  });

  it("excludes clarify decision mode", () => {
    const result = shouldShowVisibleThought(
      make("fix it", "clarify")
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/clarify/);
  });

  it("excludes direct+light plan with no user constraints", () => {
    const result = shouldShowVisibleThought(
      make("What is 2+2?", "answer", {}, {}, { structure: "direct", depth: "light" })
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/direct_light/);
  });

  // ── Simple / short prompt skips visible thought ─────────────────────────

  it("skips visible thought for simple direct factual prompts", () => {
    const result = shouldShowVisibleThought(
      make("What time is it in Tokyo?", "answer",
        { scopeSize: "small", complexity: "low" },
        { intentSurface: "knowledge_or_casual_qa" },
        { structure: "direct", depth: "light", steps: [{ type: "direct_answer" }] }
      )
    );
    expect(result.eligible).toBe(false);
  });

  it("skips visible thought for very short casual queries below threshold", () => {
    const result = shouldShowVisibleThought(
      make("hi there", "answer",
        { scopeSize: "small", complexity: "low" },
        { intentSurface: "knowledge_or_casual_qa" },
        { structure: "direct", depth: "light" }
      )
    );
    expect(result.eligible).toBe(false);
  });

  it("skips visible thought for casual low-complexity QA without depth signals", () => {
    const result = shouldShowVisibleThought(
      make("Who wrote Hamlet?", "answer",
        { scopeSize: "small", complexity: "low" },
        { intentSurface: "knowledge_or_casual_qa", constraints: { wantsStepByStep: false, wantsDepth: false } },
        { structure: "direct", depth: "light", steps: [{ type: "direct_answer" }] }
      )
    );
    expect(result.eligible).toBe(false);
  });

  // ── Complex/open-ended prompts show visible thought ──────────────────────

  it("shows visible thought for open/broad/delegated prompts", () => {
    const result = shouldShowVisibleThought(
      make("Tell me something interesting", "answer",
        {},
        { intentSurface: "open_broad_or_explore", delegationLevel: "topic_choice" }
      )
    );
    expect(result.eligible).toBe(true);
    expect(result.reason).toMatch(/delegation_topic_choice/);
  });

  it("shows visible thought for broad open-ended intent surface", () => {
    const result = shouldShowVisibleThought(
      make("What's a good topic to explore today?", "answer",
        { scopeSize: "medium" },
        { intentSurface: "open_broad_or_explore", delegationLevel: "none" }
      )
    );
    expect(result.eligible).toBe(true);
    expect(result.reason).toMatch(/open_broad/);
  });

  it("shows visible thought for high-complexity prompts", () => {
    const result = shouldShowVisibleThought(
      make("Redesign our entire auth system with JWT + refresh tokens", "answer",
        { complexity: "high", scopeSize: "large" },
        { intentSurface: "software_engineering" },
        { structure: "sectioned", depth: "deep" }
      )
    );
    expect(result.eligible).toBe(true);
  });

  it("shows visible thought when user requests step-by-step", () => {
    const result = shouldShowVisibleThought(
      make("Explain async/await step by step", "answer",
        { scopeSize: "small", complexity: "low" },
        { intentSurface: "knowledge_or_casual_qa", constraints: { wantsStepByStep: true, wantsDepth: false } }
      )
    );
    expect(result.eligible).toBe(true);
    expect(result.reason).toMatch(/explicit_depth_or_steps/);
  });

  it("shows visible thought when user requests depth", () => {
    const result = shouldShowVisibleThought(
      make("Give me a deep dive into React reconciliation", "answer",
        { scopeSize: "medium", complexity: "medium" },
        { intentSurface: "knowledge_or_casual_qa", constraints: { wantsStepByStep: false, wantsDepth: true } }
      )
    );
    expect(result.eligible).toBe(true);
  });

  it("shows visible thought for phased execution strategy", () => {
    const result = shouldShowVisibleThought(
      make("Build me a full todo app with React and Node", "answer",
        { complexity: "high", scopeSize: "large" },
        { intentSurface: "software_engineering" },
        { structure: "sectioned", depth: "deep", steps: [{ type: "intro" }, { type: "core_explanation" }, { type: "breakdown" }, { type: "example" }] },
        { mode: "phased", internalPhases: ["audit", "plan", "implement", "verify", "review"] }
      )
    );
    expect(result.eligible).toBe(true);
  });

  it("shows visible thought when approach-framing keywords are present", () => {
    const result = shouldShowVisibleThought(
      make("Walk me through how to set up CI/CD", "answer",
        { scopeSize: "medium" },
        { intentSurface: "software_engineering" },
        { structure: "sectioned", depth: "medium" }
      )
    );
    expect(result.eligible).toBe(true);
    expect(result.reason).toMatch(/approach_keyword/);
  });

  it("shows visible thought for large-scope engineering tasks", () => {
    const result = shouldShowVisibleThought(
      make("Review my entire codebase architecture", "answer",
        { complexity: "high", scopeSize: "large" },
        { intentSurface: "software_engineering" },
        { structure: "sectioned", depth: "deep" }
      )
    );
    expect(result.eligible).toBe(true);
  });

  // ── Determinism ──────────────────────────────────────────────────────────

  it("produces deterministic results for identical inputs", () => {
    const input = make("Explain event loops in JavaScript", "answer",
      { complexity: "medium", scopeSize: "small" },
      { intentSurface: "knowledge_or_casual_qa", constraints: { wantsDepth: false, wantsStepByStep: false } },
      { structure: "direct", depth: "light" }
    );
    const r1 = shouldShowVisibleThought(input);
    const r2 = shouldShowVisibleThought(input);
    const r3 = shouldShowVisibleThought(input);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it("produces same result for eligible input across multiple calls", () => {
    const input = make("Walk me through setting up authentication", "answer",
      { complexity: "medium", scopeSize: "medium" },
      { intentSurface: "software_engineering" },
      { structure: "sectioned", depth: "medium" }
    );
    const results = Array.from({ length: 5 }, () => shouldShowVisibleThought(input));
    expect(new Set(results.map((r) => r.eligible)).size).toBe(1);
    expect(new Set(results.map((r) => r.reason)).size).toBe(1);
  });

  // ── Guarded/safety responses ─────────────────────────────────────────────

  it("skips visible thought for high-risk guarded responses regardless of complexity", () => {
    const result = shouldShowVisibleThought(
      make("How do I hack into a server?", "guarded",
        { complexity: "high", scopeSize: "large" },
        { intentSurface: "software_engineering", riskLevel: "high" }
      )
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/guarded/);
  });

  it("skips visible thought for clarification responses regardless of scope", () => {
    const result = shouldShowVisibleThought(
      make("build something big", "clarify",
        { complexity: "high", scopeSize: "large" },
        { intentSurface: "software_engineering", ambiguity: {
          fromClassifier: { isAmbiguous: true },
          forExecution: { isAmbiguous: true },
          isBlocking: true,
          missingTopic: true
        }}
      )
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/clarify/);
  });

  // ── Sectioned plans ──────────────────────────────────────────────────────

  it("shows visible thought for sectioned non-light response plans", () => {
    const result = shouldShowVisibleThought(
      make("How does garbage collection work in V8?", "answer",
        { complexity: "medium", scopeSize: "medium" },
        { intentSurface: "knowledge_or_casual_qa" },
        { structure: "sectioned", depth: "medium", steps: [{ type: "intro" }, { type: "core_explanation" }] }
      )
    );
    expect(result.eligible).toBe(true);
  });

  it("does not qualify sectioned+light plan without other signals", () => {
    const result = shouldShowVisibleThought(
      make("Define recursion", "answer",
        { scopeSize: "small", complexity: "low" },
        { intentSurface: "knowledge_or_casual_qa" },
        { structure: "sectioned", depth: "light", steps: [{ type: "direct_answer" }] }
      )
    );
    // sectioned+light doesn't qualify (light excludes it from sectioned check)
    // but it's also excluded by casual_low_complexity_qa
    expect(result.eligible).toBe(false);
  });
});
