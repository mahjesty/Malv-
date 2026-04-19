/**
 * MALV internal agent system — typed contracts (Stage 1–2).
 * Agents are specialized intelligence units; user-facing identity stays MALV.
 *
 * Discovery anchor: integrates with Beast orchestration, InferenceRoutingService (CPU/GPU tiers),
 * sandbox/policy paths, workspace productivity, explore-image, calls/voice hooks.
 */

/** Stable agent taxonomy — internal only, not user-facing personas. */
export type MalvAgentKind =
  | "router"
  /** Stage 1 — execution depth / phased preference / tier fallback shaping (CPU). */
  | "smart_decision"
  /** Stage 1 — MALV-single-voice conversation framing and continuity (hybrid→CPU fallback). */
  | "conversation"
  /** Stage 1 — grounded knowledge assembly + caveats (GPU→CPU fallback). */
  | "knowledge"
  /** Stage 1 — relevance slots, suppressions, bounded context packaging. */
  | "context_assembly"
  /** Stage 1 — vault / PII suppression directives before policy review. */
  | "privacy"
  | "continuity"
  | "memory_shaping"
  | "response_composer"
  | "planning"
  | "execution_prep"
  | "sandbox_action"
  | "debug_code_intelligence"
  | "studio_builder"
  | "inbox_triage"
  | "task_framing"
  | "image_intelligence"
  | "multimodal_analysis"
  | "call_presence"
  | "device_bridge_action"
  | "research_synthesis"
  | "policy_safety_review"
  | "quality_verification"
  | "growth_advisor"
  | "fallback_recovery"
  /** Stage 2 — implementation planning / patch shaping (CCI & sandbox-aware, advisory). */
  | "coding"
  /** Stage 2 — diagnostic structure before CCI / worker fix paths. */
  | "debug"
  /** Stage 2 — architecture & integration boundaries. */
  | "system_design"
  /** Stage 2 — visual / product design direction. */
  | "designer"
  /** Stage 2 — UX flows, responsiveness, friction mapping. */
  | "frontend_experience"
  /** Stage 2 — motion, transitions, perf guardrails. */
  | "animation"
  /** Stage 2 — Studio targeting, inspect/diff/preview posture (complements studio_builder). */
  | "studio"
  /** Stage 2 — multi-page / funnel composition (marketing sites, app shells). */
  | "website_builder"
  /** Stage 2 — web threat model & hardening checklist. */
  | "website_security"
  /** Stage 2 — test strategy & coverage intent. */
  | "testing"
  /** Stage 2 — scenarios, failure surfaces, release readiness. */
  | "qa";

export type MalvAgentIdentity = {
  kind: MalvAgentKind;
  /** Stable id for telemetry/registry (e.g. malv.agent.continuity). */
  id: string;
  /** Short internal label for logs (not shown to end users as a persona). */
  internalLabel: string;
};

export type MalvAgentCapability = {
  id: string;
  description: string;
  /** Broad tags for router matching (deterministic). */
  tags: string[];
};

/** CPU/GPU/hybrid intent — complements InferenceRoutingService tier plans. */
export type MalvAgentRuntimeTierPreference = "cpu" | "gpu" | "hybrid" | "any";

export type MalvAgentExecutionMode =
  | "advisory"
  | "approval_required"
  | "executable"
  | "passive_analysis"
  | "realtime_assist"
  | "background_safe";

/**
 * Coarse truth / execution posture for auditability (not chain-of-thought).
 * Distinct from {@link MalvAgentGroundingLevel}.
 */
export type MalvAgentTruthState =
  | "advisory"
  | "partially_grounded"
  | "grounded"
  | "executable"
  | "executed"
  | "blocked"
  | "needs_approval";

export type MalvAgentGroundingLevel = "none" | "partial" | "full";

export type MalvAgentPolicyDisposition =
  | "allow_advisory"
  | "require_approval_before_execution"
  | "execution_blocked"
  | "sandbox_only"
  | "vault_scoped";

export type MalvAgentConfidence = {
  /** 0..1 — calibrated heuristically per agent; conservative defaults. */
  score: number;
  /** Non-reasoning audit line (safe for admin surfaces). */
  rationale: string;
};

export type MalvAgentEvidenceRef = {
  kind: "conversation_turn" | "file" | "task" | "sandbox_run" | "build_unit" | "call_session" | "internal";
  id?: string;
  label: string;
};

export type MalvAgentObservation = {
  summary: string;
  evidence?: MalvAgentEvidenceRef[];
};

export type MalvAgentHandoff = {
  to: MalvAgentKind;
  reason: string;
  /** Structured hints only — no free-form model reasoning. */
  payload?: Record<string, unknown>;
};

export type MalvAgentPlanFragment = {
  phase: string;
  intent: string;
  suggestedAgents?: MalvAgentKind[];
  riskNotes?: string[];
};

export type MalvAgentTraceSpan = {
  agentKind: MalvAgentKind;
  startedAtMs: number;
  finishedAtMs: number;
  tierUsed: MalvAgentRuntimeTierPreference;
  status: "ok" | "partial" | "failed" | "skipped" | "timeout" | "cancelled";
  reasonCode?: string;
};

export type MalvAgentTelemetry = {
  traceId: string;
  spans: MalvAgentTraceSpan[];
  routeReasonCodes: string[];
  degradation: "none" | "tier_fallback" | "partial_plan" | "timeout" | "cancelled";
};

export type MalvWorkSurface =
  | "chat"
  | "task"
  | "inbox"
  | "studio"
  | "image"
  | "call"
  | "voice"
  | "device"
  | "bridge"
  | "execution"
  | "research"
  | "unknown";

export type MalvWorkShape =
  | "chat_response"
  | "task_oriented"
  | "image_oriented"
  | "studio_oriented"
  | "inbox_oriented"
  | "call_oriented"
  | "device_oriented"
  | "execution_oriented"
  | "research_oriented"
  /** Stage 2 — systems / platform design requests. */
  | "architecture_oriented"
  /** Stage 2 — marketing / multi-page web builds. */
  | "website_oriented"
  /** Stage 2 — UI/UX + optional motion. */
  | "frontend_oriented"
  /** Stage 2 — test + QA emphasis. */
  | "quality_oriented"
  /** Stage 2 — code change / feature implementation (non-Studio surface). */
  | "coding_oriented"
  /** Stage 2 — defect / failure diagnosis. */
  | "debug_oriented";

export type MalvInputModality = "text" | "voice" | "video" | "image" | "file" | "multimodal";

export type MalvAgentRequestContext = {
  traceId: string;
  userId?: string | null;
  workspaceId?: string | null;
  conversationId?: string | null;
  vaultSessionId?: string | null;
  vaultScoped: boolean;
  callId?: string | null;
  surface: MalvWorkSurface;
  /** Latency-sensitive surfaces (call/voice/live). */
  latencySensitive: boolean;
  /** Privacy / vault-sensitive routing. */
  privacySensitive: boolean;
  /** Abort cooperative cancellation. */
  signal?: AbortSignal;
  /** Bounded clock for tests. */
  nowMs?: number;
  /** Optional structured hooks from Beast/meta-intelligence (opaque JSON). */
  continuityHook?: Record<string, unknown> | null;
  externalExecutionHook?: Record<string, unknown> | null;
  realtimeCallHook?: Record<string, unknown> | null;
};

export type MalvAgentPartialStatus = "complete" | "partial" | "empty" | "timeout" | "cancelled" | "error";

export type MalvAgentResultEnvelope<TPayload = unknown> = {
  agentKind: MalvAgentKind;
  identity: MalvAgentIdentity;
  truthState: MalvAgentTruthState;
  grounding: MalvAgentGroundingLevel;
  confidence: MalvAgentConfidence;
  policy: MalvAgentPolicyDisposition;
  executionMode: MalvAgentExecutionMode;
  tierPreference: MalvAgentRuntimeTierPreference;
  tierUsed?: MalvAgentRuntimeTierPreference;
  payload: TPayload;
  observations?: MalvAgentObservation[];
  handoffs?: MalvAgentHandoff[];
  planFragments?: MalvAgentPlanFragment[];
  /** Safe, concise — never model chain-of-thought. */
  advisoryForUi?: Record<string, unknown>;
  partialStatus: MalvAgentPartialStatus;
  errorCode?: string;
  errorMessage?: string;
};

export type MalvAgentPlanStep = {
  order: number;
  agentKind: MalvAgentKind;
  tierOverride?: MalvAgentRuntimeTierPreference;
  /** Steps with same group may run in parallel when lifecycle allows. */
  parallelGroup?: number;
  mode: MalvAgentExecutionMode;
};

export type MultiAgentExecutionPlan = {
  planId: string;
  steps: MalvAgentPlanStep[];
  maxParallelGroups: number;
  maxSteps: number;
  notes?: string[];
};

export type MalvTaskRouterDecision = {
  decisionId: string;
  surface: MalvWorkSurface;
  workShape: MalvWorkShape;
  /** Single vs multi-agent orchestration. */
  multiAgent: boolean;
  /** Recommended tier for the heavy leg (router-level; refined by InferenceRoutingService). */
  resourceTier: MalvAgentRuntimeTierPreference;
  executionMode: MalvAgentExecutionMode;
  complexityScore: number;
  modality: MalvInputModality;
  urgency: "low" | "normal" | "high";
  latencyMode: "normal" | "low_latency";
  privacyMode: "standard" | "vault_sensitive";
  executionRisk: "low" | "medium" | "high";
  reasonCodes: string[];
  decompositionHints: string[];
  /** Downstream MALV paths — advisory mapping only; real gating stays in sandbox/CCI/workspace. */
  malvExecutionPathHints: Array<
    "beast_worker" | "phased_chat" | "local_inference" | "sandbox_policy" | "cci" | "workspace_task" | "explore_image" | "voice_realtime" | "device_bridge"
  >;
  plan: MultiAgentExecutionPlan;
  /** Confidence in routing itself (not content truth). */
  routerConfidence: MalvAgentConfidence;
  telemetry: MalvAgentTelemetry;
};
