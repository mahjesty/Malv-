import { BadRequestException, forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { BeastOrchestratorService } from "../beast/beast.orchestrator.service";
import { SandboxExecutionService } from "../sandbox/sandbox-execution.service";
import { CallsService } from "../calls/calls.service";
import { CallSessionEntity } from "../db/entities/call-session.entity";
import { AiJobEntity } from "../db/entities/ai-job.entity";
import { resolveBoxedVoiceResponse, resolveTranscriptConsentTurn } from "./boxed/boxed-voice-resolver";
import { VoiceOperatorEventEntity, type VoiceIntentType } from "../db/entities/voice-operator-event.entity";
import { OperatorTargetEntity, type OperatorTargetType } from "../db/entities/operator-target.entity";
import { ReviewSessionEntity } from "../db/entities/review-session.entity";
import { ReviewFindingEntity, type ReviewFindingCategory, type ReviewFindingSeverity } from "../db/entities/review-finding.entity";
import type { GlobalRole } from "../workspace/workspace-access.service";
import { VoicePlaybackService } from "./voice-playback.service";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import { InferenceRoutingService } from "../inference/inference-routing.service";
import { ConfigService } from "@nestjs/config";
import { MalvTaskRouterService } from "../agent-system/router/malv-task-router.service";
import { malvAgentSystemEnabled } from "../agent-system/malv-agent-system.config";
import { randomUUID } from "crypto";

/** Where composer voice input should land: normal chat vs operator/Beast workflow. */
export type VoiceSessionTarget = "composer_chat" | "operator";

type VoiceContextHint = {
  page?: string | null;
  selectedFile?: string | null;
  activeConversationId?: string | null;
  activeTaskId?: string | null;
  issueId?: string | null;
  workspacePath?: string | null;
  workspaceId?: string | null;
  currentSymbol?: string | null;
  currentSpanStart?: number | null;
  currentSpanEnd?: number | null;
};

type ResolvedTarget = {
  targetType: OperatorTargetType;
  canonicalRef: string;
  confidence: number;
  metadata: Record<string, unknown>;
};

@Injectable()
export class VoiceOperatorService {
  private readonly logger = new Logger(VoiceOperatorService.name);
  private readonly contextMemory = new Map<string, VoiceContextHint>();

  constructor(
    private readonly killSwitch: KillSwitchService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    @Inject(forwardRef(() => BeastOrchestratorService)) private readonly beast: BeastOrchestratorService,
    private readonly calls: CallsService,
    private readonly voicePlayback: VoicePlaybackService,
    @Inject(forwardRef(() => SandboxExecutionService))
    private readonly sandbox: SandboxExecutionService,
    @InjectRepository(AiJobEntity) private readonly aiJobs: Repository<AiJobEntity>,
    @InjectRepository(VoiceOperatorEventEntity) private readonly voiceEvents: Repository<VoiceOperatorEventEntity>,
    @InjectRepository(OperatorTargetEntity) private readonly operatorTargets: Repository<OperatorTargetEntity>,
    @InjectRepository(ReviewSessionEntity) private readonly reviewSessions: Repository<ReviewSessionEntity>,
    @InjectRepository(ReviewFindingEntity) private readonly reviewFindings: Repository<ReviewFindingEntity>,
    private readonly beastWorker: BeastWorkerClient,
    private readonly inferenceRouting: InferenceRoutingService,
    private readonly cfg: ConfigService,
    private readonly malvTaskRouter: MalvTaskRouterService
  ) {}

  private detectIntent(utterance: string): VoiceIntentType {
    const t = utterance.toLowerCase();
    if (t.includes("review this") || t.includes("audit this file") || t.includes("check this page") || t.includes("look for bugs")) return "inspect";
    if (t.includes("vault")) return "vault_trigger";
    if (t.includes("debug") || t.includes("find out why") || t.includes("run through this task")) return "operator_workflow";
    if (t.includes("run") || t.includes("check this error") || t.includes("execute")) return "execute_task";
    if (t.includes("inspect") || t.includes("search this project") || t.includes("this file")) return "inspect";
    if (t.includes("summarize")) return "summarize";
    if (t.includes("explain")) return "explain";
    return "ask";
  }

  private isReviewUtterance(utterance: string): boolean {
    const t = utterance.toLowerCase();
    return t.includes("review this") || t.includes("audit this file") || t.includes("check this page") || t.includes("look for bugs");
  }

  private resolveTarget(utterance: string, context: VoiceContextHint): ResolvedTarget {
    const t = utterance.toLowerCase();
    if (t.includes("this function") && context.selectedFile && context.currentSymbol) {
      return {
        targetType: "symbol",
        canonicalRef: `${context.selectedFile}#${context.currentSymbol}`,
        confidence: 0.96,
        metadata: {
          filePath: context.selectedFile,
          symbol: context.currentSymbol,
          spanStart: context.currentSpanStart ?? null,
          spanEnd: context.currentSpanEnd ?? null
        }
      };
    }
    if ((t.includes("this file") || t.includes("audit this file")) && context.selectedFile) {
      return {
        targetType: "file",
        canonicalRef: context.selectedFile,
        confidence: 0.94,
        metadata: { filePath: context.selectedFile, symbol: context.currentSymbol ?? null }
      };
    }
    if ((t.includes("this page") || t.includes("check this page")) && context.page) {
      return { targetType: "page", canonicalRef: context.page, confidence: 0.9, metadata: { page: context.page } };
    }
    if (t.includes("this issue") && context.issueId) {
      return { targetType: "issue", canonicalRef: context.issueId, confidence: 0.9, metadata: { issueId: context.issueId } };
    }
    if (t.includes("this task") && context.activeTaskId) {
      return { targetType: "task", canonicalRef: context.activeTaskId, confidence: 0.88, metadata: { taskId: context.activeTaskId } };
    }
    if ((t.includes("this workspace") || t.includes("this repo")) && context.workspacePath) {
      return { targetType: "workspace", canonicalRef: context.workspacePath, confidence: 0.84, metadata: { workspacePath: context.workspacePath } };
    }
    return {
      targetType: "workspace",
      canonicalRef: context.workspacePath ?? "unknown_workspace",
      confidence: context.workspacePath ? 0.62 : 0.35,
      metadata: {
        fallback: true,
        page: context.page ?? null,
        selectedFile: context.selectedFile ?? null
      }
    };
  }

  private confidenceGatedIntent(intent: VoiceIntentType, confidence: number): VoiceIntentType {
    if ((intent === "execute_task" || intent === "operator_workflow") && confidence < 0.75) {
      return "explain";
    }
    return intent;
  }

  private buildReviewFindings(args: { utterance: string; commandCount: number; target: ResolvedTarget; patchProposalId?: string | null }) {
    const findings: Array<{
      severity: ReviewFindingSeverity;
      category: ReviewFindingCategory;
      title: string;
      explanation: string;
      evidence: string;
      suggestedFix: string;
      patchProposalId?: string | null;
    }> = [];
    findings.push({
      severity: "medium",
      category: "maintainability",
      title: "Scope aligned to anchored target",
      explanation: "Review execution was constrained to the resolved target rather than broad workspace-wide mutation.",
      evidence: `target=${args.target.targetType}:${args.target.canonicalRef}; commands=${args.commandCount}`,
      suggestedFix: "Keep precise anchors in voice context to maintain deterministic review scope.",
      patchProposalId: args.patchProposalId ?? null
    });
    if (args.utterance.toLowerCase().includes("bug") || args.utterance.toLowerCase().includes("error")) {
      findings.push({
        severity: "high",
        category: "logic",
        title: "Potential defect signal requires focused verification",
        explanation: "Utterance indicates a bug/error path and should trigger deterministic reproduction and targeted tests.",
        evidence: `utterance=${args.utterance.slice(0, 220)}`,
        suggestedFix: "Run narrowed test or reproduction command set and promote generated patch through approval control."
      });
    }
    return findings;
  }

  private mergeContext(userId: string, hint?: VoiceContextHint | null): VoiceContextHint {
    const prev = this.contextMemory.get(userId) ?? {};
    const merged: VoiceContextHint = {
      page: hint?.page ?? prev.page ?? null,
      selectedFile: hint?.selectedFile ?? prev.selectedFile ?? null,
      activeConversationId: hint?.activeConversationId ?? prev.activeConversationId ?? null,
      activeTaskId: hint?.activeTaskId ?? prev.activeTaskId ?? null,
      issueId: hint?.issueId ?? prev.issueId ?? null,
      workspacePath: hint?.workspacePath ?? prev.workspacePath ?? null,
      workspaceId: hint?.workspaceId ?? prev.workspaceId ?? null,
      currentSymbol: hint?.currentSymbol ?? prev.currentSymbol ?? null,
      currentSpanStart: hint?.currentSpanStart ?? prev.currentSpanStart ?? null,
      currentSpanEnd: hint?.currentSpanEnd ?? prev.currentSpanEnd ?? null
    };
    this.contextMemory.set(userId, merged);
    return merged;
  }

  async handleVoiceUtterance(args: {
    userId: string;
    userRole?: GlobalRole;
    callSessionId?: string | null;
    transcriptText: string;
    isFinal: boolean;
    contextHint?: VoiceContextHint | null;
    /** Default `operator` preserves legacy voice:transcript_chunk behavior. */
    sessionTarget?: VoiceSessionTarget;
    sessionId?: string | null;
  }) {
    if (!args.transcriptText.trim()) throw new BadRequestException("Empty transcript.");

    const sessionTarget: VoiceSessionTarget = args.sessionTarget ?? "operator";
    const sessionId = args.sessionId ?? null;
    const resolvedContext = this.mergeContext(args.userId, args.contextHint);
    if (!args.isFinal) {
      if (args.callSessionId) {
        await this.calls.markPartialTranscript({ userId: args.userId, callSessionId: args.callSessionId });
      }
      this.realtime.emitToUser(args.userId, "voice:stt_partial", { text: args.transcriptText, context: resolvedContext });
      this.realtime.emitToUser(args.userId, "voice:partial", {
        text: args.transcriptText,
        sessionId,
        sessionTarget,
        callSessionId: args.callSessionId ?? null
      });
      return { ok: true, partial: true };
    }

    if (sessionTarget === "composer_chat") {
      this.realtime.emitToUser(args.userId, "voice:final", {
        text: args.transcriptText,
        sessionId,
        sessionTarget,
        callSessionId: args.callSessionId ?? null
      });
      return { ok: true, composerChat: true };
    }

    if (args.callSessionId) {
      let callSession = await this.calls.assertUserOwnsCall({ userId: args.userId, callSessionId: args.callSessionId });
      if (callSession.malvPaused) {
        return { ok: true, paused: true };
      }

      if (callSession.kind === "voice") {
        if (callSession.voiceFlowMode === "onboarding") {
          await this.calls.nudgeVoiceFlowFromOnboarding({ userId: args.userId, callSessionId: args.callSessionId });
          callSession = await this.calls.assertUserOwnsCall({ userId: args.userId, callSessionId: args.callSessionId });
        }
        const normalizedUtterance = args.transcriptText.toLowerCase().replace(/\s+/g, " ").trim();
        const testTriggerMatch = VoicePlaybackService.matchesVoicePipelineTestTrigger(args.transcriptText);
        this.logger.log(
          JSON.stringify({
            msg: "voice_call_transcript_inspect",
            callSessionId: args.callSessionId,
            textLen: args.transcriptText.length,
            normalized: normalizedUtterance.slice(0, 200),
            testTriggerMatch
          })
        );
        if (testTriggerMatch) {
          await this.calls.recordOperatorUserUtteranceIfEnabled({
            userId: args.userId,
            callSessionId: args.callSessionId,
            content: args.transcriptText
          });
          await this.voicePlayback.emitVoicePipelineTest({
            userId: args.userId,
            callSessionId: args.callSessionId,
            triggerTranscript: args.transcriptText
          });
          return { ok: true, voicePipelineTest: true };
        }
        if (callSession.voiceFlowMode === "awaiting_transcript_consent") {
          return await this.handleVoiceTranscriptConsent(args);
        }

        await this.calls.recordOperatorUserUtteranceIfEnabled({
          userId: args.userId,
          callSessionId: args.callSessionId,
          content: args.transcriptText
        });
        await this.killSwitch.ensureSystemOnOrThrow({ reason: "voice_operator_dispatch" });
        return await this.dispatchVoiceCallBoxed(args);
      }

      await this.calls.recordUserTranscript({
        userId: args.userId,
        callSessionId: args.callSessionId,
        content: args.transcriptText
      });
      const paused = await this.calls.isCallPaused({ userId: args.userId, callSessionId: args.callSessionId });
      if (paused) {
        return { ok: true, paused: true };
      }
    }

    await this.killSwitch.ensureSystemOnOrThrow({ reason: "voice_operator_dispatch" });

    const target = this.resolveTarget(args.transcriptText, resolvedContext);
    const persistedTarget = await this.operatorTargets.save(
      this.operatorTargets.create({
        user: { id: args.userId } as any,
        workspace: resolvedContext.workspaceId ? ({ id: resolvedContext.workspaceId } as any) : null,
        targetType: target.targetType,
        canonicalRef: target.canonicalRef,
        confidenceScore: target.confidence.toFixed(4),
        resolutionMetadata: target.metadata
      })
    );

    const detectedIntent = this.detectIntent(args.transcriptText);
    const intent = this.confidenceGatedIntent(detectedIntent, target.confidence);
    this.realtime.emitToUser(args.userId, "voice:intent", {
      intent,
      detectedIntent,
      utterance: args.transcriptText,
      context: resolvedContext,
        callSessionId: args.callSessionId ?? null,
      target: {
        id: persistedTarget.id,
        type: target.targetType,
        ref: target.canonicalRef,
        confidence: target.confidence
      }
    });

    if (intent === "ask" || intent === "explain" || intent === "summarize") {
      let conversational = `Voice ${intent} received. Context page=${resolvedContext.page ?? "unknown"} file=${resolvedContext.selectedFile ?? "none"}.`;
      const voiceLlm = ["1", "true", "yes", "on"].includes(
        (process.env.MALV_VOICE_CALL_LLM_CONTINUITY_ENABLED ?? "").trim().toLowerCase()
      );
      if (voiceLlm) {
        const route = this.inferenceRouting.decideForCallVoiceContinuity({
          surface: "call_voice",
          utteranceLength: args.transcriptText.length,
          intent
        });
        const agentRouter = malvAgentSystemEnabled(this.cfg)
          ? this.malvTaskRouter.route({
              traceId: randomUUID(),
              surface: "voice",
              userText: args.transcriptText,
              vaultScoped: false,
              inputMode: "voice",
              callActive: Boolean(args.callSessionId)
            })
          : null;
        try {
          const res = await this.beastWorker.infer({
            mode: "light",
            prompt: [
              "You are MALV on a live voice session. Reply in plain language only (no markdown), at most 3 short sentences.",
              `Operator intent label: ${intent}.`,
              `Page: ${resolvedContext.page ?? "unknown"}. File: ${resolvedContext.selectedFile ?? "none"}.`,
              `User said: ${args.transcriptText}`
            ].join("\n"),
            context: {
              malvPromptAlreadyExpanded: true,
              malvOperatorMode: "explain",
              voiceCallContinuity: true,
              ...route.workerContextPatch,
              malvRouting: route.telemetry,
              ...(agentRouter
                ? {
                    malvAgentTaskRouter: {
                      workShape: agentRouter.workShape,
                      resourceTier: agentRouter.resourceTier,
                      latencyMode: agentRouter.latencyMode,
                      planId: agentRouter.plan.planId
                    }
                  }
                : {})
            }
          });
          const txt = (res.reply ?? "").trim();
          if (txt) conversational = txt;
        } catch (e) {
          this.logger.warn(
            `voice_call_llm_continuity_failed intent=${intent} ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
      await this.voiceEvents.save(
        this.voiceEvents.create({
          user: { id: args.userId } as any,
          callSession: args.callSessionId ? ({ id: args.callSessionId } as any) : null,
          intentType: intent,
          utteranceText: args.transcriptText,
          resolvedContext: resolvedContext as any,
          resultMeta: { conversational, target },
          operatorTarget: { id: persistedTarget.id } as any,
          resolutionConfidence: target.confidence.toFixed(4)
        })
      );
      if (args.callSessionId) {
        await this.calls.recordMalvTranscript({
          userId: args.userId,
          callSessionId: args.callSessionId,
          content: conversational
        });
      }
      this.realtime.emitToUser(args.userId, "voice:response", {
        intent,
        response: conversational,
        callSessionId: args.callSessionId ?? null
      });
      return { ok: true, intent, response: conversational };
    }

    const isReview = this.isReviewUtterance(args.transcriptText);
    const plan = this.beast.planVoiceOperatorWorkflow({
      utterance: args.transcriptText,
      context: {
        ...(resolvedContext as Record<string, unknown>),
        anchoredTarget: { type: target.targetType, ref: target.canonicalRef, confidence: target.confidence },
        reviewMode: isReview
      }
    });

    const job = this.aiJobs.create({
      user: { id: args.userId } as any,
      conversation: resolvedContext.activeConversationId ? ({ id: resolvedContext.activeConversationId } as any) : null,
      jobType: "beast_proactive",
      requestedMode: "Beast",
      classifiedMode: "beast",
      status: "running",
      progress: 10,
      shardKey: "voice_operator:high",
      queuePriority: 85,
      payload: {
        trigger: "voice_operator_mode",
        utterance: args.transcriptText,
        intent,
        detectedIntent,
        reviewMode: isReview,
        target: { type: target.targetType, ref: target.canonicalRef, confidence: target.confidence },
        context: resolvedContext,
        planSummary: plan.summary
      }
    });
    await this.aiJobs.save(job);

    const run = await this.sandbox.createOperatorTaskSandboxRun({
      userId: args.userId,
      userRole: args.userRole ?? "user",
      workspaceId: resolvedContext.workspaceId ?? null,
      workspacePermissionKeys: resolvedContext.workspaceId
        ? ["workspace.sandbox.execute", "workspace.operator.dispatch"]
        : undefined,
      aiJobId: job.id,
      commands: [],
      typedActions: (plan.typedActions ?? []).map((a) => ({
        ...a,
        metadata: { ...(a.metadata ?? {}), targetScope: target.targetType, targetRef: target.canonicalRef, targetConfidence: target.confidence, reviewMode: isReview }
      })),
      requiresApproval: plan.requiresApproval
    });

    job.payload = { ...(job.payload ?? {}), sandboxRunId: run.id, commandCount: 0 };
    await this.aiJobs.save(job);

    const reviewSession = isReview
      ? await this.reviewSessions.save(
          this.reviewSessions.create({
            user: { id: args.userId } as any,
            aiJob: { id: job.id } as any,
            sandboxRun: { id: run.id } as any,
            workspace: resolvedContext.workspaceId ? ({ id: resolvedContext.workspaceId } as any) : null,
            status: "running",
            targetType: target.targetType,
            targetRef: target.canonicalRef,
            targetMetadata: target.metadata,
            planSummary: { summary: plan.summary, commandCount: 0 }
          })
        )
      : null;

    if (reviewSession) {
      const patchProposalId = ((run.outputPayload ?? {}) as any)?.runtime?.patchProposalId as string | null | undefined;
      const findings = this.buildReviewFindings({
        utterance: args.transcriptText,
        commandCount: 0,
        target,
        patchProposalId
      });
      for (const finding of findings) {
        await this.reviewFindings.save(
          this.reviewFindings.create({
            reviewSession: { id: reviewSession.id } as any,
            severity: finding.severity,
            category: finding.category,
            title: finding.title,
            explanation: finding.explanation,
            evidence: finding.evidence,
            suggestedFix: finding.suggestedFix,
            patchProposal: finding.patchProposalId ? ({ id: finding.patchProposalId } as any) : null
          })
        );
      }
      reviewSession.status = "completed";
      reviewSession.resultSummary = `Review captured with ${findings.length} finding(s).`;
      await this.reviewSessions.save(reviewSession);
    }

    await this.voiceEvents.save(
      this.voiceEvents.create({
        user: { id: args.userId } as any,
        callSession: args.callSessionId ? ({ id: args.callSessionId } as any) : null,
        aiJob: { id: job.id } as any,
        sandboxRun: { id: run.id } as any,
        reviewSession: reviewSession ? ({ id: reviewSession.id } as any) : null,
        operatorTarget: { id: persistedTarget.id } as any,
        intentType: intent,
        utteranceText: args.transcriptText,
        resolvedContext: resolvedContext as any,
        executionPlan: { summary: plan.summary, commandCount: 0, requiresApproval: plan.requiresApproval },
        resultMeta: { aiJobId: job.id, sandboxRunId: run.id, reviewSessionId: reviewSession?.id ?? null, target },
        resolutionConfidence: target.confidence.toFixed(4)
      })
    );

    if (args.callSessionId) {
      await this.calls.markOperatorStarted({
        userId: args.userId,
        callSessionId: args.callSessionId,
        aiJobId: job.id,
        sandboxRunId: run.id
      });
    }
    this.realtime.emitToUser(args.userId, "job:update", { aiJobId: job.id, status: job.status, progress: job.progress });
    this.realtime.emitToUser(args.userId, "voice:operator_started", {
      intent,
      detectedIntent,
      callSessionId: args.callSessionId ?? null,
      aiJobId: job.id,
      sandboxRunId: run.id,
      reviewSessionId: reviewSession?.id ?? null,
      commandCount: 0,
      target: { type: target.targetType, ref: target.canonicalRef, confidence: target.confidence }
    });

    return { ok: true, intent, detectedIntent, aiJobId: job.id, sandboxRunId: run.id, reviewSessionId: reviewSession?.id ?? null, commandCount: 0 };
  }

  private async handleVoiceTranscriptConsent(args: {
    userId: string;
    callSessionId?: string | null;
    transcriptText: string;
  }) {
    const callSessionId = args.callSessionId as string;
    const turn = resolveTranscriptConsentTurn(args.transcriptText);
    if (turn.advanceToActive) {
      await this.calls.finalizeTranscriptConsent({
        userId: args.userId,
        callSessionId,
        transcriptEnabled: turn.enableTranscript
      });
    }
    const session = await this.calls.assertUserOwnsCall({ userId: args.userId, callSessionId });
    const recordMalv = turn.consent === "yes";
    await this.emitBoxedVoiceReply({
      userId: args.userId,
      callSessionId,
      intent: turn.intent,
      reply: turn.reply,
      recordMalvLine: recordMalv,
      session
    });
    return { ok: true, intent: turn.intent, boxed: true, response: turn.reply };
  }

  private async emitBoxedVoiceReply(args: {
    userId: string;
    callSessionId: string;
    intent: string;
    reply: string;
    recordMalvLine: boolean;
    session: CallSessionEntity;
  }) {
    this.realtime.emitToUser(args.userId, "voice:response", {
      intent: args.intent,
      response: args.reply,
      callSessionId: args.callSessionId,
      source: "boxed",
      playbackMessageId: `boxed-${args.callSessionId}-${Date.now()}`,
      voiceFlowMode: args.session.voiceFlowMode,
      callTranscriptEnabled: args.session.callTranscriptEnabled
    });

    if (args.recordMalvLine && args.session.callTranscriptEnabled && args.reply.trim()) {
      await this.calls.recordMalvTranscript({
        userId: args.userId,
        callSessionId: args.callSessionId,
        content: args.reply
      });
    } else if (args.reply.trim()) {
      await this.calls.markPlaybackState({
        userId: args.userId,
        callSessionId: args.callSessionId,
        isSpeaking: true,
        expectedPlaybackMs: this.calls.estimateTtsPlaybackMs(args.reply)
      });
    }
  }

  private async dispatchVoiceCallBoxed(args: {
    userId: string;
    userRole?: GlobalRole;
    callSessionId?: string | null;
    transcriptText: string;
  }) {
    const callSessionId = args.callSessionId as string;
    let session = await this.calls.assertUserOwnsCall({ userId: args.userId, callSessionId });
    const boxed = resolveBoxedVoiceResponse(args.transcriptText, {
      voiceFlowMode: session.voiceFlowMode,
      callTranscriptEnabled: session.callTranscriptEnabled,
      malvPaused: session.malvPaused
    });

    for (const effect of boxed.sideEffects) {
      if (effect.type === "set_malv_paused") {
        await this.calls.updateControls({
          userId: args.userId,
          callSessionId,
          malvPaused: effect.paused
        });
      }
    }

    session = await this.calls.assertUserOwnsCall({ userId: args.userId, callSessionId });

    this.realtime.emitToUser(args.userId, "voice:response", {
      intent: boxed.intent,
      response: boxed.reply,
      callSessionId,
      source: "boxed",
      playbackMessageId: `boxed-${callSessionId}-${Date.now()}`,
      voiceFlowMode: session.voiceFlowMode,
      callTranscriptEnabled: session.callTranscriptEnabled
    });

    if (boxed.uiAction) {
      this.realtime.emitToUser(args.userId, "voice:ui_action", {
        action: boxed.uiAction.action,
        callSessionId,
        source: "boxed"
      });
    }

    if (boxed.recordMalvLine && session.callTranscriptEnabled && boxed.reply.trim()) {
      await this.calls.recordMalvTranscript({
        userId: args.userId,
        callSessionId,
        content: boxed.reply
      });
    } else if (boxed.reply.trim()) {
      await this.calls.markPlaybackState({
        userId: args.userId,
        callSessionId,
        isSpeaking: true,
        expectedPlaybackMs: this.calls.estimateTtsPlaybackMs(boxed.reply)
      });
    }

    return { ok: true, intent: boxed.intent, boxed: true, response: boxed.reply };
  }
}

