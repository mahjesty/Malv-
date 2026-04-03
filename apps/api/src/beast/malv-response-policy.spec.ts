import { mapResponsePolicy } from "./malv-response-policy";
import type { UserToneAnalysis } from "./malv-conversation-signals";
import type { MetaIntelligenceDecision } from "../intelligence/meta-intelligence.types";

const baseTone = (over: Partial<UserToneAnalysis>): UserToneAnalysis => ({
  userTone: "neutral",
  urgency: "low",
  depthPreference: "balanced",
  emotionalSensitivity: "low",
  toneReasons: ["test"],
  ...over
});

describe("mapResponsePolicy", () => {
  it("uses identity_direct for identity_query", () => {
    const m = mapResponsePolicy("analyze", baseTone({ userTone: "identity_query" }));
    expect(m.primary).toBe("identity_direct");
  });

  it("maps frustrated + fix to calm_direct + concise_fix", () => {
    const m = mapResponsePolicy("fix", baseTone({ userTone: "frustrated" }));
    expect(m.primary).toBe("calm_direct");
    expect(m.secondary).toBe("concise_fix");
  });

  it("maps confused to supportive_clear", () => {
    const m = mapResponsePolicy("explain", baseTone({ userTone: "confused" }));
    expect(m.primary).toBe("supportive_clear");
  });

  it("maps technical + fix to technical_precise", () => {
    const m = mapResponsePolicy("fix", baseTone({ userTone: "technical" }));
    expect(m.primary).toBe("technical_precise");
    expect(m.secondary).toBe("concise_fix");
  });

  it("uses meta tone style when provided", () => {
    const meta = {
      activeLayers: [],
      suppressedLayers: [],
      priorityOrder: [],
      conflictDecisions: [],
      finalResponsePolicy: {
        responseMode: "action_first",
        toneStyle: "concise_fix",
        depth: "brief",
        certaintyClass: "tentative",
        confidenceClass: "medium",
        validationNeeded: true,
        includeNextStepChecklist: true,
        includeRiskCallouts: true,
        includeEmpathyLine: false
      },
      executionPolicy: {
        posture: "guided_execution",
        approvalPosture: "normal",
        allowAutonomousActions: false,
        requireSandboxValidation: true
      },
      layerOutputs: {},
      overallDecisionConfidence: 0.62
    } satisfies MetaIntelligenceDecision;
    const m = mapResponsePolicy("analyze", baseTone({ userTone: "neutral" }), meta);
    expect(m.primary).toBe("concise_fix");
  });

  it("keeps legacy behavior when router output is absent", () => {
    const m = mapResponsePolicy("explain", baseTone({ userTone: "confused" }), null);
    expect(m.primary).toBe("supportive_clear");
  });
});
