import { buildLearningAdaptiveSnapshot, computeBiasesFromAggregate } from "./malv-adaptive-thresholds.util";
import { createEmptyMalvUserLearningProfilePayload } from "../db/entities/malv-user-learning-profile.entity";

describe("malv-adaptive-thresholds.util", () => {
  it("computeBiasesFromAggregate stays bounded for empty aggregate", () => {
    const b = computeBiasesFromAggregate(createEmptyMalvUserLearningProfilePayload());
    expect(Math.abs(b.tierBias)).toBeLessThanOrEqual(0.08);
    expect(Math.abs(b.clarificationBias)).toBeLessThanOrEqual(0.08);
  });

  it("buildLearningAdaptiveSnapshot applies tierBias to upgrade gate", () => {
    const agg = createEmptyMalvUserLearningProfilePayload();
    agg.turns = 100;
    agg.tierUpgrade12 = 25;
    const biases = computeBiasesFromAggregate(agg);
    const snap = buildLearningAdaptiveSnapshot(biases);
    expect(snap.tierThresholds.upgradeIntentMax).toBeLessThan(0.52);
    expect(snap.tierThresholds.softClarificationIntentMax).toBeGreaterThan(0.2);
    expect(snap.tierThresholds.softClarificationIntentMax).toBeLessThan(0.5);
  });
});
