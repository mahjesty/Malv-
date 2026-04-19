import { forwardRef, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { BeastWorkerClient, BeastInferenceResponse } from "./client/beast-worker.client";
import { MalvOperatorFallbackBrainService } from "./malv-operator-fallback-brain.service";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { MemoryService } from "../memory/memory.service";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { BeastActivityLogEntity } from "../db/entities/beast-activity-log.entity";
import { SuggestionRecordEntity } from "../db/entities/suggestion-record.entity";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { UserEntity } from "../db/entities/user.entity";
import { AiWorkerEntity } from "../db/entities/ai-worker.entity";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import type { GlobalRole } from "../workspace/workspace-access.service";
import { ChatContextAssemblyService, type MalvInputMetadata } from "./chat-context-assembly.service";
import { formatStructuredContextForPrompt } from "./structured-context";
import {
  buildMalvChatPrompt,
  buildStandardReasoningTrace,
  MALV_SYSTEM_ROLE_PROMPT,
  summarizeMalvPromptStructure
} from "./malv-brain-prompt";
import { classifyMalvMode, type ModeType } from "./mode-router";
import { buildExecutionPlan, formatExecutionPlanForTrace, shouldAttachExecutionPlan } from "./execution-plan";
import { appendBeastSuggestionBlock, detectBeastSignal } from "./beast-signal";
import {
  assertMalvAssistantIdentityGate,
  finalizeAssistantOutputWithMeta
} from "./malv-finalize-assistant-output.util";
import {
  analyzeUserTone,
  detectLightSocialMessage,
  detectMalvIdentityQuestion,
  detectSimpleGreeting,
  mergeExplicitMoodHint
} from "./malv-conversation-signals";
import { detectSocialSmalltalkCheckin } from "./malv-response-generator";
import { buildToneInstructionBlock, mapResponsePolicy } from "./malv-response-policy";
import { buildSuperFixPlan, buildSuperFixReasoningTrace, detectSuperFixIntent } from "./super-fix-planner";
import { SandboxExecutionService } from "../sandbox/sandbox-execution.service";
import { ReflectionService } from "../improvement/reflection.service";
import { MalvControlledConfigService } from "../improvement/malv-controlled-config.service";
import { IntentUnderstandingService } from "./intent-understanding.service";
import { SemanticInterpretationService } from "./semantic-interpretation.service";
import { ExecutionStrategyService } from "./execution-strategy.service";
import {
  buildAutonomousClarificationReply,
  buildAutonomousOrchestrationBlock,
  buildSoftDualIntentClarificationReply
} from "./autonomous-orchestration.prompt";
import { PhasedChatOrchestrationService } from "./phased-chat-orchestration.service";
import { MalvChatCciHandoffService } from "../code-change-intelligence/malv-chat-cci-handoff.service";
import { MetaIntelligenceRouterService } from "../intelligence/meta-intelligence-router.service";
import { ContinuityBridgeService } from "../intelligence/continuity-bridge.service";
import { MalvBridgeCapabilityResolverService } from "../execution-bridge/malv-bridge-capability-resolver.service";
import type { MetaIntelligenceDecision } from "../intelligence/meta-intelligence.types";
import { IntentDecompositionService } from "./intent-decomposition.service";
import { WorkspaceRuntimeSessionService } from "../workspace/workspace-runtime-session.service";
import { InferenceRoutingService, type InferenceRouteDecision } from "../inference/inference-routing.service";
import { LocalInferenceProvider } from "../inference/local-inference.provider";
import { malvLocalInferenceExecutionResultToWorkerResponse } from "../inference/malv-local-inference-execution-result";
import { buildOpenAiChatMessagesForLocalInference } from "../inference/local-inference-chat-messages.util";
import { resolveBeastWorkerBaseUrl } from "../inference/malv-inference-base-urls.util";
import type { MalvInferenceRoutingTelemetry } from "../inference/inference-provider.types";
import { executeMalvTieredWorkerInfer } from "../inference/malv-tiered-worker-infer.util";
import { malvChatTurnBackendSelection } from "./malv-chat-turn-backend.util";
import { sanitizeMalvChatAssistantMetaForUser } from "./malv-chat-assistant-meta-sanitize.util";
import { shapeMalvAssistantStreamDeltaForDelivery } from "./malv-stream-delivery-text-shaping.util";
import {
  filterMalvChatTierFailoverSteps,
  malvGpuTierEnabledFromEnv,
  malvGpuTierProbeWorkerHealthFromEnv,
  malvLocalInferenceChatPathBlockedFromEnv,
  malvShouldDeferApiLocalInferenceToVerifiedGpuWorkerFirst
} from "../inference/malv-chat-tier-availability.util";
import { malvEnvFirst, MALV_LOCAL_CPU_INFERENCE_ENV } from "../inference/malv-inference-env.util";
import type { MalvTaskRouterDecision } from "../agent-system/contracts/malv-agent.contracts";
import { MalvTaskRouterService } from "../agent-system/router/malv-task-router.service";
import { MalvAgentRuntimeTierBridgeService } from "../agent-system/tier/malv-agent-runtime-tier-bridge.service";
import { malvAgentChatRouterAttachEnabled, malvAgentSystemEnabled } from "../agent-system/malv-agent-system.config";
import { MALV_AGENT_KIND_INFERENCE_REQUIREMENTS } from "../inference/malv-agent-kind-inference-requirements";
import { aggregatePlanInferenceDemand } from "../inference/malv-inference-task-demand.util";
import { classifyMalvReflexTurn, type MalvReflexKind } from "./malv-reflex-turn.util";
import { buildDeterministicTemplateShortCircuit } from "./beast-template-short-circuit.util";
import { malvServerPhasedOrchestrationEligible } from "./malv-server-phased-eligibility.util";
import { resolveMalvCognitiveEffortTier, shouldSkipMetaIntelligenceRouter } from "./malv-cognitive-effort-tier";
import type { MalvCognitiveEffortTier } from "./malv-cognitive-effort-tier";
import { MALV_REFLEX_CLASSIFIED_INTENT_PLACEHOLDER, MALV_REFLEX_EXECUTION_STRATEGY_PLACEHOLDER } from "./malv-reflex-audit-stubs";
import type { MalvResponseRetryTrace, MalvTierCorrectionTrace } from "./malv-confidence-intelligence.util";
import {
  applyAgentRouterConfidenceAdjust,
  applyMalvTierStrategyCorrectionOnce,
  computeMalvConfidencePreResponse,
  detectIntentResponseShapeDrift,
  enrichMalvConfidenceWithMeta,
  evaluateResponseConfidence,
  finalizeMalvConfidenceWithResponse,
  shouldTriggerSoftConfidenceClarification
} from "./malv-confidence-intelligence.util";
import { malvConfidenceRefinementShouldBlock } from "./malv-confidence-refinement.guard";
import type { MalvLocalInferenceExecutionResult } from "../inference/malv-local-inference-execution-result";
import { MalvLearningService } from "../malv-learning/malv-learning.service";
import { malvDisableRefinementForTesting, malvSimulationEnabled } from "../common/malv-validation-flags.util";
import {
  formatUniversalCapabilityRoutingContextBlock,
  resolveMalvUniversalCapabilityRouteForWorkerPrompt,
  resolveUniversalMalvCapabilityRoute,
  universalCapabilityDemandPatch,
  type MalvUniversalCapabilityRoute
} from "./malv-universal-capability-router.util";
import { resolveMalvUniversalCapabilityExecutionOutcome } from "./malv-universal-capability-route-lifecycle.util";
import { shouldRelaxUniversalCapabilityChatInferenceDemand } from "./malv-universal-capability-inference-relaxation.util";
import { lastAssistantTurnLooksLikeMalvClarificationRequest } from "./malv-clarification-relief.util";
import { mergeMalvDirectiveExtras } from "./malv-broad-request-resolution.util";
import { composeMalvCapabilityRichDelivery } from "./malv-universal-capability-response-compose.util";
import { computeAdaptiveMaxTokens } from "./malv-adaptive-max-tokens.util";
import { detectMalvContinuationPlan } from "./malv-continuation.util";
import { applyMalvAssistantVisibleCompletionBackstop } from "./malv-turn-outcome-backstop.util";
import { runMalvChatWorkerAutoContinuation } from "./malv-chat-worker-auto-continuation.util";
import {
  applyMalvResponseReliabilityDeliveryPass,
  clampMalvResponseConfidenceByTier,
  type MalvGroundingTier
} from "./malv-response-reliability.util";
import { MalvResponsePlanningService } from "./malv-response-planning.service";
import { buildMalvResponsePlanPromptSection } from "./malv-response-planning.util";
import { shouldShowVisibleThought } from "./malv-visible-thought-eligibility";
import { generateVisibleThoughtLines } from "./malv-visible-thought-generator";
import { MalvResponseShapingLayerService } from "./malv-response-shaping-layer.service";
import { buildMalvResponsePipelineTrace } from "./malv-response-pipeline-trace.util";

type BeastLevel = "Passive" | "Smart" | "Advanced" | "Beast";

type ChatContext = {
  userId: string;
  conversationId: string | null;
  message: string;
  beastLevel: BeastLevel;
};

export type OperatorVoicePlan = {
  summary: string;
  typedActions?: Array<{
    actionType:
      | "read_file"
      | "write_file"
      | "patch_file"
      | "list_directory"
      | "search_repo"
      | "run_tests"
      | "inspect_logs"
      | "get_git_status"
      | "get_git_diff";
    parameters: Record<string, unknown>;
    scopeType?: "workspace" | "file" | "symbol" | "directory" | "repo";
    scopeRef?: string | null;
    metadata?: Record<string, unknown>;
  }>;
  requiresApproval: boolean;
};

export type HandleChatResult = {
  reply: string;
  meta?: Record<string, unknown>;
  runId: string;
  interrupted?: boolean;
};

export function finalizeWorkerReplyForDelivery(args: {
  workerRes: BeastInferenceResponse;
  priorAssistantTexts: string[];
  beastSuggestion?: string | null;
  universalCapabilityRoute?: MalvUniversalCapabilityRoute | null;
  /**
   * When true the orchestrator is serving a live WebSocket stream turn.  Model tokens were
   * already forwarded to the client, so shaping must not silently rewrite already-visible
   * text (e.g. hollow-opener stripping, leading word removal).
   */
  forLiveWebSocketDelivery?: boolean;
}): {
  workerRes: BeastInferenceResponse;
  malvRepetitionGuardTriggered: boolean;
  malvHadModelIdentityLeak: boolean;
} {
  const streamingDerived = Boolean(
    (args.workerRes.meta as Record<string, unknown> | undefined)?.malvLocalStreamingDerived ||
      (args.workerRes.meta as Record<string, unknown> | undefined)?.malvWorkerStreamedReply
  );
  const bundle = finalizeAssistantOutputWithMeta(args.workerRes.reply ?? "", {
    priorAssistantTexts: args.priorAssistantTexts,
    universalCapabilityRoute: args.universalCapabilityRoute ?? null,
    skipLeadingHollowOpenerStrip: args.forLiveWebSocketDelivery ?? false
  });
  const withBeast = appendBeastSuggestionBlock(bundle.text, args.beastSuggestion ?? null);
  const continuationPlan = detectMalvContinuationPlan({
    reply: withBeast,
    meta: (args.workerRes.meta ?? {}) as Record<string, unknown>
  });
  const existingOutcome = ((args.workerRes.meta as Record<string, unknown> | undefined)?.malvTurnOutcome as string | undefined)
    ?.trim()
    .toLowerCase();
  const normalizedOutcome =
    existingOutcome === "failed_before_output"
      ? "failed_before_output"
      : existingOutcome === "partial_done" || continuationPlan.canContinue
        ? "partial_done"
        : "complete";
  const finalMeta: Record<string, unknown> = {
    ...(args.workerRes.meta ?? {}),
    malvTurnOutcome: normalizedOutcome,
    malvShapingPolicy: streamingDerived ? "local_stream_shaped" : "local_non_stream_shaped",
    malvFinalIdentityEnforcementMode: bundle.identityEnforcementMode,
    malvContinuationPlan: continuationPlan
  };
  return {
    workerRes: { ...args.workerRes, reply: withBeast, meta: finalMeta },
    malvRepetitionGuardTriggered: bundle.repetitionGuardTriggered,
    malvHadModelIdentityLeak: bundle.hadModelIdentityLeak
  };
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as Error & { code?: string };
  return err.name === "AbortError" || err.code === "ABORT_ERR";
}

@Injectable()
export class BeastOrchestratorService {
  private readonly logger = new Logger(BeastOrchestratorService.name);

  /** Short TTL cache for worker GPU-tier reachability probes (reduces per-turn latency on chat hot path). */
  private chatGpuTierReachabilityCache: {
    cachedAtMs: number;
    value: { gpuTierReachable: boolean; unavailableReason: string | null };
  } | null = null;
  private static readonly CHAT_GPU_TIER_REACHABILITY_TTL_MS = 5_000;

  private buildRealtimeCallHook(inputMeta?: MalvInputMetadata | null, metaDecision?: MetaIntelligenceDecision | null) {
    const layer = metaDecision?.layerOutputs?.call_context as any;
    return {
      enabled: Boolean(inputMeta?.inputMode === "voice" || inputMeta?.inputMode === "video" || inputMeta?.callId),
      callId: inputMeta?.callId ?? null,
      inputMode: inputMeta?.inputMode ?? "text",
      callState: layer?.callState ?? "idle",
      presenceMode: layer?.presenceMode ?? "active",
      privacyFlags: layer?.callPrivacyFlags ?? []
    };
  }

  private buildExternalExecutionHook(metaDecision?: MetaIntelligenceDecision | null) {
    const layer = metaDecision?.layerOutputs?.device_control as any;
    return {
      enabled: Boolean(layer),
      executionTarget: layer?.executionTarget ?? "none",
      bridgeRoute: layer?.bridgeRoute ?? "none",
      approvalRequired: layer?.approvalRequired ?? false,
      executionRisk: layer?.executionRisk ?? "low",
      rollbackPlan: layer?.rollbackPlan ?? []
    };
  }

  private buildContinuityHook(metaDecision?: MetaIntelligenceDecision | null) {
    const layer = metaDecision?.layerOutputs?.chat_to_call_continuity as any;
    return {
      enabled: Boolean(layer),
      continuityState: layer?.continuityState ?? "stable",
      activeSurface: layer?.activeSurface ?? "chat",
      sessionScope: layer?.sessionScope ?? "single_surface",
      vaultBoundaryState: layer?.vaultBoundaryState ?? "inactive"
    };
  }

  private buildIntentDecompositionHook(message: string) {
    try {
      return this.intentDecomposition.decompose(message);
    } catch {
      return null;
    }
  }

  constructor(
    private readonly worker: BeastWorkerClient,
    private readonly fallbackBrain: MalvOperatorFallbackBrainService,
    private readonly killSwitch: KillSwitchService,
    private readonly cfg: ConfigService,
    private readonly memory: MemoryService,
    private readonly contextAssembly: ChatContextAssemblyService,
    @Inject(forwardRef(() => SandboxExecutionService))
    private readonly sandbox: SandboxExecutionService,
    private readonly reflection: ReflectionService,
    private readonly controlledConfig: MalvControlledConfigService,
    private readonly intentUnderstanding: IntentUnderstandingService,
    private readonly semanticInterpretation: SemanticInterpretationService,
    private readonly executionStrategy: ExecutionStrategyService,
    private readonly responsePlanning: MalvResponsePlanningService,
    private readonly responseShaperLayer: MalvResponseShapingLayerService,
    private readonly intentDecomposition: IntentDecompositionService,
    private readonly phasedChat: PhasedChatOrchestrationService,
    @Inject(forwardRef(() => MalvChatCciHandoffService))
    private readonly cciHandoff: MalvChatCciHandoffService,
    @InjectRepository(AiWorkerEntity) private readonly aiWorkers: Repository<AiWorkerEntity>,
    @InjectRepository(AiJobEntity) private readonly aiJobs: Repository<AiJobEntity>,
    @InjectRepository(BeastActivityLogEntity) private readonly beastLogs: Repository<BeastActivityLogEntity>,
    @InjectRepository(SuggestionRecordEntity) private readonly suggestions: Repository<SuggestionRecordEntity>,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    private readonly workspaceRuntimeSessions: WorkspaceRuntimeSessionService,
    @Inject(forwardRef(() => InferenceRoutingService))
    private readonly inferenceRouting: InferenceRoutingService,
    private readonly localInference: LocalInferenceProvider,
    private readonly malvTaskRouter: MalvTaskRouterService,
    private readonly malvAgentTierBridge: MalvAgentRuntimeTierBridgeService,
    private readonly malvLearning: MalvLearningService,
    @Optional() private readonly metaIntelligenceRouter?: MetaIntelligenceRouterService,
    @Optional() private readonly continuityBridge?: ContinuityBridgeService,
    @Optional() private readonly bridgeCapabilityResolver?: MalvBridgeCapabilityResolverService
  ) {}

  private privacyPolicyGate(_ctx: ChatContext, vaultScoped: boolean) {
    return {
      allowVault: vaultScoped,
      allowAdminScopes: false,
      allowUserScopes: true
    };
  }

  private taskClassifier(ctx: ChatContext, prompt: string) {
    const normalized = prompt.toLowerCase();
    const bl = ctx.beastLevel ?? "Smart";
    const heavySignals =
      normalized.includes("beast") ||
      normalized.includes("analyze") ||
      normalized.includes("plan") ||
      normalized.includes("long") ||
      normalized.length > 280;

    if (bl === "Beast" || bl === "Advanced") {
      if (normalized.length > 80 || heavySignals) return "beast" as const;
      return "light" as const;
    }
    if (bl === "Passive") {
      return heavySignals && normalized.length > 200 ? ("beast" as const) : ("light" as const);
    }
    return heavySignals ? ("beast" as const) : ("light" as const);
  }

  private replyModeFrom(args: { usedFallback: boolean; memoryCount: number; operatorHint: boolean }) {
    if (args.usedFallback) return "fallback_safe";
    if (args.operatorHint) return "operator_ready";
    if (args.memoryCount > 0) return "memory_enriched";
    return "standard";
  }

  private shouldAttachReasoningTrace(
    message: string,
    classifiedMode: "light" | "beast",
    companionLightTurn: boolean
  ): boolean {
    // Companion-light path: skip internal trace scaffolding unless the worker tier is already "beast".
    if (companionLightTurn) return classifiedMode === "beast";
    if (classifiedMode === "beast") return true;
    return (
      message.length > 220 ||
      message.split("\n").length > 4 ||
      /\b(plan|steps|analyze|architecture|design|fix|debug|implement|refactor|migrate)\b/i.test(message)
    );
  }

  private async routeToWorker(
    mode: "light" | "beast",
    aggregated: Record<string, unknown>,
    prompt: string,
    maxTokens: number,
    signal?: AbortSignal
  ) {
    const response: BeastInferenceResponse = await this.worker.infer({
      mode,
      prompt,
      maxTokens,
      context: aggregated,
      signal
    });
    return response;
  }

  private computeAdaptiveChatMaxTokens(args: {
    userMessage: string;
    conversationLength: number;
    modeType: ModeType;
    executionStrategyMode: "single_step" | "phased" | "require_clarification";
  }): number {
    const routeType = `${args.modeType}:${args.executionStrategyMode}`;
    return computeAdaptiveMaxTokens({
      userMessage: args.userMessage,
      conversationLength: args.conversationLength,
      routeType
    });
  }

  private async resolveChatGpuTierReachability(signal?: AbortSignal): Promise<{
    gpuTierReachable: boolean;
    unavailableReason: string | null;
  }> {
    const get = (k: string) => this.cfg.get<string>(k);
    if (!malvGpuTierEnabledFromEnv(get)) {
      return { gpuTierReachable: false, unavailableReason: "gpu_tier_disabled_by_env" };
    }
    if (signal?.aborted) {
      return { gpuTierReachable: false, unavailableReason: "aborted_before_gpu_gate" };
    }
    if (!malvGpuTierProbeWorkerHealthFromEnv(get)) {
      return { gpuTierReachable: true, unavailableReason: null };
    }
    const now = Date.now();
    const ttl = BeastOrchestratorService.CHAT_GPU_TIER_REACHABILITY_TTL_MS;
    if (
      this.chatGpuTierReachabilityCache &&
      now - this.chatGpuTierReachabilityCache.cachedAtMs < ttl
    ) {
      return this.chatGpuTierReachabilityCache.value;
    }
    try {
      const h = await this.worker.health();
      const ok = Boolean(h.reachable && h.inferenceReady);
      const value = ok
        ? { gpuTierReachable: true as const, unavailableReason: null as string | null }
        : {
            gpuTierReachable: false as const,
            unavailableReason: (h.primarySkipReason as string | null | undefined) ?? "worker_inference_not_ready"
          };
      this.chatGpuTierReachabilityCache = { cachedAtMs: now, value };
      return value;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      const value = {
        gpuTierReachable: false as const,
        unavailableReason: `worker_health_error:${m.replace(/\s+/g, " ").slice(0, 160)}`
      };
      this.chatGpuTierReachabilityCache = { cachedAtMs: now, value };
      return value;
    }
  }

  private patchChatMalvRoutingTelemetry(
    malvInfTrace: Record<string, unknown>,
    patch: Partial<MalvInferenceRoutingTelemetry>
  ) {
    const prev = (malvInfTrace["malvRouting"] ?? {}) as MalvInferenceRoutingTelemetry;
    malvInfTrace["malvRouting"] = { ...prev, ...patch };
  }

  private localInferenceResultAssistantText(r: MalvLocalInferenceExecutionResult): string {
    if (r.mode === "failed_before_output") return "";
    if (r.mode === "non_stream_complete") return (r.text ?? "").trim();
    return (r.accumulatedText ?? "").trim();
  }

  /**
   * At most one cheap local refinement pass when response heuristics look weak — avoids restarting streamed output.
   */
  private async maybeMalvConfidenceRefinementPass(args: {
    userMessage: string;
    baseReply: string;
    runId: string;
    cognitiveTier: MalvCognitiveEffortTier;
    malvCompanionLightTurn: boolean;
    internalPhaseCount: number;
    signal?: AbortSignal;
    onStreamAppend?: (text: string) => void;
  }): Promise<{ reply: string; trace: MalvResponseRetryTrace }> {
    if (malvDisableRefinementForTesting((k) => this.cfg.get<string>(k))) {
      return { reply: args.baseReply, trace: { triggered: false, kind: "none", detail: "disabled_by_validation_flag" } };
    }
    const base = args.baseReply.trim();
    if (!base) {
      return { reply: args.baseReply, trace: { triggered: false, kind: "none" } };
    }
    const responseConf = evaluateResponseConfidence({
      reply: base,
      userMessage: args.userMessage,
      cognitiveTier: args.cognitiveTier,
      internalPhaseCount: args.internalPhaseCount
    });
    if (responseConf >= 0.45) {
      return { reply: args.baseReply, trace: { triggered: false, kind: "none" } };
    }
    if (args.cognitiveTier >= 3) {
      return { reply: args.baseReply, trace: { triggered: false, kind: "none", detail: "tier3_skip_retry" } };
    }

    const apiLocalChatBlocked = malvLocalInferenceChatPathBlockedFromEnv((k) => this.cfg.get<string>(k));
    if (!this.localInference.isEnabled() || apiLocalChatBlocked) {
      return {
        reply: args.baseReply,
        trace: { triggered: false, kind: "none", detail: "no_local_for_refinement" }
      };
    }

    const skipProbe = this.localInference.skipHealthProbe();
    const health = skipProbe
      ? { ok: true as const }
      : await this.localInference.probeHealth(args.signal);
    if (!health.ok) {
      return {
        reply: args.baseReply,
        trace: { triggered: false, kind: "none", detail: "local_health_failed" }
      };
    }

    const deep = args.cognitiveTier >= 2 && !args.malvCompanionLightTurn;
    const system = deep
      ? "You add missing technical depth to a draft. Output ONLY new sentences to append (do not repeat the draft). If nothing material is missing, reply exactly NO_CHANGE. Max 120 words."
      : "You refine a draft answer for clarity. Output ONLY extra sentences to append, or exactly NO_CHANGE. Max 80 words.";
    const user = `User:\n${args.userMessage}\n\nDraft:\n${base}\n\nAppend missing material or NO_CHANGE.`;

    try {
      const exec = await this.localInference.executeChatCompletions({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        correlationId: `${args.runId}:malv_conf_refine`,
        signal: args.signal
      });
      if (exec.mode === "failed_before_output") {
        return {
          reply: args.baseReply,
          trace: { triggered: false, kind: "none", detail: exec.errorMessage }
        };
      }
      const addition = this.localInferenceResultAssistantText(exec);
      if (!addition || /^no_change\b/i.test(addition)) {
        return { reply: args.baseReply, trace: { triggered: false, kind: "none", detail: "refine_no_change" } };
      }
      const sep = base.endsWith("\n") ? "\n" : "\n\n";
      const merged = `${base}${sep}${addition}`;
      args.onStreamAppend?.(shapeMalvAssistantStreamDeltaForDelivery(`${sep}${addition}`));
      return {
        reply: merged,
        trace: { triggered: true, kind: "refine_append", detail: `local_refine_chars=${addition.length}` }
      };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[MALV_CONFIDENCE] refinement skipped: ${m}`);
      return { reply: args.baseReply, trace: { triggered: false, kind: "none", detail: "refine_error" } };
    }
  }

  private async runChatWorkerWithTierFailover(args: {
    routingDecision: InferenceRouteDecision;
    classifiedWorkerMode: "light" | "beast";
    neutralAggregated: Record<string, unknown>;
    aggregated: Record<string, unknown>;
    prompt: string;
    maxTokens: number;
    signal?: AbortSignal;
    malvInfTrace: Record<string, unknown>;
    /** When set (e.g. websocket chat), uses worker `POST /v1/infer/stream` instead of blocking JSON. */
    onWorkerStreamChunk?: (text: string) => void;
  }): Promise<BeastInferenceResponse> {
    const failover = args.routingDecision.chatTierFailover;
    if (failover && failover.plan.steps.length > 0) {
      const tiered = await executeMalvTieredWorkerInfer({
        infer: (req) => this.worker.infer(req),
        inferStream: args.onWorkerStreamChunk
          ? (req) =>
              this.worker.inferStream({
                mode: req.mode,
                prompt: req.prompt,
                maxTokens: req.maxTokens,
                context: req.context,
                signal: req.signal,
                onStreamDelta: req.onStreamDelta
              })
          : undefined,
        onStreamDelta: args.onWorkerStreamChunk,
        workerMode: args.classifiedWorkerMode,
        neutralContext: args.neutralAggregated,
        cpuSidecarPatch: failover.cpuSidecarPatch,
        steps: failover.plan.steps,
        prompt: args.prompt,
        maxTokens: args.maxTokens,
        signal: args.signal
      });
      this.patchChatMalvRoutingTelemetry(args.malvInfTrace, {
        malvSelectedTier: tiered.selectedTier,
        malvSelectedBackend: tiered.selectedBackendLabel,
        malvFallbackUsed: tiered.tierFallbackUsed,
        malvFallbackReason: tiered.tierFallbackReason
      });
      return tiered.response;
    }
    if (failover && failover.plan.steps.length === 0) {
      this.logger.warn(
        `[MALV_INFERENCE_ROUTE] transport=skipped_worker_tiers reason=no_tier_reachable_after_availability_gate`
      );
      return {
        reply: "",
        meta: { malvEmptyReason: "no_worker_tier_reachable_after_availability_gate" }
      };
    }
    if (args.onWorkerStreamChunk) {
      return this.worker.inferStream({
        mode: args.classifiedWorkerMode,
        prompt: args.prompt,
        maxTokens: args.maxTokens,
        context: args.aggregated,
        signal: args.signal,
        onStreamDelta: args.onWorkerStreamChunk
      });
    }
    return this.routeToWorker(args.classifiedWorkerMode, args.aggregated, args.prompt, args.maxTokens, args.signal);
  }

  planVoiceOperatorWorkflow(args: { utterance: string; context: Record<string, unknown> }): OperatorVoicePlan {
    const u = args.utterance.toLowerCase();
    const typedActions: NonNullable<OperatorVoicePlan["typedActions"]> = [{ actionType: "list_directory", parameters: { path: "." }, scopeType: "workspace" }];

    if (u.includes("debug") || u.includes("broken") || u.includes("error")) {
      typedActions.push({
        actionType: "run_tests",
        parameters: { framework: "jest", mode: "unit", allowWatch: false, updateSnapshots: false },
        scopeType: "repo"
      });
      typedActions.push({ actionType: "inspect_logs", parameters: { pattern: "error|exception|traceback|stack", limit: 120 }, scopeType: "repo" });
    } else if (u.includes("inspect") || u.includes("module") || u.includes("file")) {
      const targetFile = (args.context.selectedFile as string | undefined) ?? "";
      if (targetFile) {
        typedActions.push({ actionType: "read_file", parameters: { path: targetFile }, scopeType: "file", scopeRef: targetFile });
      }
      typedActions.push({ actionType: "search_repo", parameters: { query: "TODO|FIXME|function|class", limit: 200 }, scopeType: "repo" });
    } else if (u.includes("build")) {
      typedActions.push({ actionType: "get_git_status", parameters: {}, scopeType: "repo" });
      typedActions.push({ actionType: "inspect_logs", parameters: { pattern: "warn|error|failed", limit: 120 }, scopeType: "repo" });
    } else {
      typedActions.push({ actionType: "search_repo", parameters: { query: "TODO|FIXME|warning|error", limit: 200 }, scopeType: "repo" });
    }

    const requiresApproval = typedActions.some((a) => a.actionType === "write_file" || a.actionType === "patch_file");
    return {
      summary: `Voice operator plan generated with ${typedActions.length} typed action(s).`,
      typedActions,
      requiresApproval
    };
  }

  async handleChat(args: {
    userId: string;
    conversationId: string | null;
    message: string;
    beastLevel?: BeastLevel;
    userRole?: GlobalRole;
    workspaceId?: string | null;
    vaultSessionId?: string | null;
    assistantMessageId: string;
    abortSignal?: AbortSignal;
    inputMeta?: MalvInputMetadata | null;
    /** WebSocket: forward local inference SSE tokens as they arrive (orchestrator does not buffer for display). */
    onAssistantStreamChunk?: (evt: {
      conversationId: string;
      runId: string;
      text: string;
      done: false;
    }) => void;
  }): Promise<HandleChatResult> {
    this.logger.log(
      `[MALV E2E] orchestrator start userId=${args.userId} conversationId=${args.conversationId ?? "new"} messageLen=${args.message.length}`
    );
    this.logger.log(
      `[MALV BRAIN] chat request received userId=${args.userId} conversationId=${args.conversationId ?? "new"} messageLen=${args.message.length}`
    );

    const ctx: ChatContext = {
      userId: args.userId,
      conversationId: args.conversationId,
      message: args.message,
      beastLevel: args.beastLevel ?? "Smart"
    };

    await this.killSwitch.ensureSystemOnOrThrow({ reason: "chat_beast_dispatch" });

    if (!ctx.conversationId) {
      throw new Error("BeastOrchestratorService.handleChat requires a persisted conversationId");
    }
    const conversationId = ctx.conversationId;

    const startedAt = Date.now();

    // TTFT: worker registry warmup must not block the chat path (must not block: kill-switch already passed).
    void this.ensureWorkerOnline().catch((e) =>
      this.logger.warn(
        `[MALV BRAIN] ensureWorkerOnline failed (non-blocking): ${e instanceof Error ? e.message : String(e)}`
      )
    );

    let classifiedWorkerMode = this.taskClassifier(ctx, args.message);
    const modeType: ModeType = classifyMalvMode(args.message, args.inputMeta ?? null);
    const toneAnalysis = mergeExplicitMoodHint(analyzeUserTone(args.message), args.inputMeta?.userMoodHint ?? null);
    const superFix = detectSuperFixIntent(args.message, args.inputMeta ?? null);
    const superFixPlan = superFix ? buildSuperFixPlan(args.message) : null;

    const reflexKindPre = classifyMalvReflexTurn(args.message, {
      superFix,
      vaultSessionId: args.vaultSessionId,
      operatorPhase: args.inputMeta?.operatorPhase ?? null,
      exploreHandoffJson: args.inputMeta?.exploreHandoffJson ?? null,
      modeType,
      inputMode: args.inputMeta?.inputMode ?? null
    });
    if (reflexKindPre) {
      return await this.executeReflexLaneChatTurn({
        startedAt,
        args,
        ctx,
        conversationId,
        classifiedWorkerMode,
        modeType,
        toneAnalysis,
        reflexKind: reflexKindPre
      });
    }

    const learningHydrationBudgetMs = 45;
    const learningHydrationStartedAt = Date.now();
    if (malvSimulationEnabled((k) => this.cfg.get<string>(k), "MALV_SIMULATE_LEARNING_HYDRATION_TIMEOUT")) {
      await new Promise((resolve) => setTimeout(resolve, learningHydrationBudgetMs + 15));
    } else {
      await this.malvLearning.awaitLearningHydrationForTurn(args.userId, learningHydrationBudgetMs);
    }
    const learningHydrationWaitMs = Date.now() - learningHydrationStartedAt;
    const learningAdaptive = this.malvLearning.snapshotForUserWithSource(args.userId);
    const learningAdaptiveSnap = learningAdaptive.snapshot;

    let malvClassifiedIntent = this.intentUnderstanding.classify(args.message, args.inputMeta ?? null);
    const malvUniversalCapabilityRoute = resolveUniversalMalvCapabilityRoute(args.message);
    const malvUniversalCapabilityDemandPatch = universalCapabilityDemandPatch(malvUniversalCapabilityRoute);
    const capabilityOutcome = await resolveMalvUniversalCapabilityExecutionOutcome({
      userText: args.message,
      route: malvUniversalCapabilityRoute,
      signal: args.abortSignal
    });
    const malvCapabilityExecution = capabilityOutcome.execution;
    const malvUniversalCapabilityLifecycleTelemetry = capabilityOutcome.telemetry;
    const malvCapabilityPromptRoute = resolveMalvUniversalCapabilityRouteForWorkerPrompt(
      malvUniversalCapabilityRoute,
      malvCapabilityExecution
    );
    const malvCapabilityPromptContractDegraded =
      malvCapabilityPromptRoute.responseMode !== malvUniversalCapabilityRoute.responseMode;
    let malvExecutionStrategy = this.executionStrategy.buildStrategy(malvClassifiedIntent, {
      rawUserMessage: args.message,
      operatorPhase: args.inputMeta?.operatorPhase ?? null,
      superFix
    });
    let malvTierCorrectionTrace: MalvTierCorrectionTrace | null = null;
    if (!superFix && modeType !== "execute" && modeType !== "operator_workflow") {
      const tierFix = applyMalvTierStrategyCorrectionOnce({
        classified: malvClassifiedIntent,
        strategy: malvExecutionStrategy,
        rawMessage: args.message,
        modeType,
        superFix,
        adaptiveTierThresholds: learningAdaptiveSnap.tierThresholds
      });
      if (tierFix.correction) {
        malvExecutionStrategy = tierFix.strategy;
        malvTierCorrectionTrace = tierFix.correction;
      }
    }
    const malvCompanionLightTurn =
      !superFix &&
      malvExecutionStrategy.mode === "single_step" &&
      malvExecutionStrategy.internalPhases.length === 0;
    const malvContextAssemblyTier = malvCompanionLightTurn ? ("simple" as const) : ("full" as const);
    const cognitiveTierForMeta = resolveMalvCognitiveEffortTier({
      reflexLane: false,
      modeType,
      superFix,
      executionStrategyMode: malvExecutionStrategy.mode,
      internalPhaseCount: malvExecutionStrategy.internalPhases.length
    });
    const intentDecomposition = this.buildIntentDecompositionHook(args.message);
    const bridgeSessionId = ctx.conversationId ?? args.userId;
    try {
      await this.continuityBridge?.hydrate?.(args.userId, bridgeSessionId);
    } catch {
      // Non-blocking continuity hydrate.
    }
    const bridgePrev = this.continuityBridge?.getContext(bridgeSessionId, args.userId);
    const currentSurface = args.inputMeta?.inputMode === "voice" || args.inputMeta?.inputMode === "video" ? "call" : modeType === "execute" ? "execution" : "chat";
    if (this.continuityBridge && bridgePrev) {
      try {
        this.continuityBridge.transferContext(bridgePrev.lastSurface, currentSurface, bridgeSessionId, args.userId);
      } catch {
        // Non-blocking continuity bridge.
      }
    }
    let metaDecision: MetaIntelligenceDecision | null = null;
    const skipMetaIntelligence = shouldSkipMetaIntelligenceRouter({
      cognitiveTier: cognitiveTierForMeta,
      superFix,
      vaultSessionId: args.vaultSessionId,
      operatorPhase: args.inputMeta?.operatorPhase ?? null,
      modeType,
      inputMode: args.inputMeta?.inputMode ?? undefined
    });
    let bridgeAvailability: Array<"mobile_agent" | "desktop_agent" | "browser_agent" | "home_assistant_bridge"> = [];
    try {
      if (this.bridgeCapabilityResolver) {
        bridgeAvailability = await this.bridgeCapabilityResolver.resolveLiveBridgeIds(args.userId);
      }
    } catch {
      bridgeAvailability = [];
    }
    try {
      if (this.metaIntelligenceRouter && !skipMetaIntelligence) {
        metaDecision = this.metaIntelligenceRouter.decide({
          urgency: toneAnalysis.urgency,
          riskTier: malvExecutionStrategy.riskTier,
          modeType,
          tone: toneAnalysis.userTone,
          scopeSize: malvClassifiedIntent.scopeSize,
          evidenceLevel: malvExecutionStrategy.riskTier === "high" ? "weak" : malvExecutionStrategy.riskTier === "medium" ? "partial" : "strong",
          requestText: args.message,
          hasFiles: Boolean(args.inputMeta?.inputMode && args.inputMeta.inputMode !== "text"),
          memoryHint: Boolean(ctx.conversationId),
          inputMode: args.inputMeta?.inputMode ?? "text",
          sessionType: args.inputMeta?.sessionType ?? null,
          callId: args.inputMeta?.callId ?? null,
          operatorPhase: args.inputMeta?.operatorPhase ?? null,
          activeSurface:
            args.inputMeta?.inputMode === "voice" || args.inputMeta?.inputMode === "video"
              ? "call"
              : args.inputMeta?.operatorPhase
                ? "execution"
                : "chat",
          activeDevice: args.inputMeta?.inputMode === "voice" ? "phone" : args.inputMeta?.inputMode === "video" ? "desktop" : "unknown",
          bridgeAvailability,
          requestedExternalExecution: modeType === "execute" || /\bopen\b|\bsend\b|\bcall\b|\bturn on\b|\bturn off\b|\blaunch\b/i.test(args.message),
          vaultScoped: Boolean(args.vaultSessionId),
          sessionId: bridgeSessionId,
          continuityOwnerUserId: args.userId
        });
      }
    } catch (e) {
      this.logger.warn(`[MALV META] router disabled due to error: ${e instanceof Error ? e.message : String(e)}`);
      metaDecision = null;
    }
    let malvConfidence = computeMalvConfidencePreResponse({
      classified: malvClassifiedIntent,
      strategy: malvExecutionStrategy,
      rawMessage: args.message,
      tierCorrection: malvTierCorrectionTrace,
      cognitiveTier: cognitiveTierForMeta
    });
    malvConfidence = enrichMalvConfidenceWithMeta(malvConfidence, metaDecision, cognitiveTierForMeta);
    const responsePolicy = mapResponsePolicy(modeType, toneAnalysis, metaDecision);
    if (malvExecutionStrategy.preferBeastWorker && classifiedWorkerMode === "light") {
      classifiedWorkerMode = "beast";
    }

    const userRef = { id: args.userId } as any as UserEntity;
    const conversationRef = ({ id: conversationId } as any as ConversationEntity) as ConversationEntity;

    const aiJob = this.aiJobs.create({
      user: userRef,
      conversation: conversationRef as any,
      jobType: "beast_chat_infer",
      requestedMode: ctx.beastLevel,
      classifiedMode: classifiedWorkerMode,
      status: "running",
      progress: 8,
      shardKey: "beast_chat:normal",
      queuePriority: classifiedWorkerMode === "beast" ? 75 : 55,
        payload: {
        messagePreview: args.message.slice(0, 400),
        assistantMessageId: args.assistantMessageId,
        inputMeta: args.inputMeta ?? null,
        malvOperatorMode: modeType,
        malvUserTone: toneAnalysis.userTone,
        malvResponsePolicy: responsePolicy.primary
      },
      beastLevel: ctx.beastLevel
    });
    await this.aiJobs.save(aiJob);
    const runId = aiJob.id;
    this.logger.log(`[MALV BRAIN] conversation/run created runId=${runId} shard=${aiJob.shardKey}`);
    this.logger.log(
      `[MALV_UNIVERSAL_ROUTE_LIFECYCLE] runId=${runId} ${JSON.stringify(malvUniversalCapabilityLifecycleTelemetry)}`
    );

    this.realtime.emitMalvOrchestration(args.userId, {
      type: "thinking",
      conversationId: ctx.conversationId,
      messageId: args.assistantMessageId,
      phase: "analyzing_context",
      detail: `intent=${malvClassifiedIntent.primaryIntent} strategy=${malvExecutionStrategy.mode}`
    });

    const sessionPromise = this.workspaceRuntimeSessions
      .createSession({
        userId: args.userId,
        sourceType: "chat",
        sourceId: conversationId
      })
      .then((ws) => ws.id as string)
      .catch((e) => {
        this.logger.warn(
          `[MALV BRAIN] workspace runtime session ensure failed: ${e instanceof Error ? e.message : String(e)}`
        );
        return null as string | null;
      });

    // must block before first token: persisted run id for assistant FK + structured context for quality routing.
    const assemblyPromise = (async () => {
      try {
        return await this.contextAssembly.assemble({
          userId: args.userId,
          conversationId,
          userMessage: args.message,
          beastLevel: ctx.beastLevel,
          vaultSessionId: args.vaultSessionId ?? null,
          inputMeta: args.inputMeta ?? null,
          contextAssemblyTier: malvContextAssemblyTier,
          memoryCueLengthThreshold: learningAdaptiveSnap.tierThresholds.memoryMinimalLengthThreshold
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`[MALV CHAT] context assembly failed ${msg}`);
        return {
          priorMessages: [{ role: "user", content: args.message }],
          conversationTitle: null,
          conversationMode: "companion",
          memorySnippets: [],
          vaultScoped: false,
          beastLevel: ctx.beastLevel,
          userMessage: args.message,
          inputMeta: args.inputMeta ?? {},
          contextBlock: "",
          structured: {
            summary: "Context assembly failed; using message only.",
            relevantMemory: [],
            recentMessages: [{ role: "user", content: args.message }],
            signals: []
          },
          contextChars: 0,
          exploreFirstResponseAdvisory: null,
          exploreFirstResponsePolicyBlock: null
        };
      }
    })();

    const [chatRuntimeSessionId, assembled] = await Promise.all([sessionPromise, assemblyPromise]);

    const malvSemanticInterpretation = this.semanticInterpretation.aggregate({
      userMessage: args.message.trim(),
      classified: malvClassifiedIntent,
      broadRequestContext: { priorMessages: assembled.priorMessages },
      userReplyFollowsAssistantClarification: lastAssistantTurnLooksLikeMalvClarificationRequest(assembled.priorMessages)
    });
    const broadPromptPolicy = malvSemanticInterpretation.broadPromptPolicy;
    let clarificationReliefApplied = false;
    if (
      !superFix &&
      malvSemanticInterpretation.signals.clarificationReliefCandidate &&
      malvExecutionStrategy.mode === "require_clarification"
    ) {
      clarificationReliefApplied = true;
      malvExecutionStrategy = this.executionStrategy.buildStrategy(
        malvClassifiedIntent,
        {
          rawUserMessage: args.message,
          operatorPhase: args.inputMeta?.operatorPhase ?? null,
          superFix
        },
        { ambiguityEffective: malvSemanticInterpretation.ambiguity.forExecution }
      );
      malvClassifiedIntent = {
        ...malvClassifiedIntent,
        ambiguity: malvSemanticInterpretation.ambiguity.forExecution
      };
      if (!superFix && modeType !== "execute" && modeType !== "operator_workflow") {
        const tierFixAfterClarRelief = applyMalvTierStrategyCorrectionOnce({
          classified: malvClassifiedIntent,
          strategy: malvExecutionStrategy,
          rawMessage: args.message,
          modeType,
          superFix,
          adaptiveTierThresholds: learningAdaptiveSnap.tierThresholds
        });
        if (tierFixAfterClarRelief.correction) {
          malvExecutionStrategy = tierFixAfterClarRelief.strategy;
          malvTierCorrectionTrace = tierFixAfterClarRelief.correction;
        }
      }
      malvConfidence = computeMalvConfidencePreResponse({
        classified: malvClassifiedIntent,
        strategy: malvExecutionStrategy,
        rawMessage: args.message,
        tierCorrection: malvTierCorrectionTrace,
        cognitiveTier: cognitiveTierForMeta
      });
      malvConfidence = enrichMalvConfidenceWithMeta(malvConfidence, metaDecision, cognitiveTierForMeta);
    }
    const planningDecisionMode =
      malvExecutionStrategy.mode === "require_clarification"
        ? "clarify"
        : broadPromptPolicy.action === "guarded"
          ? "guarded"
          : "answer";
    const malvResponsePlan = this.responsePlanning.buildPlan({
      interpretation: malvSemanticInterpretation,
      decision: {
        mode: planningDecisionMode,
        answerPlan: malvExecutionStrategy.internalPhases
      }
    });
    const malvResponsePlanPromptBlock = buildMalvResponsePlanPromptSection(malvResponsePlan);

    // Emit user-facing visible thought lines only when eligible (complex/open/delegated turns).
    // This is the authoritative emission — the gateway no longer sends generic fallback steps.
    const visibleThoughtEligibility = shouldShowVisibleThought({
      classified: malvClassifiedIntent,
      interpretation: malvSemanticInterpretation,
      plan: malvResponsePlan,
      strategy: malvExecutionStrategy,
      decisionMode: planningDecisionMode,
      rawUserMessage: args.message
    });
    if (visibleThoughtEligibility.eligible) {
      const thoughtLines = generateVisibleThoughtLines({
        classified: malvClassifiedIntent,
        interpretation: malvSemanticInterpretation,
        plan: malvResponsePlan,
        strategy: malvExecutionStrategy,
        rawUserMessage: args.message
      });
      if (thoughtLines.length > 0) {
        this.realtime.emitMalvOrchestration(args.userId, {
          type: "thinking_state",
          conversationId: ctx.conversationId,
          messageId: args.assistantMessageId,
          steps: thoughtLines
        });
      }
    }

    this.logger.log(
      `[MALV_TTFT] runId=${runId} stage=context_assembled_ms=${Date.now() - startedAt} priorTurns=${assembled.priorMessages.length} memorySnippets=${assembled.memorySnippets.length}`
    );

    if (chatRuntimeSessionId) {
      this.realtime.emitMalvOrchestration(args.userId, {
        type: "runtime_update",
        conversationId: ctx.conversationId,
        messageId: args.assistantMessageId,
        payload: {
          kind: "session_bound",
          runtimeSessionId: chatRuntimeSessionId,
          runId,
          messageId: args.assistantMessageId,
          runtimeStatus: "running",
          runtimePhase: "inferencing",
          classifiedMode: classifiedWorkerMode,
          malvOperatorMode: modeType
        }
      });
    }

    const policy = this.privacyPolicyGate(ctx, assembled.vaultScoped);
    const simulatePolicyBlock = malvSimulationEnabled((k) => this.cfg.get<string>(k), "MALV_SIMULATE_POLICY_BLOCK");
    if (!policy.allowUserScopes || simulatePolicyBlock) {
      const reply = "That request is blocked by MALV policy gates for this session.";
      aiJob.status = "completed";
      aiJob.progress = 100;
      aiJob.resultReply = reply;
      aiJob.resultMeta = { malvReplySource: "policy_block", policyDenied: true };
      aiJob.finishedAt = new Date();
      await this.aiJobs.save(aiJob);
      this.logger.log(`[MALV BRAIN] policy block completed runId=${runId}`);
      void this.reflection.logChatReflection({
        userId: args.userId,
        correlationId: runId,
        success: false,
        latencyMs: Date.now() - startedAt,
        errorClass: "policy_block",
        summary: reply,
        metadata: { classifiedMode: classifiedWorkerMode }
      });
      return { reply, meta: sanitizeMalvChatAssistantMetaForUser(aiJob.resultMeta as Record<string, unknown>), runId };
    }

    this.logger.log(`[MALV BRAIN] context assembled runId=${runId} priorTurns=${assembled.priorMessages.length}`);

    const priorAssistantTexts = assembled.priorMessages
      .filter((m) => m.role === "assistant")
      .map((m) => String(m.content ?? "").trim())
      .filter((c) => c.length > 0);
    const isFirstThreadTurn = priorAssistantTexts.length === 0;
    const lightSocialKind = detectLightSocialMessage(args.message);
    const isGreeting = !lightSocialKind && detectSimpleGreeting(args.message);
    const identityKind = !lightSocialKind && !isGreeting ? detectMalvIdentityQuestion(args.message) : null;
    const socialSmalltalkCheckin =
      !lightSocialKind && !isGreeting && !identityKind && detectSocialSmalltalkCheckin(args.message);

    let superFixSandboxRunId: string | null = null;
    if (superFix && superFixPlan && args.workspaceId) {
      this.realtime.emitMalvOrchestration(args.userId, {
        type: "thinking",
        conversationId: ctx.conversationId,
        messageId: args.assistantMessageId,
        phase: "super_fix_execute",
        detail: "staging_read_only_sandbox"
      });
      try {
        const srun = await this.sandbox.createOperatorTaskSandboxRun({
          userId: args.userId,
          userRole: args.userRole,
          workspaceId: args.workspaceId,
          aiJobId: null,
          commands: [],
          typedActions: superFixPlan.readOnlyTypedActions,
          requiresApproval: false
        });
        superFixSandboxRunId = srun.id;
        this.logger.log(`[MALV SUPER FIX] sandbox staged sandboxRunId=${srun.id} correlation=${runId}`);
      } catch (e) {
        this.logger.warn(`[MALV SUPER FIX] sandbox staging failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (superFix && superFixPlan && !args.workspaceId) {
      this.logger.log(`[MALV SUPER FIX] skipping sandbox — no workspaceId on request`);
    }

    const autonomousOrchestrationBlock =
      !superFix && malvExecutionStrategy.mode !== "require_clarification"
        ? buildAutonomousOrchestrationBlock({
            classified: malvClassifiedIntent,
            strategy: malvExecutionStrategy
          })
        : null;

    let reasoningTrace: string | undefined;
    const execPlan = shouldAttachExecutionPlan(modeType, args.message)
      ? buildExecutionPlan({ userMessage: args.message, mode: modeType })
      : null;
    if (superFix && superFixPlan) {
      reasoningTrace = buildSuperFixReasoningTrace(superFixPlan);
    } else if (execPlan) {
      reasoningTrace = formatExecutionPlanForTrace(execPlan);
    } else if (this.shouldAttachReasoningTrace(args.message, classifiedWorkerMode, malvCompanionLightTurn)) {
      reasoningTrace = buildStandardReasoningTrace(modeType);
    }

    const [directiveExtra, cciHandoffOptional] = await Promise.all([
      this.controlledConfig.getDirectiveExtraText(),
      superFix
        ? Promise.resolve(null)
        : this.cciHandoff.maybeBuildHandoffContext({
            userId: args.userId,
            userRole: args.userRole ?? "user",
            workspaceId: args.workspaceId,
            message: args.message,
            assistantMessageId: args.assistantMessageId,
            primaryIntent: malvClassifiedIntent.primaryIntent,
            classifiedIntent: malvClassifiedIntent
          })
    ]);

    const directiveExtraMerged = mergeMalvDirectiveExtras(
      directiveExtra,
      broadPromptPolicy.action === "proceed" ? broadPromptPolicy.workerGuidance : null
    );

    let contextForPrompt = assembled.contextBlock;
    if (assembled.exploreFirstResponsePolicyBlock?.trim()) {
      contextForPrompt += `\n\n${assembled.exploreFirstResponsePolicyBlock.trim()}`;
    }
    if (superFixSandboxRunId) {
      contextForPrompt += `\n\nSuper Fix: a read-only sandbox run was staged (id=${superFixSandboxRunId}). Do not invent its output; tell the operator how to use the run and what to verify when it finishes.`;
    }

    let cciHandoffMeta: Record<string, unknown> = {};
    if (cciHandoffOptional) {
      contextForPrompt += `\n\n${cciHandoffOptional.contextAppend}`;
      cciHandoffMeta = cciHandoffOptional.metaPatch;
    }
    contextForPrompt += `\n\n${formatUniversalCapabilityRoutingContextBlock(malvCapabilityPromptRoute)}`;
    if (malvCapabilityPromptContractDegraded) {
      contextForPrompt += `\n\n### Capability execution truth (internal)\nA richer path was selected (**${malvUniversalCapabilityRoute.responseMode}**) but **no verified execution bundle** reached the model for this turn. Answer from general knowledge and the thread; do not imply live verification, retrieved pages, or attached images. Stay direct — no research-tour tone or search coaching.`;
    }
    if (malvCapabilityExecution.promptInjection.trim().length > 0) {
      const inj = malvCapabilityExecution.promptInjection.trim();
      contextForPrompt += `\n\n${inj}`;
    }

    /** Local OpenAI path: structured signals/memory without duplicating priorMessages thread. */
    const localContextBudget = malvCompanionLightTurn ? 3600 : 9000;
    const localStructuredBlock = formatStructuredContextForPrompt(assembled.structured, localContextBudget, {
      includeRecentThread: false
    });
    let localContextForPrompt = localStructuredBlock;
    if (assembled.exploreFirstResponsePolicyBlock?.trim()) {
      localContextForPrompt += `\n\n${assembled.exploreFirstResponsePolicyBlock.trim()}`;
    }
    if (superFixSandboxRunId) {
      localContextForPrompt += `\n\nSuper Fix: a read-only sandbox run was staged (id=${superFixSandboxRunId}). Do not invent its output; tell the operator how to use the run and what to verify when it finishes.`;
    }
    if (cciHandoffOptional) {
      localContextForPrompt += `\n\n${cciHandoffOptional.contextAppend}`;
    }
    localContextForPrompt += `\n\n${formatUniversalCapabilityRoutingContextBlock(malvCapabilityPromptRoute)}`;
    if (malvCapabilityPromptContractDegraded) {
      localContextForPrompt += `\n\n### Capability execution truth (internal)\nA richer path was selected (**${malvUniversalCapabilityRoute.responseMode}**) but **no verified execution bundle** reached the model for this turn. Answer from general knowledge and the thread; do not imply live verification, retrieved pages, or attached images. Stay direct — no research-tour tone or search coaching.`;
    }
    if (malvCapabilityExecution.promptInjection.trim().length > 0) {
      const inj = malvCapabilityExecution.promptInjection.trim();
      localContextForPrompt += `\n\n${inj}`;
    }

    this.realtime.emitMalvOrchestration(args.userId, {
      type: "memory_context",
      conversationId: ctx.conversationId,
      messageId: args.assistantMessageId,
      snippetCount: assembled.memorySnippets.length,
      vaultScoped: assembled.vaultScoped
    });

    const operatorHint =
      /\b(run tests?|build|debug|stack|sandbox|approve|deploy)\b/i.test(args.message) ||
      Boolean(args.inputMeta?.operatorPhase);

    const malvPromptEffort: "standard" | "economy" =
      malvCompanionLightTurn && cognitiveTierForMeta === 1 && modeType !== "execute" && modeType !== "operator_workflow"
        ? "economy"
        : "standard";

    const malvCapabilityRoutingPromptHook =
      malvCapabilityPromptRoute.responseMode === "plain_model"
        ? undefined
        : `Capability route: ${malvUniversalCapabilityRoute.responseMode}. Obey the "### MALV universal capability route" section inside the context summary.`;

    const malvServerPhasedEligible = malvServerPhasedOrchestrationEligible({
      phasedModuleEnabled: this.phasedChat.isEnabled(),
      executionStrategyMode: malvExecutionStrategy.mode,
      superFix,
      internalPhaseCount: malvExecutionStrategy.internalPhases.length
    });
    /**
     * Phase 5 transport parity: phased orchestration is not suppressed for WebSocket. WS still forwards
     * live worker tokens when the worker streams; phased steps use discrete infer calls and the final
     * combined reply is delivered as chunks in `realtime.gateway` when no live stream was seen.
     */
    const useServerPhasedEarly = malvServerPhasedEligible;

    const adaptiveMaxTokens = this.computeAdaptiveChatMaxTokens({
      userMessage: args.message,
      conversationLength: assembled.priorMessages.length,
      modeType,
      executionStrategyMode: malvExecutionStrategy.mode
    });
    let malvServerPhasedOrchestrationEnabled = false;
    const inferenceTrace = {
      runId,
      malvAdaptiveMaxTokens: adaptiveMaxTokens,
      malvCognitiveEffortTier: cognitiveTierForMeta,
      malvMetaIntelligenceSkipped: skipMetaIntelligence,
      malvTtftStageMs: { orchestrator_after_kill_switch: Date.now() - startedAt },
      malvPromptEffort,
      malvOperatorMode: modeType,
      workerClassifiedMode: classifiedWorkerMode,
      contextChars: assembled.contextChars,
      memorySnippetCount: assembled.memorySnippets.length,
      vaultScoped: assembled.vaultScoped,
      reasoningAttached: Boolean(reasoningTrace),
      executionPlanAttached: Boolean(execPlan),
      structuredSummaryLen: assembled.structured.summary.length,
      malvUserTone: toneAnalysis.userTone,
      malvResponsePolicy: responsePolicy.primary,
      malvResponsePolicySecondary: responsePolicy.secondary ?? null,
      malvToneReason: toneAnalysis.toneReasons,
      malvGreetingShortCircuit: isGreeting,
      malvIdentityShortCircuit: Boolean(identityKind),
      malvLightSocial: Boolean(lightSocialKind),
      malvLightSocialKind: lightSocialKind ?? null,
      malvFirstThreadTurn: isFirstThreadTurn,
      malvExploreFirstResponseShaping: Boolean(assembled.exploreFirstResponsePolicyBlock?.trim()),
      malvBareCasualSmallTalk: socialSmalltalkCheckin,
      malvSocialSmalltalkCheckin: socialSmalltalkCheckin,
      malvIntentKind: malvClassifiedIntent.primaryIntent,
      malvIntentScope: malvClassifiedIntent.scopeSize,
      malvIntentComplexity: malvClassifiedIntent.complexity,
      malvIntentDomains: malvClassifiedIntent.domains,
      malvExecutionStrategyMode: malvExecutionStrategy.mode,
      malvInternalPhaseCount: malvExecutionStrategy.internalPhases.length,
      malvAutonomousOrchestrationAttached: Boolean(autonomousOrchestrationBlock),
      malvContextAssemblyTier: malvContextAssemblyTier,
      malvCompanionLightTurn: malvCompanionLightTurn,
      malvIntentDecompositionAttached: Boolean(intentDecomposition),
      malvRouterDecisionTrace: metaDecision?.routerDecisionTrace ?? null,
      malvConfidenceTrace: metaDecision?.confidenceTrace ?? null,
      malvContinuityTrace: metaDecision?.continuityTrace ?? null,
      malvRealtimeCallHook: this.buildRealtimeCallHook(args.inputMeta ?? null, metaDecision),
      malvExternalExecutionHook: this.buildExternalExecutionHook(metaDecision),
      malvContinuityHook: this.buildContinuityHook(metaDecision),
      malvServerPhasedEligible: malvServerPhasedEligible,
      /** True when multi-step phased worker orchestration will run (HTTP and WS). */
      malvServerPhasedPlanned: useServerPhasedEarly,
      /**
       * Legacy trace key — Phase 5 always false (phased is no longer skipped merely because a WS stream callback is present).
       * Prefer `malvChatWsLiveStreamCallback` + `malvServerPhasedPlanned` for observability.
       */
      malvServerPhasedSkippedForLiveWsStream: false,
      malvChatWsLiveStreamCallback: Boolean(args.onAssistantStreamChunk),
      malvConfidence: { ...malvConfidence, responseConfidence: malvConfidence.responseConfidence },
      malvTierCorrection: malvTierCorrectionTrace,
      malvAmbiguitySignals: { ...malvConfidence.signals },
      malvDecisionRationale: malvConfidence.decisionRationale,
      malvResponseRetry: null,
      malvIntentDriftHint: null,
      malvLearningSignalsCaptured: false,
      malvLearningHydrationWaitMs: learningHydrationWaitMs,
      malvLearningSnapshotScope: learningAdaptive.scope,
      malvDeferredLearningCapture: "unknown",
      malvAdaptiveAdjustments: {
        tierBias: learningAdaptiveSnap.tierBias,
        clarificationBias: learningAdaptiveSnap.clarificationBias,
        memoryBias: learningAdaptiveSnap.memoryBias,
        verbosityBias: learningAdaptiveSnap.verbosityBias
      },
      malvUniversalCapabilityRoute: {
        responseMode: malvUniversalCapabilityRoute.responseMode,
        freshnessMatters: malvUniversalCapabilityRoute.freshnessMatters,
        mixedMode: malvUniversalCapabilityRoute.mixedMode,
        financeLensActive: malvUniversalCapabilityRoute.financeLensActive,
        sourceBackedRecommended: malvUniversalCapabilityRoute.sourceBackedRecommended,
        imageEnrichmentRecommended: malvUniversalCapabilityRoute.imageEnrichmentRecommended,
        topSignals: malvUniversalCapabilityRoute.topSignals
      },
      malvUniversalCapabilityPromptRoute: {
        responseMode: malvCapabilityPromptRoute.responseMode,
        promptContractDegraded: malvCapabilityPromptContractDegraded
      },
      malvCapabilityExecution: {
        ok: malvCapabilityExecution.ok,
        skipped: Boolean(malvCapabilityExecution.skipped),
        hasPromptInjection: malvCapabilityExecution.promptInjection.trim().length > 0,
        hasRich: Boolean(malvCapabilityExecution.rich),
        error: malvCapabilityExecution.error ?? null
      },
      malvUniversalRouteLifecycle: malvUniversalCapabilityLifecycleTelemetry
    };

    const aggregated: Record<string, unknown> = {
      messages: assembled.priorMessages,
      contextBlock: contextForPrompt,
      memorySnippets: assembled.memorySnippets,
      memoryScope: "policy-gated",
      vaultIncluded: Boolean(assembled.vaultScoped),
      beastLevel: ctx.beastLevel,
      conversationMode: assembled.conversationMode,
      conversationTitle: assembled.conversationTitle,
      workspaceId: args.workspaceId ?? null,
      userRole: args.userRole ?? "user",
      assistantMessageId: args.assistantMessageId,
      runId,
      // Same UUID as runId (ai job id); propagated to beast-worker for log correlation.
      malvCorrelationId: runId,
      inputMeta: args.inputMeta ?? {},
      operatorHint,
      replyModeHint: this.replyModeFrom({ usedFallback: false, memoryCount: assembled.memorySnippets.length, operatorHint }),
      malvPromptAlreadyExpanded: true,
      malvOperatorMode: modeType,
      malvBehaviorMode: modeType,
      malvSuperFix: superFix,
      superFixSandboxRunId,
      malvReasoningAttached: Boolean(reasoningTrace),
      malvInferenceTrace: inferenceTrace,
      malvStructuredContextSummary: assembled.structured.summary,
      malvUserTone: toneAnalysis.userTone,
      malvResponsePolicy: responsePolicy.primary,
      malvToneReason: toneAnalysis.toneReasons,
      malvClassifiedIntent,
      malvExecutionStrategy,
      malvIntentDecomposition: intentDecomposition,
      malvMetaIntelligenceDecision: metaDecision,
      malvRealtimeCallHook: this.buildRealtimeCallHook(args.inputMeta ?? null, metaDecision),
      malvExternalExecutionHook: this.buildExternalExecutionHook(metaDecision),
      malvContinuityHook: this.buildContinuityHook(metaDecision),
      malvUniversalCapabilityRoute,
      /** Real system role for OpenAI-style backends (identity lock before user prompt). */
      systemPrompt: MALV_SYSTEM_ROLE_PROMPT
    };

    const agentRouterAttach = malvAgentSystemEnabled(this.cfg) && malvAgentChatRouterAttachEnabled(this.cfg);
    let agentRoute: MalvTaskRouterDecision | null = null;
    if (agentRouterAttach && cognitiveTierForMeta >= 2) {
      const layerOut = metaDecision?.layerOutputs as Record<string, unknown> | undefined;
      agentRoute = this.malvTaskRouter.route({
        traceId: runId,
        surface: "chat",
        userText: args.message,
        classified: malvClassifiedIntent,
        executionStrategy: malvExecutionStrategy,
        vaultScoped: assembled.vaultScoped,
        inputMode: args.inputMeta?.inputMode ?? null,
        memorySnippetCount: assembled.memorySnippets.length,
        hasCodeKeywords: /\b(debug|typescript|react|sandbox|patch|repo|stack trace)\b/i.test(args.message),
        hasImageKeywords: /\b(image|screenshot|png|svg|diagram)\b/i.test(args.message),
        studioContext:
          /studio|build unit|malv studio/i.test(String(assembled.structured.summary ?? "")) ||
          /studio|build unit|preview|patch\b/i.test(args.message),
        callActive: Boolean(args.inputMeta?.callId),
        deviceHookActive: Boolean(layerOut?.device_control),
        contextCharsEstimate: assembled.contextChars
      });
    }

    let routingDecision = this.inferenceRouting.decideForChat({
      surface: "chat",
      userMessage: args.message,
      modeType,
      classifiedWorkerMode,
      superFix: Boolean(superFix),
      useServerPhased: useServerPhasedEarly,
      executionStrategyMode: malvExecutionStrategy.mode,
      internalPhaseCount: malvExecutionStrategy.internalPhases.length,
      contextChars: assembled.contextChars,
      vaultScoped: assembled.vaultScoped,
      inputMode: args.inputMeta?.inputMode ?? null,
      mergedTurnCapabilityDemand:
        agentRoute != null ? aggregatePlanInferenceDemand(agentRoute.plan, MALV_AGENT_KIND_INFERENCE_REQUIREMENTS) : undefined,
      mergedUniversalCapabilityDemand: malvUniversalCapabilityDemandPatch ?? undefined
    });
    const neutralAggregated = { ...aggregated };
    Object.assign(aggregated, routingDecision.workerContextPatch);
    aggregated.malvInferenceTrace = {
      ...(aggregated.malvInferenceTrace as Record<string, unknown>),
      malvRouting: routingDecision.telemetry
    };
    let malvInfTrace = aggregated.malvInferenceTrace as Record<string, unknown>;
    malvInfTrace.malvLocalInferenceEnabled = this.localInference.isEnabled();
    malvInfTrace.malvChatInferenceTransport = "pending";

    if (agentRouterAttach && agentRoute) {
      const tierAlign = this.malvAgentTierBridge.alignRouterWithInferenceTelemetry(agentRoute, routingDecision.telemetry);
      const planAgentKinds = [...new Set(agentRoute.plan.steps.map((s) => s.agentKind))];
      aggregated.malvAgentTaskRouter = {
        decisionId: agentRoute.decisionId,
        workShape: agentRoute.workShape,
        multiAgent: agentRoute.multiAgent,
        resourceTier: agentRoute.resourceTier,
        executionMode: agentRoute.executionMode,
        complexityScore: agentRoute.complexityScore,
        executionRisk: agentRoute.executionRisk,
        reasonCodes: agentRoute.reasonCodes,
        planId: agentRoute.plan.planId,
        planSteps: agentRoute.plan.steps.length,
        planAgentKinds,
        stage1CoreRuntimeEnabled: planAgentKinds.some((k) =>
          ["router", "smart_decision", "conversation", "knowledge", "context_assembly", "privacy"].includes(k)
        ),
        pathHints: agentRoute.malvExecutionPathHints,
        routerConfidence: agentRoute.routerConfidence,
        tierAlignment: tierAlign
      };
      malvInfTrace.malvAgentRouter = {
        workShape: agentRoute.workShape,
        resourceTier: agentRoute.resourceTier,
        alignmentNote: tierAlign.alignmentNote,
        degradedFromRouterIntent: tierAlign.degradedFromRouterIntent
      };
    }

    malvConfidence = applyAgentRouterConfidenceAdjust(
      malvConfidence,
      cognitiveTierForMeta,
      agentRoute?.routerConfidence?.score ?? null
    );
    malvInfTrace.malvConfidence = { ...malvConfidence, responseConfidence: malvConfidence.responseConfidence };
    malvInfTrace.malvAmbiguitySignals = { ...malvConfidence.signals };
    malvInfTrace.malvDecisionRationale = malvConfidence.decisionRationale;

    const toneInstructionBlock = buildToneInstructionBlock(responsePolicy);

    let workerRes: BeastInferenceResponse;
    let usedApiFallback = false;
    let workerAttemptError: string | undefined;
    let malvRepetitionGuardTriggered = false;
    let malvHadModelIdentityLeak = false;
    let beastSignalReason: string | null = null;

    /**
     * Deterministic template/greeting/social replies use the Tier-0 reflex lane only
     * ({@link classifyMalvReflexTurn} → {@link executeReflexLaneChatTurn} → {@link buildDeterministicTemplateShortCircuit}).
     * Post-assembly copies of the same detectors were redundant with that path and could bypass safety gates
     * (e.g. superFix + short social text). Signals below still record detector hints for traces.
     */

    if (malvExecutionStrategy.mode === "require_clarification" && !superFix) {
      this.logger.log(`[MALV BRAIN] autonomous clarification short-circuit runId=${runId}`);
      const beastSigEarly = detectBeastSignal({
        userMessage: args.message,
        priorMessages: assembled.priorMessages
      });
      beastSignalReason = beastSigEarly.reason ?? null;
      const clarificationText = buildAutonomousClarificationReply(malvClassifiedIntent);
      const clarifyBundle = finalizeAssistantOutputWithMeta(clarificationText, { priorAssistantTexts });
      malvRepetitionGuardTriggered = clarifyBundle.repetitionGuardTriggered;
      malvHadModelIdentityLeak = clarifyBundle.hadModelIdentityLeak;
      const withBeast = appendBeastSuggestionBlock(clarifyBundle.text, beastSigEarly.suggestion);
      workerRes = {
        reply: withBeast,
        meta: {
          malvReplySource: "malv_autonomous_clarification",
          malvAutonomousClarification: true,
          malvClassifiedIntent,
          malvExecutionStrategy,
          malvUserTone: toneAnalysis.userTone,
          malvResponsePolicy: responsePolicy.primary,
          malvResponsePolicySecondary: responsePolicy.secondary ?? null,
          malvToneReason: toneAnalysis.toneReasons,
          malvRepetitionGuardTriggered,
          malvHadModelIdentityLeak,
          replyMode: this.replyModeFrom({
            usedFallback: false,
            memoryCount: assembled.memorySnippets.length,
            operatorHint
          })
        }
      };
    } else if (
      !superFix &&
      shouldTriggerSoftConfidenceClarification(
        malvClassifiedIntent,
        malvConfidence,
        args.message,
        learningAdaptiveSnap.tierThresholds.softClarificationIntentMax
      )
    ) {
      this.logger.log(`[MALV BRAIN] confidence-aware soft clarification runId=${runId}`);
      const beastSigEarly = detectBeastSignal({
        userMessage: args.message,
        priorMessages: assembled.priorMessages
      });
      beastSignalReason = beastSigEarly.reason ?? null;
      const clarificationText = buildSoftDualIntentClarificationReply(malvClassifiedIntent);
      const softBundle = finalizeAssistantOutputWithMeta(clarificationText, { priorAssistantTexts });
      malvRepetitionGuardTriggered = softBundle.repetitionGuardTriggered;
      malvHadModelIdentityLeak = softBundle.hadModelIdentityLeak;
      const withBeast = appendBeastSuggestionBlock(softBundle.text, beastSigEarly.suggestion);
      workerRes = {
        reply: withBeast,
        meta: {
          malvReplySource: "malv_confidence_clarification",
          malvConfidenceClarification: true,
          malvClassifiedIntent,
          malvExecutionStrategy,
          malvUserTone: toneAnalysis.userTone,
          malvResponsePolicy: responsePolicy.primary,
          malvResponsePolicySecondary: responsePolicy.secondary ?? null,
          malvToneReason: toneAnalysis.toneReasons,
          malvRepetitionGuardTriggered,
          malvHadModelIdentityLeak,
          replyMode: this.replyModeFrom({
            usedFallback: false,
            memoryCount: assembled.memorySnippets.length,
            operatorHint
          })
        }
      };
    } else {
      let malvUniversalInferenceDemandRelaxed = false;
      const routingTel = routingDecision.telemetry;
      const { gpuTierReachable, unavailableReason: gpuTierUnreachableReason } =
        await this.resolveChatGpuTierReachability(args.abortSignal);
      const cpuWorkerTierReachable = routingTel.malvLightweightTierRequested === true;
      if (routingDecision.chatTierFailover) {
        routingDecision.chatTierFailover.plan.steps = filterMalvChatTierFailoverSteps(
          routingDecision.chatTierFailover.plan.steps,
          { gpuTierReachable, cpuWorkerTierReachable }
        );
      }
      if (
        shouldRelaxUniversalCapabilityChatInferenceDemand({
          universalDemandPatch: malvUniversalCapabilityDemandPatch,
          filteredFailoverPlanStepCount: routingDecision.chatTierFailover?.plan.steps.length ?? 0
        })
      ) {
        malvUniversalInferenceDemandRelaxed = true;
        this.logger.warn(
          `[MALV_UNIVERSAL_INFERENCE_RELAX] ${JSON.stringify({
            runId,
            reason: "no_failover_steps_after_universal_capability_demand",
            prior_routing_reason: routingTel.malvRoutingReason
          })}`
        );
        routingDecision = this.inferenceRouting.decideForChat({
          surface: "chat",
          userMessage: args.message,
          modeType,
          classifiedWorkerMode,
          superFix: Boolean(superFix),
          useServerPhased: useServerPhasedEarly,
          executionStrategyMode: malvExecutionStrategy.mode,
          internalPhaseCount: malvExecutionStrategy.internalPhases.length,
          contextChars: assembled.contextChars,
          vaultScoped: assembled.vaultScoped,
          inputMode: args.inputMeta?.inputMode ?? null,
          mergedTurnCapabilityDemand:
            agentRoute != null ? aggregatePlanInferenceDemand(agentRoute.plan, MALV_AGENT_KIND_INFERENCE_REQUIREMENTS) : undefined
        });
        Object.assign(aggregated, neutralAggregated);
        Object.assign(aggregated, routingDecision.workerContextPatch);
        aggregated.malvInferenceTrace = {
          ...(aggregated.malvInferenceTrace as Record<string, unknown>),
          malvRouting: routingDecision.telemetry,
          malvUniversalCapabilityInferenceDemandRelaxed: true,
          malvUniversalCapabilityInferenceDemandRelaxedReason: "no_worker_failover_steps_with_universal_demand"
        };
        malvInfTrace = aggregated.malvInferenceTrace as Record<string, unknown>;
        if (routingDecision.chatTierFailover) {
          routingDecision.chatTierFailover.plan.steps = filterMalvChatTierFailoverSteps(
            routingDecision.chatTierFailover.plan.steps,
            { gpuTierReachable, cpuWorkerTierReachable }
          );
        }
      }
      malvInfTrace.malvUniversalCapabilityInferenceDemandRelaxed = malvUniversalInferenceDemandRelaxed;
      const apiLocalChatBlocked = malvLocalInferenceChatPathBlockedFromEnv((k) => this.cfg.get<string>(k));
      const cpuPathAvailable =
        cpuWorkerTierReachable || (this.localInference.isEnabled() && !apiLocalChatBlocked);
      const gpuTierHealthProbeEnabled = malvGpuTierProbeWorkerHealthFromEnv((k) => this.cfg.get<string>(k));
      this.patchChatMalvRoutingTelemetry(malvInfTrace, {
        malvGpuTierReachable: gpuTierReachable,
        malvCpuWorkerTierReachable: cpuWorkerTierReachable,
        malvGpuTierUnreachableReason: gpuTierUnreachableReason,
        malvGpuTierHealthProbeEnabled: gpuTierHealthProbeEnabled
      });
      this.logger.log(
        `[MALV_ROUTING_TURN_AVAIL] ${JSON.stringify({
          runId,
          preferred_tier: routingTel.malvPreferredTier,
          gpu_available: gpuTierReachable,
          gpu_health_probe_enabled: gpuTierHealthProbeEnabled,
          cpu_available: cpuPathAvailable,
          cpu_worker_sidecar_available: cpuWorkerTierReachable,
          local_inference_configured: this.localInference.isEnabled(),
          api_local_inference_chat_path_blocked: apiLocalChatBlocked,
          filtered_worker_steps: routingDecision.chatTierFailover?.plan.steps.length ?? 0,
          gpu_tier_unreachable_reason: gpuTierUnreachableReason
        })}`
      );
      if (
        useServerPhasedEarly &&
        !gpuTierReachable &&
        cpuWorkerTierReachable &&
        routingDecision.chatTierFailover
      ) {
        Object.assign(aggregated, routingDecision.chatTierFailover.cpuSidecarPatch);
      }

      const useServerPhased = useServerPhasedEarly;

      if (useServerPhased) {
        malvServerPhasedOrchestrationEnabled = true;
        malvInfTrace.malvChatInferenceTransport = "beast_worker_phased";
      }

      const phasedNotice =
        "The API is executing phased orchestration across multiple worker turns. Answer only the current phase; earlier phases were completed in prior inference steps within this same request.";

      const forwardWorkerStreamChunk =
        args.onAssistantStreamChunk && ctx.conversationId
          ? (text: string) =>
              args.onAssistantStreamChunk!({
                conversationId: ctx.conversationId!,
                runId,
                text: shapeMalvAssistantStreamDeltaForDelivery(text),
                done: false
              })
          : undefined;

      if (useServerPhased) {
        this.logger.log(
          `[MALV BRAIN] server phased orchestration runId=${runId} phases=${malvExecutionStrategy.internalPhases.length}`
        );
        const phasedOutcome = await this.phasedChat.runWorkerPhases({
          originalUserMessage: args.message,
          phases: malvExecutionStrategy.internalPhases,
          mode: classifiedWorkerMode,
          baseAggregated: aggregated,
          maxTokens: adaptiveMaxTokens,
          signal: args.abortSignal,
          synthesizeFallback: (reason) =>
            this.fallbackBrain.synthesize({
              userMessage: args.message,
              classifiedMode: classifiedWorkerMode,
              workerError: reason,
              correlationId: runId
            }),
          onPhaseStart: (phase, index, total) => {
            this.realtime.emitMalvOrchestration(args.userId, {
              type: "thinking",
              conversationId: ctx.conversationId!,
              messageId: args.assistantMessageId,
              phase: `server_phase:${phase}`,
              detail: `step ${index + 1}/${total}`
            });
          },
          onPhaseComplete: (entry) => {
            this.realtime.emitMalvOrchestration(args.userId, {
              type: "thinking",
              conversationId: ctx.conversationId!,
              messageId: args.assistantMessageId,
              phase: `server_phase:${entry.phaseId}`,
              detail: `completed ${entry.index + 1}/${entry.total}`,
              status: entry.status,
              producer: entry.producer,
              replyChars: entry.replyChars
            });
          },
          buildPrompt: (userMessageForStep) =>
            buildMalvChatPrompt({
              userMessage: userMessageForStep,
              contextBlock: contextForPrompt,
              beastLevel: ctx.beastLevel,
              classifiedMode: classifiedWorkerMode,
              modeType,
              reasoningTrace,
              superFix,
              directiveExtra: directiveExtraMerged,
              toneInstructionBlock,
              isFirstThreadTurn,
              userTone: toneAnalysis.userTone,
              serverPhasedOrchestrationNotice: phasedNotice,
              attachSecuritySoftwareHygiene: !malvCompanionLightTurn,
              promptEffort: malvPromptEffort,
              adaptiveStyleHint: learningAdaptiveSnap.adaptiveStyleHint ?? undefined,
              capabilityRoutingBlock: malvCapabilityRoutingPromptHook,
              responsePlanBlock: malvResponsePlanPromptBlock
            })
        });

        const phasedUsedFallback = phasedOutcome.trace.some((t) => t.producer === "fallback_brain");
        usedApiFallback = phasedUsedFallback;
        workerRes = {
          reply: phasedOutcome.combinedReply.trim(),
          meta: {
            ...phasedOutcome.lastMeta,
            malvReplySource: "beast_worker_phased",
            malvServerPhasedTrace: phasedOutcome.trace,
            malvServerPhasedOrchestration: true,
            replyMode: this.replyModeFrom({
              usedFallback: phasedUsedFallback,
              memoryCount: assembled.memorySnippets.length,
              operatorHint
            })
          }
        };
      } else {
        const prompt = buildMalvChatPrompt({
          userMessage: args.message,
          contextBlock: contextForPrompt,
          beastLevel: ctx.beastLevel,
          classifiedMode: classifiedWorkerMode,
          modeType,
          reasoningTrace,
          superFix,
          directiveExtra: directiveExtraMerged,
          toneInstructionBlock,
          isFirstThreadTurn,
          userTone: toneAnalysis.userTone,
          autonomousOrchestrationBlock: autonomousOrchestrationBlock ?? undefined,
          attachSecuritySoftwareHygiene: !malvCompanionLightTurn,
          promptEffort: malvPromptEffort,
          adaptiveStyleHint: learningAdaptiveSnap.adaptiveStyleHint ?? undefined,
          capabilityRoutingBlock: malvCapabilityRoutingPromptHook,
          responsePlanBlock: malvResponsePlanPromptBlock
        });

        this.logger.log(
          `[MALV_INFERENCE_TRACE] api_orchestrator mode=${modeType} workerMode=${classifiedWorkerMode} contextChars=${assembled.contextChars} memory=${assembled.memorySnippets.length} promptLen=${prompt.length} runId=${runId}`
        );
        this.logger.log(
          `[MALV_PROMPT_STRUCTURE] runId=${runId} systemRoleChars=${MALV_SYSTEM_ROLE_PROMPT.length} ${JSON.stringify(
            summarizeMalvPromptStructure(prompt)
          )}`
        );

        try {
          this.logger.log(`[MALV BRAIN] worker request sent runId=${runId} correlationId=${runId}`);

          const rawRespectTier = (malvEnvFirst((k) => this.cfg.get<string>(k), MALV_LOCAL_CPU_INFERENCE_ENV.RESPECT_ROUTING_TIER) ?? "")
            .trim()
            .toLowerCase();
          const respectLocalInferenceRoutingTier =
            rawRespectTier === "" ||
            rawRespectTier === "1" ||
            rawRespectTier === "true" ||
            rawRespectTier === "yes" ||
            rawRespectTier === "on";
          const skipLocalForGpuPreferred = malvShouldDeferApiLocalInferenceToVerifiedGpuWorkerFirst({
            respectLocalInferenceRoutingTier,
            preferredTier: routingTel.malvPreferredTier,
            gpuTierReachable,
            gpuTierWorkerHealthProbeEnabled: gpuTierHealthProbeEnabled
          });

          const simulateLocalUnavailable = malvSimulationEnabled(
            (k) => this.cfg.get<string>(k),
            "MALV_SIMULATE_LOCAL_INFERENCE_UNAVAILABLE"
          );
          const shouldTryApiLocal = this.localInference.shouldAttemptLocal() && !apiLocalChatBlocked && !simulateLocalUnavailable;

          if (skipLocalForGpuPreferred) {
            malvInfTrace.malvLocalInferenceSkipReason = "gpu_preferred_respecting_tier_worker_gpu_verified";
            malvInfTrace.malvChatInferenceTransport = "beast_worker";
            this.logger.log(
              `[MALV_INFERENCE_ROUTE] transport=beast_worker reason=gpu_preferred_skip_local_verified_gpu runId=${runId}`
            );
            workerRes = await this.runChatWorkerWithTierFailover({
              routingDecision,
              classifiedWorkerMode,
              neutralAggregated,
              aggregated,
              prompt,
              maxTokens: adaptiveMaxTokens,
              signal: args.abortSignal,
              malvInfTrace,
              onWorkerStreamChunk: forwardWorkerStreamChunk
            });
            malvInfTrace.malvLocalInferenceAttempted = false;
            malvInfTrace.malvLocalInferenceUsed = false;
          } else if (shouldTryApiLocal) {
            const trace = aggregated.malvInferenceTrace as Record<string, unknown>;
            trace.malvLocalInferenceAttempted = true;
            const configuredModel = (malvEnvFirst((k) => this.cfg.get<string>(k), MALV_LOCAL_CPU_INFERENCE_ENV.MODEL) ?? "").trim();
            if (configuredModel) {
              trace.malvLocalInferenceEffectiveModelConfigured = configuredModel;
            }
            const skipProbe = this.localInference.skipHealthProbe();
            trace.malvLocalInferenceSkipHealthProbe = skipProbe;
            const health = skipProbe
              ? {
                  ok: true,
                  reachable: true,
                  detail: "skipped_by_local_cpu_skip_health_probe_env",
                  baseUrl: this.localInference.getResolvedBaseUrlForLogs()
                }
              : await this.localInference.probeHealth(args.abortSignal);
            trace.malvLocalInferenceProbeOk = health.ok;
            trace.malvLocalInferenceProbeDetail = health.detail;
            trace.malvLocalInferenceProbeBaseUrl = health.baseUrl ?? null;
            let usedLocal = false;
            if (health.ok) {
              try {
                const localPrompt = buildMalvChatPrompt({
                  userMessage: args.message,
                  contextBlock: localContextForPrompt,
                  beastLevel: ctx.beastLevel,
                  classifiedMode: classifiedWorkerMode,
                  modeType,
                  reasoningTrace,
                  superFix,
                  directiveExtra: directiveExtraMerged,
                  toneInstructionBlock,
                  isFirstThreadTurn,
                  userTone: toneAnalysis.userTone,
                  autonomousOrchestrationBlock: autonomousOrchestrationBlock ?? undefined,
                  attachSecuritySoftwareHygiene: !malvCompanionLightTurn,
                  promptEffort: malvPromptEffort,
                  adaptiveStyleHint: learningAdaptiveSnap.adaptiveStyleHint ?? undefined,
                  capabilityRoutingBlock: malvCapabilityRoutingPromptHook,
                  responsePlanBlock: malvResponsePlanPromptBlock
                });
                const messages = buildOpenAiChatMessagesForLocalInference({
                  priorMessages: assembled.priorMessages,
                  fullMalvChatPrompt: localPrompt,
                  systemRolePrompt: MALV_SYSTEM_ROLE_PROMPT
                });
                this.realtime.emitMalvOrchestration(args.userId, {
                  type: "thinking",
                  conversationId: ctx.conversationId,
                  messageId: args.assistantMessageId,
                  phase: "building_response",
                  detail: `routing=${classifiedWorkerMode}`
                });
                this.logger.log(`[MALV LOCAL TURN] route_chosen=local_execute runId=${runId}`);
                const localExec = await this.localInference.executeChatCompletions({
                  messages,
                  correlationId: runId,
                  signal: args.abortSignal,
                  onStreamDelta: forwardWorkerStreamChunk
                    ? (ev) => forwardWorkerStreamChunk(ev.text)
                    : undefined
                });
                if (localExec.mode === "failed_before_output") {
                  this.logger.warn(
                    `[MALV LOCAL TURN] failed_before_output runId=${runId} err=${localExec.errorMessage} — worker_fallback`
                  );
                  this.localInference.recordFailure(localExec.errorMessage);
                  trace.malvChatInferenceTransport = "beast_worker_after_local_failure";
                  trace.malvLocalInferenceFailureReason = localExec.errorMessage;
                  workerRes = await this.runChatWorkerWithTierFailover({
                    routingDecision,
                    classifiedWorkerMode,
                    neutralAggregated,
                    aggregated,
                    prompt,
                    maxTokens: adaptiveMaxTokens,
                    signal: args.abortSignal,
                    malvInfTrace,
                    onWorkerStreamChunk: forwardWorkerStreamChunk
                  });
                } else {
                  workerRes = malvLocalInferenceExecutionResultToWorkerResponse(localExec);
                  usedLocal = true;
                  trace.malvChatInferenceTransport = "local_openai_compatible";
                  const localMeta = workerRes.meta as Record<string, unknown> | undefined;
                  const reportedModel = typeof localMeta?.malvLocalInferenceModel === "string" ? localMeta.malvLocalInferenceModel : null;
                  trace.malvLocalInferenceModelReported = reportedModel;
                  trace.malvLocalInferenceEffectiveModelUsed = reportedModel ?? (configuredModel || null);
                  this.logger.log(
                    `[MALV_INFERENCE_ROUTE] transport=local_openai_compatible runId=${runId} effectiveModel=${String(trace.malvLocalInferenceEffectiveModelUsed ?? "unknown")} execMode=${localExec.mode}`
                  );
                  this.patchChatMalvRoutingTelemetry(malvInfTrace, {
                    malvSelectedTier: "cpu",
                    malvSelectedBackend: "local_openai_compatible",
                    malvSelectedAgent: classifiedWorkerMode,
                    malvFallbackUsed: false,
                    malvFallbackReason: null
                  });
                }
              } catch (locErr) {
                if (isAbortError(locErr)) throw locErr;
                const lm = locErr instanceof Error ? locErr.message : String(locErr);
                this.logger.warn(`[MALV LOCAL INFERENCE] completion threw, falling back to worker runId=${runId} err=${lm}`);
                this.logger.warn(`[MALV_INFERENCE_ROUTE] transport=beast_worker reason=after_local_completion_failure runId=${runId}`);
                this.localInference.recordFailure(lm);
                trace.malvChatInferenceTransport = "beast_worker_after_local_failure";
                trace.malvLocalInferenceFailureReason = lm;
                workerRes = await this.runChatWorkerWithTierFailover({
                  routingDecision,
                  classifiedWorkerMode,
                  neutralAggregated,
                  aggregated,
                  prompt,
                  maxTokens: adaptiveMaxTokens,
                  signal: args.abortSignal,
                  malvInfTrace,
                  onWorkerStreamChunk: forwardWorkerStreamChunk
                });
              }
            } else {
              if (args.abortSignal?.aborted) {
                const err = new Error("aborted");
                err.name = "AbortError";
                throw err;
              }
              this.logger.warn(
                `[MALV LOCAL INFERENCE] health check failed, using beast-worker runId=${runId} detail=${health.detail}`
              );
              this.logger.warn(`[MALV_INFERENCE_ROUTE] transport=beast_worker reason=local_health_failed runId=${runId}`);
              this.localInference.recordFailure(`health:${health.detail}`);
              trace.malvChatInferenceTransport = "beast_worker_after_local_health_fail";
              trace.malvLocalInferenceFailureReason = health.detail;
              workerRes = await this.runChatWorkerWithTierFailover({
                routingDecision,
                classifiedWorkerMode,
                neutralAggregated,
                aggregated,
                prompt,
                maxTokens: adaptiveMaxTokens,
                signal: args.abortSignal,
                malvInfTrace,
                onWorkerStreamChunk: forwardWorkerStreamChunk
              });
            }
            trace.malvLocalInferenceUsed = usedLocal;
          } else {
            malvInfTrace.malvLocalInferenceSkipReason = apiLocalChatBlocked
              ? "local_inference_chat_path_disabled"
              : !this.localInference.isEnabled()
                ? "local_inference_disabled"
                : "local_inference_cooldown";
            malvInfTrace.malvChatInferenceTransport = "beast_worker";
            this.logger.log(
              `[MALV_INFERENCE_ROUTE] transport=beast_worker reason=${malvInfTrace.malvLocalInferenceSkipReason} runId=${runId}`
            );
            workerRes = await this.runChatWorkerWithTierFailover({
              routingDecision,
              classifiedWorkerMode,
              neutralAggregated,
              aggregated,
              prompt,
              maxTokens: adaptiveMaxTokens,
              signal: args.abortSignal,
              malvInfTrace,
              onWorkerStreamChunk: forwardWorkerStreamChunk
            });
            malvInfTrace.malvLocalInferenceAttempted = false;
          }

          const rawWorkerLen = (workerRes.reply ?? "").trim().length;
          this.logger.log(`[MALV BRAIN] worker reply length: ${rawWorkerLen} runId=${runId}`);
          this.logger.log(`[MALV WORKER] worker response received runId=${runId} len=${(workerRes.reply ?? "").length}`);
          if (malvSimulationEnabled((k) => this.cfg.get<string>(k), "MALV_SIMULATE_WORKER_FALLBACK")) {
            workerRes = { ...workerRes, reply: "" };
          }
          const trimmed = (workerRes.reply ?? "").trim();
          if (!trimmed) {
            const wm = workerRes.meta as Record<string, unknown> | undefined;
            const attempts = wm?.inferenceAttempts;
            this.logger.warn(
              `[MALV BRAIN] fallback invoked (empty worker reply) runId=${runId}` +
                (attempts != null ? ` workerInferenceAttempts=${JSON.stringify(attempts)}` : "")
            );
            workerRes = this.fallbackBrain.synthesize({
              userMessage: args.message,
              classifiedMode: classifiedWorkerMode,
              workerError: "Worker returned an empty reply body.",
              correlationId: runId
            });
            usedApiFallback = true;
            this.logger.log(`[MALV BRAIN] fallback reply length: ${(workerRes.reply ?? "").length}`);
          } else {
            const priorSource = (workerRes.meta as Record<string, unknown> | undefined)?.malvReplySource;
            const replySource =
              priorSource === "local_openai_compatible" ? "local_openai_compatible" : "beast_worker";
            workerRes = {
              reply: trimmed,
              meta: {
                ...(workerRes.meta ?? {}),
                malvReplySource: replySource,
                replyMode: this.replyModeFrom({
                  usedFallback: false,
                  memoryCount: assembled.memorySnippets.length,
                  operatorHint
                })
              }
            };
          }

          if ((workerRes.reply ?? "").trim().length > 0) {
            const refineBlock = malvConfidenceRefinementShouldBlock({
              userText: args.message,
              declaredRoute: malvUniversalCapabilityRoute,
              execution: malvCapabilityExecution
            });
            const ref = refineBlock.blocked
              ? {
                  reply: workerRes.reply ?? "",
                  trace: {
                    triggered: false as const,
                    kind: "none" as const,
                    detail: `refine_blocked:${refineBlock.detail}`
                  }
                }
              : await this.maybeMalvConfidenceRefinementPass({
                  userMessage: args.message,
                  baseReply: workerRes.reply ?? "",
                  runId,
                  cognitiveTier: cognitiveTierForMeta,
                  malvCompanionLightTurn,
                  internalPhaseCount: malvExecutionStrategy.internalPhases.length,
                  signal: args.abortSignal,
                  onStreamAppend: forwardWorkerStreamChunk
                });
            malvInfTrace.malvResponseRetry = ref.trace;
            if (ref.trace.triggered) {
              this.logger.log(`[MALV_CONFIDENCE] refine_append runId=${runId} detail=${String(ref.trace.detail ?? "")}`);
              workerRes = {
                ...workerRes,
                reply: ref.reply,
                meta: {
                  ...(workerRes.meta ?? {}),
                  malvConfidenceRefineAppend: true
                }
              };
            }
          }
        } catch (e) {
          if (isAbortError(e)) {
            this.logger.warn(`[MALV RUNTIME] generation interrupted (abort) runId=${runId}`);
            aiJob.status = "cancelled";
            aiJob.progress = 100;
            aiJob.errorMessage = "interrupted_by_operator";
            aiJob.finishedAt = new Date();
            await this.aiJobs.save(aiJob);
            this.realtime.emitToUser(args.userId, "job:update", {
              aiJobId: aiJob.id,
              status: aiJob.status,
              progress: aiJob.progress
            });
            void this.reflection.logChatReflection({
              userId: args.userId,
              correlationId: runId,
              success: false,
              latencyMs: Date.now() - startedAt,
              errorClass: "interrupted",
              summary: "interrupted",
              metadata: { classifiedMode: classifiedWorkerMode, malvOperatorMode: modeType, superFix }
            });
            this.logger.log(`[MALV_CHAT_TURN_BACKEND] runId=${runId} selected=non_inferencing reason=interrupted`);
            return {
              reply: "",
              runId,
              interrupted: true,
              meta: { malvReplySource: "interrupted", runId }
            };
          }
          workerAttemptError = e instanceof Error ? e.message : String(e);
          this.logger.error(`[MALV BRAIN] error in generation pipeline: ${workerAttemptError}`);
          this.logger.error(`[MALV_INFERENCE_ROUTE] transport=api_operator_fallback_brain runId=${runId}`);
          const fbTrace = aggregated.malvInferenceTrace as Record<string, unknown>;
          fbTrace.malvChatInferenceTransport = "api_operator_fallback_brain";
          fbTrace.malvFallbackExceptionSummary = workerAttemptError.slice(0, 320);
          workerRes = this.fallbackBrain.synthesize({
            userMessage: args.message,
            classifiedMode: classifiedWorkerMode,
            workerError: workerAttemptError,
            correlationId: runId
          });
          usedApiFallback = true;
          this.logger.log(`[MALV BRAIN] fallback reply length: ${(workerRes.reply ?? "").length}`);
        }

        if (!args.abortSignal?.aborted && (workerRes.reply ?? "").trim().length === 0) {
          this.logger.error(
            `[MALV BRAIN] pipeline produced empty reply after worker+fallback runId=${runId} — synthesizing emergency line`
          );
          workerRes = this.fallbackBrain.synthesize({
            userMessage: args.message,
            classifiedMode: classifiedWorkerMode,
            workerError: "Emergency: both worker and prior fallback returned empty string.",
            correlationId: runId
          });
          usedApiFallback = true;
          this.logger.log(`[MALV BRAIN] fallback reply length: ${(workerRes.reply ?? "").length}`);
        }
      }

      if ((workerRes.reply ?? "").trim().length > 0) {
        const continuationMaxRaw = Number(this.cfg.get<string>("MALV_CHAT_AUTO_CONTINUATION_MAX") ?? "1");
        const continuationMax = Number.isFinite(continuationMaxRaw)
          ? Math.max(0, Math.min(2, Math.trunc(continuationMaxRaw)))
          : 1;
        workerRes = await runMalvChatWorkerAutoContinuation(workerRes, {
          userMessage: args.message,
          malvExecutionStrategy,
          continuationMax,
          runId,
          signal: args.abortSignal,
          inferContinuation: ({ prompt, attempt, maxAttempts, continueReason }) =>
            this.worker.infer({
              mode: classifiedWorkerMode,
              prompt,
              maxTokens: adaptiveMaxTokens,
              context: {
                ...aggregated,
                malvContinuationContext: {
                  enabled: true,
                  attempt,
                  maxAttempts,
                  reason: continueReason
                }
              },
              signal: args.abortSignal
            }),
          onThinking: (detail) =>
            this.realtime.emitMalvOrchestration(args.userId, {
              type: "thinking",
              conversationId: ctx.conversationId!,
              messageId: args.assistantMessageId,
              phase: "continuation",
              detail
            }),
          forwardStreamAppend: forwardWorkerStreamChunk,
          logger: this.logger
        });
      }

      const beastSig = detectBeastSignal({
        userMessage: args.message,
        priorMessages: assembled.priorMessages
      });
      beastSignalReason = beastSig.reason ?? null;
      const finalized = finalizeWorkerReplyForDelivery({
        workerRes,
        priorAssistantTexts,
        beastSuggestion: beastSig.suggestion,
        universalCapabilityRoute: malvUniversalCapabilityRoute,
        forLiveWebSocketDelivery: Boolean(args.onAssistantStreamChunk)
      });
      const metaEarly = (finalized.workerRes.meta ?? {}) as Record<string, unknown>;
      const skipRichCompose =
        metaEarly.malvAutonomousClarification === true || metaEarly.malvConfidenceClarification === true;
      if (!skipRichCompose) {
        const composed = composeMalvCapabilityRichDelivery({
          route: malvUniversalCapabilityRoute,
          modelReply: finalized.workerRes.reply ?? "",
          execution: malvCapabilityExecution,
          userText: args.message,
          forLiveWebSocketDelivery: Boolean(args.onAssistantStreamChunk)
        });
        workerRes = {
          ...finalized.workerRes,
          reply: composed.reply,
          meta: { ...metaEarly, ...composed.metaPatch }
        };
      } else {
        workerRes = finalized.workerRes;
      }
      malvRepetitionGuardTriggered = finalized.malvRepetitionGuardTriggered;
      malvHadModelIdentityLeak = finalized.malvHadModelIdentityLeak;
      this.logger.log(
        `[MALV LOCAL TURN] shaping=${String((workerRes.meta as Record<string, unknown>).malvShapingPolicy)} runId=${runId} outcome=${String((workerRes.meta as Record<string, unknown>).malvTurnOutcome)}`
      );
    }

    const priorUsersForReliability = assembled.priorMessages.filter((m) => m.role === "user");
    const lastUserBeforeTurnReliability =
      priorUsersForReliability.length > 0
        ? String(priorUsersForReliability[priorUsersForReliability.length - 1]?.content ?? "").trim()
        : null;
    const lastAssistantForReliability = [...assembled.priorMessages].filter((m) => m.role === "assistant").pop();
    const reliabilityDelivery = applyMalvResponseReliabilityDeliveryPass({
      userText: args.message,
      declaredRoute: malvUniversalCapabilityRoute,
      execution: malvCapabilityExecution,
      reply: workerRes.reply ?? "",
      meta: { ...(workerRes.meta ?? {}) } as Record<string, unknown>,
      priorUserText: lastUserBeforeTurnReliability,
      priorAssistantSnippet: lastAssistantForReliability
        ? String(lastAssistantForReliability.content ?? "").slice(0, 900)
        : null,
      hadLiveStreamTokens: Boolean(args.onAssistantStreamChunk)
    });
    workerRes = {
      ...workerRes,
      reply: reliabilityDelivery.reply,
      meta: reliabilityDelivery.meta
    };
    const preserveGuardedResponse = planningDecisionMode === "guarded";
    const shapedFinalReply = this.responseShaperLayer.shape({
      response: workerRes.reply ?? "",
      plan: malvResponsePlan,
      interpretation: malvSemanticInterpretation,
      preserveGuarded: preserveGuardedResponse,
      hadLiveStreamTokens: Boolean(args.onAssistantStreamChunk)
    });
    workerRes = {
      ...workerRes,
      reply: shapedFinalReply,
      meta: {
        ...(workerRes.meta ?? {}),
        malvResponseShapingLayerApplied: true,
        malvResponseShapingStructure: malvResponsePlan.structure,
        malvResponseShapingGuardedBypass: preserveGuardedResponse
      }
    };
    const finalizedMeta = (workerRes.meta ?? {}) as Record<string, unknown>;
    let pipelineTrace = buildMalvResponsePipelineTrace({
      interpretation: malvSemanticInterpretation,
      decisionMode: planningDecisionMode,
      replySource: String(finalizedMeta.malvReplySource ?? ""),
      clarificationReliefApplied,
      plan: malvResponsePlan,
      shapingApplied: true,
      shapingGuardedBypass: preserveGuardedResponse,
      finalOutcome: String(finalizedMeta.malvTurnOutcome ?? "complete"),
      finalResponse: workerRes.reply ?? "",
      persisted: true,
      returned: true,
      transport: String((aggregated.malvInferenceTrace as Record<string, unknown>)?.malvChatInferenceTransport ?? "")
    });
    aggregated.malvInferenceTrace = {
      ...(aggregated.malvInferenceTrace as Record<string, unknown>),
      malvResponsePipelineTrace: pipelineTrace
    };

    const traceFinalize = aggregated.malvInferenceTrace as Record<string, unknown>;
    traceFinalize.malvReliabilityAssessment = reliabilityDelivery.meta.malvReliabilityAssessment ?? null;
    const driftHint = detectIntentResponseShapeDrift(malvClassifiedIntent, workerRes.reply ?? "", args.message);
    traceFinalize.malvIntentDriftHint = driftHint.kind === "none" ? null : driftHint;
    const finalResponseConfRaw = evaluateResponseConfidence({
      reply: workerRes.reply ?? "",
      userMessage: args.message,
      cognitiveTier: cognitiveTierForMeta,
      internalPhaseCount: malvExecutionStrategy.internalPhases.length
    });
    const reliabilityTier = (reliabilityDelivery.meta.malvReliabilityAssessment as { tier?: MalvGroundingTier } | undefined)
      ?.tier;
    const finalResponseConf = clampMalvResponseConfidenceByTier(finalResponseConfRaw, reliabilityTier ?? null);
    traceFinalize.malvConfidence = finalizeMalvConfidenceWithResponse(malvConfidence, finalResponseConf);

    const mrRoute = traceFinalize.malvRouting as { malvSelectedBackend?: string } | undefined;
    const modelUsed =
      (typeof mrRoute?.malvSelectedBackend === "string" && mrRoute.malvSelectedBackend.trim()
        ? mrRoute.malvSelectedBackend
        : null) ??
      (typeof traceFinalize.malvLocalInferenceEffectiveModelUsed === "string"
        ? (traceFinalize.malvLocalInferenceEffectiveModelUsed as string)
        : null);
    const priorUserMsgs = assembled.priorMessages
      .filter((m) => m.role === "user")
      .map((m) => String(m.content ?? "").trim())
      .filter((c) => c.length > 0);
    const lastAssistantPrior = [...assembled.priorMessages].filter((m) => m.role === "assistant").pop();
    const lastAssistantContent = lastAssistantPrior ? String(lastAssistantPrior.content ?? "") : null;
    const refRetryTrace = traceFinalize.malvResponseRetry as MalvResponseRetryTrace | null | undefined;
    if (this.malvLearning.isEnabled()) {
      traceFinalize.malvLearningSignalsCaptured = true;
      const deferredCaptureOk = this.malvLearning.scheduleTurnCapture({
        userId: args.userId,
        runId,
        reflexLane: false,
        cognitiveTier: cognitiveTierForMeta,
        primaryIntent: malvClassifiedIntent.primaryIntent,
        message: args.message,
        ambiguity: malvClassifiedIntent.ambiguity.isAmbiguous,
        memorySnippetCount: assembled.memorySnippets.length,
        modelUsed,
        tierCorrection: malvTierCorrectionTrace,
        responseConfidence: (traceFinalize.malvConfidence as { responseConfidence?: number }).responseConfidence ?? 0,
        refinementTriggered: Boolean(refRetryTrace?.triggered),
        driftKind: driftHint.kind === "none" ? null : driftHint.kind,
        replySource: String((workerRes.meta as Record<string, unknown>)?.malvReplySource ?? ""),
        priorUserMessages: priorUserMsgs,
        lastAssistantContent
      });
      traceFinalize.malvDeferredLearningCapture = deferredCaptureOk ? "success" : "failed";
    }

    const backstoppedTurn = applyMalvAssistantVisibleCompletionBackstop({
      meta: (workerRes.meta ?? {}) as Record<string, unknown>,
      reply: workerRes.reply ?? "",
      runId,
      logger: this.logger,
      logContext: "ai_job_persist"
    });
    workerRes = {
      ...workerRes,
      meta: {
        ...backstoppedTurn.meta,
        malvTurnOutcome: backstoppedTurn.outcome
      }
    };
    pipelineTrace = buildMalvResponsePipelineTrace({
      interpretation: malvSemanticInterpretation,
      decisionMode: planningDecisionMode,
      replySource: String(((workerRes.meta ?? {}) as Record<string, unknown>).malvReplySource ?? ""),
      clarificationReliefApplied,
      plan: malvResponsePlan,
      shapingApplied: true,
      shapingGuardedBypass: preserveGuardedResponse,
      finalOutcome: backstoppedTurn.outcome,
      finalResponse: workerRes.reply ?? "",
      persisted: true,
      returned: true,
      transport: String((aggregated.malvInferenceTrace as Record<string, unknown>)?.malvChatInferenceTransport ?? "")
    });
    (aggregated.malvInferenceTrace as Record<string, unknown>).malvResponsePipelineTrace = pipelineTrace;

    aiJob.status = "completed";
    aiJob.progress = 100;
    aiJob.resultReply = workerRes.reply;
    aiJob.resultMeta = {
      ...(workerRes.meta ?? {}),
      ...(usedApiFallback
        ? { malvUsedApiFallbackBrain: true, workerAttemptError: workerAttemptError ?? null }
        : {}),
      replyMode: this.replyModeFrom({
        usedFallback: usedApiFallback,
        memoryCount: assembled.memorySnippets.length,
        operatorHint
      }),
      malvBehaviorMode: modeType,
      malvOperatorMode: modeType,
      malvSuperFix: superFix,
      superFixSandboxRunId,
      malvInferenceTrace: {
        ...(aggregated.malvInferenceTrace as Record<string, unknown>),
        malvServerPhasedOrchestrationEnabled
      },
      malvResponsePipelineTrace: pipelineTrace,
      ...cciHandoffMeta,
      malvBeastSignalReason: beastSignalReason,
      malvRepetitionGuardTriggered,
      malvGreetingShortCircuit: isGreeting,
      malvLightSocialShortCircuit: Boolean(lightSocialKind),
      malvCasualSmallTalkShortCircuit: socialSmalltalkCheckin,
      malvSocialSmalltalkCheckinShortCircuit: socialSmalltalkCheckin,
      malvIdentityHandled: Boolean(identityKind),
      malvHadModelIdentityLeak,
      malvToneReason: toneAnalysis.toneReasons,
      malvLowQualityHint:
        workerRes.reply.length < 48 && args.message.length > 220 ? "short_reply_long_question" : undefined,
      malvClassifiedIntent,
      malvExecutionStrategy,
      malvIntentDecomposition: intentDecomposition
    };
    aiJob.errorMessage = usedApiFallback ? workerAttemptError ?? null : null;
    aiJob.finishedAt = new Date();
    const phasedTrace = (aiJob.resultMeta as { malvServerPhasedTrace?: unknown } | undefined)?.malvServerPhasedTrace;
    if (phasedTrace) {
      aiJob.payload = { ...(aiJob.payload ?? {}), malvServerPhasedTrace: phasedTrace };
    }
    await this.aiJobs.save(aiJob);

    const log = this.beastLogs.create({
      user: userRef,
      aiJob,
      eventType: "inference",
      payload: {
        mode: classifiedWorkerMode,
        classified: classifiedWorkerMode,
        malvOperatorMode: modeType,
        replyLen: workerRes.reply.length,
        usedApiFallbackBrain: usedApiFallback,
        contextChars: assembled.contextChars,
        memorySnippetCount: assembled.memorySnippets.length
      }
    });
    await this.beastLogs.save(log);

    const suggestion = this.suggestions.create({
      user: userRef,
      aiJob,
      suggestionType: "next_step",
      riskLevel: "low",
      status: "active",
      content: workerRes.reply.slice(0, 1200),
      metadata: {
        classifiedMode: classifiedWorkerMode,
        malvOperatorMode: modeType,
        beastLevel: ctx.beastLevel,
        usedApiFallback
      }
    });
    await this.suggestions.save(suggestion);

    const autoLog =
      (this.cfg.get<string>("MALV_MEMORY_AUTO_LOG_CHAT_TURNS") ?? process.env.MALV_MEMORY_AUTO_LOG_CHAT_TURNS) === "true";
    if (autoLog) {
      try {
        const isCollab = assembled.conversationMode === "collaboration";
        const collaborationRoomId = isCollab ? assembled.collaborationRoomId ?? null : null;
        const scope = isCollab ? ("collaboration" as const) : ("session" as const);
        await this.memory.addEntry({
          userId: args.userId,
          scope,
          type: "chat_turn",
          title: "Latest turn",
          content: `User: ${args.message}\nAssistant: ${workerRes.reply}`,
          tags: ["session", "chat_turn"],
          source: "chat",
          sourceRefs: { aiJobId: aiJob.id },
          collaborationRoomId
        });
      } catch (e) {
        this.logger.warn(`[MALV BRAIN] memory addEntry skipped: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    this.realtime.emitToUser(args.userId, "job:update", {
      aiJobId: aiJob.id,
      status: aiJob.status,
      progress: aiJob.progress
    });

    this.logger.log(
      `[MALV BRAIN] reply emitted runId=${runId} replyLen=${workerRes.reply.length} fallback=${usedApiFallback}`
    );

    void this.reflection.logChatReflection({
      userId: args.userId,
      correlationId: runId,
      success: !usedApiFallback,
      latencyMs: Date.now() - startedAt,
      errorClass: usedApiFallback ? "fallback_brain" : workerAttemptError ? "worker_error" : null,
      summary: workerRes.reply.slice(0, 240),
      metadata: {
        classifiedMode: classifiedWorkerMode,
        malvOperatorMode: modeType,
        superFix,
        superFixSandboxRunId,
        malvLowQualityHint: (aiJob.resultMeta as any)?.malvLowQualityHint
      }
    });

    if (this.continuityBridge) {
      try {
        this.continuityBridge.setContext(
          bridgeSessionId,
          {
            activeIntent: malvClassifiedIntent.primaryIntent,
            entities: [String((metaDecision?.layerOutputs?.device_control as any)?.executionTarget ?? "none")],
            lastAction: args.message.slice(0, 120),
            lastSurface: currentSurface
          },
          args.userId
        );
      } catch {
        // Non-blocking continuity bridge.
      }
    }

    const resultMeta = aiJob.resultMeta ?? workerRes.meta;
    const turnSelected = malvChatTurnBackendSelection(usedApiFallback, (resultMeta as Record<string, unknown>)?.malvReplySource);
    this.logger.log(
      `[MALV_CHAT_TURN_BACKEND] runId=${runId} selected=${turnSelected} replySource=${String((resultMeta as Record<string, unknown>)?.malvReplySource ?? "none")}`
    );
    const routingTrace = (resultMeta as Record<string, unknown>)?.malvInferenceTrace as Record<string, unknown> | undefined;
    const mr = routingTrace?.malvRouting as MalvInferenceRoutingTelemetry | undefined;
    const replySourceForRoute = String((resultMeta as Record<string, unknown>)?.malvReplySource ?? "");
    const templateShortCircuitSources = new Set([
      "malv_light_social_short_circuit",
      "malv_greeting_short_circuit",
      "malv_identity_short_circuit",
      "malv_casual_small_talk_short_circuit",
      "malv_autonomous_clarification",
      "malv_confidence_clarification",
      "interrupted"
    ]);
    const usedNonInferencingShortcut = templateShortCircuitSources.has(replySourceForRoute);
    let promptRouteTaskClass = "unknown";
    if (usedNonInferencingShortcut) {
      if (replySourceForRoute === "malv_greeting_short_circuit") promptRouteTaskClass = "chat_template_greeting";
      else if (replySourceForRoute === "malv_identity_short_circuit") promptRouteTaskClass = "chat_template_identity";
      else if (replySourceForRoute === "malv_light_social_short_circuit") promptRouteTaskClass = "chat_template_light_social";
      else if (replySourceForRoute === "malv_casual_small_talk_short_circuit")
        promptRouteTaskClass = "chat_social_smalltalk_checkin";
      else if (replySourceForRoute === "malv_autonomous_clarification")
        promptRouteTaskClass = "chat_autonomous_clarification";
      else if (replySourceForRoute === "interrupted") promptRouteTaskClass = "chat_interrupted";
    } else {
      promptRouteTaskClass = mr?.malvTaskClass ?? "chat_inferencing_unknown";
    }
    this.logger.log(
      `[MALV_CHAT_PROMPT_ROUTE] ${JSON.stringify({
        runId,
        task_class: promptRouteTaskClass,
        used_non_inferencing_shortcut: usedNonInferencingShortcut,
        preferred_tier: mr?.malvPreferredTier ?? null,
        selected_tier: usedNonInferencingShortcut ? "none" : (mr?.malvSelectedTier ?? null),
        selected_backend: usedNonInferencingShortcut ? "template_responder" : (mr?.malvSelectedBackend ?? null),
        fallback_used: usedApiFallback || Boolean(mr?.malvFallbackUsed),
        reply_source: replySourceForRoute || null
      })}`
    );
    if (mr) {
      const cpuAvail =
        mr.malvCpuWorkerTierReachable === true || Boolean(routingTrace?.malvLocalInferenceEnabled);
      const skipReason =
        typeof routingTrace?.malvLocalInferenceSkipReason === "string"
          ? routingTrace.malvLocalInferenceSkipReason
          : null;
      const localUsed = routingTrace?.malvLocalInferenceUsed === true;
      const effModel = routingTrace?.malvLocalInferenceEffectiveModelUsed ?? null;
      this.logger.log(
        `[MALV_ROUTING_TURN] runId=${runId} payload=${JSON.stringify({
          task_class: mr.malvTaskClass,
          preferred_tier: mr.malvPreferredTier,
          gpu_available: mr.malvGpuTierReachable ?? null,
          gpu_health_probe_enabled: mr.malvGpuTierHealthProbeEnabled ?? null,
          cpu_available: cpuAvail,
          selected_tier: mr.malvSelectedTier,
          selected_backend: mr.malvSelectedBackend,
          selected_agent: mr.malvSelectedAgent,
          fallback_used: mr.malvFallbackUsed,
          fallback_reason: mr.malvFallbackReason,
          local_inference_skipped: Boolean(skipReason),
          local_inference_skip_reason: skipReason,
          local_inference_used: localUsed,
          local_inference_effective_model: effModel
        })}`
      );
    }

    return {
      reply: workerRes.reply,
      meta: sanitizeMalvChatAssistantMetaForUser(resultMeta as Record<string, unknown>),
      runId
    };
  }

  /**
   * Tier-0 reflex lane: deterministic templates after minimal thread load only.
   * must block: kill-switch (caller), conversation auth in thread slice, aiJob completion row for FK integrity.
   */
  private async executeReflexLaneChatTurn(ps: {
    startedAt: number;
    conversationId: string;
    reflexKind: MalvReflexKind;
    classifiedWorkerMode: "light" | "beast";
    modeType: ModeType;
    toneAnalysis: ReturnType<typeof mergeExplicitMoodHint>;
    ctx: ChatContext;
    args: {
      userId: string;
      conversationId: string | null;
      message: string;
      beastLevel?: BeastLevel;
      userRole?: GlobalRole;
      workspaceId?: string | null;
      vaultSessionId?: string | null;
      assistantMessageId: string;
      abortSignal?: AbortSignal;
      inputMeta?: MalvInputMetadata | null;
      onAssistantStreamChunk?: (evt: { conversationId: string; runId: string; text: string; done: false }) => void;
    };
  }): Promise<HandleChatResult> {
    const { args, ctx, conversationId, reflexKind, classifiedWorkerMode, modeType, toneAnalysis, startedAt } = ps;
    const tReflex0 = Date.now();
    const slice = await this.contextAssembly.loadReflexThreadSlice({
      userId: args.userId,
      conversationId
    });
    const priorAssistantTexts = slice.priorMessages
      .filter((m) => m.role === "assistant")
      .map((m) => String(m.content ?? "").trim())
      .filter((c) => c.length > 0);

    const tmpl = buildDeterministicTemplateShortCircuit({
      reflexKind,
      userMessage: args.message,
      priorMessages: slice.priorMessages,
      priorAssistantTexts,
      conversationId,
      toneAnalysis,
      isFirstThreadTurn: slice.isFirstThreadTurn
    });

    const metaDecision: MetaIntelligenceDecision | null = null;
    const responsePolicy = mapResponsePolicy(modeType, toneAnalysis, metaDecision);
    const operatorHint =
      /\b(run tests?|build|debug|stack|sandbox|approve|deploy)\b/i.test(args.message) ||
      Boolean(args.inputMeta?.operatorPhase);

    const userRef = { id: args.userId } as any as UserEntity;
    const conversationRef = { id: conversationId } as any as ConversationEntity;

    const aiJob = this.aiJobs.create({
      user: userRef,
      conversation: conversationRef as any,
      jobType: "beast_chat_infer",
      requestedMode: ctx.beastLevel,
      classifiedMode: classifiedWorkerMode,
      status: "running",
      progress: 8,
      shardKey: "beast_chat:reflex",
      queuePriority: 40,
      payload: {
        messagePreview: args.message.slice(0, 400),
        assistantMessageId: args.assistantMessageId,
        inputMeta: args.inputMeta ?? null,
        malvOperatorMode: modeType,
        malvUserTone: toneAnalysis.userTone,
        malvResponsePolicy: responsePolicy.primary,
        malvReflexLane: true
      },
      beastLevel: ctx.beastLevel
    });
    await this.aiJobs.save(aiJob);
    const runId = aiJob.id;

    if (args.onAssistantStreamChunk && tmpl.reply) {
      args.onAssistantStreamChunk({
        conversationId,
        runId,
        text: shapeMalvAssistantStreamDeltaForDelivery(tmpl.reply),
        done: false
      });
    }

    const reflexLearningSnap = this.malvLearning.snapshotForUser(args.userId);
    const inferenceTrace = {
      runId,
      malvCognitiveEffortTier: 0 as const,
      malvReflexLane: true,
      malvMetaIntelligenceSkipped: true,
      malvIntentServiceSkipped: true,
      malvContextAssemblySkipped: true,
      malvTtftStageMs: {
        reflex_thread_slice_ms: Date.now() - tReflex0,
        reflex_total_prep_ms: Date.now() - startedAt
      },
      malvOperatorMode: modeType,
      workerClassifiedMode: classifiedWorkerMode,
      malvUserTone: toneAnalysis.userTone,
      malvResponsePolicy: responsePolicy.primary,
      malvChatInferenceTransport: "reflex_template" as const,
      malvLearningSignalsCaptured: false,
      malvAdaptiveAdjustments: {
        tierBias: reflexLearningSnap.tierBias,
        clarificationBias: reflexLearningSnap.clarificationBias,
        memoryBias: reflexLearningSnap.memoryBias,
        verbosityBias: reflexLearningSnap.verbosityBias
      }
    };

    let workerRes: BeastInferenceResponse = {
      reply: assertMalvAssistantIdentityGate(tmpl.reply),
      meta: {
        malvReplySource: tmpl.malvReplySource,
        malvReflexLane: true,
        malvLightSocialShortCircuit: reflexKind.kind === "light_social",
        malvLightSocialKind: reflexKind.kind === "light_social" ? reflexKind.lightSocialKind : undefined,
        malvGreetingShortCircuit: reflexKind.kind === "greeting",
        malvIdentityHandled: reflexKind.kind === "identity",
        malvCasualSmallTalkShortCircuit: reflexKind.kind === "social_smalltalk",
        malvSocialSmalltalkCheckinShortCircuit: reflexKind.kind === "social_smalltalk",
        malvUserTone: toneAnalysis.userTone,
        malvResponsePolicy: responsePolicy.primary,
        malvResponsePolicySecondary: responsePolicy.secondary ?? null,
        malvToneReason: toneAnalysis.toneReasons,
        malvRepetitionGuardTriggered: tmpl.malvRepetitionGuardTriggered,
        malvHadModelIdentityLeak: tmpl.malvHadModelIdentityLeak,
        replyMode: this.replyModeFrom({ usedFallback: false, memoryCount: 0, operatorHint }),
        malvInferenceTrace: inferenceTrace,
        malvTurnOutcome: "complete" as const
      }
    };

    const reflexBackstop = applyMalvAssistantVisibleCompletionBackstop({
      meta: (workerRes.meta ?? {}) as Record<string, unknown>,
      reply: workerRes.reply ?? "",
      runId,
      logger: this.logger,
      logContext: "ai_job_persist"
    });
    workerRes = {
      ...workerRes,
      meta: {
        ...reflexBackstop.meta,
        malvTurnOutcome: reflexBackstop.outcome
      }
    };

    aiJob.status = "completed";
    aiJob.progress = 100;
    aiJob.resultReply = workerRes.reply;
    aiJob.resultMeta = {
      ...(workerRes.meta ?? {}),
      replyMode: this.replyModeFrom({ usedFallback: false, memoryCount: 0, operatorHint }),
      malvBehaviorMode: modeType,
      malvOperatorMode: modeType,
      malvSuperFix: false,
      malvInferenceTrace: inferenceTrace,
      malvBeastSignalReason: tmpl.beastSignalReason,
      malvClassifiedIntent: MALV_REFLEX_CLASSIFIED_INTENT_PLACEHOLDER,
      malvExecutionStrategy: MALV_REFLEX_EXECUTION_STRATEGY_PLACEHOLDER,
      malvIntentDecomposition: null
    };
    aiJob.errorMessage = null;
    aiJob.finishedAt = new Date();
    await this.aiJobs.save(aiJob);

    this.realtime.emitToUser(args.userId, "job:update", {
      aiJobId: aiJob.id,
      status: aiJob.status,
      progress: aiJob.progress
    });

    this.logger.log(
      `[MALV_TTFT] reflex_lane runId=${runId} prepMs=${Date.now() - startedAt} threadMs=${inferenceTrace.malvTtftStageMs.reflex_thread_slice_ms}`
    );

    void this.scheduleDeferredReflexPostTurnWork({
      userRef,
      aiJob,
      userId: args.userId,
      runId,
      startedAt,
      classifiedWorkerMode,
      modeType,
      beastLevel: ctx.beastLevel,
      usedApiFallback: false,
      workerRes,
      message: args.message,
      conversationMode: slice.conversationMode,
      priorMessages: slice.priorMessages
    });

    const resultMeta = aiJob.resultMeta ?? workerRes.meta;
    this.logger.log(
      `[MALV_CHAT_TURN_BACKEND] runId=${runId} selected=non_inferencing replySource=${String((resultMeta as Record<string, unknown>)?.malvReplySource ?? "none")}`
    );

    return {
      reply: workerRes.reply,
      meta: sanitizeMalvChatAssistantMetaForUser(resultMeta as Record<string, unknown>),
      runId
    };
  }

  /**
   * Non-user-critical persistence for reflex turns — can defer: logs, suggestions, reflection, optional memory auto-log.
   * must block (handled before this): aiJob completion row for assistant FK + realtime job:update for active UIs.
   */
  private scheduleDeferredReflexPostTurnWork(ps: {
    userRef: UserEntity;
    aiJob: AiJobEntity;
    userId: string;
    runId: string;
    startedAt: number;
    classifiedWorkerMode: "light" | "beast";
    modeType: ModeType;
    beastLevel: BeastLevel;
    usedApiFallback: boolean;
    workerRes: BeastInferenceResponse;
    message: string;
    conversationMode: string;
    priorMessages: Array<{ role: string; content: string }>;
  }): void {
    void (async () => {
      try {
        const log = this.beastLogs.create({
          user: ps.userRef,
          aiJob: ps.aiJob,
          eventType: "inference",
          payload: {
            mode: ps.classifiedWorkerMode,
            classified: ps.classifiedWorkerMode,
            malvOperatorMode: ps.modeType,
            replyLen: ps.workerRes.reply.length,
            usedApiFallbackBrain: ps.usedApiFallback,
            contextChars: 0,
            memorySnippetCount: 0,
            malvReflexLaneDeferredLog: true
          }
        });
        await this.beastLogs.save(log);

        const suggestion = this.suggestions.create({
          user: ps.userRef,
          aiJob: ps.aiJob,
          suggestionType: "next_step",
          riskLevel: "low",
          status: "active",
          content: ps.workerRes.reply.slice(0, 1200),
          metadata: {
            classifiedMode: ps.classifiedWorkerMode,
            malvOperatorMode: ps.modeType,
            beastLevel: ps.beastLevel,
            usedApiFallback: ps.usedApiFallback,
            malvReflexLaneDeferred: true
          }
        });
        await this.suggestions.save(suggestion);

        const autoLog =
          (this.cfg.get<string>("MALV_MEMORY_AUTO_LOG_CHAT_TURNS") ?? process.env.MALV_MEMORY_AUTO_LOG_CHAT_TURNS) === "true";
        if (autoLog && ps.conversationMode !== "collaboration") {
          try {
            await this.memory.addEntry({
              userId: ps.userId,
              scope: "session",
              type: "chat_turn",
              title: "Latest turn",
              content: `User: ${ps.message}\nAssistant: ${ps.workerRes.reply}`,
              tags: ["session", "chat_turn"],
              source: "chat",
              sourceRefs: { aiJobId: ps.aiJob.id },
              collaborationRoomId: null
            });
          } catch (e) {
            this.logger.warn(`[MALV BRAIN] reflex deferred memory addEntry skipped: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        void this.reflection.logChatReflection({
          userId: ps.userId,
          correlationId: ps.runId,
          success: !ps.usedApiFallback,
          latencyMs: Date.now() - ps.startedAt,
          errorClass: ps.usedApiFallback ? "fallback_brain" : null,
          summary: ps.workerRes.reply.slice(0, 240),
          metadata: {
            classifiedMode: ps.classifiedWorkerMode,
            malvOperatorMode: ps.modeType,
            superFix: false,
            malvReflexLaneDeferredReflection: true
          }
        });

        if (this.malvLearning.isEnabled()) {
          const priorUserMsgs = ps.priorMessages
            .filter((m) => m.role === "user")
            .map((m) => String(m.content ?? "").trim())
            .filter((c) => c.length > 0);
          const lastAssistantPrior = [...ps.priorMessages].filter((m) => m.role === "assistant").pop();
          const respConf = evaluateResponseConfidence({
            reply: ps.workerRes.reply ?? "",
            userMessage: ps.message,
            cognitiveTier: 0,
            internalPhaseCount: 0
          });
          this.malvLearning.scheduleTurnCapture({
            userId: ps.userId,
            runId: ps.runId,
            reflexLane: true,
            cognitiveTier: 0,
            primaryIntent: "unknown",
            message: ps.message,
            ambiguity: false,
            memorySnippetCount: 0,
            modelUsed: "reflex_template",
            tierCorrection: null,
            responseConfidence: respConf,
            refinementTriggered: false,
            driftKind: null,
            replySource: String((ps.workerRes.meta as Record<string, unknown>)?.malvReplySource ?? ""),
            priorUserMessages: priorUserMsgs,
            lastAssistantContent: lastAssistantPrior ? String(lastAssistantPrior.content ?? "") : null
          });
        }
      } catch (e) {
        this.logger.warn(
          `[MALV REFLEX] deferred post-turn work failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    })();
  }

  private async ensureWorkerOnline(): Promise<void> {
    const workerType = "beast" as const;
    const baseUrl = resolveBeastWorkerBaseUrl((k) => this.cfg.get<string>(k));
    const nodeName = this.cfg.get<string>("MALV_BEAST_NODE_NAME") ?? "local-beast-worker";

    const existing = await this.aiWorkers.findOne({
      where: { workerType, baseUrl }
    });

    if (existing) {
      existing.status = "online";
      existing.lastSeenAt = new Date();
      await this.aiWorkers.save(existing);
      return;
    }

    const entity = this.aiWorkers.create({
      workerType,
      nodeName,
      baseUrl,
      status: "online",
      lastSeenAt: new Date(),
      capabilities: { modes: ["light", "cpu", "gpu", "beast"] }
    });
    await this.aiWorkers.save(entity);
  }
}
