import { tierSatisfiesDemand } from "./malv-inference-task-demand.util";
import type { MalvTaskCapabilityDemand, MalvTierRuntimeCapabilitySnapshot } from "./malv-inference-tier-capability.types";

describe("malv-inference-task-demand.util", () => {
  const strongCpu: MalvTierRuntimeCapabilitySnapshot = {
    tier: "cpu",
    capabilityClass: "frontier",
    maxPromptChars: 128_000,
    maxContextChars: 256_000,
    reasoningDepthMax: "frontier",
    latencyProfile: "interactive",
    structuredOutputReliability: "high",
    multimodalSupported: true,
    maxConcurrentInfer: 0
  };

  it("allows CPU tier for deep code-style demand when deployment declares sufficient depth", () => {
    const demand: MalvTaskCapabilityDemand = {
      minimumCapabilityClass: "standard",
      reasoningDepthRequired: "deep",
      requiresMultimodal: false,
      requiresStructuredOutput: false,
      promptChars: 2000,
      contextChars: 8000,
      minimumResponsiveness: "interactive",
      concurrentInferSlotsRequired: 1
    };
    expect(tierSatisfiesDemand(strongCpu, demand)).toBe(true);
  });

  it("rejects CPU tier when multimodal is required but not declared", () => {
    const weakMm: MalvTierRuntimeCapabilitySnapshot = { ...strongCpu, multimodalSupported: false };
    const demand: MalvTaskCapabilityDemand = {
      minimumCapabilityClass: "standard",
      reasoningDepthRequired: "standard",
      requiresMultimodal: true,
      requiresStructuredOutput: false,
      promptChars: 100,
      contextChars: 0,
      minimumResponsiveness: "interactive",
      concurrentInferSlotsRequired: 1
    };
    expect(tierSatisfiesDemand(weakMm, demand)).toBe(false);
  });
});
