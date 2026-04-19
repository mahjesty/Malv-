import type { BeastInferenceResponse } from "../beast/client/beast-worker.client";
import type { MalvTierFailoverStep } from "./inference-tier-failover-plan.util";
import { materializeWorkerContextForTierStep } from "./inference-tier-failover-plan.util";

export type MalvTieredInferFn = (args: {
  mode: "light" | "cpu" | "gpu" | "beast";
  prompt: string;
  maxTokens?: number;
  context: Record<string, unknown>;
  signal?: AbortSignal;
}) => Promise<BeastInferenceResponse>;

/** Same as {@link MalvTieredInferFn} plus streaming callback invoked for each worker delta. */
export type MalvTieredInferStreamFn = (args: {
  mode: "light" | "cpu" | "gpu" | "beast";
  prompt: string;
  maxTokens?: number;
  context: Record<string, unknown>;
  signal?: AbortSignal;
  onStreamDelta: (text: string) => void;
}) => Promise<BeastInferenceResponse>;

export type MalvTieredWorkerInferOutcome = {
  response: BeastInferenceResponse;
  selectedTier: MalvTierFailoverStep["tier"];
  selectedBackendLabel: string | null;
  tierFallbackUsed: boolean;
  tierFallbackReason: string | null;
  attemptIndex: number;
};

function backendFromMeta(meta: Record<string, unknown> | undefined): string | null {
  if (!meta) return null;
  const direct = meta["inferenceBackend"] ?? meta["malvLastBackend"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return null;
}

function isNonEmptyReply(res: BeastInferenceResponse): boolean {
  return Boolean((res.reply ?? "").trim());
}

/**
 * Sequentially tries beast-worker with CPU sidecar vs default primary chain ordering.
 * Empty replies and thrown errors both advance to the next tier when one exists.
 */
export async function executeMalvTieredWorkerInfer(args: {
  infer: MalvTieredInferFn;
  /** When set with `onStreamDelta`, tier attempts use worker SSE instead of blocking JSON /v1/infer. */
  inferStream?: MalvTieredInferStreamFn;
  onStreamDelta?: (text: string) => void;
  workerMode: "light" | "beast";
  neutralContext: Record<string, unknown>;
  cpuSidecarPatch: Record<string, unknown>;
  steps: MalvTierFailoverStep[];
  prompt: string;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<MalvTieredWorkerInferOutcome> {
  const inferMode = args.workerMode === "beast" ? "beast" : "light";
  const useStream = Boolean(args.inferStream && args.onStreamDelta);
  let lastFailureReason: string | null = null;
  let lastResponse: BeastInferenceResponse | null = null;

  for (let i = 0; i < args.steps.length; i++) {
    const step = args.steps[i]!;
    const ctx = materializeWorkerContextForTierStep({
      neutralContext: args.neutralContext,
      cpuSidecarPatch: args.cpuSidecarPatch,
      step
    });
    let emittedThisAttempt = false;
    try {
      const response = useStream
        ? await args.inferStream!({
            mode: inferMode,
            prompt: args.prompt,
            maxTokens: args.maxTokens,
            context: ctx,
            signal: args.signal,
            onStreamDelta: (t) => {
              emittedThisAttempt = true;
              args.onStreamDelta!(t);
            }
          })
        : await args.infer({
            mode: inferMode,
            prompt: args.prompt,
            maxTokens: args.maxTokens,
            context: ctx,
            signal: args.signal
          });
      lastResponse = response;
      if (isNonEmptyReply(response)) {
        const meta = response.meta as Record<string, unknown> | undefined;
        return {
          response,
          selectedTier: step.tier,
          selectedBackendLabel: backendFromMeta(meta),
          tierFallbackUsed: i > 0,
          tierFallbackReason: i > 0 ? lastFailureReason : null,
          attemptIndex: i
        };
      }
      if (useStream && emittedThisAttempt) {
        const meta = response.meta as Record<string, unknown> | undefined;
        return {
          response,
          selectedTier: step.tier,
          selectedBackendLabel: backendFromMeta(meta),
          tierFallbackUsed: i > 0,
          tierFallbackReason: i > 0 ? lastFailureReason : null,
          attemptIndex: i
        };
      }
      const m = response.meta as Record<string, unknown> | undefined;
      lastFailureReason =
        (m?.malvEmptyReason != null ? String(m.malvEmptyReason) : null) ??
        (m?.malvLastFinishReason != null ? String(m.malvLastFinishReason) : null) ??
        "empty_worker_reply";
    } catch (e) {
      if (emittedThisAttempt) {
        throw e;
      }
      lastFailureReason = e instanceof Error ? e.message : String(e);
    }
  }

  const fallbackResponse: BeastInferenceResponse =
    lastResponse ??
    ({
      reply: "",
      meta: { malvEmptyReason: lastFailureReason ?? "all_tier_attempts_failed" }
    } as BeastInferenceResponse);

  const lastStep = args.steps[args.steps.length - 1]!;
  return {
    response: fallbackResponse,
    selectedTier: lastStep.tier,
    selectedBackendLabel: backendFromMeta(fallbackResponse.meta as Record<string, unknown> | undefined),
    tierFallbackUsed: args.steps.length > 1,
    tierFallbackReason: lastFailureReason,
    attemptIndex: args.steps.length - 1
  };
}
