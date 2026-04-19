import type { MultiAgentExecutionPlan } from "../agent-system/contracts/malv-agent.contracts";
import type { ChatRoutingInput } from "./inference-chat-routing.input";
import type { MalvAgentKindInferenceRequirements } from "./malv-agent-kind-inference-requirements";
import {
  MALV_INFERENCE_CAPABILITY_CLASS_ORDER,
  MALV_LATENCY_PROFILE_ORDER,
  MALV_REASONING_DEPTH_ORDER,
  MALV_STRUCTURED_OUTPUT_ORDER,
  type MalvLatencyProfileClass,
  type MalvReasoningDepthClass,
  type MalvTaskCapabilityDemand,
  type MalvTierRuntimeCapabilitySnapshot
} from "./malv-inference-tier-capability.types";

export function maxCapabilityClass(
  a: MalvTaskCapabilityDemand["minimumCapabilityClass"],
  b: MalvTaskCapabilityDemand["minimumCapabilityClass"]
): MalvTaskCapabilityDemand["minimumCapabilityClass"] {
  return MALV_INFERENCE_CAPABILITY_CLASS_ORDER[a] >= MALV_INFERENCE_CAPABILITY_CLASS_ORDER[b] ? a : b;
}

export function maxReasoningDepth(a: MalvReasoningDepthClass, b: MalvReasoningDepthClass): MalvReasoningDepthClass {
  return MALV_REASONING_DEPTH_ORDER[a] >= MALV_REASONING_DEPTH_ORDER[b] ? a : b;
}

export function minResponsiveness(a: MalvLatencyProfileClass, b: MalvLatencyProfileClass): MalvLatencyProfileClass {
  return MALV_LATENCY_PROFILE_ORDER[a] <= MALV_LATENCY_PROFILE_ORDER[b] ? a : b;
}

export function mergeCapabilityDemands(a: MalvTaskCapabilityDemand, b: MalvTaskCapabilityDemand): MalvTaskCapabilityDemand {
  return {
    minimumCapabilityClass: maxCapabilityClass(a.minimumCapabilityClass, b.minimumCapabilityClass),
    reasoningDepthRequired: maxReasoningDepth(a.reasoningDepthRequired, b.reasoningDepthRequired),
    requiresMultimodal: a.requiresMultimodal || b.requiresMultimodal,
    requiresStructuredOutput: a.requiresStructuredOutput || b.requiresStructuredOutput,
    promptChars: Math.max(a.promptChars, b.promptChars),
    contextChars: Math.max(a.contextChars, b.contextChars),
    minimumResponsiveness: minResponsiveness(a.minimumResponsiveness, b.minimumResponsiveness),
    concurrentInferSlotsRequired: Math.max(a.concurrentInferSlotsRequired, b.concurrentInferSlotsRequired)
  };
}

export function inferChatTurnCapabilityDemand(input: ChatRoutingInput): MalvTaskCapabilityDemand {
  const promptChars = input.userMessage.length;
  const contextChars = input.contextChars;

  let minimumCapabilityClass: MalvTaskCapabilityDemand["minimumCapabilityClass"] = "edge";
  let reasoningDepthRequired: MalvReasoningDepthClass = "interactive";
  let requiresStructuredOutput = false;
  let minimumResponsiveness: MalvLatencyProfileClass = "interactive";

  const heavyMode =
    input.modeType === "execute" ||
    input.modeType === "fix" ||
    input.modeType === "operator_workflow" ||
    input.executionStrategyMode === "require_clarification";

  if (input.superFix) {
    minimumCapabilityClass = maxCapabilityClass(minimumCapabilityClass, "enhanced");
    reasoningDepthRequired = maxReasoningDepth(reasoningDepthRequired, "deep");
  }
  if (heavyMode) {
    minimumCapabilityClass = maxCapabilityClass(minimumCapabilityClass, "enhanced");
    reasoningDepthRequired = maxReasoningDepth(reasoningDepthRequired, "deep");
  }

  const phased = input.useServerPhased || (input.internalPhaseCount ?? 0) > 1;
  if (phased) {
    requiresStructuredOutput = true;
    minimumCapabilityClass = maxCapabilityClass(minimumCapabilityClass, "standard");
    reasoningDepthRequired = maxReasoningDepth(reasoningDepthRequired, "standard");
  }

  if (input.classifiedWorkerMode === "beast" && input.inputMode !== "voice" && input.inputMode !== "video") {
    minimumCapabilityClass = maxCapabilityClass(minimumCapabilityClass, "enhanced");
    reasoningDepthRequired = maxReasoningDepth(reasoningDepthRequired, "deep");
  }

  if (input.vaultScoped) {
    minimumCapabilityClass = maxCapabilityClass(minimumCapabilityClass, "standard");
  }

  if (input.inputMode === "voice" || input.inputMode === "video") {
    minimumResponsiveness = minResponsiveness(minimumResponsiveness, "strict_interactive");
    reasoningDepthRequired = maxReasoningDepth(reasoningDepthRequired, "interactive");
  }

  const codeOrArchitectureSignals = /\b(refactor|architecture|debug|stack trace|typescript|implement|patch)\b/i.test(input.userMessage);
  if (codeOrArchitectureSignals) {
    reasoningDepthRequired = maxReasoningDepth(reasoningDepthRequired, "deep");
    minimumCapabilityClass = maxCapabilityClass(minimumCapabilityClass, "standard");
  }

  return {
    minimumCapabilityClass,
    reasoningDepthRequired,
    requiresMultimodal: false,
    requiresStructuredOutput,
    promptChars,
    contextChars,
    minimumResponsiveness,
    concurrentInferSlotsRequired: phased ? 2 : 1
  };
}

export function aggregatePlanInferenceDemand(
  plan: MultiAgentExecutionPlan,
  byKind: Record<string, MalvAgentKindInferenceRequirements | undefined>
): MalvTaskCapabilityDemand {
  let out: MalvTaskCapabilityDemand = {
    minimumCapabilityClass: "edge",
    reasoningDepthRequired: "interactive",
    requiresMultimodal: false,
    requiresStructuredOutput: false,
    promptChars: 0,
    contextChars: 0,
    minimumResponsiveness: "throughput",
    concurrentInferSlotsRequired: 1
  };

  for (const step of plan.steps) {
    const req = byKind[step.agentKind];
    if (!req) continue;
    const slice: MalvTaskCapabilityDemand = {
      minimumCapabilityClass: req.minimumRequiredCapabilityClass,
      reasoningDepthRequired: req.minimumReasoningDepth,
      requiresMultimodal: req.requiresMultimodal,
      requiresStructuredOutput: req.requiresStructuredOutput,
      promptChars: 0,
      contextChars: 0,
      minimumResponsiveness: req.minimumResponsiveness,
      concurrentInferSlotsRequired: req.concurrentInferSlots ?? 1
    };
    out = mergeCapabilityDemands(out, slice);
  }

  return out;
}

export function mergeChatAndPlanDemands(
  chat: MalvTaskCapabilityDemand,
  plan: MultiAgentExecutionPlan,
  byKind: Record<string, MalvAgentKindInferenceRequirements | undefined>
): MalvTaskCapabilityDemand {
  return mergeCapabilityDemands(chat, aggregatePlanInferenceDemand(plan, byKind));
}

export function tierSatisfiesDemand(tier: MalvTierRuntimeCapabilitySnapshot, demand: MalvTaskCapabilityDemand): boolean {
  if (MALV_INFERENCE_CAPABILITY_CLASS_ORDER[tier.capabilityClass] < MALV_INFERENCE_CAPABILITY_CLASS_ORDER[demand.minimumCapabilityClass]) {
    return false;
  }
  if (MALV_REASONING_DEPTH_ORDER[tier.reasoningDepthMax] < MALV_REASONING_DEPTH_ORDER[demand.reasoningDepthRequired]) {
    return false;
  }
  if (demand.requiresMultimodal && !tier.multimodalSupported) {
    return false;
  }
  if (
    demand.requiresStructuredOutput &&
    MALV_STRUCTURED_OUTPUT_ORDER[tier.structuredOutputReliability] < MALV_STRUCTURED_OUTPUT_ORDER.medium
  ) {
    return false;
  }
  if (tier.maxPromptChars > 0 && demand.promptChars > tier.maxPromptChars) {
    return false;
  }
  if (tier.maxContextChars > 0 && demand.contextChars > tier.maxContextChars) {
    return false;
  }
  if (MALV_LATENCY_PROFILE_ORDER[tier.latencyProfile] > MALV_LATENCY_PROFILE_ORDER[demand.minimumResponsiveness]) {
    return false;
  }
  if (tier.maxConcurrentInfer > 0 && demand.concurrentInferSlotsRequired > tier.maxConcurrentInfer) {
    return false;
  }
  return true;
}

export function chatCpuEligibilityFromDemand(args: {
  demand: MalvTaskCapabilityDemand;
  cpu: MalvTierRuntimeCapabilitySnapshot;
  /** When false, CPU tier is not offered regardless of capability match. */
  cpuSidecarConfigured: boolean;
}): { cpuEligible: boolean; blockReason?: string } {
  if (!args.cpuSidecarConfigured) {
    return { cpuEligible: false, blockReason: "cpu_tier_disabled_or_unconfigured" };
  }
  if (!tierSatisfiesDemand(args.cpu, args.demand)) {
    return { cpuEligible: false, blockReason: "cpu_tier_capability_insufficient_for_task_demand" };
  }
  return { cpuEligible: true };
}
