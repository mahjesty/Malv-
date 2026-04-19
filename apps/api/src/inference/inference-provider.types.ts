/**
 * Logical inference provider identifiers — must stay aligned with beast-worker backends
 * (e.g. malvInferenceBackend / MALV_INFERENCE_FAILOVER).
 */
export type MalvInferenceProviderId =
  | "primary_chain"
  | "lightweight_local"
  /** API-side local CPU llama.cpp / llama-server (OpenAI-compatible HTTP; MALV_LOCAL_CPU_INFERENCE_* / legacy MALV_LOCAL_INFERENCE_*). */
  | "local_openai_compatible"
  | "openai_compatible"
  | "ollama"
  | "llamacpp"
  | "transformers"
  | "fallback";

export type MalvInferenceLatencyTier = "interactive" | "standard" | "heavy";

export type MalvInferenceSurface = "chat" | "call_recap" | "call_voice" | "task" | "inbox" | "image" | "cci" | "other";

export type MalvInferenceCapabilityProfile = {
  providerId: MalvInferenceProviderId;
  /** Beast-worker backend name when overriding chain */
  workerBackend?: string;
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsStructuredJson: boolean;
  latencyTier: MalvInferenceLatencyTier;
  maxPromptCharsHint: number;
  maxContextCharsHint: number;
  intendedRoles: string[];
};

export type MalvInferenceModelTier = "cpu" | "gpu";

/**
 * Turn-level routing telemetry (API). `malvSelected*` fields are finalized after inference attempts;
 * routing seeds them with conservative defaults before orchestration.
 */
export type MalvInferenceRoutingTelemetry = {
  /** Deterministic task bucket (chat, image, recap, …). */
  malvTaskClass: string;
  /** Policy intent: which model tier should run first when available. */
  malvPreferredTier: MalvInferenceModelTier;
  /** Tier that produced the successful reply (or last attempt if none). */
  malvSelectedTier: MalvInferenceModelTier | "unknown";
  /** Beast-worker backend name when known (from worker meta or routing patch). */
  malvSelectedBackend: string | null;
  /** MALV worker/agent lane (`light` vs `beast` chat classifier). */
  malvSelectedAgent: "light" | "beast" | "unknown";
  /** True when a later tier attempt succeeded after an earlier tier failed or returned empty. */
  malvFallbackUsed: boolean;
  /** Why the router left the first tier (HTTP error summary, empty reply, etc.). */
  malvFallbackReason: string | null;
  malvRoutingProviderSelected: MalvInferenceProviderId | string;
  malvRoutingReason: string;
  malvRoutingSurface: MalvInferenceSurface;
  malvRoutingLatencyTier: MalvInferenceLatencyTier;
  malvLightweightTierRequested: boolean;
  /** Set on chat turns after availability gating (orchestrator). */
  malvGpuTierReachable?: boolean;
  malvCpuWorkerTierReachable?: boolean;
  /** Mirrors `MALV_GPU_TIER_PROBE_WORKER_HEALTH` for this turn — when false, GPU reachability is not proof for API local skip. */
  malvGpuTierHealthProbeEnabled?: boolean;
  /** Why the GPU/primary worker tier was skipped, when applicable. */
  malvGpuTierUnreachableReason?: string | null;
};
