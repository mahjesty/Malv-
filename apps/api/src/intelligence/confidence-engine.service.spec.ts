import { ConfidenceEngineService } from "./confidence-engine.service";

describe("ConfidenceEngineService", () => {
  const svc = new ConfidenceEngineService();

  it("scores deterministically with expected formula", () => {
    const out = svc.evaluate({
      inputClarity: 0.8,
      contextCompleteness: 0.7,
      ambiguity: 0.2,
      riskLevel: 0.3,
      historicalSuccess: 0.6
    });
    expect(out.score).toBe(0.52);
    expect(out.level).toBe("medium");
  });

  it("returns low level when ambiguity and risk are high", () => {
    const out = svc.evaluate({
      inputClarity: 0.3,
      contextCompleteness: 0.3,
      ambiguity: 0.9,
      riskLevel: 0.9
    });
    expect(out.level).toBe("low");
  });

  it("applies stricter execution calibration with weak evidence", () => {
    const out = svc.evaluate({
      inputClarity: 0.9,
      contextCompleteness: 0.9,
      ambiguity: 0.1,
      riskLevel: 0.2,
      historicalSuccess: 0.8,
      domain: "execution",
      evidenceStrength: "weak"
    });
    expect(out.confidenceTrace?.domain).toBe("execution");
    expect(out.score).toBeLessThan(0.8);
  });
});
