import { RuntimePolicyService } from "./runtime-policy.service";

describe("RuntimePolicyService typed actions", () => {
  const mk = () => {
    const defs: any = { findOne: jest.fn() };
    const versions: any = { findOne: jest.fn(), save: jest.fn() };
    const bindings: any = { findOne: jest.fn(), save: jest.fn(), findOneOrFail: jest.fn() };
    const cmdDecisions: any = { save: jest.fn(), create: jest.fn((x: any) => x) };
    const typedActionDecisions: any = { save: jest.fn(), create: jest.fn((x: any) => x) };
    const securityEvents = { emitBestEffort: jest.fn() };
    const svc = new RuntimePolicyService(defs, versions, bindings, cmdDecisions, typedActionDecisions, securityEvents as any);
    return { svc, defs, versions, bindings, typedActionDecisions, securityEvents, cmdDecisions };
  };

  it("requires approval for write_file typed action", async () => {
    const { svc, bindings, versions } = mk();
    bindings.findOne.mockResolvedValue({ policyVersion: { id: "pv-1" } });
    versions.findOne.mockResolvedValue({ id: "pv-1", rulesJson: null });
    const out = await svc.evaluateTypedAction({
      sandboxRunId: "run-1",
      actionType: "write_file",
      parameters: { path: "apps/api/src/main.ts", content: "x" }
    });
    expect(out.decision).toBe("require_approval");
    expect(out.riskLevel).toBe("high");
  });

  it("rewrites search_repo limit when missing", async () => {
    const { svc, bindings, versions } = mk();
    bindings.findOne.mockResolvedValue({ policyVersion: { id: "pv-1" } });
    versions.findOne.mockResolvedValue({ id: "pv-1", rulesJson: null });
    const out = await svc.evaluateTypedAction({
      sandboxRunId: "run-1",
      actionType: "search_repo",
      parameters: { query: "error" }
    });
    expect(out.decision).toBe("rewrite");
    expect(out.rewrittenParameters).toMatchObject({ query: "error", limit: 100 });
  });

  it("emits security event when command policy decision is persisted as deny", async () => {
    const { svc, cmdDecisions, securityEvents } = mk();
    cmdDecisions.save.mockResolvedValue({ id: "d1" });
    await svc.persistDecision({
      sandboxCommandRecord: { id: "c1" } as any,
      sandboxRunId: "run-1",
      policyVersionId: "pv-1",
      requestedCommand: "rm -rf",
      normalizedCommand: "rm -rf",
      commandCategory: "system",
      riskLevel: "critical",
      decision: "deny",
      decisionReason: "denied by pattern"
    });
    expect(securityEvents.emitBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "sandbox.policy.denied",
        subsystem: "sandbox_policy"
      })
    );
  });

  it("denies unknown typed action by default", async () => {
    const { svc, bindings, versions } = mk();
    bindings.findOne.mockResolvedValue({ policyVersion: { id: "pv-1" } });
    versions.findOne.mockResolvedValue({ id: "pv-1", rulesJson: null });
    const out = await svc.evaluateTypedAction({
      sandboxRunId: "run-1",
      actionType: "unknown_action",
      parameters: {}
    });
    expect(out.decision).toBe("deny");
  });
});
