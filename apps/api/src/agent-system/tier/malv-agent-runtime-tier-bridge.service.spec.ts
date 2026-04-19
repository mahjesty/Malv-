import { MalvAgentRuntimeTierBridgeService } from "./malv-agent-runtime-tier-bridge.service";
import type { MalvTaskRouterDecision } from "../contracts/malv-agent.contracts";

function cfg(map: Record<string, string | undefined>) {
  return { get: (k: string) => map[k] } as any;
}

describe("MalvAgentRuntimeTierBridgeService", () => {
  it("flags degraded path when router wants GPU but inference telemetry is CPU", () => {
    const bridge = new MalvAgentRuntimeTierBridgeService(cfg({}), {} as any);
    const decision = {
      resourceTier: "gpu"
    } as MalvTaskRouterDecision;
    const align = bridge.alignRouterWithInferenceTelemetry(decision, { malvPreferredTier: "cpu" });
    expect(align.degradedFromRouterIntent).toBe(true);
    expect(align.inferencePreferredTier).toBe("cpu");
  });

  it("resolves call surface to CPU tier preference", () => {
    const bridge = new MalvAgentRuntimeTierBridgeService(cfg({}), {} as any);
    expect(bridge.resolveTierForNonChatSurface("call", "gpu")).toBe("cpu");
  });
});
