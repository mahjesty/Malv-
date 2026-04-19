import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  MALV_INFERENCE_CAPABILITY_CLASS_ORDER,
  MALV_LATENCY_PROFILE_ORDER,
  MALV_REASONING_DEPTH_ORDER,
  MALV_STRUCTURED_OUTPUT_ORDER,
  type MalvInferenceCapabilityClass,
  type MalvLatencyProfileClass,
  type MalvReasoningDepthClass,
  type MalvStructuredOutputReliabilityClass,
  type MalvTierRuntimeCapabilitySnapshot
} from "./malv-inference-tier-capability.types";

function truthy(raw: string | undefined, defaultVal: boolean): boolean {
  if (raw == null || raw === "") return defaultVal;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function intEnv(get: (k: string) => string | undefined, key: string, fallback: number): number {
  const n = Number(get(key));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function nonNegativeInt(get: (k: string) => string | undefined, key: string, fallback: number): number {
  const n = Number(get(key));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function parseEnum<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  const v = (raw ?? "").trim().toLowerCase().replace(/-/g, "_") as T;
  return allowed.includes(v) ? v : fallback;
}

const CAP_CLASSES = Object.keys(MALV_INFERENCE_CAPABILITY_CLASS_ORDER) as MalvInferenceCapabilityClass[];
const REASON = Object.keys(MALV_REASONING_DEPTH_ORDER) as MalvReasoningDepthClass[];
const LATENCY = Object.keys(MALV_LATENCY_PROFILE_ORDER) as MalvLatencyProfileClass[];
const STRUCT = Object.keys(MALV_STRUCTURED_OUTPUT_ORDER) as MalvStructuredOutputReliabilityClass[];

/**
 * Reads CPU/GPU tier capability metadata from deployment env (with legacy fallbacks for existing vars).
 * Stronger live hardware is expressed by raising classes, context limits, and reasoning depth — not code edits.
 */
@Injectable()
export class MalvInferenceTierCapabilityService {
  constructor(private readonly cfg: ConfigService) {}

  getCpuTierSnapshot(): MalvTierRuntimeCapabilitySnapshot {
    const get = (k: string) => this.cfg.get<string>(k);
    return {
      tier: "cpu",
      capabilityClass: parseEnum(
        get("MALV_CPU_TIER_CAPABILITY_CLASS") ?? get("MALV_LIGHTWEIGHT_TIER_CAPABILITY_CLASS"),
        CAP_CLASSES,
        "standard"
      ),
      maxPromptChars: intEnv(get, "MALV_CPU_TIER_MAX_PROMPT_CHARS", intEnv(get, "MALV_LIGHTWEIGHT_MAX_PROMPT_CHARS", 6000)),
      maxContextChars: intEnv(get, "MALV_CPU_TIER_MAX_CONTEXT_CHARS", intEnv(get, "MALV_LIGHTWEIGHT_MAX_CONTEXT_CHARS", 24_000)),
      reasoningDepthMax: parseEnum(get("MALV_CPU_TIER_REASONING_DEPTH_MAX"), REASON, "deep"),
      latencyProfile: parseEnum(get("MALV_CPU_TIER_LATENCY_PROFILE"), LATENCY, "interactive"),
      structuredOutputReliability: parseEnum(get("MALV_CPU_TIER_STRUCTURED_OUTPUT_RELIABILITY"), STRUCT, "medium"),
      multimodalSupported: truthy(get("MALV_CPU_TIER_MULTIMODAL_SUPPORTED"), false),
      maxConcurrentInfer: nonNegativeInt(get, "MALV_CPU_TIER_MAX_CONCURRENT_INFER", 0)
    };
  }

  getGpuTierSnapshot(): MalvTierRuntimeCapabilitySnapshot {
    const get = (k: string) => this.cfg.get<string>(k);
    return {
      tier: "gpu",
      capabilityClass: parseEnum(get("MALV_GPU_TIER_CAPABILITY_CLASS"), CAP_CLASSES, "frontier"),
      maxPromptChars: intEnv(get, "MALV_GPU_TIER_MAX_PROMPT_CHARS", 200_000),
      maxContextChars: intEnv(get, "MALV_GPU_TIER_MAX_CONTEXT_CHARS", 500_000),
      reasoningDepthMax: parseEnum(get("MALV_GPU_TIER_REASONING_DEPTH_MAX"), REASON, "frontier"),
      latencyProfile: parseEnum(get("MALV_GPU_TIER_LATENCY_PROFILE"), LATENCY, "balanced"),
      structuredOutputReliability: parseEnum(get("MALV_GPU_TIER_STRUCTURED_OUTPUT_RELIABILITY"), STRUCT, "high"),
      multimodalSupported: truthy(get("MALV_GPU_TIER_MULTIMODAL_SUPPORTED"), true),
      maxConcurrentInfer: nonNegativeInt(get, "MALV_GPU_TIER_MAX_CONCURRENT_INFER", 0)
    };
  }
}
