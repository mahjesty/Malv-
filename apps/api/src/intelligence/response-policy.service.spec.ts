import { ResponsePolicyService } from "./response-policy.service";

describe("ResponsePolicyService", () => {
  const svc = new ResponsePolicyService();

  it("derives response and execution policy deterministically", () => {
    const response = svc.derive(
      {
        urgency: "high",
        riskTier: "high",
        modeType: "execute",
        tone: "technical",
        scopeSize: "large",
        evidenceLevel: "weak"
      },
      []
    );
    expect(response.responseMode).toBe("action_first");
    expect(response.validationNeeded).toBe(true);

    const exec = svc.deriveExecutionPolicy(
      {
        urgency: "high",
        riskTier: "high",
        modeType: "execute",
        tone: "technical",
        scopeSize: "large",
        evidenceLevel: "weak"
      },
      {
        execution: {
          executionReadiness: "needs_validation",
          actionPlan: [],
          checkpointPlan: [],
          rollbackRisk: "high",
          completionCriteria: []
        }
      }
    );
    expect(exec.approvalPosture).toBe("elevated");
    expect(exec.requireSandboxValidation).toBe(true);
  });

  it("adapts depth and empathy from cross-layer signals", () => {
    const response = svc.derive(
      {
        urgency: "low",
        riskTier: "medium",
        modeType: "analyze",
        tone: "neutral",
        scopeSize: "large",
        evidenceLevel: "partial"
      },
      [],
      {
        communication: { responseDepth: "brief" },
        contextual: { stateModel: { userStressLevel: "high" } }
      } as any
    );
    expect(response.depth).toBe("brief");
    expect(response.includeEmpathyLine).toBe(true);
  });

  it("elevates validation for external execution and call privacy", () => {
    const response = svc.derive(
      {
        urgency: "medium",
        riskTier: "medium",
        modeType: "execute",
        tone: "neutral",
        scopeSize: "medium",
        evidenceLevel: "partial"
      },
      [],
      {
        call_context: { callPrivacyFlags: ["sensitive_spoken_context"], voiceToneStrategy: "urgent" },
        device_control: { approvalRequired: true, executionRisk: "medium" }
      } as any
    );
    expect(response.validationNeeded).toBe(true);
    expect(response.includeRiskCallouts).toBe(true);
  });

  it("requires sandbox validation for device-target execution", () => {
    const exec = svc.deriveExecutionPolicy(
      {
        urgency: "low",
        riskTier: "low",
        modeType: "execute",
        tone: "direct",
        scopeSize: "small",
        evidenceLevel: "strong"
      },
      {
        execution: { executionReadiness: "ready" },
        device_control: { executionTarget: "desktop", approvalRequired: false }
      } as any
    );
    expect(exec.requireSandboxValidation).toBe(true);
  });

  it("escalates response style under urgent private call plus external risk", () => {
    const response = svc.derive(
      {
        urgency: "high",
        riskTier: "medium",
        modeType: "execute",
        tone: "neutral",
        scopeSize: "small",
        evidenceLevel: "partial"
      },
      [],
      {
        call_context: { callPrivacyFlags: ["sensitive_spoken_context"], voiceToneStrategy: "urgent" },
        device_control: { approvalRequired: true, executionRisk: "high" }
      } as any
    );
    expect(response.toneStyle).toBe("strategic_operator");
    expect(response.includeRiskCallouts).toBe(true);
  });

  it("escalates validation when continuity health is weak", () => {
    const response = svc.derive(
      {
        urgency: "low",
        riskTier: "low",
        modeType: "analyze",
        tone: "neutral",
        scopeSize: "small",
        evidenceLevel: "partial"
      },
      [],
      {
        chat_to_call_continuity: { continuityState: "transitioning", continuityHealth: "weak" }
      } as any
    );
    expect(response.validationNeeded).toBe(true);
    expect(response.confidenceExplanation).toContain("confidence=");
  });
});
