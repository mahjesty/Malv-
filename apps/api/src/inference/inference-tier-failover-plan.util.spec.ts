import { buildMalvChatTierFailoverPlan, materializeWorkerContextForTierStep } from "./inference-tier-failover-plan.util";

describe("buildMalvChatTierFailoverPlan", () => {
  it("prefers CPU first for low-scope tasks when the sidecar is configured", () => {
    const plan = buildMalvChatTierFailoverPlan({
      preferredTier: "cpu",
      cpuSidecarConfigured: true,
      cpuSidecarEligibleForTask: true
    });
    expect(plan.preferredTier).toBe("cpu");
    expect(plan.steps).toEqual([
      { tier: "cpu", applyCpuSidecarPatch: true },
      { tier: "gpu", applyCpuSidecarPatch: false }
    ]);
  });

  it("falls back to GPU-only when CPU sidecar is unavailable but the task is still low-scope", () => {
    const plan = buildMalvChatTierFailoverPlan({
      preferredTier: "cpu",
      cpuSidecarConfigured: false,
      cpuSidecarEligibleForTask: true
    });
    expect(plan.steps).toEqual([{ tier: "gpu", applyCpuSidecarPatch: false }]);
  });

  it("prefers GPU first for heavy tasks and can escalate to CPU when eligible", () => {
    const plan = buildMalvChatTierFailoverPlan({
      preferredTier: "gpu",
      cpuSidecarConfigured: true,
      cpuSidecarEligibleForTask: true
    });
    expect(plan.preferredTier).toBe("gpu");
    expect(plan.steps).toEqual([
      { tier: "gpu", applyCpuSidecarPatch: false },
      { tier: "cpu", applyCpuSidecarPatch: true }
    ]);
  });

  it("uses GPU-only for heavy tasks when CPU sidecar cannot run that task shape", () => {
    const plan = buildMalvChatTierFailoverPlan({
      preferredTier: "gpu",
      cpuSidecarConfigured: true,
      cpuSidecarEligibleForTask: false
    });
    expect(plan.steps).toEqual([{ tier: "gpu", applyCpuSidecarPatch: false }]);
  });
});

describe("materializeWorkerContextForTierStep", () => {
  it("strips CPU patch keys for GPU steps", () => {
    const ctx = materializeWorkerContextForTierStep({
      neutralContext: { a: 1, malvInferenceBackend: "lightweight_local" },
      cpuSidecarPatch: { malvInferenceBackend: "lightweight_local", malvInferenceModel: "x" },
      step: { tier: "gpu", applyCpuSidecarPatch: false }
    });
    expect(ctx.malvInferenceBackend).toBeUndefined();
    expect(ctx.malvInferenceModel).toBeUndefined();
    expect(ctx.a).toBe(1);
  });
});
