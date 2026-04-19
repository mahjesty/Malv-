import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MalvInferenceRoutingTelemetry } from "../../inference/inference-provider.types";
import type { MalvAgentRuntimeTierPreference, MalvTaskRouterDecision } from "../contracts/malv-agent.contracts";
import { InferenceRoutingService } from "../../inference/inference-routing.service";
import type { ChatRoutingInput } from "../../inference/inference-chat-routing.input";

export type MalvAgentTierAlignment = {
  /** Router-level tier intent (CPU/GPU/hybrid). */
  routerTier: MalvAgentRuntimeTierPreference;
  /** InferenceRoutingService outcome for the same chat turn (authoritative for worker patch). */
  inferencePreferredTier: "cpu" | "gpu";
  /** True when router wanted GPU-heavy work but inference selected CPU-first (truthful diagnostic). */
  degradedFromRouterIntent: boolean;
  /** Safe audit string — no model internals. */
  alignmentNote: string;
  /** Whether lightweight / CPU sidecar is configured (env snapshot). */
  cpuTierConfigured: boolean;
};

/**
 * Bridges agent router tier intent with {@link InferenceRoutingService} — does not bypass inference policy.
 */
@Injectable()
export class MalvAgentRuntimeTierBridgeService {
  constructor(
    private readonly cfg: ConfigService,
    private readonly inferenceRouting: InferenceRoutingService
  ) {}

  cpuTierConfiguredSnapshot(): boolean {
    const lw = (this.cfg.get<string>("MALV_LIGHTWEIGHT_INFERENCE_ENABLED") ?? "0").trim().toLowerCase();
    const rt = (this.cfg.get<string>("MALV_LIGHTWEIGHT_ROUTING_ENABLED") ?? "0").trim().toLowerCase();
    const on = (v: string) => v === "1" || v === "true" || v === "yes" || v === "on";
    return on(lw) && on(rt);
  }

  /**
   * Compare router decision vs chat routing — used for observability and hybrid flow hints.
   * Beast remains responsible for applying `workerContextPatch` from inference.
   */
  alignWithChatInference(router: MalvTaskRouterDecision, chatInput: ChatRoutingInput): MalvAgentTierAlignment {
    const inf = this.inferenceRouting.decideForChat(chatInput);
    const inferencePreferredTier = inf.telemetry.malvPreferredTier === "cpu" ? "cpu" : "gpu";
    const routerWantsGpu = router.resourceTier === "gpu" || router.resourceTier === "hybrid";
    const degradedFromRouterIntent = routerWantsGpu && inferencePreferredTier === "cpu";
    const cpuOk = this.cpuTierConfiguredSnapshot();
    const alignmentNote = degradedFromRouterIntent
      ? "router_gpu_intent_cpu_inference_path_task_shape_or_config"
      : router.resourceTier === "cpu" && inferencePreferredTier === "gpu"
        ? "router_cpu_intent_gpu_inference_path_heavy_task_shape"
        : "router_and_inference_aligned";

    return {
      routerTier: router.resourceTier,
      inferencePreferredTier,
      degradedFromRouterIntent,
      alignmentNote,
      cpuTierConfigured: cpuOk
    };
  }

  /**
   * Heuristic tier for non-chat surfaces (sync, config-aware).
   */
  resolveTierForNonChatSurface(surface: MalvTaskRouterDecision["surface"], routerTier: MalvAgentRuntimeTierPreference): MalvAgentRuntimeTierPreference {
    if (surface === "call" || surface === "voice") return "cpu";
    if (surface === "image" || surface === "research") return routerTier === "cpu" ? "hybrid" : routerTier;
    return routerTier;
  }

  /**
   * Uses already-computed chat routing telemetry (no second {@link InferenceRoutingService.decideForChat} call).
   */
  alignRouterWithInferenceTelemetry(
    router: MalvTaskRouterDecision,
    telemetry: Pick<MalvInferenceRoutingTelemetry, "malvPreferredTier">
  ): MalvAgentTierAlignment {
    const inferencePreferredTier = telemetry.malvPreferredTier;
    const routerWantsGpu = router.resourceTier === "gpu" || router.resourceTier === "hybrid";
    const degradedFromRouterIntent = routerWantsGpu && inferencePreferredTier === "cpu";
    const alignmentNote = degradedFromRouterIntent
      ? "router_gpu_intent_cpu_inference_path_task_shape_or_config"
      : router.resourceTier === "cpu" && inferencePreferredTier === "gpu"
        ? "router_cpu_intent_gpu_inference_path_heavy_task_shape"
        : "router_and_inference_aligned";

    return {
      routerTier: router.resourceTier,
      inferencePreferredTier,
      degradedFromRouterIntent,
      alignmentNote,
      cpuTierConfigured: this.cpuTierConfiguredSnapshot()
    };
  }
}
