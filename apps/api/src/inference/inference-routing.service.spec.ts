import { ConfigService } from "@nestjs/config";
import { InferenceRoutingService } from "./inference-routing.service";
import { MalvInferenceTierCapabilityService } from "./malv-inference-tier-capability.service";

function makeCfg(map: Record<string, string | undefined>) {
  return {
    get: (k: string) => map[k]
  } as unknown as ConfigService;
}

function makeRouting(map: Record<string, string | undefined>) {
  const c = makeCfg(map);
  return new InferenceRoutingService(c, new MalvInferenceTierCapabilityService(c));
}

const chatBase = {
  surface: "chat" as const,
  userMessage: "hello there",
  modeType: "explain" as const,
  classifiedWorkerMode: "light" as const,
  superFix: false,
  useServerPhased: false,
  executionStrategyMode: "normal",
  internalPhaseCount: 0,
  contextChars: 100,
  vaultScoped: false,
  inputMode: "text" as const
};

describe("InferenceRoutingService", () => {
  it("keeps primary chain when lightweight disabled", async () => {
    const svc = makeRouting({
      MALV_LIGHTWEIGHT_INFERENCE_ENABLED: "false",
      MALV_LIGHTWEIGHT_ROUTING_ENABLED: "true"
    });
    const d = svc.decideForChat(chatBase);
    expect(d.telemetry.malvLightweightTierRequested).toBe(false);
    expect(d.telemetry.malvPreferredTier).toBe("cpu");
    expect(d.telemetry.malvTaskClass).toBe("chat_low_scope_lightweight_unavailable");
    expect(d.workerContextPatch.malvInferenceBackend).toBeUndefined();
    expect(d.chatTierFailover?.plan.steps).toEqual([{ tier: "gpu", applyCpuSidecarPatch: false }]);
    expect(d.telemetry.malvRoutingReason).toContain("lightweight_disabled");
  });

  it("routes lightweight for short explain mode when enabled (CPU tier first)", async () => {
    const svc = makeRouting({
      MALV_LIGHTWEIGHT_INFERENCE_ENABLED: "true",
      MALV_LIGHTWEIGHT_ROUTING_ENABLED: "true"
    });
    const d = svc.decideForChat(chatBase);
    expect(d.telemetry.malvLightweightTierRequested).toBe(true);
    expect(d.telemetry.malvPreferredTier).toBe("cpu");
    expect(d.telemetry.malvTaskClass).toBe("chat_cpu_eligible_by_capability_profile");
    expect(d.workerContextPatch.malvInferenceBackend).toBe("lightweight_local");
    expect(d.chatTierFailover?.plan.steps[0]).toEqual({ tier: "cpu", applyCpuSidecarPatch: true });
    expect(d.chatTierFailover?.plan.steps[1]).toEqual({ tier: "gpu", applyCpuSidecarPatch: false });
  });

  it("prefers GPU tier for execute mode when CPU capability profile cannot satisfy demand", async () => {
    const svc = makeRouting({
      MALV_LIGHTWEIGHT_INFERENCE_ENABLED: "true",
      MALV_LIGHTWEIGHT_ROUTING_ENABLED: "true"
    });
    const d = svc.decideForChat({
      ...chatBase,
      userMessage: "run deploy",
      modeType: "execute",
      classifiedWorkerMode: "beast"
    });
    expect(d.telemetry.malvLightweightTierRequested).toBe(false);
    expect(d.telemetry.malvPreferredTier).toBe("gpu");
    expect(d.telemetry.malvTaskClass).toBe("chat_cpu_tier_capability_mismatch");
    expect(d.workerContextPatch.malvInferenceBackend).toBeUndefined();
    expect(d.chatTierFailover?.plan.steps).toEqual([{ tier: "gpu", applyCpuSidecarPatch: false }]);
  });

  it("applies model override when set", async () => {
    const svc = makeRouting({
      MALV_LIGHTWEIGHT_INFERENCE_ENABLED: "true",
      MALV_LIGHTWEIGHT_ROUTING_ENABLED: "true",
      MALV_LIGHTWEIGHT_INFERENCE_MODEL_OVERRIDE: "tiny-model"
    });
    const d = svc.decideForImageExpansion({
      surface: "image",
      rawPromptLength: 40,
      hasSourceImage: false
    });
    expect(d.workerContextPatch.malvInferenceModel).toBe("tiny-model");
    expect(d.telemetry.malvTaskClass).toBe("image_cpu_eligible_by_capability_profile");
  });
});
