import { generateVisibleThoughtLines, VISIBLE_THOUGHT_INTERNAL_TERM_BANLIST } from "./malv-visible-thought-generator";
import type { VisibleThoughtGeneratorInput } from "./malv-visible-thought-generator";
import type { ClassifiedIntent } from "./intent-understanding.types";
import type { MalvSemanticInterpretation } from "./semantic-interpretation.types";
import type { MalvResponsePlan } from "./malv-response-planning.util";
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
  classified: Partial<ClassifiedIntent> = {},
  interpretation: Partial<MalvSemanticInterpretation> = {},
  plan: Partial<MalvResponsePlan> = {},
  strategy: Partial<ExecutionStrategyResult> = {}
): VisibleThoughtGeneratorInput {
  return {
    rawUserMessage,
    classified: baseClassified(classified),
    interpretation: baseInterpretation(interpretation),
    plan: basePlan(plan),
    strategy: baseStrategy(strategy)
  };
}

// ─── Internal term validator ───────────────────────────────────────────────

function containsInternalTerm(lines: string[]): string | null {
  const joined = lines.join(" ").toLowerCase();
  for (const term of VISIBLE_THOUGHT_INTERNAL_TERM_BANLIST) {
    if (joined.includes(term.toLowerCase())) {
      return term;
    }
  }
  return null;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("generateVisibleThoughtLines — humanized thought generation", () => {

  // ── Output shape ─────────────────────────────────────────────────────────

  it("returns between 1 and 4 lines for any eligible input", () => {
    const inputs: VisibleThoughtGeneratorInput[] = [
      make("Tell me something interesting", {}, { intentSurface: "open_broad_or_explore", delegationLevel: "topic_choice" }),
      make("Walk me through building a REST API step by step", { complexity: "high" }, { intentSurface: "software_engineering", constraints: { wantsStepByStep: true, wantsDepth: false } }),
      make("Deep dive into React reconciliation", { complexity: "high" }, { constraints: { wantsDepth: true, wantsStepByStep: false } }, { depth: "deep" }),
      make("Build me a full SaaS product", { complexity: "high", scopeSize: "large" }, {}, {}, { mode: "phased", internalPhases: ["audit", "plan", "implement", "verify", "review"] })
    ];
    for (const input of inputs) {
      const lines = generateVisibleThoughtLines(input);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      expect(lines.length).toBeLessThanOrEqual(4);
    }
  });

  it("returns non-empty strings", () => {
    const lines = generateVisibleThoughtLines(
      make("Explain dependency injection", { complexity: "medium" }, { intentSurface: "knowledge_or_casual_qa" })
    );
    for (const line of lines) {
      expect(typeof line).toBe("string");
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  // ── No internal technical language ───────────────────────────────────────

  it("generates no internal system terminology for delegated broad prompt", () => {
    const lines = generateVisibleThoughtLines(
      make("Something interesting", {}, {
        intentSurface: "open_broad_or_explore",
        delegationLevel: "topic_choice"
      })
    );
    const leaked = containsInternalTerm(lines);
    expect(leaked).toBeNull();
  });

  it("generates no internal system terminology for high-complexity engineering task", () => {
    const lines = generateVisibleThoughtLines(
      make("Rebuild our auth system from scratch", { complexity: "high", scopeSize: "large" }, {
        intentSurface: "software_engineering"
      }, { structure: "sectioned", depth: "deep" }, {
        mode: "phased",
        internalPhases: ["audit", "plan", "implement", "verify", "review"]
      })
    );
    const leaked = containsInternalTerm(lines);
    expect(leaked).toBeNull();
  });

  it("generates no internal system terminology for step-by-step request", () => {
    const lines = generateVisibleThoughtLines(
      make("Walk me through React hooks step by step", {}, {
        intentSurface: "knowledge_or_casual_qa",
        constraints: { wantsStepByStep: true, wantsDepth: false }
      })
    );
    const leaked = containsInternalTerm(lines);
    expect(leaked).toBeNull();
  });

  it("never contains banlist terms across a wide set of inputs", () => {
    const inputs: VisibleThoughtGeneratorInput[] = [
      make("What is an API?", { complexity: "low" }, { intentSurface: "knowledge_or_casual_qa" }),
      make("Debug my React crash", { complexity: "high" }, { intentSurface: "software_engineering" }),
      make("Tell me something cool", {}, { intentSurface: "open_broad_or_explore", delegationLevel: "topic_choice" }),
      make("Explain auth step by step", {}, { constraints: { wantsStepByStep: true, wantsDepth: false } }),
      make("Review my whole codebase", { complexity: "high", scopeSize: "large" }, { intentSurface: "software_engineering" }),
      make("Compare Redis vs Postgres for caching", { complexity: "medium" }, { intentSurface: "knowledge_or_casual_qa" }),
      make("Plan out a new feature end to end", { complexity: "high" }, {}, {}, { mode: "phased", internalPhases: ["plan", "implement", "verify"] })
    ];
    for (const input of inputs) {
      const lines = generateVisibleThoughtLines(input);
      const leaked = containsInternalTerm(lines);
      expect(leaked).toBeNull();
    }
  });

  // ── Specific signal → natural language mapping ───────────────────────────

  it("uses delegation/open-choice language for broad delegated prompts", () => {
    const lines = generateVisibleThoughtLines(
      make("Show me something interesting", {}, {
        intentSurface: "open_broad_or_explore",
        delegationLevel: "topic_choice"
      })
    );
    const joined = lines.join(" ").toLowerCase();
    expect(joined).toMatch(/open|explor|direction|choice/);
  });

  it("uses step-by-step language when user requests structured breakdown", () => {
    const lines = generateVisibleThoughtLines(
      make("Walk me through how async/await works step by step", {}, {
        constraints: { wantsStepByStep: true, wantsDepth: false }
      }, { structure: "step_by_step" })
    );
    const joined = lines.join(" ").toLowerCase();
    expect(joined).toMatch(/step|break|structur/);
  });

  it("uses debugging/diagnostic language for debug-keyword engineering turns", () => {
    const lines = generateVisibleThoughtLines(
      make("My app crashes on startup, help me debug it", { complexity: "high" }, {
        intentSurface: "software_engineering"
      })
    );
    const joined = lines.join(" ").toLowerCase();
    expect(joined).toMatch(/debug|diagnos|caus|work|problem/);
  });

  it("uses methodical language for complex engineering tasks", () => {
    const lines = generateVisibleThoughtLines(
      make("Implement a distributed rate limiter", { complexity: "high", scopeSize: "large" }, {
        intentSurface: "software_engineering"
      }, { depth: "deep" })
    );
    const joined = lines.join(" ").toLowerCase();
    expect(joined).toMatch(/methodic|careful|organiz|structur|approach|engineer/);
  });

  // ── Determinism ──────────────────────────────────────────────────────────

  it("produces identical output for identical inputs", () => {
    const input = make("Explain dependency injection", { complexity: "medium" }, {
      intentSurface: "knowledge_or_casual_qa",
      constraints: { wantsDepth: true, wantsStepByStep: false }
    }, { depth: "deep" });
    const r1 = generateVisibleThoughtLines(input);
    const r2 = generateVisibleThoughtLines(input);
    const r3 = generateVisibleThoughtLines(input);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it("produces same result for same qualifying input across multiple invocations", () => {
    const input = make("Tell me something worth exploring", {}, {
      intentSurface: "open_broad_or_explore",
      delegationLevel: "topic_choice"
    });
    const results = Array.from({ length: 5 }, () => generateVisibleThoughtLines(input));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});
