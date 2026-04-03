import { BeastOrchestratorService } from "./beast.orchestrator.service";

describe("BeastOrchestratorService hooks", () => {
  it("keeps hook metadata advisory-only", () => {
    const svc = Object.create(BeastOrchestratorService.prototype) as BeastOrchestratorService;
    const hooks = {
      call: (svc as any).buildRealtimeCallHook(
        { inputMode: "voice", callId: "call-1" },
        { layerOutputs: { call_context: { callState: "listening", presenceMode: "active", callPrivacyFlags: [] } } }
      ),
      external: (svc as any).buildExternalExecutionHook({
        layerOutputs: {
          device_control: {
            executionTarget: "desktop",
            bridgeRoute: "desktop_agent",
            approvalRequired: true,
            executionRisk: "medium",
            rollbackPlan: ["snapshot_target_state"]
          }
        }
      }),
      continuity: (svc as any).buildContinuityHook({
        layerOutputs: {
          chat_to_call_continuity: {
            continuityState: "transitioning",
            activeSurface: "mixed",
            sessionScope: "cross_surface",
            vaultBoundaryState: "inactive"
          }
        }
      })
    };

    expect(hooks.call.enabled).toBe(true);
    expect(hooks.external.enabled).toBe(true);
    expect(hooks.continuity.enabled).toBe(true);
    expect((hooks.external as any).executeNow).toBeUndefined();
    expect((hooks.external as any).autonomous).toBeUndefined();
  });
});
