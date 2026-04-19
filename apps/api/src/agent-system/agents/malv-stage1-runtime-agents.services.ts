import { Injectable } from "@nestjs/common";
import type { ClassifiedIntent } from "../../beast/intent-understanding.types";
import type { ExecutionStrategyResult } from "../../beast/execution-strategy.service";
import type {
  MalvAgentRequestContext,
  MalvAgentResultEnvelope,
  MalvAgentPartialStatus,
  MalvWorkShape,
  MalvWorkSurface,
  MalvAgentRuntimeTierPreference
} from "../contracts/malv-agent.contracts";
import {
  agentIdentity,
  assertNotAborted,
  envelopeBase,
  malvAgentDefaultConfidence,
  type MalvAgentContract
} from "../foundation/malv-base-agent";

export type MalvSmartDecisionAgentInput = {
  userText: string;
  workShape: MalvWorkShape;
  complexityScore: number;
  resourceTier: MalvAgentRuntimeTierPreference;
  executionRisk: "low" | "medium" | "high";
  multiAgent: boolean;
  latencyMode: "normal" | "low_latency";
  classified?: ClassifiedIntent | null;
  executionStrategy?: ExecutionStrategyResult | null;
};

export type MalvConversationAgentInput = {
  userText: string;
  classified?: ClassifiedIntent | null;
  surfacesTouched?: string[];
};

export type MalvKnowledgeAgentInput = {
  userText: string;
  topicHint: string;
  sourceCount: number;
  workShape: MalvWorkShape;
};

export type MalvContextAssemblyAgentInput = {
  userText: string;
  surface: MalvWorkSurface;
  memorySnippetCount: number;
  vaultScoped: boolean;
  codeLike: boolean;
};

export type MalvPrivacyAgentInput = {
  userText: string;
  vaultScoped: boolean;
  privacySensitive: boolean;
};

function okEnvelope<T>(
  kind: MalvAgentResultEnvelope["agentKind"],
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
    tierUsed: MalvAgentResultEnvelope<T>["tierUsed"];
    advisoryForUi: Record<string, unknown>;
    partialStatus: MalvAgentPartialStatus;
    handoffs: MalvAgentResultEnvelope<T>["handoffs"];
  }> = {}
): MalvAgentResultEnvelope<T> {
  const identity = agentIdentity(kind, id, label);
  return {
    ...envelopeBase({
      identity,
      truthState: opts.truthState ?? "advisory",
      grounding: opts.grounding ?? "partial",
      confidence: malvAgentDefaultConfidence(opts.confidence ?? 0.72, opts.rationale ?? "heuristic_stage1"),
      policy: opts.policy ?? "allow_advisory",
      executionMode: opts.executionMode ?? "advisory",
      tierPreference: opts.tier ?? "cpu",
      tierUsed: opts.tierUsed,
      partialStatus: opts.partialStatus ?? "complete"
    }),
    payload,
    advisoryForUi: opts.advisoryForUi,
    handoffs: opts.handoffs
  };
}

const PII_LIKE = /\b(ssn|social security|credit card|cvv|password|api[_-]?key|secret|bearer\s+[a-z0-9_-]{20,})\b/i;

@Injectable()
export class MalvSmartDecisionAgentService implements MalvAgentContract<MalvSmartDecisionAgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("smart_decision", "malv.agent.smart_decision", "Smart decision");

  async execute(
    ctx: MalvAgentRequestContext,
    input: MalvSmartDecisionAgentInput
  ): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const t = input.userText ?? "";
    const lower = t.toLowerCase();
    const questionHeavy = (t.match(/\?/g) ?? []).length >= 2 || /\b(clarify|what do you mean|which one)\b/i.test(t);
    const longForm = t.length > 2400;

    let executionDepth: "shallow" | "standard" | "deep" = "standard";
    if (input.complexityScore >= 0.72 || longForm) executionDepth = "deep";
    else if (input.complexityScore < 0.35 && !input.multiAgent) executionDepth = "shallow";

    const preferPhasedChat =
      input.executionStrategy?.mode === "phased" ||
      (input.multiAgent && input.complexityScore >= 0.55) ||
      /\b(step by step|phased|iterate|sprint)\b/i.test(lower);

    const clarifyFirst =
      input.executionStrategy?.mode === "require_clarification" || (questionHeavy && input.executionRisk !== "high");

    /** Truthful fallback: if latency-critical, CPU; else mirror router tier with conservative CPU bias on vault. */
    let fallbackTierIntent: MalvAgentRuntimeTierPreference = input.resourceTier;
    if (input.latencyMode === "low_latency") fallbackTierIntent = "cpu";
    else if (ctx.vaultScoped && input.resourceTier === "gpu") fallbackTierIntent = "cpu";
    else if (input.resourceTier === "hybrid" && input.complexityScore < 0.5) fallbackTierIntent = "cpu";

    const mergeStrategy: "single_pass" | "sequential_merge" | "parallel_shallow_merge" =
      input.latencyMode === "low_latency"
        ? "single_pass"
        : preferPhasedChat
          ? "sequential_merge"
          : input.multiAgent
            ? "parallel_shallow_merge"
            : "single_pass";

    const decisionProfile = {
      executionDepth,
      preferPhasedChat,
      clarifyFirst,
      fallbackTierIntent,
      mergeStrategy,
      executionModeHint: clarifyFirst ? "advisory" : input.executionRisk === "high" ? "approval_required" : "advisory",
      reasoningSignals: {
        complexityScore: input.complexityScore,
        multiAgent: input.multiAgent,
        workShape: input.workShape,
        questionHeavy,
        longForm
      }
    };

    return okEnvelope("smart_decision", this.identity.id, this.identity.internalLabel, { decisionProfile }, {
      tier: "cpu",
      tierUsed: "cpu",
      confidence: 0.84,
      rationale: "deterministic_depth_and_merge",
      handoffs: [
        { to: "planning", reason: "deep_or_phased", payload: { preferPhasedChat } },
        { to: "conversation", reason: "clarify_or_frame", payload: { clarifyFirst } }
      ],
      advisoryForUi: { executionDepth, mergeStrategy }
    });
  }
}

@Injectable()
export class MalvConversationAgentService implements MalvAgentContract<MalvConversationAgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("conversation", "malv.agent.conversation", "Conversation");

  async execute(
    ctx: MalvAgentRequestContext,
    input: MalvConversationAgentInput
  ): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const hook = ctx.continuityHook as { activeSurface?: string; lastAssistantTurnId?: string } | null | undefined;
    const active = hook?.activeSurface ?? "chat";
    const surfaces = input.surfacesTouched?.length ? input.surfacesTouched.join(",") : active;

    const intent = input.classified?.primaryIntent ?? null;
    const lower = input.userText.toLowerCase();
    const imperative = /^(please\s+)?(add|fix|create|update|delete|run|deploy|implement)\b/i.test(input.userText.trim());

    let stance: "assistive" | "collaborative" | "directive_light" = "assistive";
    if (imperative && input.classified?.complexity !== "high") stance = "directive_light";
    else if (input.classified?.complexity === "high") stance = "collaborative";

    const continuityMarkers = [
      `surface=${surfaces}`,
      ctx.vaultScoped ? "vault_context=active" : "vault_context=off",
      hook?.lastAssistantTurnId ? `continuity_ref=present` : "continuity_ref=cold"
    ];

    const clarificationCandidates: string[] = [];
    if (/\b(this|that|it)\b/i.test(lower) && lower.split(/\s+/).length < 12) {
      clarificationCandidates.push("Resolve vague referents (this/that/it) against last turn or selection.");
    }
    if (input.classified?.scopeSize === "large" && !/\b(scope|phase|mvp)\b/i.test(lower)) {
      clarificationCandidates.push("Confirm scope boundaries or MVP slice.");
    }

    const responseOutline = [
      "Acknowledge objective in one line",
      intent === "frontend_design"
        ? "Offer creative axis + constraint check"
        : "Answer core question with structured bullets",
      input.classified?.complexity === "high" ? "Surface risks + next verification step" : "Close with one crisp follow-up"
    ];

    const conversationFrame = {
      stance,
      continuityMarkers,
      clarificationCandidates,
      responseOutline,
      intentAlignment: intent ?? "unclassified"
    };

    const tier: MalvAgentRuntimeTierPreference = ctx.latencySensitive ? "cpu" : "hybrid";
    const mode = ctx.latencySensitive ? "realtime_assist" : "advisory";

    return okEnvelope("conversation", this.identity.id, this.identity.internalLabel, { conversationFrame }, {
      tier,
      tierUsed: ctx.latencySensitive ? "cpu" : "hybrid",
      executionMode: mode,
      confidence: 0.78,
      rationale: "intent_and_surface_framing",
      handoffs: [{ to: "context_assembly", reason: "slot_packaging" }],
      grounding: "partial"
    });
  }
}

@Injectable()
export class MalvKnowledgeAgentService implements MalvAgentContract<MalvKnowledgeAgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("knowledge", "malv.agent.knowledge", "Knowledge");

  async execute(ctx: MalvAgentRequestContext, input: MalvKnowledgeAgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const grounded = input.sourceCount > 0 && !ctx.vaultScoped;
    const groundingMode: "full" | "partial" | "thin" | "none" = grounded ? (input.sourceCount >= 3 ? "full" : "partial") : input.workShape === "research_oriented" ? "thin" : "none";

    const caveats: string[] = [];
    if (groundingMode === "none" || groundingMode === "thin") {
      caveats.push("No indexed sources attached — treat as shaping only, not verified facts.");
    }
    if (ctx.vaultScoped) caveats.push("Vault session — avoid citing non-vault corpora as ground truth.");

    const knowledgeBundle = {
      retrievalShape: input.workShape === "research_oriented" ? "wide_then_narrow" : "local_conversation_first",
      synthesisMode: groundingMode === "none" ? "hypothesis_only" : "grounded_merge",
      groundingMode,
      caveats,
      topicEcho: input.topicHint.slice(0, 160)
    };

    const preferGpu = !ctx.latencySensitive && groundingMode !== "none";
    const tier: MalvAgentRuntimeTierPreference = preferGpu ? "gpu" : "cpu";

    return okEnvelope("knowledge", this.identity.id, this.identity.internalLabel, { knowledgeBundle }, {
      tier,
      tierUsed: tier,
      truthState: groundingMode === "full" ? "partially_grounded" : "advisory",
      confidence: grounded ? 0.68 : 0.52,
      rationale: grounded ? "sources_present" : "ungrounded_explicit",
      handoffs: [{ to: "quality_verification", reason: "grounding_check" }]
    });
  }
}

@Injectable()
export class MalvContextAssemblyAgentService implements MalvAgentContract<MalvContextAssemblyAgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("context_assembly", "malv.agent.context_assembly", "Context assembly");

  async execute(
    ctx: MalvAgentRequestContext,
    input: MalvContextAssemblyAgentInput
  ): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const suppressions: string[] = [];
    if (input.vaultScoped) suppressions.push("vault_durable_memory_promotion");
    if (PII_LIKE.test(input.userText)) suppressions.push("pii_class_echo_to_telemetry");
    if (ctx.privacySensitive) suppressions.push("narrow_third_party_tool_hints");

    const prioritySlots = [
      "user_goal",
      input.codeLike ? "repro_and_env" : "constraints",
      input.memorySnippetCount > 0 ? "recent_memory_snippets" : "session_tail",
      "policy_and_safety_boundary"
    ];

    const tokenBudgetBand: "tight" | "normal" | "roomy" =
      input.surface === "call" || input.surface === "voice" ? "tight" : input.userText.length > 3500 ? "roomy" : "normal";

    const contextBundle = {
      prioritySlots,
      suppressions,
      tokenBudgetBand,
      relevanceNotes: [
        "Prefer last explicit user constraint over older assistant speculation.",
        input.codeLike ? "Keep stack traces and file paths verbatim in slot, not paraphrased." : "Keep user vocabulary for product terms."
      ],
      vaultScoped: input.vaultScoped
    };

    return okEnvelope("context_assembly", this.identity.id, this.identity.internalLabel, { contextBundle }, {
      tier: "cpu",
      tierUsed: "cpu",
      policy: input.vaultScoped ? "vault_scoped" : "allow_advisory",
      confidence: 0.81,
      rationale: "bounded_slot_template",
      handoffs: [{ to: "response_composer", reason: "compose_from_slots" }]
    });
  }
}

@Injectable()
export class MalvPrivacyAgentService implements MalvAgentContract<MalvPrivacyAgentInput, Record<string, unknown>> {
  readonly identity = agentIdentity("privacy", "malv.agent.privacy", "Privacy");

  async execute(ctx: MalvAgentRequestContext, input: MalvPrivacyAgentInput): Promise<MalvAgentResultEnvelope<Record<string, unknown>>> {
    assertNotAborted(ctx);
    const maskClasses: string[] = [];
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(input.userText)) maskClasses.push("ssn_like");
    if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(input.userText)) maskClasses.push("card_like");
    if (/\b(sk_live_|sk_test_|Bearer\s+[a-zA-Z0-9_-]{20,})\b/.test(input.userText)) maskClasses.push("credential_like");

    const suppressLongTermWrite = input.vaultScoped || input.privacySensitive || maskClasses.length > 0;
    const redactTelemetry = maskClasses.length > 0 || input.privacySensitive;

    const privacyDirectives = {
      suppressLongTermWrite,
      maskClasses,
      allowedSurfaces: input.vaultScoped ? ["chat", "vault_scoped_tools"] : ["chat", "workspace", "studio", "explore"],
      redactTelemetry,
      vaultScoped: input.vaultScoped,
      userTextClassOnly: maskClasses.length > 0 ? "may_contain_sensitive_patterns" : "no_high_risk_patterns_heuristic"
    };

    return okEnvelope("privacy", this.identity.id, this.identity.internalLabel, { privacyDirectives }, {
      tier: "cpu",
      tierUsed: "cpu",
      policy: input.vaultScoped ? "vault_scoped" : "allow_advisory",
      confidence: 0.9,
      rationale: "pattern_class_scan",
      handoffs: [
        { to: "policy_safety_review", reason: "post_privacy_policy" },
        { to: "memory_shaping", reason: "durable_write_gate" }
      ]
    });
  }
}

export const MALV_STAGE1_RUNTIME_AGENT_PROVIDERS = [
  MalvSmartDecisionAgentService,
  MalvConversationAgentService,
  MalvKnowledgeAgentService,
  MalvContextAssemblyAgentService,
  MalvPrivacyAgentService
] as const;
