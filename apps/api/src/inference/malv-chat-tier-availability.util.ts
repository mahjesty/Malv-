import type { MalvTierFailoverStep } from "./inference-tier-failover-plan.util";
import type { MalvInferenceModelTier } from "./inference-provider.types";
import { malvEnvFirst, MALV_LOCAL_CPU_INFERENCE_ENV } from "./malv-inference-env.util";

/** When unset or empty, GPU tier attempts are allowed (production default). Set `false` when GPU/OpenAI chain is intentionally offline (CPU-only dev). */
export function malvGpuTierEnabledFromEnv(get: (key: string) => string | undefined): boolean {
  const v = get("MALV_GPU_TIER_ENABLED");
  if (v == null || v === "") return true;
  return !["0", "false", "no", "off"].includes(v.trim().toLowerCase());
}

/**
 * When true, chat gating calls beast-worker health and treats the GPU/primary chain as unavailable
 * if the worker reports inference not ready. Default false to avoid extra latency unless operators opt in.
 */
export function malvGpuTierProbeWorkerHealthFromEnv(get: (key: string) => string | undefined): boolean {
  const raw = (get("MALV_GPU_TIER_PROBE_WORKER_HEALTH") ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * When true, normal chat must not use the API-side local CPU llama-server path
 * (`MALV_LOCAL_CPU_INFERENCE_*` / legacy `MALV_LOCAL_INFERENCE_*`), even if enabled.
 * Beast-worker primary chain and optional local health probes are unchanged.
 */
export function malvLocalInferenceChatPathBlockedFromEnv(get: (key: string) => string | undefined): boolean {
  const v = (malvEnvFirst(get, MALV_LOCAL_CPU_INFERENCE_ENV.DISABLE_CHAT_PATH) ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Drops worker tier steps that are currently unreachable so we do not hit a dead GPU path first.
 * CPU steps require the lightweight sidecar to be policy-eligible for this turn (`cpuWorkerTierReachable`).
 */
export function filterMalvChatTierFailoverSteps(
  steps: MalvTierFailoverStep[],
  avail: { gpuTierReachable: boolean; cpuWorkerTierReachable: boolean }
): MalvTierFailoverStep[] {
  return steps.filter((s) => {
    if (s.tier === "gpu") return avail.gpuTierReachable;
    if (s.tier === "cpu") return avail.cpuWorkerTierReachable;
    return false;
  });
}

/**
 * When true, the API may skip its direct llama-server call and send the turn to beast-worker first because
 * routing policy prefers GPU **and** GPU reachability was evidence-based (worker health probe enabled and passed).
 *
 * If `MALV_GPU_TIER_PROBE_WORKER_HEALTH` is off, GPU reachability is optimistic for tier filtering only — we must
 * not treat it as proof that skipping API local inference is safe.
 */
export function malvShouldDeferApiLocalInferenceToVerifiedGpuWorkerFirst(args: {
  respectLocalInferenceRoutingTier: boolean;
  preferredTier: MalvInferenceModelTier;
  gpuTierReachable: boolean;
  gpuTierWorkerHealthProbeEnabled: boolean;
}): boolean {
  return (
    args.respectLocalInferenceRoutingTier &&
    args.preferredTier === "gpu" &&
    args.gpuTierReachable &&
    args.gpuTierWorkerHealthProbeEnabled
  );
}
