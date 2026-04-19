import {
  filterMalvChatTierFailoverSteps,
  malvGpuTierEnabledFromEnv,
  malvGpuTierProbeWorkerHealthFromEnv,
  malvLocalInferenceChatPathBlockedFromEnv,
  malvShouldDeferApiLocalInferenceToVerifiedGpuWorkerFirst
} from "./malv-chat-tier-availability.util";

describe("malvGpuTierEnabledFromEnv", () => {
  it("defaults to GPU tier enabled when unset", () => {
    expect(malvGpuTierEnabledFromEnv(() => undefined)).toBe(true);
    expect(malvGpuTierEnabledFromEnv(() => "")).toBe(true);
  });

  it("disables GPU tier when explicitly false", () => {
    expect(malvGpuTierEnabledFromEnv(() => "false")).toBe(false);
    expect(malvGpuTierEnabledFromEnv(() => "0")).toBe(false);
  });
});

describe("malvGpuTierProbeWorkerHealthFromEnv", () => {
  it("defaults probe off", () => {
    expect(malvGpuTierProbeWorkerHealthFromEnv(() => undefined)).toBe(false);
  });

  it("enables probe when true", () => {
    expect(malvGpuTierProbeWorkerHealthFromEnv(() => "true")).toBe(true);
  });
});

describe("malvLocalInferenceChatPathBlockedFromEnv", () => {
  it("defaults to not blocking", () => {
    expect(malvLocalInferenceChatPathBlockedFromEnv(() => undefined)).toBe(false);
    expect(malvLocalInferenceChatPathBlockedFromEnv(() => "")).toBe(false);
  });

  it("blocks when legacy disable flag is true", () => {
    expect(
      malvLocalInferenceChatPathBlockedFromEnv((k) =>
        k === "MALV_LOCAL_INFERENCE_DISABLE_CHAT_PATH" ? "true" : undefined
      )
    ).toBe(true);
  });

  it("blocks when MALV_LOCAL_CPU_INFERENCE_DISABLE_CHAT_PATH is true", () => {
    expect(
      malvLocalInferenceChatPathBlockedFromEnv((k) =>
        k === "MALV_LOCAL_CPU_INFERENCE_DISABLE_CHAT_PATH" ? "1" : undefined
      )
    ).toBe(true);
  });

  it("prefers CPU-named disable flag over legacy", () => {
    expect(
      malvLocalInferenceChatPathBlockedFromEnv((k) => {
        if (k === "MALV_LOCAL_CPU_INFERENCE_DISABLE_CHAT_PATH") return "false";
        if (k === "MALV_LOCAL_INFERENCE_DISABLE_CHAT_PATH") return "true";
        return undefined;
      })
    ).toBe(false);
  });
});

describe("malvShouldDeferApiLocalInferenceToVerifiedGpuWorkerFirst", () => {
  it("does not defer when GPU health probe is disabled (unverified reachability)", () => {
    expect(
      malvShouldDeferApiLocalInferenceToVerifiedGpuWorkerFirst({
        respectLocalInferenceRoutingTier: true,
        preferredTier: "gpu",
        gpuTierReachable: true,
        gpuTierWorkerHealthProbeEnabled: false
      })
    ).toBe(false);
  });

  it("defers only when tier is respected, GPU preferred, reachable, and probe proved it", () => {
    expect(
      malvShouldDeferApiLocalInferenceToVerifiedGpuWorkerFirst({
        respectLocalInferenceRoutingTier: true,
        preferredTier: "gpu",
        gpuTierReachable: true,
        gpuTierWorkerHealthProbeEnabled: true
      })
    ).toBe(true);
  });

  it("does not defer when GPU tier is unreachable even if probe is on", () => {
    expect(
      malvShouldDeferApiLocalInferenceToVerifiedGpuWorkerFirst({
        respectLocalInferenceRoutingTier: true,
        preferredTier: "gpu",
        gpuTierReachable: false,
        gpuTierWorkerHealthProbeEnabled: true
      })
    ).toBe(false);
  });

  it("does not defer when policy prefers CPU", () => {
    expect(
      malvShouldDeferApiLocalInferenceToVerifiedGpuWorkerFirst({
        respectLocalInferenceRoutingTier: true,
        preferredTier: "cpu",
        gpuTierReachable: true,
        gpuTierWorkerHealthProbeEnabled: true
      })
    ).toBe(false);
  });

  it("does not defer when respecting tier is off", () => {
    expect(
      malvShouldDeferApiLocalInferenceToVerifiedGpuWorkerFirst({
        respectLocalInferenceRoutingTier: false,
        preferredTier: "gpu",
        gpuTierReachable: true,
        gpuTierWorkerHealthProbeEnabled: true
      })
    ).toBe(false);
  });
});

describe("filterMalvChatTierFailoverSteps", () => {
  const steps = [
    { tier: "gpu" as const, applyCpuSidecarPatch: false },
    { tier: "cpu" as const, applyCpuSidecarPatch: true }
  ];

  it("keeps only CPU when GPU is unreachable", () => {
    expect(filterMalvChatTierFailoverSteps(steps, { gpuTierReachable: false, cpuWorkerTierReachable: true })).toEqual([
      { tier: "cpu", applyCpuSidecarPatch: true }
    ]);
  });

  it("keeps only GPU when CPU worker tier is unreachable", () => {
    expect(filterMalvChatTierFailoverSteps(steps, { gpuTierReachable: true, cpuWorkerTierReachable: false })).toEqual([
      { tier: "gpu", applyCpuSidecarPatch: false }
    ]);
  });

  it("returns empty when neither tier is reachable", () => {
    expect(filterMalvChatTierFailoverSteps(steps, { gpuTierReachable: false, cpuWorkerTierReachable: false })).toEqual([]);
  });
});
