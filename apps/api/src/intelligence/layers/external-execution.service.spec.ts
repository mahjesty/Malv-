import { ExternalExecutionService } from "./external-execution.service";

describe("ExternalExecutionService", () => {
  const svc = new ExternalExecutionService();

  it("escalates approval and stays advisory when certainty is insufficient", () => {
    const out = svc.analyze(
      {
        urgency: "medium",
        riskTier: "medium",
        modeType: "execute",
        tone: "direct",
        scopeSize: "medium",
        evidenceLevel: "partial"
      },
      {
        executionTarget: "desktop",
        bridgeRoute: "none",
        executionPlan: [],
        approvalRequired: false,
        permissionStatus: "unknown",
        rollbackPlan: [],
        executionRisk: "medium",
        confirmationStrategy: "ask_before_execute",
        routeConfidence: 0.4,
        confidenceReason: "low_route_certainty"
      }
    );
    expect(out.approvalRequired).toBe(true);
    expect(out.confirmationStrategy).toBe("deny_and_explain");
    expect(out.executionPlan).toContain("provide_advisory_only_steps");
  });

  it("generates rollback fallback when absent", () => {
    const out = svc.analyze(
      {
        urgency: "low",
        riskTier: "low",
        modeType: "execute",
        tone: "neutral",
        scopeSize: "small",
        evidenceLevel: "strong"
      },
      {
        executionTarget: "home_device",
        bridgeRoute: "home_assistant_bridge",
        executionPlan: [],
        approvalRequired: false,
        permissionStatus: "allowed",
        rollbackPlan: [],
        executionRisk: "low",
        confirmationStrategy: "auto_safe",
        routeConfidence: 0.9,
        confidenceReason: "target_and_bridge_are_clear"
      }
    );
    expect(out.rollbackPlan.length).toBeGreaterThan(0);
  });
});
