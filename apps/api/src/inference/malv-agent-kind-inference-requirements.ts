import type { MalvAgentKind } from "../agent-system/contracts/malv-agent.contracts";
import {
  MALV_SPECIALIZED_AGENT_SCHEMA_STAGE2_BY_KIND,
  type MalvStage2BuildTechKind
} from "../agent-system/contracts/malv-stage2-specialized-agent.schema";
import { MALV_SPECIALIZED_AGENT_SCHEMA_BY_KIND, type MalvStage1CoreRuntimeKind } from "../agent-system/contracts/malv-specialized-agent.schema";
import type { MalvInferenceCapabilityClass, MalvLatencyProfileClass, MalvReasoningDepthClass } from "./malv-inference-tier-capability.types";

export type MalvAgentKindInferenceRequirements = {
  minimumRequiredCapabilityClass: MalvInferenceCapabilityClass;
  minimumReasoningDepth: MalvReasoningDepthClass;
  requiresMultimodal: boolean;
  requiresStructuredOutput: boolean;
  minimumResponsiveness: MalvLatencyProfileClass;
  /** Parallel infer slots this agent may consume when lifecycle runs parallel groups (>1 tightens tier budget). */
  concurrentInferSlots?: number;
};

const R = (x: MalvAgentKindInferenceRequirements): MalvAgentKindInferenceRequirements => x;

function fromStage1(kind: MalvStage1CoreRuntimeKind): MalvAgentKindInferenceRequirements {
  const s = MALV_SPECIALIZED_AGENT_SCHEMA_BY_KIND[kind];
  return {
    minimumRequiredCapabilityClass: s.minimumRequiredCapabilityClass,
    minimumReasoningDepth: s.minimumReasoningDepth,
    requiresMultimodal: s.requiresMultimodalInference,
    requiresStructuredOutput: s.requiresStructuredInferenceOutput,
    minimumResponsiveness: s.minimumInferenceResponsiveness,
    concurrentInferSlots: s.concurrentInferSlots
  };
}

function fromStage2(kind: MalvStage2BuildTechKind): MalvAgentKindInferenceRequirements {
  const s = MALV_SPECIALIZED_AGENT_SCHEMA_STAGE2_BY_KIND[kind];
  return {
    minimumRequiredCapabilityClass: s.minimumRequiredCapabilityClass,
    minimumReasoningDepth: s.minimumReasoningDepth,
    requiresMultimodal: s.requiresMultimodalInference,
    requiresStructuredOutput: s.requiresStructuredInferenceOutput,
    minimumResponsiveness: s.minimumInferenceResponsiveness,
    concurrentInferSlots: s.concurrentInferSlots
  };
}

/**
 * Static per-kind inference demand used when aggregating multi-agent plans.
 * Stage-1 rows mirror {@link MALV_SPECIALIZED_AGENT_SCHEMA_BY_KIND}; other kinds use conservative defaults.
 */
export const MALV_AGENT_KIND_INFERENCE_REQUIREMENTS: Record<MalvAgentKind, MalvAgentKindInferenceRequirements> = {
  router: fromStage1("router"),
  smart_decision: fromStage1("smart_decision"),
  conversation: fromStage1("conversation"),
  knowledge: fromStage1("knowledge"),
  planning: fromStage1("planning"),
  execution_prep: fromStage1("execution_prep"),
  context_assembly: fromStage1("context_assembly"),
  memory_shaping: fromStage1("memory_shaping"),
  quality_verification: fromStage1("quality_verification"),
  privacy: fromStage1("privacy"),
  continuity: R({
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodal: false,
    requiresStructuredOutput: false,
    minimumResponsiveness: "interactive"
  }),
  response_composer: R({
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodal: false,
    requiresStructuredOutput: false,
    minimumResponsiveness: "interactive"
  }),
  sandbox_action: R({
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodal: false,
    requiresStructuredOutput: true,
    minimumResponsiveness: "balanced"
  }),
  debug_code_intelligence: R({
    minimumRequiredCapabilityClass: "enhanced",
    minimumReasoningDepth: "deep",
    requiresMultimodal: false,
    requiresStructuredOutput: true,
    minimumResponsiveness: "balanced"
  }),
  studio_builder: R({
    minimumRequiredCapabilityClass: "enhanced",
    minimumReasoningDepth: "deep",
    requiresMultimodal: false,
    requiresStructuredOutput: true,
    minimumResponsiveness: "balanced"
  }),
  inbox_triage: R({
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodal: false,
    requiresStructuredOutput: true,
    minimumResponsiveness: "interactive"
  }),
  task_framing: R({
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodal: false,
    requiresStructuredOutput: true,
    minimumResponsiveness: "interactive"
  }),
  image_intelligence: R({
    minimumRequiredCapabilityClass: "enhanced",
    minimumReasoningDepth: "standard",
    requiresMultimodal: true,
    requiresStructuredOutput: false,
    minimumResponsiveness: "balanced"
  }),
  multimodal_analysis: R({
    minimumRequiredCapabilityClass: "enhanced",
    minimumReasoningDepth: "deep",
    requiresMultimodal: true,
    requiresStructuredOutput: false,
    minimumResponsiveness: "balanced"
  }),
  call_presence: R({
    minimumRequiredCapabilityClass: "edge",
    minimumReasoningDepth: "interactive",
    requiresMultimodal: false,
    requiresStructuredOutput: false,
    minimumResponsiveness: "strict_interactive"
  }),
  device_bridge_action: R({
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodal: false,
    requiresStructuredOutput: true,
    minimumResponsiveness: "interactive"
  }),
  research_synthesis: R({
    minimumRequiredCapabilityClass: "enhanced",
    minimumReasoningDepth: "deep",
    requiresMultimodal: false,
    requiresStructuredOutput: false,
    minimumResponsiveness: "balanced"
  }),
  policy_safety_review: R({
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodal: false,
    requiresStructuredOutput: false,
    minimumResponsiveness: "interactive"
  }),
  growth_advisor: R({
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodal: false,
    requiresStructuredOutput: false,
    minimumResponsiveness: "interactive"
  }),
  fallback_recovery: R({
    minimumRequiredCapabilityClass: "edge",
    minimumReasoningDepth: "interactive",
    requiresMultimodal: false,
    requiresStructuredOutput: false,
    minimumResponsiveness: "interactive"
  }),
  coding: fromStage2("coding"),
  debug: fromStage2("debug"),
  system_design: fromStage2("system_design"),
  designer: fromStage2("designer"),
  frontend_experience: fromStage2("frontend_experience"),
  animation: fromStage2("animation"),
  studio: fromStage2("studio"),
  website_builder: fromStage2("website_builder"),
  website_security: fromStage2("website_security"),
  testing: fromStage2("testing"),
  qa: fromStage2("qa")
};
