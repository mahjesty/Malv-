import { ConflictPolicyService } from "./conflict-policy.service";

describe("ConflictPolicyService", () => {
  const svc = new ConflictPolicyService();

  it("returns deterministic conflict set", () => {
    const out = svc.resolve({
      urgency: "high",
      riskTier: "high",
      modeType: "execute",
      tone: "confused",
      scopeSize: "large",
      evidenceLevel: "weak"
    });
    expect(out.map((x) => x.conflictType)).toEqual([
      "urgency_vs_completeness",
      "empathy_vs_directness",
      "speed_vs_safety",
      "confidence_vs_uncertainty",
      "action_vs_explanation"
    ]);
    expect(out.find((x) => x.conflictType === "speed_vs_safety")?.winner).toBe("safety");
  });
});
