import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { ClassifiedIntent } from "../../beast/intent-understanding.types";
import type { ExecutionStrategyResult } from "../../beast/execution-strategy.service";
import { MALV_AGENT_KIND_INFERENCE_REQUIREMENTS } from "../../inference/malv-agent-kind-inference-requirements";
import { MalvInferenceTierCapabilityService } from "../../inference/malv-inference-tier-capability.service";
import type { MalvTaskCapabilityDemand } from "../../inference/malv-inference-tier-capability.types";
import {
  aggregatePlanInferenceDemand,
  mergeCapabilityDemands,
  tierSatisfiesDemand
} from "../../inference/malv-inference-task-demand.util";
import type {
  MalvAgentExecutionMode,
  MalvAgentKind,
  MalvAgentRuntimeTierPreference,
  MalvAgentTelemetry,
  MalvInputModality,
  MalvTaskRouterDecision,
  MalvWorkShape,
  MalvWorkSurface,
  MultiAgentExecutionPlan,
  MalvAgentPlanStep
} from "../contracts/malv-agent.contracts";
import { MalvAgentRouteReason } from "../foundation/malv-agent-route-reason.codes";
import { malvAgentDefaultConfidence } from "../foundation/malv-base-agent";
import { MalvAgentRegistryService } from "../registry/malv-agent-registry.service";

export type MalvTaskRouterInput = {
  traceId?: string;
  surface: MalvWorkSurface;
  userText: string;
  classified?: ClassifiedIntent | null;
  executionStrategy?: ExecutionStrategyResult | null;
  vaultScoped: boolean;
  /** Beast input meta: text | voice | video */
  inputMode?: string | null;
  modality?: MalvInputModality;
  memorySnippetCount?: number;
  hasCodeKeywords?: boolean;
  hasImageKeywords?: boolean;
  studioContext?: boolean;
  callActive?: boolean;
  deviceHookActive?: boolean;
  /** When known (e.g. Beast assembled context), refines tier vs CPU/GPU capability profiles. */
  contextCharsEstimate?: number;
};

@Injectable()
export class MalvTaskRouterService {
  constructor(
    private readonly registry: MalvAgentRegistryService,
    private readonly tierCapabilities: MalvInferenceTierCapabilityService
  ) {}

  route(input: MalvTaskRouterInput): MalvTaskRouterDecision {
    const decisionId = randomUUID();
    const traceId = input.traceId ?? decisionId;
    const reasonCodes: string[] = [];
    const text = input.userText ?? "";
    const lower = text.toLowerCase();

    const modality = input.modality ?? inferModality(input.inputMode, input.surface);
    if (modality !== "text") reasonCodes.push(MalvAgentRouteReason.MULTIMODAL_INPUT);

    const privacyMode = input.vaultScoped ? "vault_sensitive" : "standard";
    if (input.vaultScoped) reasonCodes.push(MalvAgentRouteReason.VAULT_SENSITIVE);

    const latencyMode: MalvTaskRouterDecision["latencyMode"] =
      input.surface === "call" || input.surface === "voice" || input.inputMode === "voice" || input.inputMode === "video" || input.callActive
        ? "low_latency"
        : "normal";
    if (latencyMode === "low_latency") reasonCodes.push(MalvAgentRouteReason.LOW_LATENCY);

    reasonCodes.push(surfaceReason(input.surface));

    const complexityScore = scoreComplexity(input.classified, text, input.executionStrategy);
    if (complexityScore >= 0.65) reasonCodes.push(MalvAgentRouteReason.HIGH_COMPLEXITY);

    const executionRisk = riskFrom(input.classified, input.executionStrategy, lower);
    if (executionRisk === "high") reasonCodes.push(MalvAgentRouteReason.HIGH_RISK);

    const workShape = inferWorkShape(input.surface, lower, input);
    let resourceTier = pickTier(workShape, complexityScore, latencyMode, privacyMode, modality);
    if (resourceTier === "cpu") reasonCodes.push(MalvAgentRouteReason.TIER_CPU_PREFERRED);
    if (resourceTier === "gpu") reasonCodes.push(MalvAgentRouteReason.TIER_GPU_PREFERRED);
    if (resourceTier === "hybrid") reasonCodes.push(MalvAgentRouteReason.TIER_HYBRID);

    const executionMode = pickExecutionMode(workShape, executionRisk, input.executionStrategy);
    const multiAgent = shouldMultiAgent(workShape, complexityScore, input.executionStrategy);
    if (multiAgent) reasonCodes.push(MalvAgentRouteReason.MULTI_AGENT);
    else reasonCodes.push(MalvAgentRouteReason.SINGLE_AGENT);

    const pathHints = buildPathHints(workShape, input.executionStrategy, multiAgent);
    const decompositionHints = buildDecompositionHints(input.classified, input.executionStrategy);

    const planExtras: MalvTaskCapabilityDemand = {
      minimumCapabilityClass: "edge",
      reasoningDepthRequired: "interactive",
      requiresMultimodal: modality === "multimodal" || modality === "image",
      requiresStructuredOutput: false,
      promptChars: text.length,
      contextChars: input.contextCharsEstimate ?? 0,
      minimumResponsiveness: latencyMode === "low_latency" ? "strict_interactive" : "interactive",
      concurrentInferSlotsRequired: multiAgent ? 2 : 1
    };

    let plan = buildPlan({
      workShape,
      multiAgent,
      resourceTier,
      executionMode,
      complexityScore,
      memorySnippetCount: input.memorySnippetCount ?? 0,
      vaultScoped: input.vaultScoped,
      latencyMode,
      clarification: input.executionStrategy?.mode === "require_clarification",
      userText: text
    });

    const refinedTier = refineResourceTierForCapabilityPlan(this.tierCapabilities, resourceTier, plan, planExtras);
    if (refinedTier !== resourceTier) {
      resourceTier = refinedTier;
      plan = buildPlan({
        workShape,
        multiAgent,
        resourceTier,
        executionMode,
        complexityScore,
        memorySnippetCount: input.memorySnippetCount ?? 0,
        vaultScoped: input.vaultScoped,
        latencyMode,
        clarification: input.executionStrategy?.mode === "require_clarification",
        userText: text
      });
      reasonCodes.push(MalvAgentRouteReason.TIER_REFINED_FOR_CAPABILITY);
    }

    const telemetry: MalvAgentTelemetry = {
      traceId,
      spans: [],
      routeReasonCodes: [...reasonCodes],
      degradation: "none"
    };

    const matched = this.registry.matchByTags(tagsForShape(workShape));

    return {
      decisionId,
      surface: input.surface,
      workShape,
      multiAgent,
      resourceTier,
      executionMode,
      complexityScore,
      modality,
      urgency: urgencyFrom(lower, workShape),
      latencyMode,
      privacyMode,
      executionRisk,
      reasonCodes,
      decompositionHints,
      malvExecutionPathHints: pathHints,
      plan,
      routerConfidence: malvAgentDefaultConfidence(
        multiAgent ? 0.74 : 0.82,
        "deterministic_rules_with_registry_match"
      ),
      telemetry: {
        ...telemetry,
        routeReasonCodes: [...telemetry.routeReasonCodes, `registry_tag_hits:${matched.slice(0, 5).join(",")}`]
      }
    };
  }
}

function inferModality(inputMode: string | null | undefined, surface: MalvWorkSurface): MalvInputModality {
  if (inputMode === "voice") return "voice";
  if (inputMode === "video") return "video";
  if (surface === "image") return "image";
  return "text";
}

function surfaceReason(surface: MalvWorkSurface): string {
  switch (surface) {
    case "chat":
      return MalvAgentRouteReason.SURFACE_CHAT;
    case "task":
      return MalvAgentRouteReason.SURFACE_TASK;
    case "inbox":
      return MalvAgentRouteReason.SURFACE_INBOX;
    case "studio":
      return MalvAgentRouteReason.SURFACE_STUDIO;
    case "image":
      return MalvAgentRouteReason.SURFACE_IMAGE;
    case "call":
      return MalvAgentRouteReason.SURFACE_CALL;
    case "voice":
      return MalvAgentRouteReason.SURFACE_VOICE;
    case "device":
      return MalvAgentRouteReason.SURFACE_DEVICE;
    case "bridge":
      return MalvAgentRouteReason.SURFACE_BRIDGE;
    case "execution":
      return MalvAgentRouteReason.SURFACE_EXECUTION;
    case "research":
      return MalvAgentRouteReason.SURFACE_RESEARCH;
    default:
      return MalvAgentRouteReason.SURFACE_CHAT;
  }
}

function scoreComplexity(classified: ClassifiedIntent | null | undefined, text: string, strategy: ExecutionStrategyResult | null | undefined): number {
  let s = 0.2;
  if (text.length > 1200) s += 0.25;
  if (text.length > 4000) s += 0.15;
  if (classified) {
    if (classified.complexity === "high") s += 0.35;
    else if (classified.complexity === "medium") s += 0.2;
    if (classified.scopeSize === "large") s += 0.2;
    else if (classified.scopeSize === "medium") s += 0.1;
  }
  if (strategy?.mode === "phased") s += 0.15;
  if (strategy?.riskTier === "high") s += 0.1;
  return Math.min(1, s);
}

function riskFrom(
  classified: ClassifiedIntent | null | undefined,
  strategy: ExecutionStrategyResult | null | undefined,
  lower: string
): MalvTaskRouterDecision["executionRisk"] {
  if (strategy?.riskTier === "high") return "high";
  if (classified?.complexity === "high" && classified.scopeSize === "large") return "high";
  if (/\b(rm -rf|delete all|drop table|wire money|transfer \$)\b/i.test(lower)) return "high";
  if (strategy?.riskTier === "medium") return "medium";
  return "low";
}

function inferWorkShape(surface: MalvWorkSurface, lower: string, input: MalvTaskRouterInput): MalvWorkShape {
  if (surface === "inbox") return "inbox_oriented";
  if (surface === "task") return "task_oriented";
  if (surface === "image") return "image_oriented";
  if (surface === "studio" || input.studioContext) return "studio_oriented";
  if (surface === "call" || surface === "voice") return "call_oriented";
  if (surface === "device" || surface === "bridge" || input.deviceHookActive) return "device_oriented";
  if (surface === "execution") return "execution_oriented";
  if (surface === "research") return "research_oriented";

  /** Stage 2 keyword routing — selective; explicit surfaces above win (chat-only; task/execution already shaped). */
  if (surface === "chat") {
    if (/\b(system design|architecture|microservices?|bounded context|integration boundaries?|cap theorem|data model)\b/.test(lower)) {
      return "architecture_oriented";
    }
    if (/\b(landing page|marketing site|website structure|sitemap|conversion funnel|seo)\b/.test(lower)) {
      return "website_oriented";
    }
    if (/\b(qa\b|quality assurance|release readiness|regression suite|e2e test|unit tests?|jest|playwright|cypress)\b/.test(lower)) {
      return "quality_oriented";
    }
    if (/\b(ui design|ux\b|design system|tailwind|responsive layout|component library|figma|interaction design|frontend ux)\b/.test(lower)) {
      return "frontend_oriented";
    }
    if (
      /\b(debug|root cause|stack trace|repro|exception|crash|segmentation fault)\b/.test(lower) &&
      /\b(error|code|build|typescript|test|fails?)\b/.test(lower)
    ) {
      return "debug_oriented";
    }
    if (
      /\b(implement|feature|add endpoint|refactor|pull request|code change|build api)\b/.test(lower) &&
      /\b(code|typescript|react|api|backend|frontend)\b/.test(lower) &&
      !/\b(debug|root cause|stack trace|crash)\b/.test(lower)
    ) {
      return "coding_oriented";
    }
  }

  if (input.hasImageKeywords || /\b(image|screenshot|diagram)\b/.test(lower)) return "image_oriented";
  if (input.hasCodeKeywords || /\b(debug|stack trace|typescript|repo|patch)\b/.test(lower)) return "studio_oriented";
  return "chat_response";
}

function pickTier(
  shape: MalvWorkShape,
  complexity: number,
  latency: MalvTaskRouterDecision["latencyMode"],
  privacy: MalvTaskRouterDecision["privacyMode"],
  modality: MalvInputModality
): MalvAgentRuntimeTierPreference {
  if (latency === "low_latency") return "cpu";
  if (shape === "call_oriented") return "cpu";
  if (shape === "inbox_oriented" || shape === "task_oriented") return complexity > 0.55 ? "hybrid" : "cpu";
  if (shape === "image_oriented" || shape === "research_oriented") return "gpu";
  if (modality === "multimodal" || modality === "image") return "gpu";
  if (shape === "studio_oriented" && complexity > 0.5) return "hybrid";
  if (shape === "execution_oriented") return "hybrid";
  if (shape === "architecture_oriented") return complexity > 0.5 ? "gpu" : "hybrid";
  if (shape === "website_oriented") return "hybrid";
  if (shape === "frontend_oriented") return complexity > 0.45 ? "gpu" : "hybrid";
  if (shape === "quality_oriented") return "cpu";
  if (shape === "coding_oriented" || shape === "debug_oriented") return complexity > 0.5 ? "hybrid" : "cpu";
  if (complexity >= 0.65) return "gpu";
  if (privacy === "vault_sensitive" && complexity < 0.45) return "cpu";
  return complexity > 0.4 ? "gpu" : "cpu";
}

function pickExecutionMode(
  shape: MalvWorkShape,
  risk: MalvTaskRouterDecision["executionRisk"],
  strategy: ExecutionStrategyResult | null | undefined
): MalvAgentExecutionMode {
  if (strategy?.mode === "require_clarification") return "advisory";
  if (shape === "device_oriented") return "approval_required";
  if (shape === "execution_oriented" || shape === "studio_oriented") {
    return risk === "high" ? "approval_required" : "advisory";
  }
  if (shape === "architecture_oriented" || shape === "website_oriented" || shape === "frontend_oriented") {
    return risk === "high" ? "approval_required" : "advisory";
  }
  if (shape === "quality_oriented" || shape === "coding_oriented" || shape === "debug_oriented") {
    return "advisory";
  }
  if (shape === "call_oriented") return "realtime_assist";
  if (shape === "inbox_oriented" || shape === "task_oriented") return "advisory";
  return "advisory";
}

function shouldMultiAgent(
  shape: MalvWorkShape,
  complexity: number,
  strategy: ExecutionStrategyResult | null | undefined
): boolean {
  if (strategy?.mode === "phased") return true;
  if (shape === "execution_oriented" || shape === "studio_oriented") return complexity > 0.45 || strategy?.preferBeastWorker === true;
  if (shape === "research_oriented") return true;
  if (shape === "architecture_oriented" || shape === "website_oriented") return true;
  if (shape === "frontend_oriented") return complexity > 0.42;
  if (shape === "quality_oriented") return complexity > 0.4;
  if (shape === "coding_oriented" || shape === "debug_oriented") return complexity > 0.48;
  if (shape === "chat_response" && complexity >= 0.65) return true;
  return false;
}

function buildPathHints(
  shape: MalvWorkShape,
  strategy: ExecutionStrategyResult | null | undefined,
  multiAgent: boolean
): MalvTaskRouterDecision["malvExecutionPathHints"] {
  const hints: MalvTaskRouterDecision["malvExecutionPathHints"] = ["beast_worker"];
  if (strategy?.mode === "phased" || multiAgent) hints.push("phased_chat");
  if (shape === "studio_oriented" || shape === "execution_oriented") {
    hints.push("sandbox_policy", "cci");
  }
  if (shape === "architecture_oriented" || shape === "coding_oriented" || shape === "debug_oriented") {
    hints.push("sandbox_policy", "cci");
  }
  if (shape === "website_oriented" || shape === "frontend_oriented") {
    hints.push("workspace_task", "cci");
  }
  if (shape === "quality_oriented") hints.push("workspace_task");
  if (shape === "task_oriented" || shape === "inbox_oriented") hints.push("workspace_task");
  if (shape === "image_oriented") hints.push("explore_image");
  if (shape === "call_oriented") hints.push("voice_realtime");
  if (shape === "device_oriented") hints.push("device_bridge");
  return [...new Set(hints)];
}

function buildDecompositionHints(classified: ClassifiedIntent | null | undefined, strategy: ExecutionStrategyResult | null | undefined): string[] {
  const out: string[] = [];
  if (strategy?.mode === "phased") {
    out.push(`internal_phases:${strategy.internalPhases.length}`);
  }
  if (classified?.primaryIntent) out.push(`intent:${classified.primaryIntent}`);
  if (strategy?.mode === "require_clarification") out.push("clarify_before_execution");
  return out;
}

function tagsForShape(shape: MalvWorkShape): string[] {
  switch (shape) {
    case "inbox_oriented":
      return ["inbox", "triage"];
    case "task_oriented":
      return ["tasks", "planning"];
    case "image_oriented":
      return ["image", "multimodal"];
    case "studio_oriented":
      return ["studio", "code", "sandbox"];
    case "call_oriented":
      return ["call", "latency"];
    case "device_oriented":
      return ["device", "bridge", "policy"];
    case "execution_oriented":
      return ["execution", "sandbox", "policy"];
    case "research_oriented":
      return ["research", "synthesis"];
    case "architecture_oriented":
      return ["architecture", "planning", "systems"];
    case "website_oriented":
      return ["website", "marketing", "funnel"];
    case "frontend_oriented":
      return ["frontend", "ux", "design"];
    case "quality_oriented":
      return ["testing", "qa", "quality"];
    case "coding_oriented":
      return ["coding", "implementation", "cci"];
    case "debug_oriented":
      return ["debug", "diagnostics", "cci"];
    default:
      return ["routing", "response"];
  }
}

function urgencyFrom(lower: string, shape: MalvWorkShape): MalvTaskRouterDecision["urgency"] {
  if (/\burgent|asap|immediately\b/.test(lower)) return "high";
  if (shape === "call_oriented") return "high";
  return "normal";
}

type PlanArgs = {
  workShape: MalvWorkShape;
  multiAgent: boolean;
  resourceTier: MalvAgentRuntimeTierPreference;
  executionMode: MalvAgentExecutionMode;
  complexityScore: number;
  memorySnippetCount: number;
  vaultScoped: boolean;
  latencyMode: MalvTaskRouterDecision["latencyMode"];
  clarification: boolean;
  userText: string;
};

function buildPlan(args: PlanArgs): MultiAgentExecutionPlan {
  const liteEligible =
    !args.multiAgent &&
    args.complexityScore < 0.34 &&
    args.workShape === "chat_response" &&
    !args.clarification &&
    args.latencyMode === "normal" &&
    !args.vaultScoped;

  if (liteEligible) {
    const lite: MalvAgentPlanStep[] = [
      { order: 0, agentKind: "router", mode: "passive_analysis", tierOverride: "cpu", parallelGroup: 0 },
      { order: 1, agentKind: "smart_decision", mode: "passive_analysis", tierOverride: "cpu", parallelGroup: 1 }
    ];
    let o = 2;
    if (args.memorySnippetCount > 0 || args.vaultScoped) {
      lite.push({ order: o++, agentKind: "memory_shaping", mode: "passive_analysis", tierOverride: "cpu", parallelGroup: 1 });
    }
    lite.push({ order: o++, agentKind: "privacy", mode: "passive_analysis", tierOverride: "cpu" });
    lite.push({ order: o++, agentKind: "response_composer", mode: "advisory", tierOverride: "cpu" });
    return {
      planId: `plan_${args.workShape}_lite`,
      steps: lite,
      maxParallelGroups: 2,
      maxSteps: 8,
      notes: ["single_agent_lite_plan_stage1"]
    };
  }

  const steps: MalvAgentPlanStep[] = [];
  let order = 0;
  const push = (agentKind: MalvAgentKind, mode: MalvAgentExecutionMode, tier?: MalvAgentRuntimeTierPreference, parallelGroup?: number) => {
    steps.push({ order: order++, agentKind, mode, tierOverride: tier, parallelGroup });
  };

  push("router", "passive_analysis", "cpu", 0);
  push("smart_decision", "passive_analysis", "cpu", 1);
  if (args.latencyMode === "low_latency") {
    push("call_presence", "realtime_assist", "cpu", 1);
  }
  if (args.memorySnippetCount > 0 || args.vaultScoped) {
    push("memory_shaping", "passive_analysis", "cpu", 1);
  }
  if (!args.clarification) {
    if (args.latencyMode === "low_latency") {
      push("conversation", "realtime_assist", "cpu", 1);
    } else {
      push("context_assembly", "passive_analysis", "cpu", undefined);
      push("conversation", "advisory", args.resourceTier === "gpu" ? "hybrid" : "cpu", undefined);
    }
  }

  if (
    args.workShape === "research_oriented" ||
    args.workShape === "architecture_oriented" ||
    (args.workShape === "chat_response" && args.complexityScore >= 0.55 && args.multiAgent)
  ) {
    push("knowledge", "advisory", "gpu", undefined);
  }

  if (args.workShape === "inbox_oriented") {
    push("inbox_triage", "advisory", "cpu", 2);
    push("task_framing", "advisory", "cpu", 2);
  } else if (args.workShape === "task_oriented") {
    push("task_framing", "advisory", "cpu", 2);
    push("execution_prep", "advisory", "cpu", 3);
  } else if (args.workShape === "image_oriented") {
    push("image_intelligence", "advisory", "gpu", 2);
  } else if (args.workShape === "studio_oriented") {
    const low = args.userText.toLowerCase();
    const debugLike = /\b(bug|crash|error|stack|repro|fail|exception|broken)\b/.test(low);
    push("studio", "advisory", "hybrid", 2);
    if (debugLike) {
      push("debug", "advisory", "gpu", 3);
    } else {
      push("coding", "advisory", "gpu", 3);
    }
    push("studio_builder", "advisory", "hybrid", 4);
    push("sandbox_action", "approval_required", "cpu", 5);
  } else if (args.workShape === "architecture_oriented") {
    push("system_design", "advisory", "gpu", 2);
  } else if (args.workShape === "website_oriented") {
    push("website_builder", "advisory", "gpu", 2);
    if (args.complexityScore >= 0.42 || args.multiAgent) {
      push("designer", "advisory", "hybrid", 3);
      push("frontend_experience", "advisory", "hybrid", 3);
    }
    push("website_security", "advisory", "cpu", 4);
    if (args.multiAgent || args.complexityScore >= 0.48) {
      push("testing", "advisory", "cpu", 5);
      push("qa", "advisory", "cpu", 6);
    }
  } else if (args.workShape === "frontend_oriented") {
    push("designer", "advisory", "gpu", 2);
    push("frontend_experience", "advisory", "hybrid", 3);
    if (args.complexityScore >= 0.45 || /\b(animation|motion|transition)\b/.test(args.userText.toLowerCase())) {
      push("animation", "advisory", "gpu", 4);
    }
  } else if (args.workShape === "quality_oriented") {
    push("testing", "advisory", "cpu", 2);
    push("qa", "advisory", "cpu", 3);
  } else if (args.workShape === "coding_oriented") {
    push("coding", "advisory", args.resourceTier === "gpu" ? "gpu" : "hybrid", 2);
  } else if (args.workShape === "debug_oriented") {
    push("debug", "advisory", "gpu", 2);
  } else if (args.workShape === "device_oriented") {
    push("device_bridge_action", "approval_required", "cpu", 2);
  } else if (args.workShape === "research_oriented") {
    push("research_synthesis", "advisory", "gpu", 2);
  } else if (args.workShape === "execution_oriented") {
    push("planning", "advisory", "gpu", 2);
    push("execution_prep", "advisory", "cpu", 3);
    push("sandbox_action", "approval_required", "cpu", 4);
  } else {
    // chat_response
    if (args.multiAgent && args.complexityScore >= 0.65) {
      push("planning", "advisory", "gpu", 2);
    }
  }

  push("privacy", "passive_analysis", "cpu", undefined);
  push("policy_safety_review", "advisory", "cpu", undefined);
  push("quality_verification", "passive_analysis", "cpu", undefined);
  push("response_composer", "advisory", args.resourceTier === "cpu" ? "cpu" : "hybrid", undefined);

  return {
    planId: `plan_${args.workShape}_${args.multiAgent ? "multi" : "single"}`,
    steps,
    maxParallelGroups: 4,
    maxSteps: Math.min(22, steps.length + 2),
    notes: args.clarification ? ["clarification_short_circuit"] : []
  };
}

function refineResourceTierForCapabilityPlan(
  tierCapabilities: MalvInferenceTierCapabilityService,
  heuristic: MalvAgentRuntimeTierPreference,
  plan: MultiAgentExecutionPlan,
  extras: MalvTaskCapabilityDemand
): MalvAgentRuntimeTierPreference {
  const cpu = tierCapabilities.getCpuTierSnapshot();
  const gpu = tierCapabilities.getGpuTierSnapshot();
  const fromPlan = aggregatePlanInferenceDemand(plan, MALV_AGENT_KIND_INFERENCE_REQUIREMENTS);
  const demand = mergeCapabilityDemands(fromPlan, extras);
  const cpuOk = tierSatisfiesDemand(cpu, demand);
  const gpuOk = tierSatisfiesDemand(gpu, demand);

  if (!gpuOk && cpuOk) return "cpu";
  if (!cpuOk && gpuOk) {
    if (heuristic === "cpu") return "hybrid";
    return "gpu";
  }
  return heuristic;
}
