import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { MalvInferenceTierCapabilityService } from "../../inference/malv-inference-tier-capability.service";
import { MalvAgentOrchestratorService } from "./malv-agent-orchestrator.service";
import { MalvTaskRouterService } from "../router/malv-task-router.service";
import { MalvAgentLifecycleService } from "../lifecycle/malv-agent-lifecycle.service";
import { MalvAgentRegistryService } from "../registry/malv-agent-registry.service";
import { MALV_ALL_REGISTERED_AGENT_PROVIDERS } from "../malv-agent-system.providers";

function testConfig(map: Record<string, string | undefined>) {
  return { get: (k: string) => map[k] } as unknown as ConfigService;
}

describe("MalvAgentOrchestratorService", () => {
  it("runAdvisoryLifecycleWithDefaultInputs executes bounded plan", async () => {
    const cfg = testConfig({
      MALV_LIGHTWEIGHT_MAX_PROMPT_CHARS: "6000",
      MALV_LIGHTWEIGHT_MAX_CONTEXT_CHARS: "24000"
    });
    const m = await Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: cfg },
        MalvInferenceTierCapabilityService,
        ...MALV_ALL_REGISTERED_AGENT_PROVIDERS,
        MalvAgentRegistryService,
        MalvTaskRouterService,
        MalvAgentLifecycleService,
        MalvAgentOrchestratorService
      ]
    }).compile();
    await m.init();
    const orch = m.get(MalvAgentOrchestratorService);
    const { decision, result } = await orch.runAdvisoryLifecycleWithDefaultInputs({
      ctx: {
        traceId: "orch",
        vaultScoped: false,
        surface: "chat",
        latencySensitive: false,
        privacySensitive: false
      },
      routerInput: {
        surface: "chat",
        userText: "hi",
        vaultScoped: false
      },
      timeoutMs: 30_000
    });
    expect(decision.plan.steps.length).toBeGreaterThan(0);
    expect(result.envelopes.length).toBeGreaterThan(0);
    expect(result.merged.payload && typeof result.merged.payload === "object").toBe(true);
  });
});
