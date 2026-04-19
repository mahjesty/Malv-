import { resolveMalvCognitiveEffortTier, shouldSkipMetaIntelligenceRouter } from "./malv-cognitive-effort-tier";

describe("malv cognitive effort tier", () => {
  it("assigns tier 0 for reflex lane", () => {
    expect(
      resolveMalvCognitiveEffortTier({
        reflexLane: true,
        modeType: "analyze",
        superFix: false,
        executionStrategyMode: "phased",
        internalPhaseCount: 4
      })
    ).toBe(0);
  });

  it("assigns tier 3 for super fix", () => {
    expect(
      resolveMalvCognitiveEffortTier({
        reflexLane: false,
        modeType: "fix",
        superFix: true,
        executionStrategyMode: "single_step",
        internalPhaseCount: 0
      })
    ).toBe(3);
  });

  it("assigns tier 2 for phased strategy", () => {
    expect(
      resolveMalvCognitiveEffortTier({
        reflexLane: false,
        modeType: "analyze",
        superFix: false,
        executionStrategyMode: "phased",
        internalPhaseCount: 2
      })
    ).toBe(2);
  });

  it("skips meta router only on low tiers with safe gates", () => {
    expect(
      shouldSkipMetaIntelligenceRouter({
        cognitiveTier: 1,
        superFix: false,
        vaultSessionId: null,
        operatorPhase: null,
        modeType: "explain",
        inputMode: "text"
      })
    ).toBe(true);

    expect(
      shouldSkipMetaIntelligenceRouter({
        cognitiveTier: 2,
        superFix: false,
        vaultSessionId: null,
        operatorPhase: null,
        modeType: "explain",
        inputMode: "text"
      })
    ).toBe(false);
  });
});
