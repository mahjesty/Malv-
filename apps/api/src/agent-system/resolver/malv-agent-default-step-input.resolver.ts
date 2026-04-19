import type { MalvAgentKind, MalvAgentRequestContext, MalvTaskRouterDecision } from "../contracts/malv-agent.contracts";
import type { MalvAgentStepInputResolver } from "../lifecycle/malv-agent-lifecycle.service";
import type { MalvTaskRouterInput } from "../router/malv-task-router.service";

export type MalvDefaultResolverContext = {
  ctx: MalvAgentRequestContext;
  routerInput: MalvTaskRouterInput;
  decision: MalvTaskRouterDecision;
};

/**
 * Maps router output + request context into per-agent typed inputs for advisory lifecycle runs.
 * Beast / operators pass the same closure after `route()`; keeps execution bounded and testable.
 */
export function createMalvDefaultStepInputResolver(args: MalvDefaultResolverContext): MalvAgentStepInputResolver {
  return (kind, _step) => resolveMalvAgentStepInput(kind, args);
}

export function resolveMalvAgentStepInput(kind: MalvAgentKind, args: MalvDefaultResolverContext): unknown {
  const { ctx, routerInput, decision } = args;
  const text = routerInput.userText ?? "";
  const risk = decision.executionRisk;

  switch (kind) {
    case "router":
      return {
        userText: text,
        classified: routerInput.classified ?? null,
        executionStrategy: routerInput.executionStrategy ?? null
      };
    case "smart_decision":
      return {
        userText: text,
        workShape: decision.workShape,
        complexityScore: decision.complexityScore,
        resourceTier: decision.resourceTier,
        executionRisk: risk,
        multiAgent: decision.multiAgent,
        latencyMode: decision.latencyMode,
        classified: routerInput.classified ?? null,
        executionStrategy: routerInput.executionStrategy ?? null
      };
    case "conversation":
      return { userText: text, classified: routerInput.classified ?? null, surfacesTouched: [] };
    case "continuity":
      return { surfacesTouched: [] };
    case "knowledge":
      return {
        userText: text,
        topicHint: text.slice(0, 200),
        sourceCount: routerInput.memorySnippetCount ?? 0,
        workShape: decision.workShape
      };
    case "context_assembly":
      return {
        userText: text,
        surface: routerInput.surface,
        memorySnippetCount: routerInput.memorySnippetCount ?? 0,
        vaultScoped: routerInput.vaultScoped,
        codeLike: Boolean(routerInput.hasCodeKeywords)
      };
    case "privacy":
      return {
        userText: text,
        vaultScoped: routerInput.vaultScoped,
        privacySensitive: ctx.privacySensitive || routerInput.vaultScoped
      };
    case "memory_shaping":
      return {
        memorySnippetCount: routerInput.memorySnippetCount ?? 0,
        vaultScoped: routerInput.vaultScoped
      };
    case "response_composer":
      return { fragments: [{ source: "user", text }] };
    case "planning":
      return { goalSummary: text.slice(0, 2000), riskTier: risk };
    case "execution_prep":
      return {
        planSummary: text.slice(0, 2000),
        hasSandboxTarget: Boolean(routerInput.studioContext || decision.workShape === "studio_oriented")
      };
    case "sandbox_action":
      return { approved: false, actionSketch: text.slice(0, 500) };
    case "debug_code_intelligence":
      return { symptom: text.slice(0, 2000), languageHint: null };
    case "studio_builder":
      return { buildUnitId: null, intent: text.slice(0, 500) };
    case "inbox_triage":
      return { rawText: text };
    case "task_framing":
      return { titleHint: null, body: text };
    case "image_intelligence":
      return { userPrompt: text, hasSourceImage: false };
    case "multimodal_analysis":
      return { modalities: [routerInput.modality ?? "text"], summaryHint: text.slice(0, 200) };
    case "call_presence":
      return { callActive: Boolean(routerInput.callActive), inputMode: routerInput.inputMode ?? "text" };
    case "device_bridge_action":
      return { executionTarget: "unspecified", approvalRequired: true };
    case "research_synthesis":
      return { sourceCount: routerInput.memorySnippetCount ?? 0, topic: text.slice(0, 200) };
    case "policy_safety_review":
      return { proposedActionSummary: text.slice(0, 4000), riskTier: risk };
    case "quality_verification":
      return {
        requirements: decision.decompositionHints.length ? decision.decompositionHints.slice(0, 6) : ["address_user_message", "stay_consistent"],
        candidateSummary: text.slice(0, 4000)
      };
    case "growth_advisor":
      return { metricHint: decision.workShape };
    case "fallback_recovery":
      return { failureCodes: decision.reasonCodes.slice(0, 5) };
    case "coding":
    case "debug":
    case "system_design":
    case "designer":
    case "frontend_experience":
    case "animation":
    case "studio":
    case "website_builder":
    case "website_security":
    case "testing":
    case "qa":
      return {
        userText: text,
        workShape: decision.workShape,
        surface: routerInput.surface,
        complexityScore: decision.complexityScore,
        executionRisk: risk,
        vaultScoped: routerInput.vaultScoped,
        studioContext: Boolean(routerInput.studioContext),
        classified: routerInput.classified ?? null
      };
    default:
      return {};
  }
}
