/**
 * Professional schema for MALV specialized agents (Stage 1+).
 * Each agent is defined once; services implement behavior that conforms to this contract.
 */

import type { MalvInferenceCapabilityClass, MalvLatencyProfileClass, MalvReasoningDepthClass } from "../../inference/malv-inference-tier-capability.types";
import type { MalvAgentKind, MalvAgentResultEnvelope, MalvAgentRuntimeTierPreference } from "./malv-agent.contracts";

export const MALV_SPECIALIZED_AGENT_SCHEMA_VERSION = 1 as const;

/** Coarse task classes owned by an agent (router / governance use). */
export type MalvAgentOwnedTaskClass =
  | "routing"
  | "decision_shaping"
  | "conversation_framing"
  | "knowledge_assembly"
  | "planning"
  | "execution_preparation"
  | "context_packaging"
  | "memory_scoping"
  | "verification"
  | "privacy_suppression"
  | "policy_review"
  | "fallback_recovery"
  | "code_implementation"
  | "diagnostics"
  | "systems_architecture"
  | "visual_design"
  | "ux_engineering"
  | "motion_design"
  | "studio_orchestration"
  | "web_composition"
  | "web_security"
  | "test_engineering"
  | "quality_assurance";

/** Symbolic tool surface — not executable grants; real gating stays in Beast/sandbox/CCI. */
export type MalvAgentAllowedToolSymbol =
  | "malv.task_router"
  | "malv.agent_registry"
  | "malv.inference_routing_telemetry"
  | "malv.beast_worker_context"
  | "malv.sandbox_policy_gate"
  | "malv.vault_scope_flags"
  | "malv.workspace_task_hints"
  | "malv.none_advisory_only"
  | "malv.cci_workspace_hints"
  | "malv.build_unit_pipeline"
  | "malv.preview_inspect_surface"
  | "malv.code_change_intel_gate";

export type MalvSpecializedAgentVisibility = "internal" | "user_visible_metadata_only";

export type MalvSpecializedAgentSchema = {
  /** Stable display name (internal ops). */
  name: string;
  mission: string;
  ownedTaskClasses: MalvAgentOwnedTaskClass[];
  visibility: MalvSpecializedAgentVisibility;
  allowedTools: MalvAgentAllowedToolSymbol[];
  preferredTier: MalvAgentRuntimeTierPreference;
  fallbackTier: MalvAgentRuntimeTierPreference;
  /** Minimum CPU/GPU capability class this agent needs for its inference leg (deployment compares against tier profiles). */
  minimumRequiredCapabilityClass: MalvInferenceCapabilityClass;
  /** Minimum reasoning depth the hosting tier must be configured to handle. */
  minimumReasoningDepth: MalvReasoningDepthClass;
  requiresMultimodalInference: boolean;
  requiresStructuredInferenceOutput: boolean;
  minimumInferenceResponsiveness: MalvLatencyProfileClass;
  /** When a tier meets this capability class, the agent may use a richer path (orchestration metadata). */
  enhancedCapabilityPath?: {
    preferredTier: MalvAgentRuntimeTierPreference;
    minimumCapabilityClass: MalvInferenceCapabilityClass;
  };
  /** Optional parallel infer slots for tier concurrency budgeting (default 1). */
  concurrentInferSlots?: number;
  handoffTargets: MalvAgentKind[];
  /** Key for typed payload discriminant in tests / merge logic. */
  outputContractKey: string;
  safetyRules: string[];
  telemetryFieldIds: string[];
  successCriteriaIds: string[];
};

export const MALV_STAGE1_CORE_RUNTIME_KINDS = [
  "router",
  "smart_decision",
  "conversation",
  "knowledge",
  "planning",
  "execution_prep",
  "context_assembly",
  "memory_shaping",
  "quality_verification",
  "privacy"
] as const satisfies readonly MalvAgentKind[];

export type MalvStage1CoreRuntimeKind = (typeof MALV_STAGE1_CORE_RUNTIME_KINDS)[number];

export const MALV_SPECIALIZED_AGENT_SCHEMA_BY_KIND: Record<MalvStage1CoreRuntimeKind, MalvSpecializedAgentSchema> = {
  router: {
    name: "Task Router Agent",
    mission: "Triage modality and work shape, emit structured route signals for downstream MALV agents without duplicating policy execution.",
    ownedTaskClasses: ["routing"],
    visibility: "internal",
    allowedTools: ["malv.task_router", "malv.agent_registry", "malv.beast_worker_context"],
    preferredTier: "cpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "edge",
    minimumReasoningDepth: "interactive",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: false,
    minimumInferenceResponsiveness: "interactive",
    handoffTargets: ["smart_decision", "conversation", "context_assembly"],
    outputContractKey: "malv.router.v1",
    safetyRules: [
      "Never claim execution completed",
      "Never bypass sandbox or approval gates",
      "Stay truthful about uncertainty of inferred intent"
    ],
    telemetryFieldIds: ["route.signals", "route.complexity_hint", "route.shape_secondary"],
    successCriteriaIds: ["router.signals_non_empty", "router.handoffs_safe", "router.strategy_present"]
  },
  smart_decision: {
    name: "Smart Decision Agent",
    mission: "Shape execution depth, phased vs single-pass preference, tier fallback posture, and clarification gates from router and strategy signals.",
    ownedTaskClasses: ["decision_shaping"],
    visibility: "internal",
    allowedTools: ["malv.task_router", "malv.inference_routing_telemetry", "malv.beast_worker_context"],
    preferredTier: "cpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: false,
    minimumInferenceResponsiveness: "interactive",
    handoffTargets: ["planning", "conversation", "execution_prep", "fallback_recovery"],
    outputContractKey: "malv.smart_decision.v1",
    safetyRules: [
      "Degraded tier must be explicit in output",
      "High-risk execution remains advisory or needs_approval downstream",
      "No autonomous external execution"
    ],
    telemetryFieldIds: ["decision.depth", "decision.fallback_tier", "decision.phased_preference"],
    successCriteriaIds: ["decision.profile_present", "decision.fallback_truthful"]
  },
  conversation: {
    name: "Conversation Agent",
    mission: "Frame continuity-aware response structure, intent alignment, and clarification candidates without exposing internal personas.",
    ownedTaskClasses: ["conversation_framing"],
    visibility: "internal",
    allowedTools: ["malv.beast_worker_context", "malv.vault_scope_flags"],
    preferredTier: "hybrid",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: false,
    minimumInferenceResponsiveness: "interactive",
    enhancedCapabilityPath: { preferredTier: "gpu", minimumCapabilityClass: "enhanced" },
    handoffTargets: ["context_assembly", "quality_verification", "knowledge"],
    outputContractKey: "malv.conversation.v1",
    safetyRules: [
      "MALV-single-voice framing only",
      "Vault sessions: avoid long-form recall commitments in frame",
      "Latency-sensitive surfaces: minimize optional work"
    ],
    telemetryFieldIds: ["conv.stance", "conv.clarify_candidates", "conv.outline_slots"],
    successCriteriaIds: ["conversation.frame_present", "conversation.latency_respected"]
  },
  knowledge: {
    name: "Knowledge Agent",
    mission: "Assemble structured knowledge shaping: retrieval posture, grounded synthesis mode, and explicit caveats when evidence is thin.",
    ownedTaskClasses: ["knowledge_assembly"],
    visibility: "internal",
    allowedTools: ["malv.beast_worker_context", "malv.workspace_task_hints"],
    preferredTier: "gpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "deep",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: false,
    minimumInferenceResponsiveness: "balanced",
    enhancedCapabilityPath: { preferredTier: "gpu", minimumCapabilityClass: "enhanced" },
    handoffTargets: ["quality_verification", "planning", "conversation"],
    outputContractKey: "malv.knowledge.v1",
    safetyRules: [
      "Mark ungrounded claims",
      "No fabricated citations",
      "Vault: minimize persistent knowledge writes"
    ],
    telemetryFieldIds: ["know.retrieval_shape", "know.grounding_mode", "know.caveat_count"],
    successCriteriaIds: ["knowledge.bundle_present", "knowledge.caveats_when_ungrounded"]
  },
  planning: {
    name: "Planning Agent",
    mission: "Produce bounded, phased actionable plans with explicit checkpoints and risk-aware sequencing.",
    ownedTaskClasses: ["planning"],
    visibility: "internal",
    allowedTools: ["malv.sandbox_policy_gate", "malv.workspace_task_hints"],
    preferredTier: "gpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "deep",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "balanced",
    enhancedCapabilityPath: { preferredTier: "gpu", minimumCapabilityClass: "enhanced" },
    concurrentInferSlots: 2,
    handoffTargets: ["execution_prep", "quality_verification", "sandbox_action"],
    outputContractKey: "malv.planning.v1",
    safetyRules: [
      "Cap phase count",
      "High risk: mandatory verify phase",
      "Plans are advisory until approved executors run"
    ],
    telemetryFieldIds: ["plan.phase_count", "plan.risk_band", "plan.bounded"],
    successCriteriaIds: ["plan.phases_bounded", "plan.high_risk_has_verify"]
  },
  execution_prep: {
    name: "Execution Agent",
    mission: "Prepare execution-oriented intelligence: preconditions, blockers, and approval checkpoints without bypassing sandbox.",
    ownedTaskClasses: ["execution_preparation"],
    visibility: "internal",
    allowedTools: ["malv.sandbox_policy_gate", "malv.workspace_task_hints"],
    preferredTier: "cpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "balanced",
    handoffTargets: ["sandbox_action", "policy_safety_review", "quality_verification"],
    outputContractKey: "malv.execution_prep.v1",
    safetyRules: [
      "Never set executable truth without explicit approval signals",
      "External/device paths remain blocked by default"
    ],
    telemetryFieldIds: ["exec.blocker_count", "exec.checkpoint_count", "exec.sandbox_ready_hint"],
    successCriteriaIds: ["execution_prep.preconditions_listed", "execution_prep.no_false_executable"]
  },
  context_assembly: {
    name: "Context Assembly Agent",
    mission: "Decide relevance priorities, suppression rules, and bounded context slots for downstream synthesis.",
    ownedTaskClasses: ["context_packaging"],
    visibility: "internal",
    allowedTools: ["malv.beast_worker_context", "malv.vault_scope_flags"],
    preferredTier: "cpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: false,
    minimumInferenceResponsiveness: "interactive",
    handoffTargets: ["conversation", "knowledge", "response_composer"],
    outputContractKey: "malv.context_assembly.v1",
    safetyRules: [
      "Vault-sensitive: strict priority ordering",
      "Never exfiltrate vault markers to unsafe surfaces"
    ],
    telemetryFieldIds: ["ctx.slot_count", "ctx.suppression_count", "ctx.budget_band"],
    successCriteriaIds: ["context.bundle_present", "context.vault_suppression_when_scoped"]
  },
  memory_shaping: {
    name: "Memory Agent",
    mission: "Distinguish transient, session, and long-lived memory injection with vault and privacy boundaries.",
    ownedTaskClasses: ["memory_scoping"],
    visibility: "internal",
    allowedTools: ["malv.vault_scope_flags", "malv.beast_worker_context"],
    preferredTier: "cpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: false,
    minimumInferenceResponsiveness: "interactive",
    handoffTargets: ["privacy", "context_assembly"],
    outputContractKey: "malv.memory_shaping.v1",
    safetyRules: [
      "Vault: disable durable memory promotion by default",
      "User deletion signals must be respected downstream"
    ],
    telemetryFieldIds: ["mem.transient", "mem.session", "mem.long_term_eligible"],
    successCriteriaIds: ["memory.vault_disables_durable", "memory.session_always_on_context"]
  },
  quality_verification: {
    name: "Verification Agent",
    mission: "Check completeness, coherence, and readiness against stated requirements with conservative gaps.",
    ownedTaskClasses: ["verification"],
    visibility: "internal",
    allowedTools: ["malv.none_advisory_only"],
    preferredTier: "cpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: false,
    minimumInferenceResponsiveness: "interactive",
    handoffTargets: ["response_composer", "fallback_recovery", "planning"],
    outputContractKey: "malv.quality_verification.v1",
    safetyRules: [
      "Verification is advisory; never silently rewrite user content",
      "Empty candidates must fail closed with explicit gaps"
    ],
    telemetryFieldIds: ["verify.pass", "verify.gap_count", "verify.coherence_band"],
    successCriteriaIds: ["verify.gaps_when_empty", "verify.coherence_scored"]
  },
  privacy: {
    name: "Privacy Agent",
    mission: "Enforce privacy boundaries, vault-sensitive suppression directives, and telemetry redaction hints.",
    ownedTaskClasses: ["privacy_suppression"],
    visibility: "internal",
    allowedTools: ["malv.vault_scope_flags", "malv.task_router"],
    preferredTier: "cpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: false,
    minimumInferenceResponsiveness: "interactive",
    handoffTargets: ["policy_safety_review", "memory_shaping", "context_assembly"],
    outputContractKey: "malv.privacy.v1",
    safetyRules: [
      "Default-safe suppression on PII-like patterns when vault or privacy flags set",
      "Never log raw secrets; emit pattern classes only"
    ],
    telemetryFieldIds: ["priv.suppress_long_term", "priv.mask_classes", "priv.redact_telemetry"],
    successCriteriaIds: ["privacy.directives_present", "privacy.vault_suppresses_durable"]
  }
};

export type MalvSuccessCriterionResult = {
  id: string;
  passed: boolean;
  detail: string;
};

function payloadRecord(env: MalvAgentResultEnvelope): Record<string, unknown> {
  return env.payload && typeof env.payload === "object" ? (env.payload as Record<string, unknown>) : {};
}

/** Deterministic success checks per Stage-1 agent (no LLM). */
export function evaluateStage1SuccessCriteria(
  kind: MalvStage1CoreRuntimeKind,
  env: MalvAgentResultEnvelope
): MalvSuccessCriterionResult[] {
  const p = payloadRecord(env);

  const results: MalvSuccessCriterionResult[] = [];

  const add = (id: string, passed: boolean, detail: string) => results.push({ id, passed, detail });

  switch (kind) {
    case "router": {
      const triage = p["triage"];
      const signals = p["routeStrategy"];
      add("router.signals_non_empty", Array.isArray(triage) && triage.length > 0, "triage array");
      add(
        "router.handoffs_safe",
        !(env.handoffs ?? []).some((h) => h.to === "sandbox_action"),
        "no direct sandbox handoff from router"
      );
      add("router.strategy_present", signals != null && typeof signals === "object", "routeStrategy object");
      break;
    }
    case "smart_decision": {
      add("decision.profile_present", typeof p["decisionProfile"] === "object", "decisionProfile");
      const fp = p["decisionProfile"] as Record<string, unknown> | undefined;
      add(
        "decision.fallback_truthful",
        fp?.["fallbackTierIntent"] === "cpu" || fp?.["fallbackTierIntent"] === "gpu" || fp?.["fallbackTierIntent"] === "hybrid",
        "fallback tier enumerated"
      );
      break;
    }
    case "conversation": {
      add("conversation.frame_present", typeof p["conversationFrame"] === "object", "conversationFrame");
      add(
        "conversation.latency_respected",
        !env.executionMode || env.executionMode !== "realtime_assist" || typeof p["conversationFrame"] === "object",
        "frame exists for realtime mode"
      );
      break;
    }
    case "knowledge": {
      add("knowledge.bundle_present", typeof p["knowledgeBundle"] === "object", "knowledgeBundle");
      const kb = p["knowledgeBundle"] as Record<string, unknown> | undefined;
      const ungrounded = kb?.["groundingMode"] === "none" || kb?.["groundingMode"] === "thin";
      const caveats = kb?.["caveats"];
      add(
        "knowledge.caveats_when_ungrounded",
        !ungrounded || (Array.isArray(caveats) && caveats.length > 0),
        "caveats when ungrounded"
      );
      break;
    }
    case "planning": {
      const phases = p["phases"];
      add("plan.phases_bounded", Array.isArray(phases) && phases.length > 0 && phases.length <= 8, "phase cap");
      const risk = (p["riskBand"] as string) || "";
      add(
        "plan.high_risk_has_verify",
        risk !== "high" || (Array.isArray(phases) && phases.some((x) => String(x).toLowerCase().includes("verify"))),
        "verify phase for high risk"
      );
      break;
    }
    case "execution_prep": {
      add("execution_prep.preconditions_listed", Array.isArray(p["preconditions"]), "preconditions");
      add(
        "execution_prep.no_false_executable",
        env.truthState !== "executable" || p["approvalSignalsRequired"] === true,
        "executable only with explicit approval path"
      );
      break;
    }
    case "context_assembly": {
      add("context.bundle_present", typeof p["contextBundle"] === "object", "contextBundle");
      const b = p["contextBundle"] as Record<string, unknown> | undefined;
      const sup = (b?.["suppressions"] as string[] | undefined) ?? [];
      add(
        "context.vault_suppression_when_scoped",
        b?.["vaultScoped"] !== true || sup.some((s) => /vault|durable|long_term|pii/i.test(s)),
        "vault durable suppression hints"
      );
      break;
    }
    case "memory_shaping": {
      add(
        "memory.vault_disables_durable",
        env.policy !== "vault_scoped" || p["injectLongTerm"] === false,
        "vault disables durable promotion"
      );
      add("memory.session_always_on_context", typeof p["injectSession"] === "boolean", "session flag explicit");
      break;
    }
    case "quality_verification": {
      const summaryEcho = String(p["candidateEcho"] ?? "");
      const empty = summaryEcho.trim().length === 0;
      add("verify.gaps_when_empty", !empty || ((p["gaps"] as unknown[])?.length ?? 0) > 0, "gaps on empty candidate");
      add("verify.coherence_scored", typeof p["coherenceScore"] === "number", "coherenceScore numeric");
      break;
    }
    case "privacy": {
      add("privacy.directives_present", typeof p["privacyDirectives"] === "object", "privacyDirectives");
      const d = p["privacyDirectives"] as Record<string, unknown> | undefined;
      add(
        "privacy.vault_suppresses_durable",
        d?.["vaultScoped"] !== true || d?.["suppressLongTermWrite"] === true,
        "vault suppress durable"
      );
      break;
    }
  }

  return results;
}

export function stage1SchemaComplianceReport(kinds: MalvStage1CoreRuntimeKind[]): {
  version: typeof MALV_SPECIALIZED_AGENT_SCHEMA_VERSION;
  kinds: MalvStage1CoreRuntimeKind[];
  eachHasSchema: boolean;
} {
  return {
    version: MALV_SPECIALIZED_AGENT_SCHEMA_VERSION,
    kinds,
    eachHasSchema: kinds.every((k) => MALV_SPECIALIZED_AGENT_SCHEMA_BY_KIND[k] != null)
  };
}
