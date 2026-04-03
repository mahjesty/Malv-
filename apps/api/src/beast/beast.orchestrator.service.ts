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
import {
  buildMalvChatPrompt,
  buildStandardReasoningTrace,
  MALV_SYSTEM_ROLE_PROMPT,
  summarizeMalvPromptStructure
} from "./malv-brain-prompt";
import { classifyMalvMode, type ModeType } from "./mode-router";
import { buildExecutionPlan, formatExecutionPlanForTrace, shouldAttachExecutionPlan } from "./execution-plan";
import { appendBeastSuggestionBlock, detectBeastSignal } from "./beast-signal";
import { shapeMalvReply } from "./response-shaper";
import {
  analyzeUserTone,
  detectLightSocialMessage,
  detectMalvIdentityQuestion,
  detectSimpleGreeting,
  mergeExplicitMoodHint
} from "./malv-conversation-signals";
import {
  buildMalvGeneratorContext,
  detectBareCasualSmallTalk,
  generateMalvResponse
} from "./malv-response-generator";
import { buildToneInstructionBlock, mapResponsePolicy } from "./malv-response-policy";
import { buildSuperFixPlan, buildSuperFixReasoningTrace, detectSuperFixIntent } from "./super-fix-planner";
import { SandboxExecutionService } from "../sandbox/sandbox-execution.service";
import { ReflectionService } from "../improvement/reflection.service";
import { MalvControlledConfigService } from "../improvement/malv-controlled-config.service";
import { IntentUnderstandingService } from "./intent-understanding.service";
import { ExecutionStrategyService } from "./execution-strategy.service";
import { buildAutonomousClarificationReply, buildAutonomousOrchestrationBlock } from "./autonomous-orchestration.prompt";
import { PhasedChatOrchestrationService } from "./phased-chat-orchestration.service";
import { MalvChatCciHandoffService } from "../code-change-intelligence/malv-chat-cci-handoff.service";
import { MetaIntelligenceRouterService } from "../intelligence/meta-intelligence-router.service";
import { ContinuityBridgeService } from "../intelligence/continuity-bridge.service";
import type { MetaIntelligenceDecision } from "../intelligence/meta-intelligence.types";
import { IntentDecompositionService } from "./intent-decomposition.service";
import { WorkspaceRuntimeSessionService } from "../workspace/workspace-runtime-session.service";

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

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as Error & { code?: string };
  return err.name === "AbortError" || err.code === "ABORT_ERR";
}

@Injectable()
export class BeastOrchestratorService {
  private readonly logger = new Logger(BeastOrchestratorService.name);

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
    private readonly executionStrategy: ExecutionStrategyService,
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
    @Optional() private readonly metaIntelligenceRouter?: MetaIntelligenceRouterService,
    @Optional() private readonly continuityBridge?: ContinuityBridgeService
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

  private shouldAttachReasoningTrace(message: string, classifiedMode: "light" | "beast"): boolean {
    if (classifiedMode === "beast") return true;
    return (
      message.length > 140 ||
      message.split("\n").length > 2 ||
      /\b(plan|steps|analyze|architecture|design|fix|debug|implement)\b/i.test(message)
    );
  }

  private async routeToWorker(
    mode: "light" | "beast",
    aggregated: Record<string, unknown>,
    prompt: string,
    signal?: AbortSignal
  ) {
    const response: BeastInferenceResponse = await this.worker.infer({
      mode,
      prompt,
      context: aggregated,
      signal
    });
    return response;
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

    const startedAt = Date.now();
    let classifiedWorkerMode = this.taskClassifier(ctx, args.message);
    const modeType: ModeType = classifyMalvMode(args.message, args.inputMeta ?? null);
    const toneAnalysis = mergeExplicitMoodHint(analyzeUserTone(args.message), args.inputMeta?.userMoodHint ?? null);
    const superFix = detectSuperFixIntent(args.message, args.inputMeta ?? null);
    const superFixPlan = superFix ? buildSuperFixPlan(args.message) : null;

    const malvClassifiedIntent = this.intentUnderstanding.classify(args.message, args.inputMeta ?? null);
    const malvExecutionStrategy = this.executionStrategy.buildStrategy(malvClassifiedIntent);
    const intentDecomposition = this.buildIntentDecompositionHook(args.message);
    const bridgeSessionId = ctx.conversationId ?? args.userId;
    const bridgePrev = this.continuityBridge?.getContext(bridgeSessionId);
    const currentSurface = args.inputMeta?.inputMode === "voice" || args.inputMeta?.inputMode === "video" ? "call" : modeType === "execute" ? "execution" : "chat";
    if (this.continuityBridge && bridgePrev) {
      try {
        this.continuityBridge.transferContext(bridgePrev.lastSurface, currentSurface, bridgeSessionId);
      } catch {
        // Non-blocking continuity bridge.
      }
    }
    let metaDecision: MetaIntelligenceDecision | null = null;
    try {
      if (this.metaIntelligenceRouter) {
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
          bridgeAvailability: ["mobile_agent", "desktop_agent", "browser_agent", "home_assistant_bridge"],
          requestedExternalExecution: modeType === "execute" || /\bopen\b|\bsend\b|\bcall\b|\bturn on\b|\bturn off\b|\blaunch\b/i.test(args.message),
          vaultScoped: Boolean(args.vaultSessionId),
          sessionId: bridgeSessionId
        });
      }
    } catch (e) {
      this.logger.warn(`[MALV META] router disabled due to error: ${e instanceof Error ? e.message : String(e)}`);
      metaDecision = null;
    }
    const responsePolicy = mapResponsePolicy(modeType, toneAnalysis, metaDecision);
    if (malvExecutionStrategy.preferBeastWorker && classifiedWorkerMode === "light") {
      classifiedWorkerMode = "beast";
    }

    await this.ensureWorkerOnline();

    const userRef = { id: args.userId } as any as UserEntity;
    const conversationRef = ctx.conversationId ? ({ id: ctx.conversationId } as any as ConversationEntity) : null;

    if (!ctx.conversationId) {
      throw new Error("BeastOrchestratorService.handleChat requires a persisted conversationId");
    }

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

    let chatRuntimeSessionId: string | null = null;
    try {
      const wsSession = await this.workspaceRuntimeSessions.createSession({
        userId: args.userId,
        sourceType: "chat",
        sourceId: ctx.conversationId
      });
      chatRuntimeSessionId = wsSession.id;
    } catch (e) {
      this.logger.warn(
        `[MALV BRAIN] workspace runtime session ensure failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }

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

    this.realtime.emitMalvOrchestration(args.userId, {
      type: "thinking",
      conversationId: ctx.conversationId,
      messageId: args.assistantMessageId,
      phase: "analyzing_context",
      detail: `intent=${malvClassifiedIntent.primaryIntent} strategy=${malvExecutionStrategy.mode}`
    });

    let assembled;
    try {
      assembled = await this.contextAssembly.assemble({
        userId: args.userId,
        conversationId: ctx.conversationId,
        userMessage: args.message,
        beastLevel: ctx.beastLevel,
        vaultSessionId: args.vaultSessionId ?? null,
        inputMeta: args.inputMeta ?? null
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[MALV CHAT] context assembly failed ${msg}`);
      assembled = {
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
        contextChars: 0
      };
    }

    const policy = this.privacyPolicyGate(ctx, assembled.vaultScoped);
    if (!policy.allowUserScopes) {
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
      return { reply, meta: aiJob.resultMeta, runId };
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
    const bareCasualSmallTalk =
      !lightSocialKind && !isGreeting && !identityKind && detectBareCasualSmallTalk(args.message);

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
    } else if (this.shouldAttachReasoningTrace(args.message, classifiedWorkerMode)) {
      reasoningTrace = buildStandardReasoningTrace(modeType);
    }

    const directiveExtra = await this.controlledConfig.getDirectiveExtraText();

    let contextForPrompt = assembled.contextBlock;
    if (superFixSandboxRunId) {
      contextForPrompt += `\n\nSuper Fix: a read-only sandbox run was staged (id=${superFixSandboxRunId}). Do not invent its output; tell the operator how to use the run and what to verify when it finishes.`;
    }

    let cciHandoffMeta: Record<string, unknown> = {};
    if (!superFix) {
      const ho = await this.cciHandoff.maybeBuildHandoffContext({
        userId: args.userId,
        userRole: args.userRole ?? "user",
        workspaceId: args.workspaceId,
        message: args.message,
        assistantMessageId: args.assistantMessageId,
        primaryIntent: malvClassifiedIntent.primaryIntent
      });
      if (ho) {
        contextForPrompt += `\n\n${ho.contextAppend}`;
        cciHandoffMeta = ho.metaPatch;
      }
    }

    this.realtime.emitMalvOrchestration(args.userId, {
      type: "memory_context",
      conversationId: ctx.conversationId,
      messageId: args.assistantMessageId,
      snippetCount: assembled.memorySnippets.length,
      vaultScoped: assembled.vaultScoped
    });

    this.realtime.emitMalvOrchestration(args.userId, {
      type: "thinking",
      conversationId: ctx.conversationId,
      messageId: args.assistantMessageId,
      phase: "building_response",
      detail: `routing=${classifiedWorkerMode}`
    });

    const operatorHint =
      /\b(run tests?|build|debug|stack|sandbox|approve|deploy)\b/i.test(args.message) ||
      Boolean(args.inputMeta?.operatorPhase);

    let malvServerPhasedOrchestrationEnabled = false;
    const inferenceTrace = {
      runId,
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
      malvBareCasualSmallTalk: bareCasualSmallTalk,
      malvIntentKind: malvClassifiedIntent.primaryIntent,
      malvIntentScope: malvClassifiedIntent.scopeSize,
      malvIntentComplexity: malvClassifiedIntent.complexity,
      malvIntentDomains: malvClassifiedIntent.domains,
      malvExecutionStrategyMode: malvExecutionStrategy.mode,
      malvInternalPhaseCount: malvExecutionStrategy.internalPhases.length,
      malvAutonomousOrchestrationAttached: Boolean(autonomousOrchestrationBlock),
      malvIntentDecompositionAttached: Boolean(intentDecomposition),
      malvRouterDecisionTrace: metaDecision?.routerDecisionTrace ?? null,
      malvConfidenceTrace: metaDecision?.confidenceTrace ?? null,
      malvContinuityTrace: metaDecision?.continuityTrace ?? null,
      malvRealtimeCallHook: this.buildRealtimeCallHook(args.inputMeta ?? null, metaDecision),
      malvExternalExecutionHook: this.buildExternalExecutionHook(metaDecision),
      malvContinuityHook: this.buildContinuityHook(metaDecision)
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
      /** Real system role for OpenAI-style backends (identity lock before user prompt). */
      systemPrompt: MALV_SYSTEM_ROLE_PROMPT
    };

    const toneInstructionBlock = buildToneInstructionBlock(responsePolicy);

    let workerRes: BeastInferenceResponse;
    let usedApiFallback = false;
    let workerAttemptError: string | undefined;
    let malvRepetitionGuardTriggered = false;
    let malvHadModelIdentityLeak = false;
    let beastSignalReason: string | null = null;

    if (lightSocialKind) {
      this.logger.log(`[MALV BRAIN] light-social short-circuit runId=${runId} kind=${lightSocialKind}`);
      const beastSigEarly = detectBeastSignal({
        userMessage: args.message,
        priorMessages: assembled.priorMessages
      });
      beastSignalReason = beastSigEarly.reason ?? null;
      const shaped = shapeMalvReply(
        generateMalvResponse(
          buildMalvGeneratorContext({
            userMessage: args.message,
            conversationHistory: assembled.priorMessages,
            conversationId: ctx.conversationId ?? runId,
            userTone: toneAnalysis.userTone,
            toneReasons: toneAnalysis.toneReasons,
            isFirstThreadTurn,
            isGreeting: false,
            detectedIntent: "light_social",
            lightSocialKind
          })
        ),
        { priorAssistantTexts }
      );
      malvRepetitionGuardTriggered = shaped.repetitionGuardTriggered;
      malvHadModelIdentityLeak = shaped.hadModelIdentityLeak;
      const withBeast = appendBeastSuggestionBlock(shaped.text, beastSigEarly.suggestion);
      workerRes = {
        reply: withBeast,
        meta: {
          malvReplySource: "malv_light_social_short_circuit",
          malvLightSocialShortCircuit: true,
          malvLightSocialKind: lightSocialKind,
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
    } else if (isGreeting) {
      this.logger.log(`[MALV BRAIN] greeting short-circuit runId=${runId}`);
      const beastSigEarly = detectBeastSignal({
        userMessage: args.message,
        priorMessages: assembled.priorMessages
      });
      beastSignalReason = beastSigEarly.reason ?? null;
      const shaped = shapeMalvReply(
        generateMalvResponse(
          buildMalvGeneratorContext({
            userMessage: args.message,
            conversationHistory: assembled.priorMessages,
            conversationId: ctx.conversationId ?? runId,
            userTone: toneAnalysis.userTone,
            toneReasons: toneAnalysis.toneReasons,
            isFirstThreadTurn,
            isGreeting: true,
            detectedIntent: "greeting"
          })
        ),
        { priorAssistantTexts }
      );
      malvRepetitionGuardTriggered = shaped.repetitionGuardTriggered;
      malvHadModelIdentityLeak = shaped.hadModelIdentityLeak;
      const withBeast = appendBeastSuggestionBlock(shaped.text, beastSigEarly.suggestion);
      workerRes = {
        reply: withBeast,
        meta: {
          malvReplySource: "malv_greeting_short_circuit",
          malvGreetingShortCircuit: true,
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
    } else if (identityKind) {
      this.logger.log(`[MALV BRAIN] identity short-circuit runId=${runId} kind=${identityKind}`);
      const beastSigEarly = detectBeastSignal({
        userMessage: args.message,
        priorMessages: assembled.priorMessages
      });
      beastSignalReason = beastSigEarly.reason ?? null;
      const shaped = shapeMalvReply(
        generateMalvResponse(
          buildMalvGeneratorContext({
            userMessage: args.message,
            conversationHistory: assembled.priorMessages,
            conversationId: ctx.conversationId ?? runId,
            userTone: toneAnalysis.userTone,
            toneReasons: toneAnalysis.toneReasons,
            isFirstThreadTurn,
            isGreeting: false,
            detectedIntent: "identity_question",
            identityKind
          })
        ),
        { priorAssistantTexts }
      );
      malvRepetitionGuardTriggered = shaped.repetitionGuardTriggered;
      malvHadModelIdentityLeak = shaped.hadModelIdentityLeak;
      const withBeast = appendBeastSuggestionBlock(shaped.text, beastSigEarly.suggestion);
      workerRes = {
        reply: withBeast,
        meta: {
          malvReplySource: "malv_identity_short_circuit",
          malvIdentityHandled: true,
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
    } else if (bareCasualSmallTalk) {
      this.logger.log(`[MALV BRAIN] casual-small-talk short-circuit runId=${runId}`);
      const beastSigEarly = detectBeastSignal({
        userMessage: args.message,
        priorMessages: assembled.priorMessages
      });
      beastSignalReason = beastSigEarly.reason ?? null;
      const shaped = shapeMalvReply(
        generateMalvResponse(
          buildMalvGeneratorContext({
            userMessage: args.message,
            conversationHistory: assembled.priorMessages,
            conversationId: ctx.conversationId ?? runId,
            userTone: toneAnalysis.userTone,
            toneReasons: toneAnalysis.toneReasons,
            isFirstThreadTurn,
            isGreeting: false,
            detectedIntent: "casual_small_talk"
          })
        ),
        { priorAssistantTexts }
      );
      malvRepetitionGuardTriggered = shaped.repetitionGuardTriggered;
      malvHadModelIdentityLeak = shaped.hadModelIdentityLeak;
      const withBeast = appendBeastSuggestionBlock(shaped.text, beastSigEarly.suggestion);
      workerRes = {
        reply: withBeast,
        meta: {
          malvReplySource: "malv_casual_small_talk_short_circuit",
          malvCasualSmallTalkShortCircuit: true,
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
    } else if (malvExecutionStrategy.mode === "require_clarification" && !superFix) {
      this.logger.log(`[MALV BRAIN] autonomous clarification short-circuit runId=${runId}`);
      const beastSigEarly = detectBeastSignal({
        userMessage: args.message,
        priorMessages: assembled.priorMessages
      });
      beastSignalReason = beastSigEarly.reason ?? null;
      const clarificationText = buildAutonomousClarificationReply(malvClassifiedIntent);
      const shaped = shapeMalvReply(clarificationText, { priorAssistantTexts });
      malvRepetitionGuardTriggered = shaped.repetitionGuardTriggered;
      malvHadModelIdentityLeak = shaped.hadModelIdentityLeak;
      const withBeast = appendBeastSuggestionBlock(shaped.text, beastSigEarly.suggestion);
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
    } else {
      const useServerPhased =
        this.phasedChat.isEnabled() &&
        malvExecutionStrategy.mode === "phased" &&
        !superFix &&
        malvExecutionStrategy.internalPhases.length > 0;

      if (useServerPhased) {
        malvServerPhasedOrchestrationEnabled = true;
      }

      const phasedNotice =
        "The API is executing phased orchestration across multiple worker turns. Answer only the current phase; earlier phases were completed in prior inference steps within this same request.";

      if (useServerPhased) {
        this.logger.log(
          `[MALV BRAIN] server phased orchestration runId=${runId} phases=${malvExecutionStrategy.internalPhases.length}`
        );
        const phasedOutcome = await this.phasedChat.runWorkerPhases({
          originalUserMessage: args.message,
          phases: malvExecutionStrategy.internalPhases,
          mode: classifiedWorkerMode,
          baseAggregated: aggregated,
          signal: args.abortSignal,
          synthesizeFallback: (reason) =>
            this.fallbackBrain.synthesize({
              userMessage: args.message,
              classifiedMode: classifiedWorkerMode,
              workerError: reason
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
          buildPrompt: (userMessageForStep) =>
            buildMalvChatPrompt({
              userMessage: userMessageForStep,
              contextBlock: contextForPrompt,
              beastLevel: ctx.beastLevel,
              classifiedMode: classifiedWorkerMode,
              modeType,
              reasoningTrace,
              superFix,
              directiveExtra: directiveExtra || undefined,
              toneInstructionBlock,
              isFirstThreadTurn,
              userTone: toneAnalysis.userTone,
              serverPhasedOrchestrationNotice: phasedNotice
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
          directiveExtra: directiveExtra || undefined,
          toneInstructionBlock,
          isFirstThreadTurn,
          userTone: toneAnalysis.userTone,
          autonomousOrchestrationBlock: autonomousOrchestrationBlock ?? undefined
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
          workerRes = await this.routeToWorker(classifiedWorkerMode, aggregated, prompt, args.abortSignal);
          const rawWorkerLen = (workerRes.reply ?? "").trim().length;
          this.logger.log(`[MALV BRAIN] worker reply length: ${rawWorkerLen} runId=${runId}`);
          this.logger.log(`[MALV WORKER] worker response received runId=${runId} len=${(workerRes.reply ?? "").length}`);
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
              workerError: "Worker returned an empty reply body."
            });
            usedApiFallback = true;
            this.logger.log(`[MALV BRAIN] fallback reply length: ${(workerRes.reply ?? "").length}`);
          } else {
            workerRes = {
              reply: trimmed,
              meta: {
                ...(workerRes.meta ?? {}),
                malvReplySource: "beast_worker",
                replyMode: this.replyModeFrom({
                  usedFallback: false,
                  memoryCount: assembled.memorySnippets.length,
                  operatorHint
                })
              }
            };
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
            return {
              reply: "",
              runId,
              interrupted: true,
              meta: { malvReplySource: "interrupted", runId }
            };
          }
          workerAttemptError = e instanceof Error ? e.message : String(e);
          this.logger.error(`[MALV BRAIN] error in generation pipeline: ${workerAttemptError}`);
          workerRes = this.fallbackBrain.synthesize({
            userMessage: args.message,
            classifiedMode: classifiedWorkerMode,
            workerError: workerAttemptError
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
            workerError: "Emergency: both worker and prior fallback returned empty string."
          });
          usedApiFallback = true;
          this.logger.log(`[MALV BRAIN] fallback reply length: ${(workerRes.reply ?? "").length}`);
        }
      }

      const beastSig = detectBeastSignal({
        userMessage: args.message,
        priorMessages: assembled.priorMessages
      });
      beastSignalReason = beastSig.reason ?? null;
      const shaped = shapeMalvReply(workerRes.reply ?? "", { priorAssistantTexts });
      malvRepetitionGuardTriggered = shaped.repetitionGuardTriggered;
      malvHadModelIdentityLeak = shaped.hadModelIdentityLeak;
      const withBeast = appendBeastSuggestionBlock(shaped.text, beastSig.suggestion);
      workerRes = { ...workerRes, reply: withBeast };
    }

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
      malvInferenceTrace: { ...inferenceTrace, malvServerPhasedOrchestrationEnabled },
      ...cciHandoffMeta,
      malvBeastSignalReason: beastSignalReason,
      malvRepetitionGuardTriggered,
      malvGreetingShortCircuit: isGreeting,
      malvLightSocialShortCircuit: Boolean(lightSocialKind),
      malvCasualSmallTalkShortCircuit: bareCasualSmallTalk,
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
        this.continuityBridge.setContext(bridgeSessionId, {
          activeIntent: malvClassifiedIntent.primaryIntent,
          entities: [String((metaDecision?.layerOutputs?.device_control as any)?.executionTarget ?? "none")],
          lastAction: args.message.slice(0, 120),
          lastSurface: currentSurface
        });
      } catch {
        // Non-blocking continuity bridge.
      }
    }

    return { reply: workerRes.reply, meta: aiJob.resultMeta ?? workerRes.meta, runId };
  }

  private async ensureWorkerOnline(): Promise<void> {
    const workerType = "beast" as const;
    const baseUrl = this.cfg.get<string>("BEAST_WORKER_BASE_URL") ?? "http://127.0.0.1:9090";
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
