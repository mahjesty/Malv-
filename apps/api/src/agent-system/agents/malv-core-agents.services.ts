import { Injectable } from "@nestjs/common";
import type { ClassifiedIntent } from "../../beast/intent-understanding.types";
import type { ExecutionStrategyResult } from "../../beast/execution-strategy.service";
import type {
  MalvAgentKind,
  MalvAgentHandoff,
  MalvAgentPlanFragment,
  MalvAgentRequestContext,
  MalvAgentResultEnvelope,
  MalvAgentPartialStatus,
  MalvAgentRuntimeTierPreference
} from "../contracts/malv-agent.contracts";
import {
  agentIdentity,
  assertNotAborted,
  envelopeBase,
  malvAgentDefaultConfidence,
  type MalvAgentContract
} from "../foundation/malv-base-agent";

/** Shared typed inputs — keep narrow and extensible. */
export type MalvRouterAgentInput = {
  userText: string;
  classified?: ClassifiedIntent | null;
  executionStrategy?: ExecutionStrategyResult | null;
};

export type MalvContinuityAgentInput = {
  surfacesTouched?: string[];
};

export type MalvMemoryShapingAgentInput = {
  memorySnippetCount: number;
  vaultScoped: boolean;
};

export type MalvResponseComposerAgentInput = {
  fragments: Array<{ source: string; text: string }>;
};

export type MalvPlanningAgentInput = {
  goalSummary: string;
  riskTier: "low" | "medium" | "high";
};

export type MalvExecutionPrepAgentInput = {
  planSummary: string;
  hasSandboxTarget: boolean;
};

export type MalvSandboxActionAgentInput = {
  approved: boolean;
  actionSketch?: string;
};

export type MalvDebugCodeAgentInput = {
  symptom: string;
  languageHint?: string | null;
};

export type MalvStudioBuilderAgentInput = {
  buildUnitId?: string | null;
  intent: string;
};

export type MalvInboxTriageAgentInput = {
  rawText: string;
};

export type MalvTaskFramingAgentInput = {
  titleHint?: string | null;
  body: string;
};

export type MalvImageIntelligenceAgentInput = {
  userPrompt: string;
  hasSourceImage: boolean;
};

export type MalvMultimodalAnalysisAgentInput = {
  modalities: string[];
  summaryHint?: string | null;
};

export type MalvCallPresenceAgentInput = {
  callActive: boolean;
  inputMode: string;
};

export type MalvDeviceBridgeAgentInput = {
  executionTarget: string;
  approvalRequired: boolean;
};

export type MalvResearchSynthesisAgentInput = {
  sourceCount: number;
  topic: string;
};

export type MalvPolicySafetyAgentInput = {
  proposedActionSummary: string;
  riskTier: "low" | "medium" | "high";
};

export type MalvQualityVerificationAgentInput = {
  requirements: string[];
  candidateSummary: string;
};

export type MalvGrowthAdvisorAgentInput = {
  metricHint?: string | null;
};

export type MalvFallbackRecoveryAgentInput = {
  failureCodes: string[];
  partialOutputs?: number;
};

function okEnvelope<T>(
  kind: MalvAgentKind,
  id: string,
  label: string,
  payload: T,
  opts: Partial<{
    truthState: MalvAgentResultEnvelope<T>["truthState"];
    grounding: MalvAgentResultEnvelope<T>["grounding"];
    confidence: number;
    rationale: string;
    policy: MalvAgentResultEnvelope<T>["policy"];
    executionMode: MalvAgentResultEnvelope<T>["executionMode"];
    tier: MalvAgentResultEnvelope<T>["tierPreference"];
    tierUsed: MalvAgentRuntimeTierPreference;
    advisoryForUi: Record<string, unknown>;
    partialStatus: MalvAgentPartialStatus;
    planFragments: MalvAgentPlanFragment[];
    handoffs: MalvAgentHandoff[];
  }> = {}
): MalvAgentResultEnvelope<T> {
  const identity = agentIdentity(kind, id, label);
  return {
    ...envelopeBase({
      identity,
      truthState: opts.truthState ?? "advisory",
      grounding: opts.grounding ?? "partial",
      confidence: malvAgentDefaultConfidence(opts.confidence ?? 0.72, opts.rationale ?? "heuristic_default"),
      policy: opts.policy ?? "allow_advisory",
      executionMode: opts.executionMode ?? "advisory",
      tierPreference: opts.tier ?? "cpu",
      tierUsed: opts.tierUsed,
      partialStatus: opts.partialStatus ?? "complete"
    }),
    payload,
    advisoryForUi: opts.advisoryForUi,
    planFragments: opts.planFragments,
    handoffs: opts.handoffs
  };
}

@Injectable()
export class MalvRouterAgentService implements MalvAgentContract<MalvRouterAgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("router", "malv.agent.router", "Router");

  async execute(ctx: MalvAgentRequestContext, input: MalvRouterAgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const triage: string[] = [];
    if (input.classified) {
      triage.push(`intent=${input.classified.primaryIntent}`);
      triage.push(`complexity=${input.classified.complexity}`);
      triage.push(`scope=${input.classified.scopeSize}`);
    }
    if (input.executionStrategy?.mode === "require_clarification") triage.push("clarification_gate");
    if (input.executionStrategy?.mode === "phased") triage.push("phased_strategy");
    if (input.executionStrategy?.riskTier === "high") triage.push("high_risk_strategy");
    if (triage.length === 0) triage.push("intent=unclassified");

    const text = input.userText ?? "";
    const signalHits: string[] = [];
    if (/\?/.test(text)) signalHits.push("question");
    if (/\b(code|patch|diff|typescript|react|sandbox)\b/i.test(text)) signalHits.push("engineering");
    if (/\b(image|diagram|screenshot|png)\b/i.test(text)) signalHits.push("visual");
    if (/\b(schedule|calendar|remind|tomorrow)\b/i.test(text)) signalHits.push("time_coordination");

    const routeStrategy = {
      suggestedDepth: text.length > 3000 || input.classified?.complexity === "high" ? "deep" : text.length < 80 ? "shallow" : "standard",
      secondarySignals: signalHits,
      latencyBudget: ctx.latencySensitive ? "tight_ms" : "normal",
      modalityHint: ctx.surface === "image" ? "image" : "text_first"
    };

    const complexity = input.classified?.complexity ?? "low";

    return okEnvelope("router", this.identity.id, this.identity.internalLabel, { triage, routeStrategy, signalHits }, {
      tier: "cpu",
      confidence: 0.88,
      rationale: "structured_triage_and_route_signals",
      advisoryForUi: { complexity, signalHits },
      handoffs: [{ to: "smart_decision", reason: "depth_and_merge", payload: { triageHead: triage[0] } }]
    });
  }
}

@Injectable()
export class MalvContinuityAgentService implements MalvAgentContract<MalvContinuityAgentInput, { bridgeSummary: string }> {
  readonly identity = agentIdentity("continuity", "malv.agent.continuity", "Continuity");

  async execute(ctx: MalvAgentRequestContext, input: MalvContinuityAgentInput): Promise<MalvAgentResultEnvelope<{ bridgeSummary: string }>> {
    assertNotAborted(ctx);
    const hook = ctx.continuityHook as { activeSurface?: string } | null | undefined;
    const active = hook?.activeSurface ?? "chat";
    const surfaces = input.surfacesTouched?.length ? input.surfacesTouched.join(",") : active;
    return okEnvelope("continuity", this.identity.id, this.identity.internalLabel, {
      bridgeSummary: `Surfaces: ${surfaces}; vaultScoped=${ctx.vaultScoped}`
    }, {
      tier: ctx.latencySensitive ? "cpu" : "hybrid",
      confidence: 0.7,
      rationale: "hook_structured_summary",
      grounding: "partial"
    });
  }
}

@Injectable()
export class MalvMemoryShapingAgentService implements MalvAgentContract<MalvMemoryShapingAgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("memory_shaping", "malv.agent.memory", "Memory shaping");

  async execute(ctx: MalvAgentRequestContext, input: MalvMemoryShapingAgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const injectLongTerm = !ctx.vaultScoped && !ctx.privacySensitive && input.memorySnippetCount > 0;
    const injectSession = true;
    const transientOnly = ctx.latencySensitive || ctx.surface === "call" || ctx.surface === "voice";
    const memoryScope = {
      transientEphemeral: transientOnly,
      sessionWorking: injectSession,
      longTermEligible: injectLongTerm,
      vaultPartition: ctx.vaultScoped ? "isolated" : "standard"
    };
    return okEnvelope("memory_shaping", this.identity.id, this.identity.internalLabel, {
      injectLongTerm,
      injectSession,
      memoryScope,
      redactForLogs: ctx.vaultScoped || ctx.privacySensitive
    }, {
      tier: "cpu",
      policy: ctx.vaultScoped ? "vault_scoped" : "allow_advisory",
      confidence: 0.82,
      rationale: "transient_session_durable_split",
      handoffs: [{ to: "privacy", reason: "durable_write_review" }]
    });
  }
}

@Injectable()
export class MalvResponseComposerAgentService implements MalvAgentContract<MalvResponseComposerAgentInput, { composedHint: string }> {
  readonly identity = agentIdentity("response_composer", "malv.agent.response_composer", "Response composer");

  async execute(ctx: MalvAgentRequestContext, input: MalvResponseComposerAgentInput): Promise<MalvAgentResultEnvelope<{ composedHint: string }>> {
    assertNotAborted(ctx);
    const hint = input.fragments.map((f) => `[${f.source}] ${f.text.slice(0, 200)}`).join("\n");
    const useGpu = input.fragments.reduce((n, f) => n + f.text.length, 0) > 4000;
    return okEnvelope("response_composer", this.identity.id, this.identity.internalLabel, { composedHint: hint || "(empty)" }, {
      tier: useGpu ? "gpu" : "cpu",
      confidence: 0.65,
      rationale: "length_heuristic",
      truthState: "advisory"
    });
  }
}

@Injectable()
export class MalvPlanningAgentService implements MalvAgentContract<MalvPlanningAgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("planning", "malv.agent.planning", "Planning");

  async execute(ctx: MalvAgentRequestContext, input: MalvPlanningAgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    let phases =
      input.riskTier === "high"
        ? ["audit", "plan", "checkpoint", "implement", "verify"]
        : ["plan", "implement", "verify"];
    if (phases.length > 6) phases = phases.slice(0, 6);
    const riskBand = input.riskTier;
    const acceptanceCriteria = [
      "Each phase has an observable output or artifact",
      "Rollback or abort path identified before implement",
      "Verification references the original goal summary"
    ];
    const boundedPlan = {
      maxPhases: 6,
      timeboxHint: ctx.latencySensitive ? "short_slices" : "standard_slices",
      riskBand
    };
    return okEnvelope("planning", this.identity.id, this.identity.internalLabel, { phases, riskBand, acceptanceCriteria, boundedPlan }, {
      tier: "gpu",
      executionMode: "advisory",
      confidence: 0.64,
      rationale: "risk_scaled_bounded_template",
      planFragments: phases.map((p) => ({ phase: p, intent: input.goalSummary.slice(0, 120) })),
      handoffs: [{ to: "execution_prep", reason: "plan_to_preconditions" }]
    });
  }
}

@Injectable()
export class MalvExecutionPrepAgentService implements MalvAgentContract<MalvExecutionPrepAgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("execution_prep", "malv.agent.execution_prep", "Execution prep");

  async execute(ctx: MalvAgentRequestContext, input: MalvExecutionPrepAgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const blockers: string[] = [];
    if (!input.hasSandboxTarget) blockers.push("no_sandbox_target_declared");
    if (!input.planSummary.trim()) blockers.push("empty_plan");
    const preconditions = [
      "Explicit user or policy-approved execution scope",
      input.hasSandboxTarget ? "Sandbox target registered in MALV Studio / workspace" : "Sandbox target must be declared before execution",
      "No high-risk financial or destructive intent without human checkpoint"
    ];
    const approvalSignalsRequired = true;
    const sandboxReadiness = input.hasSandboxTarget && input.planSummary.trim().length > 0 ? "likely" : "blocked";
    return okEnvelope("execution_prep", this.identity.id, this.identity.internalLabel, {
      blockers,
      preconditions,
      approvalSignalsRequired,
      sandboxReadiness
    }, {
      tier: "cpu",
      truthState: blockers.length ? "needs_approval" : "advisory",
      confidence: 0.8,
      rationale: "precondition_and_approval_gate",
      handoffs: [{ to: "sandbox_action", reason: "ready_for_policy_sandbox", payload: { sandboxReadiness } }]
    });
  }
}

@Injectable()
export class MalvSandboxActionAgentService implements MalvAgentContract<MalvSandboxActionAgentInput, { ready: boolean }> {
  readonly identity = agentIdentity("sandbox_action", "malv.agent.sandbox", "Sandbox action");

  async execute(ctx: MalvAgentRequestContext, input: MalvSandboxActionAgentInput): Promise<MalvAgentResultEnvelope<{ ready: boolean }>> {
    assertNotAborted(ctx);
    const ready = input.approved === true;
    return okEnvelope("sandbox_action", this.identity.id, this.identity.internalLabel, { ready }, {
      tier: "cpu",
      policy: "sandbox_only",
      executionMode: "approval_required",
      truthState: ready ? "executable" : "needs_approval",
      confidence: 0.9,
      rationale: "policy_gate_explicit"
    });
  }
}

@Injectable()
export class MalvDebugCodeIntelligenceAgentService implements MalvAgentContract<MalvDebugCodeAgentInput, { angles: string[] }> {
  readonly identity = agentIdentity("debug_code_intelligence", "malv.agent.debug", "Debug / code intelligence");

  async execute(ctx: MalvAgentRequestContext, input: MalvDebugCodeAgentInput): Promise<MalvAgentResultEnvelope<{ angles: string[] }>> {
    assertNotAborted(ctx);
    const deep = input.symptom.length > 400 || (input.languageHint?.length ?? 0) > 0;
    return okEnvelope("debug_code_intelligence", this.identity.id, this.identity.internalLabel, {
      angles: ["repro", "isolate", "minimal_patch", "verify"]
    }, {
      tier: deep ? "gpu" : "cpu",
      confidence: 0.62,
      rationale: "scope_heuristic"
    });
  }
}

@Injectable()
export class MalvStudioBuilderAgentService implements MalvAgentContract<MalvStudioBuilderAgentInput, { focus: string }> {
  readonly identity = agentIdentity("studio_builder", "malv.agent.studio", "Studio builder");

  async execute(ctx: MalvAgentRequestContext, input: MalvStudioBuilderAgentInput): Promise<MalvAgentResultEnvelope<{ focus: string }>> {
    assertNotAborted(ctx);
    return okEnvelope("studio_builder", this.identity.id, this.identity.internalLabel, {
      focus: input.buildUnitId ? `unit:${input.buildUnitId}` : "workspace_studio"
    }, {
      tier: "hybrid",
      confidence: 0.68,
      rationale: "studio_surface_default"
    });
  }
}

@Injectable()
export class MalvInboxTriageAgentService implements MalvAgentContract<MalvInboxTriageAgentInput, { urgency: string; category: string }> {
  readonly identity = agentIdentity("inbox_triage", "malv.agent.inbox", "Inbox triage");

  async execute(ctx: MalvAgentRequestContext, input: MalvInboxTriageAgentInput): Promise<MalvAgentResultEnvelope<{ urgency: string; category: string }>> {
    assertNotAborted(ctx);
    const urgent = /urgent|asap|today|blocking/i.test(input.rawText);
    return okEnvelope("inbox_triage", this.identity.id, this.identity.internalLabel, {
      urgency: urgent ? "high" : "normal",
      category: "unsorted"
    }, {
      tier: "cpu",
      confidence: 0.55,
      rationale: "keyword_triage_stub"
    });
  }
}

@Injectable()
export class MalvTaskFramingAgentService implements MalvAgentContract<MalvTaskFramingAgentInput, { title: string; acceptance: string[] }> {
  readonly identity = agentIdentity("task_framing", "malv.agent.task_framing", "Task framing");

  async execute(ctx: MalvAgentRequestContext, input: MalvTaskFramingAgentInput): Promise<MalvAgentResultEnvelope<{ title: string; acceptance: string[] }>> {
    assertNotAborted(ctx);
    const title = (input.titleHint?.trim() || input.body.slice(0, 80) || "Task").replace(/\s+/g, " ");
    return okEnvelope("task_framing", this.identity.id, this.identity.internalLabel, {
      title,
      acceptance: ["Outcome described", "Verification path identified"]
    }, {
      tier: "cpu",
      confidence: 0.7,
      rationale: "structured_stub"
    });
  }
}

@Injectable()
export class MalvImageIntelligenceAgentService implements MalvAgentContract<MalvImageIntelligenceAgentInput, { expansionLegs: string[] }> {
  readonly identity = agentIdentity("image_intelligence", "malv.agent.image", "Image intelligence");

  async execute(ctx: MalvAgentRequestContext, input: MalvImageIntelligenceAgentInput): Promise<MalvAgentResultEnvelope<{ expansionLegs: string[] }>> {
    assertNotAborted(ctx);
    const legs = input.hasSourceImage ? ["preserve_subject", "style_transfer", "composition"] : ["subject", "lighting", "composition"];
    return okEnvelope("image_intelligence", this.identity.id, this.identity.internalLabel, { expansionLegs: legs }, {
      tier: "gpu",
      confidence: 0.63,
      rationale: "multimodal_heavy_default"
    });
  }
}

@Injectable()
export class MalvMultimodalAnalysisAgentService implements MalvAgentContract<MalvMultimodalAnalysisAgentInput, { coverage: string }> {
  readonly identity = agentIdentity("multimodal_analysis", "malv.agent.multimodal", "Multimodal analysis");

  async execute(ctx: MalvAgentRequestContext, input: MalvMultimodalAnalysisAgentInput): Promise<MalvAgentResultEnvelope<{ coverage: string }>> {
    assertNotAborted(ctx);
    return okEnvelope("multimodal_analysis", this.identity.id, this.identity.internalLabel, {
      coverage: input.modalities.join("+") || "text"
    }, {
      tier: "gpu",
      grounding: "partial",
      confidence: 0.58,
      rationale: "modality_list_only"
    });
  }
}

@Injectable()
export class MalvCallPresenceAgentService implements MalvAgentContract<MalvCallPresenceAgentInput, { posture: string }> {
  readonly identity = agentIdentity("call_presence", "malv.agent.call", "Call / presence");

  async execute(ctx: MalvAgentRequestContext, input: MalvCallPresenceAgentInput): Promise<MalvAgentResultEnvelope<{ posture: string }>> {
    assertNotAborted(ctx);
    return okEnvelope("call_presence", this.identity.id, this.identity.internalLabel, {
      posture: input.callActive ? "realtime_concise" : "idle"
    }, {
      tier: "cpu",
      executionMode: "realtime_assist",
      confidence: 0.82,
      rationale: "latency_sensitive_surface"
    });
  }
}

@Injectable()
export class MalvDeviceBridgeActionAgentService implements MalvAgentContract<MalvDeviceBridgeAgentInput, { allowed: boolean }> {
  readonly identity = agentIdentity("device_bridge_action", "malv.agent.device_bridge", "Device / bridge");

  async execute(ctx: MalvAgentRequestContext, input: MalvDeviceBridgeAgentInput): Promise<MalvAgentResultEnvelope<{ allowed: boolean }>> {
    assertNotAborted(ctx);
    return okEnvelope("device_bridge_action", this.identity.id, this.identity.internalLabel, {
      allowed: false,
      executionTarget: input.executionTarget,
      approvalRequired: input.approvalRequired
    }, {
      tier: "cpu",
      policy: "require_approval_before_execution",
      truthState: "blocked",
      executionMode: "approval_required",
      confidence: 0.95,
      rationale: "no_unsafe_autonomous_device_execution",
      advisoryForUi: { externalOnly: true, autoExecuteAllowed: false }
    });
  }
}

@Injectable()
export class MalvResearchSynthesisAgentService implements MalvAgentContract<MalvResearchSynthesisAgentInput, { outline: string[] }> {
  readonly identity = agentIdentity("research_synthesis", "malv.agent.research", "Research synthesis");

  async execute(ctx: MalvAgentRequestContext, input: MalvResearchSynthesisAgentInput): Promise<MalvAgentResultEnvelope<{ outline: string[] }>> {
    assertNotAborted(ctx);
    return okEnvelope("research_synthesis", this.identity.id, this.identity.internalLabel, {
      outline: ["Sources indexed", "Claims mapped", "Gaps flagged"]
    }, {
      tier: "gpu",
      truthState: "partially_grounded",
      confidence: 0.55,
      rationale: "local_sources_only_no_web_claim",
      advisoryForUi: { sourceCount: input.sourceCount, topic: input.topic.slice(0, 120) }
    });
  }
}

@Injectable()
export class MalvPolicySafetyReviewAgentService implements MalvAgentContract<MalvPolicySafetyAgentInput, { verdict: "allow" | "review" | "block" }> {
  readonly identity = agentIdentity("policy_safety_review", "malv.agent.policy", "Policy / safety");

  async execute(ctx: MalvAgentRequestContext, input: MalvPolicySafetyAgentInput): Promise<MalvAgentResultEnvelope<{ verdict: "allow" | "review" | "block" }>> {
    assertNotAborted(ctx);
    let verdict: "allow" | "review" | "block" = "allow";
    if (/\b(rm -rf|delete all|format disk)\b/i.test(input.proposedActionSummary)) verdict = "block";
    else if (input.riskTier === "high") verdict = "review";
    return okEnvelope("policy_safety_review", this.identity.id, this.identity.internalLabel, { verdict }, {
      tier: "cpu",
      truthState: verdict === "block" ? "blocked" : verdict === "review" ? "needs_approval" : "advisory",
      confidence: 0.88,
      rationale: "risk_tier_rule"
    });
  }
}

@Injectable()
export class MalvQualityVerificationAgentService implements MalvAgentContract<MalvQualityVerificationAgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("quality_verification", "malv.agent.quality", "Quality verification");

  async execute(ctx: MalvAgentRequestContext, input: MalvQualityVerificationAgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const gaps: string[] = [];
    const summary = input.candidateSummary.trim();
    if (!summary) gaps.push("empty_candidate");
    const reqHits = input.requirements.filter((r) => {
      const needle = r.toLowerCase().slice(0, Math.min(8, r.length));
      return needle.length > 0 && summary.toLowerCase().includes(needle);
    });
    if (input.requirements.length > 0 && reqHits.length < Math.min(input.requirements.length, 2)) {
      gaps.push("requirement_coverage_uncertain");
    }
    const sentences = summary.split(/[.!?]+/).filter((s) => s.trim().length > 8);
    const coherenceScore = summary.length === 0 ? 0 : Math.min(1, 0.45 + sentences.length * 0.12 + Math.min(summary.length / 4000, 0.35));
    if (sentences.length === 1 && summary.length > 600) gaps.push("coherence_monolith_single_span");

    const pass = gaps.length === 0 && coherenceScore >= 0.45;

    return okEnvelope("quality_verification", this.identity.id, this.identity.internalLabel, {
      pass,
      gaps,
      coherenceScore,
      candidateEcho: summary.slice(0, 2000),
      readiness: pass ? "ok" : "needs_revision",
      requirementHits: reqHits.length
    }, {
      tier: "cpu",
      confidence: 0.74,
      rationale: "checklist_coherence_readiness",
      handoffs: pass ? [{ to: "response_composer", reason: "verified_compose" }] : [{ to: "planning", reason: "revise_for_gaps" }]
    });
  }
}

@Injectable()
export class MalvGrowthSelfImprovementAdvisorAgentService implements MalvAgentContract<MalvGrowthAdvisorAgentInput, { hints: string[] }> {
  readonly identity = agentIdentity("growth_advisor", "malv.agent.growth", "Growth advisor");

  async execute(ctx: MalvAgentRequestContext, _input: MalvGrowthAdvisorAgentInput): Promise<MalvAgentResultEnvelope<{ hints: string[] }>> {
    assertNotAborted(ctx);
    return okEnvelope("growth_advisor", this.identity.id, this.identity.internalLabel, {
      hints: ["Measure repeated failure codes", "Review routing tier fallbacks"]
    }, {
      tier: "cpu",
      executionMode: "background_safe",
      truthState: "advisory",
      policy: "allow_advisory",
      confidence: 0.5,
      rationale: "advisory_only_no_self_apply"
    });
  }
}

@Injectable()
export class MalvFallbackRecoveryAgentService implements MalvAgentContract<MalvFallbackRecoveryAgentInput, { recoverySteps: string[] }> {
  readonly identity = agentIdentity("fallback_recovery", "malv.agent.fallback", "Fallback recovery");

  async execute(ctx: MalvAgentRequestContext, input: MalvFallbackRecoveryAgentInput): Promise<MalvAgentResultEnvelope<{ recoverySteps: string[] }>> {
    assertNotAborted(ctx);
    return okEnvelope("fallback_recovery", this.identity.id, this.identity.internalLabel, {
      recoverySteps: [
        "Acknowledge partial completion",
        "Narrow scope or reduce tier",
        ...input.failureCodes.slice(0, 3).map((c) => `retry_subset:${c}`)
      ]
    }, {
      tier: "cpu",
      truthState: "advisory",
      partialStatus: input.partialOutputs ? "partial" : "complete",
      confidence: 0.66,
      rationale: "degraded_mode_truthful"
    });
  }
}

/** Nest provider registration list — order stable for deterministic registry iteration. */
export const MALV_CORE_AGENT_PROVIDERS = [
  MalvRouterAgentService,
  MalvContinuityAgentService,
  MalvMemoryShapingAgentService,
  MalvResponseComposerAgentService,
  MalvPlanningAgentService,
  MalvExecutionPrepAgentService,
  MalvSandboxActionAgentService,
  MalvDebugCodeIntelligenceAgentService,
  MalvStudioBuilderAgentService,
  MalvInboxTriageAgentService,
  MalvTaskFramingAgentService,
  MalvImageIntelligenceAgentService,
  MalvMultimodalAnalysisAgentService,
  MalvCallPresenceAgentService,
  MalvDeviceBridgeActionAgentService,
  MalvResearchSynthesisAgentService,
  MalvPolicySafetyReviewAgentService,
  MalvQualityVerificationAgentService,
  MalvGrowthSelfImprovementAdvisorAgentService,
  MalvFallbackRecoveryAgentService
] as const;

export type MalvCoreAgentServiceInstance =
  | MalvRouterAgentService
  | MalvContinuityAgentService
  | MalvMemoryShapingAgentService
  | MalvResponseComposerAgentService
  | MalvPlanningAgentService
  | MalvExecutionPrepAgentService
  | MalvSandboxActionAgentService
  | MalvDebugCodeIntelligenceAgentService
  | MalvStudioBuilderAgentService
  | MalvInboxTriageAgentService
  | MalvTaskFramingAgentService
  | MalvImageIntelligenceAgentService
  | MalvMultimodalAnalysisAgentService
  | MalvCallPresenceAgentService
  | MalvDeviceBridgeActionAgentService
  | MalvResearchSynthesisAgentService
  | MalvPolicySafetyReviewAgentService
  | MalvQualityVerificationAgentService
  | MalvGrowthSelfImprovementAdvisorAgentService
  | MalvFallbackRecoveryAgentService;
