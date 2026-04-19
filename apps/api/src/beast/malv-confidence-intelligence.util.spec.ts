import type { ClassifiedIntent } from "./intent-understanding.types";
import {
  applyMalvTierStrategyCorrectionOnce,
  deriveIntentConfidence,
  detectMultiIntent,
  evaluateResponseConfidence,
  shouldTriggerSoftConfidenceClarification,
  computeMalvConfidencePreResponse,
  enrichMalvConfidenceWithMeta,
  applyAgentRouterConfidenceAdjust
} from "./malv-confidence-intelligence.util";
import type { ExecutionStrategyResult } from "./execution-strategy.service";

function baseClassified(partial: Partial<ClassifiedIntent>): ClassifiedIntent {
  const scores: ClassifiedIntent["scores"] = {
    full_product_build: 0,
    feature_build: 0,
    bug_fix: 0,
    improvement_refactor: 0,
    frontend_design: 0,
    backend_logic: 0,
    system_upgrade: 0,
    ...partial.scores
  };
  return {
    primaryIntent: partial.primaryIntent ?? "feature_build",
    scores,
    scopeSize: partial.scopeSize ?? "small",
    complexity: partial.complexity ?? "low",
    domains: partial.domains ?? [],
    ambiguity: partial.ambiguity ?? { isAmbiguous: false }
  };
}

describe("malv-confidence-intelligence.util", () => {
  it("deriveIntentConfidence rewards score separation", () => {
    const loose = baseClassified({ scores: { feature_build: 3, bug_fix: 2 } as ClassifiedIntent["scores"] });
    const tight = baseClassified({ scores: { feature_build: 3, bug_fix: 3 } as ClassifiedIntent["scores"] });
    expect(deriveIntentConfidence(loose)).toBeGreaterThan(deriveIntentConfidence(tight));
  });

  it("detectMultiIntent when two intents are strong", () => {
    const c = baseClassified({ scores: { feature_build: 3, bug_fix: 3 } as ClassifiedIntent["scores"] });
    expect(detectMultiIntent(c)).toBe(true);
  });

  it("applyMalvTierStrategyCorrectionOnce upgrades companion-light when multi-intent", () => {
    const classified = baseClassified({
      scores: { feature_build: 3, bug_fix: 3 } as ClassifiedIntent["scores"],
      scopeSize: "small",
      complexity: "low"
    });
    const strategy: ExecutionStrategyResult = {
      mode: "single_step",
      internalPhases: [],
      preferBeastWorker: false,
      riskTier: "low"
    };
    const out = applyMalvTierStrategyCorrectionOnce({
      classified,
      strategy,
      rawMessage: "fix the feature and add logging",
      modeType: "explain",
      superFix: false
    });
    expect(out.correction?.toTier).toBe(2);
    expect(out.strategy.internalPhases.length).toBeGreaterThan(0);
  });

  it("evaluateResponseConfidence penalizes uncertainty and length mismatch", () => {
    const ok = evaluateResponseConfidence({
      reply: "Here is a concrete answer with enough substance for the question asked.",
      userMessage: "short",
      cognitiveTier: 1,
      internalPhaseCount: 0
    });
    const bad = evaluateResponseConfidence({
      reply: "maybe",
      userMessage: "x".repeat(500),
      cognitiveTier: 2,
      internalPhaseCount: 5
    });
    expect(ok).toBeGreaterThan(bad);
  });

  it("shouldTriggerSoftConfidenceClarification stays off for broad open-ended prompts", () => {
    const classified = baseClassified({
      scores: { feature_build: 3, bug_fix: 3 } as ClassifiedIntent["scores"],
      ambiguity: { isAmbiguous: false }
    });
    const conf = computeMalvConfidencePreResponse({
      classified,
      strategy: {
        mode: "single_step",
        internalPhases: [],
        preferBeastWorker: false,
        riskTier: "low"
      },
      rawMessage: "surprise me with a deep explanation of something complex",
      tierCorrection: null,
      cognitiveTier: 1
    });
    expect(shouldTriggerSoftConfidenceClarification(classified, conf, "surprise me with a deep explanation of something complex")).toBe(
      false
    );
  });

  it("shouldTriggerSoftConfidenceClarification stays off for knowledge questions", () => {
    const classified = baseClassified({
      scores: { feature_build: 3, bug_fix: 3 } as ClassifiedIntent["scores"],
      ambiguity: { isAmbiguous: false }
    });
    const conf = computeMalvConfidencePreResponse({
      classified,
      strategy: {
        mode: "single_step",
        internalPhases: [],
        preferBeastWorker: false,
        riskTier: "low"
      },
      rawMessage: "What is the difference between X and Y?",
      tierCorrection: null,
      cognitiveTier: 1
    });
    expect(shouldTriggerSoftConfidenceClarification(classified, conf, "What is the difference between X and Y?")).toBe(
      false
    );
  });

  it("enrichMalvConfidenceWithMeta sets conflicting_context only for tier 2+", () => {
    const base = computeMalvConfidencePreResponse({
      classified: baseClassified({}),
      strategy: { mode: "single_step", internalPhases: [], preferBeastWorker: false, riskTier: "low" },
      rawMessage: "hi",
      tierCorrection: null,
      cognitiveTier: 1
    });
    const meta = {
      routerDecisionTrace: { conflictingSignalsDetected: true },
      overallDecisionConfidence: 0.9
    } as any;
    const t1 = enrichMalvConfidenceWithMeta(base, meta, 1);
    expect(t1.signals.conflicting_context).toBe(false);
    const t2 = enrichMalvConfidenceWithMeta(base, meta, 2);
    expect(t2.signals.conflicting_context).toBe(true);
  });

  it("applyAgentRouterConfidenceAdjust reacts to low router score", () => {
    const base = computeMalvConfidencePreResponse({
      classified: baseClassified({}),
      strategy: { mode: "single_step", internalPhases: ["audit"], preferBeastWorker: false, riskTier: "low" } as any,
      rawMessage: "x",
      tierCorrection: null,
      cognitiveTier: 2
    });
    const adj = applyAgentRouterConfidenceAdjust(base, 2, 0.2);
    expect(adj.tierConfidence).toBeLessThanOrEqual(base.tierConfidence);
  });
});
