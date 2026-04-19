import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  MalvInferenceLatencyTier,
  MalvInferenceModelTier,
  MalvInferenceProviderId,
  MalvInferenceRoutingTelemetry,
  MalvInferenceSurface
} from "./inference-provider.types";
import type { ChatRoutingInput } from "./inference-chat-routing.input";
export type { ChatRoutingInput } from "./inference-chat-routing.input";
import { buildMalvChatTierFailoverPlan, type MalvChatTierFailoverPlan } from "./inference-tier-failover-plan.util";
import { MalvInferenceTierCapabilityService } from "./malv-inference-tier-capability.service";
import type { MalvTaskCapabilityDemand } from "./malv-inference-tier-capability.types";
import {
  chatCpuEligibilityFromDemand,
  inferChatTurnCapabilityDemand,
  mergeCapabilityDemands,
  tierSatisfiesDemand
} from "./malv-inference-task-demand.util";

function truthy(raw: string | undefined, defaultVal: boolean): boolean {
  if (raw == null || raw === "") return defaultVal;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export type ImageRoutingInput = {
  surface: Extract<MalvInferenceSurface, "image">;
  rawPromptLength: number;
  hasSourceImage: boolean;
};

export type CallRecapRoutingInput = {
  surface: Extract<MalvInferenceSurface, "call_recap">;
  transcriptJsonChars: number;
};

export type CallVoiceRoutingInput = {
  surface: Extract<MalvInferenceSurface, "call_voice">;
  utteranceLength: number;
  intent: "ask" | "explain" | "summarize";
};

export type ProductivityDraftRoutingInput = {
  surface: Extract<MalvInferenceSurface, "task" | "inbox">;
  kind: "task_commentary" | "inbox_triage";
  textLength: number;
};

export type InferenceRouteDecision = {
  workerContextPatch: Record<string, unknown>;
  telemetry: MalvInferenceRoutingTelemetry;
  /** Present for chat: ordered CPU/GPU attempts + CPU sidecar patch for beast-worker. */
  chatTierFailover?: {
    plan: MalvChatTierFailoverPlan;
    cpuSidecarPatch: Record<string, unknown>;
  };
};

type ChatShapeClassification = {
  taskClass: string;
  taskShapeFitsCpuSidecar: boolean;
  routingReason: string;
  latencyTier: MalvInferenceLatencyTier;
};

/**
 * Task classification and CPU/GPU routing using deployment capability profiles — not fixed model identities.
 * CPU (`lightweight_local`) is selected only when configured tier metadata satisfies the merged task + agent-plan demand.
 */
@Injectable()
export class InferenceRoutingService {
  constructor(
    private readonly cfg: ConfigService,
    private readonly tierCapabilities: MalvInferenceTierCapabilityService
  ) {}

  private lightweightEnabled(): boolean {
    return truthy(this.cfg.get<string>("MALV_LIGHTWEIGHT_INFERENCE_ENABLED"), false);
  }

  private routingEnabled(): boolean {
    return truthy(this.cfg.get<string>("MALV_LIGHTWEIGHT_ROUTING_ENABLED"), true);
  }

  private surfaceAllowed(surface: MalvInferenceSurface): boolean {
    const key = `MALV_LIGHTWEIGHT_SURFACE_${surface.toUpperCase()}_ENABLED`;
    const v = this.cfg.get<string>(key);
    if (v == null || v === "") return true;
    return truthy(v, true);
  }

  private classifyChatTaskShape(input: ChatRoutingInput): ChatShapeClassification {
    if (input.superFix) {
      return {
        taskClass: "chat_super_fix",
        taskShapeFitsCpuSidecar: false,
        routingReason: "blocked_super_fix",
        latencyTier: "standard"
      };
    }
    if (input.vaultScoped) {
      return {
        taskClass: "chat_vault_session",
        taskShapeFitsCpuSidecar: false,
        routingReason: "blocked_vault_session",
        latencyTier: "standard"
      };
    }

    const cpu = this.tierCapabilities.getCpuTierSnapshot();
    let demand: MalvTaskCapabilityDemand = inferChatTurnCapabilityDemand(input);
    if (input.mergedTurnCapabilityDemand) {
      demand = mergeCapabilityDemands(demand, input.mergedTurnCapabilityDemand);
    }
    if (input.mergedUniversalCapabilityDemand) {
      demand = mergeCapabilityDemands(demand, input.mergedUniversalCapabilityDemand);
    }

    const cpuWouldFitCapability = tierSatisfiesDemand(cpu, demand);
    const cpuSidecarConfigured =
      this.lightweightEnabled() && this.routingEnabled() && this.surfaceAllowed("chat");

    if (cpuWouldFitCapability && !this.lightweightEnabled()) {
      return {
        taskClass: "chat_low_scope_lightweight_unavailable",
        taskShapeFitsCpuSidecar: true,
        routingReason: "lightweight_disabled_by_config",
        latencyTier: "interactive"
      };
    }
    if (cpuWouldFitCapability && !this.routingEnabled()) {
      return {
        taskClass: "chat_low_scope_routing_disabled",
        taskShapeFitsCpuSidecar: true,
        routingReason: "routing_disabled",
        latencyTier: "interactive"
      };
    }
    if (cpuWouldFitCapability && !this.surfaceAllowed("chat")) {
      return {
        taskClass: "chat_low_scope_surface_disabled",
        taskShapeFitsCpuSidecar: true,
        routingReason: "surface_chat_disabled",
        latencyTier: "interactive"
      };
    }

    const { cpuEligible, blockReason } = chatCpuEligibilityFromDemand({
      demand,
      cpu,
      cpuSidecarConfigured
    });

    if (!cpuEligible) {
      const taskClass =
        blockReason === "cpu_tier_disabled_or_unconfigured" ? "chat_cpu_tier_unavailable" : "chat_cpu_tier_capability_mismatch";
      return {
        taskClass,
        taskShapeFitsCpuSidecar: false,
        routingReason: blockReason ?? "primary_chain_default",
        latencyTier: "standard"
      };
    }

    return {
      taskClass: "chat_cpu_eligible_by_capability_profile",
      taskShapeFitsCpuSidecar: true,
      routingReason: "eligible_cpu_tier_matches_task_demand",
      latencyTier: "interactive"
    };
  }

  private baseTelemetry(args: {
    surface: MalvInferenceSurface;
    taskClass: string;
    preferredTier: MalvInferenceModelTier;
    providerSelected: MalvInferenceProviderId;
    reason: string;
    latencyTier: MalvInferenceLatencyTier;
    lightweightRequested: boolean;
    selectedAgent: "light" | "beast" | "unknown";
  }): MalvInferenceRoutingTelemetry {
    return {
      malvTaskClass: args.taskClass,
      malvPreferredTier: args.preferredTier,
      malvSelectedTier: "unknown",
      malvSelectedBackend: null,
      malvSelectedAgent: args.selectedAgent,
      malvFallbackUsed: false,
      malvFallbackReason: null,
      malvRoutingProviderSelected: args.providerSelected,
      malvRoutingReason: args.reason,
      malvRoutingSurface: args.surface,
      malvRoutingLatencyTier: args.latencyTier,
      malvLightweightTierRequested: args.lightweightRequested
    };
  }

  private cpuSidecarPatchForChat(): Record<string, unknown> {
    const patch: Record<string, unknown> = { malvInferenceBackend: "lightweight_local" };
    const modelOverride = (this.cfg.get<string>("MALV_LIGHTWEIGHT_INFERENCE_MODEL_OVERRIDE") ?? "").trim();
    if (modelOverride) {
      patch.malvInferenceModel = modelOverride;
    }
    return patch;
  }

  decideForChat(input: ChatRoutingInput): InferenceRouteDecision {
    const shape = this.classifyChatTaskShape(input);
    const cpuSidecarConfigured =
      this.lightweightEnabled() && this.routingEnabled() && this.surfaceAllowed("chat");
    const allowLightweight = shape.taskShapeFitsCpuSidecar && cpuSidecarConfigured;

    const policyPreferredTier: MalvInferenceModelTier = shape.taskShapeFitsCpuSidecar ? "cpu" : "gpu";
    const plan = buildMalvChatTierFailoverPlan({
      preferredTier: policyPreferredTier,
      cpuSidecarConfigured,
      cpuSidecarEligibleForTask: shape.taskShapeFitsCpuSidecar
    });

    const useLw = allowLightweight;
    const providerSelected: MalvInferenceProviderId = useLw ? "lightweight_local" : "primary_chain";

    const first = plan.steps[0]!;
    const workerContextPatch: Record<string, unknown> = {};
    const cpuSidecarPatch = this.cpuSidecarPatchForChat();
    if (first.applyCpuSidecarPatch) {
      Object.assign(workerContextPatch, cpuSidecarPatch);
    }

    const telemetry = this.baseTelemetry({
      surface: "chat",
      taskClass: shape.taskClass,
      preferredTier: policyPreferredTier,
      providerSelected,
      reason: shape.routingReason,
      latencyTier: shape.latencyTier,
      lightweightRequested: useLw,
      selectedAgent: input.classifiedWorkerMode
    });

    return {
      workerContextPatch,
      telemetry,
      chatTierFailover: { plan, cpuSidecarPatch }
    };
  }

  private sidecarEligibleForDemand(surface: MalvInferenceSurface, demand: MalvTaskCapabilityDemand): boolean {
    const cpu = this.tierCapabilities.getCpuTierSnapshot();
    return (
      this.lightweightEnabled() &&
      this.routingEnabled() &&
      this.surfaceAllowed(surface) &&
      tierSatisfiesDemand(cpu, demand)
    );
  }

  decideForImageExpansion(input: ImageRoutingInput): InferenceRouteDecision {
    const demand: MalvTaskCapabilityDemand = {
      minimumCapabilityClass: "standard",
      reasoningDepthRequired: "interactive",
      requiresMultimodal: input.hasSourceImage,
      requiresStructuredOutput: false,
      promptChars: input.rawPromptLength,
      contextChars: 0,
      minimumResponsiveness: "interactive",
      concurrentInferSlotsRequired: 1
    };
    const useLw = this.sidecarEligibleForDemand("image", demand);

    let reason = "primary_chain_default";
    let taskClass = "image_gpu_preferred";
    if (!this.lightweightEnabled()) {
      reason = "lightweight_disabled_by_config";
      taskClass = "image_lightweight_unavailable";
    } else if (!this.surfaceAllowed("image")) {
      reason = "surface_image_disabled";
      taskClass = "image_surface_disabled";
    } else if (!tierSatisfiesDemand(this.tierCapabilities.getCpuTierSnapshot(), demand)) {
      reason = "blocked_cpu_tier_capability_mismatch";
      taskClass = "image_cpu_capability_mismatch";
    } else {
      reason = "eligible_image_prompt_expansion";
      taskClass = "image_cpu_eligible_by_capability_profile";
    }

    const patch: Record<string, unknown> = {};
    if (useLw) {
      patch.malvInferenceBackend = "lightweight_local";
    }
    const modelOverride = (this.cfg.get<string>("MALV_LIGHTWEIGHT_INFERENCE_MODEL_OVERRIDE") ?? "").trim();
    if (useLw && modelOverride) {
      patch.malvInferenceModel = modelOverride;
    }

    const preferred: MalvInferenceModelTier = useLw ? "cpu" : "gpu";

    return {
      workerContextPatch: patch,
      telemetry: this.baseTelemetry({
        surface: "image",
        taskClass,
        preferredTier: preferred,
        providerSelected: useLw ? "lightweight_local" : "primary_chain",
        reason,
        latencyTier: "interactive",
        lightweightRequested: useLw,
        selectedAgent: "unknown"
      })
    };
  }

  decideForCallRecap(input: CallRecapRoutingInput): InferenceRouteDecision {
    const demand: MalvTaskCapabilityDemand = {
      minimumCapabilityClass: "standard",
      reasoningDepthRequired: "standard",
      requiresMultimodal: false,
      requiresStructuredOutput: false,
      promptChars: 0,
      contextChars: input.transcriptJsonChars,
      minimumResponsiveness: "interactive",
      concurrentInferSlotsRequired: 1
    };
    const useLw = this.sidecarEligibleForDemand("call_recap", demand);

    let reason = "primary_chain_default";
    let taskClass = "call_recap_gpu_preferred";
    if (!this.lightweightEnabled()) {
      reason = "lightweight_disabled_by_config";
      taskClass = "call_recap_lightweight_unavailable";
    } else if (!this.surfaceAllowed("call_recap")) {
      reason = "surface_call_recap_disabled";
      taskClass = "call_recap_surface_disabled";
    } else if (!tierSatisfiesDemand(this.tierCapabilities.getCpuTierSnapshot(), demand)) {
      reason = "blocked_long_transcript_recap";
      taskClass = "call_recap_transcript_exceeds_cpu_tier_context";
    } else {
      reason = "eligible_short_call_recap";
      taskClass = "call_recap_cpu_eligible_by_capability_profile";
    }

    const patch: Record<string, unknown> = {};
    if (useLw) {
      patch.malvInferenceBackend = "lightweight_local";
    }
    const modelOverride = (this.cfg.get<string>("MALV_LIGHTWEIGHT_INFERENCE_MODEL_OVERRIDE") ?? "").trim();
    if (useLw && modelOverride) {
      patch.malvInferenceModel = modelOverride;
    }

    return {
      workerContextPatch: patch,
      telemetry: this.baseTelemetry({
        surface: "call_recap",
        taskClass,
        preferredTier: useLw ? "cpu" : "gpu",
        providerSelected: useLw ? "lightweight_local" : "primary_chain",
        reason,
        latencyTier: useLw ? "standard" : "heavy",
        lightweightRequested: useLw,
        selectedAgent: "beast"
      })
    };
  }

  decideForCallVoiceContinuity(input: CallVoiceRoutingInput): InferenceRouteDecision {
    const demand: MalvTaskCapabilityDemand = {
      minimumCapabilityClass: "edge",
      reasoningDepthRequired: "interactive",
      requiresMultimodal: false,
      requiresStructuredOutput: false,
      promptChars: input.utteranceLength,
      contextChars: 0,
      minimumResponsiveness: "strict_interactive",
      concurrentInferSlotsRequired: 1
    };
    const useLw = this.sidecarEligibleForDemand("call_voice", demand);

    let reason = "primary_chain_default";
    let taskClass = "call_voice_gpu_preferred";
    if (!this.lightweightEnabled()) {
      reason = "lightweight_disabled_by_config";
      taskClass = "call_voice_lightweight_unavailable";
    } else if (!this.surfaceAllowed("call_voice")) {
      reason = "surface_call_voice_disabled";
      taskClass = "call_voice_surface_disabled";
    } else if (!tierSatisfiesDemand(this.tierCapabilities.getCpuTierSnapshot(), demand)) {
      reason = "blocked_voice_utterance_or_latency_profile";
      taskClass = "call_voice_cpu_capability_mismatch";
    } else {
      reason = "eligible_voice_continuity";
      taskClass = "call_voice_cpu_eligible_by_capability_profile";
    }

    const patch: Record<string, unknown> = {};
    if (useLw) {
      patch.malvInferenceBackend = "lightweight_local";
    }
    const modelOverride = (this.cfg.get<string>("MALV_LIGHTWEIGHT_INFERENCE_MODEL_OVERRIDE") ?? "").trim();
    if (useLw && modelOverride) {
      patch.malvInferenceModel = modelOverride;
    }

    return {
      workerContextPatch: patch,
      telemetry: this.baseTelemetry({
        surface: "call_voice",
        taskClass,
        preferredTier: useLw ? "cpu" : "gpu",
        providerSelected: useLw ? "lightweight_local" : "primary_chain",
        reason,
        latencyTier: "interactive",
        lightweightRequested: useLw,
        selectedAgent: "unknown"
      })
    };
  }

  decideForProductivityDraft(input: ProductivityDraftRoutingInput): InferenceRouteDecision {
    const demand: MalvTaskCapabilityDemand = {
      minimumCapabilityClass: "standard",
      reasoningDepthRequired: "standard",
      requiresMultimodal: false,
      requiresStructuredOutput: false,
      promptChars: input.textLength,
      contextChars: 0,
      minimumResponsiveness: "interactive",
      concurrentInferSlotsRequired: 1
    };
    const useLw = this.sidecarEligibleForDemand(input.surface, demand);

    let reason = "primary_chain_default";
    let taskClass = `${input.kind}_gpu_preferred`;
    if (!this.lightweightEnabled()) {
      reason = "lightweight_disabled_by_config";
      taskClass = `${input.kind}_lightweight_unavailable`;
    } else if (!this.surfaceAllowed(input.surface)) {
      reason = `surface_${input.surface}_disabled`;
      taskClass = `${input.kind}_surface_disabled`;
    } else if (!tierSatisfiesDemand(this.tierCapabilities.getCpuTierSnapshot(), demand)) {
      reason = "blocked_text_length";
      taskClass = `${input.kind}_text_exceeds_cpu_tier_prompt`;
    } else {
      reason = `eligible_${input.kind}`;
      taskClass = `${input.kind}_cpu_eligible_by_capability_profile`;
    }

    const patch: Record<string, unknown> = {};
    if (useLw) {
      patch.malvInferenceBackend = "lightweight_local";
    }
    const modelOverride = (this.cfg.get<string>("MALV_LIGHTWEIGHT_INFERENCE_MODEL_OVERRIDE") ?? "").trim();
    if (useLw && modelOverride) {
      patch.malvInferenceModel = modelOverride;
    }

    return {
      workerContextPatch: patch,
      telemetry: this.baseTelemetry({
        surface: input.surface,
        taskClass,
        preferredTier: useLw ? "cpu" : "gpu",
        providerSelected: useLw ? "lightweight_local" : "primary_chain",
        reason,
        latencyTier: "interactive",
        lightweightRequested: useLw,
        selectedAgent: "unknown"
      })
    };
  }
}
