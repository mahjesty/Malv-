import { BadRequestException, forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { VaultSessionEntity, type VaultSessionStatus } from "../db/entities/vault-session.entity";
import { CallSessionEntity, type CallSessionKind, type CallSessionStatus } from "../db/entities/call-session.entity";
import { CallTranscriptEntity, type TranscriptSpeakerRole } from "../db/entities/call-transcript.entity";
import { ConversationEntity } from "../db/entities/conversation.entity";
import { AuditEventEntity, type AuditEventLevel } from "../db/entities/audit-event.entity";
import { MessageEntity } from "../db/entities/message.entity";
import { WorkspaceTaskEntity } from "../db/entities/workspace-task.entity";
import type {
  CallConnectionState,
  CallParticipationScope,
  CallRecapPayload,
  CallRuntimeSnapshot,
  CallVoiceState,
  VoiceFlowMode
} from "./call-runtime.types";
import { VOICE_ONBOARDING_TRANSCRIPT_QUESTION } from "../voice/boxed/boxed-voice-copy";
import { MalvFeatureFlagsService } from "../common/malv-feature-flags.service";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import { WorkspaceActivityService } from "../workspace/workspace-activity.service";
import { AuthorizationService } from "../common/authorization/authorization.service";
import { ObservabilityService } from "../common/observability.service";

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);
  private readonly activeReuseStaleMs = Number(process.env.MALV_CALL_ACTIVE_REUSE_STALE_MS ?? 15 * 60 * 1000);
  private readonly playbackResetTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly killSwitch: KillSwitchService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway,
    @InjectRepository(CallSessionEntity) private readonly sessions: Repository<CallSessionEntity>,
    @InjectRepository(CallTranscriptEntity) private readonly transcripts: Repository<CallTranscriptEntity>,
    @InjectRepository(ConversationEntity) private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(VaultSessionEntity) private readonly vaultSessions: Repository<VaultSessionEntity>,
    @InjectRepository(AuditEventEntity) private readonly audits: Repository<AuditEventEntity>,
    @InjectRepository(MessageEntity) private readonly messages: Repository<MessageEntity>,
    @InjectRepository(WorkspaceTaskEntity) private readonly tasks: Repository<WorkspaceTaskEntity>,
    private readonly beastWorker: BeastWorkerClient,
    private readonly flags: MalvFeatureFlagsService,
    private readonly activity: WorkspaceActivityService,
    private readonly authz: AuthorizationService,
    private readonly observability: ObservabilityService
  ) {}

  private normalizeRecap(raw: Record<string, unknown> | null | undefined): CallRecapPayload | null {
    if (!raw || typeof raw !== "object") return null;
    const summary = typeof raw.summary === "string" ? raw.summary : undefined;
    const actionItems = Array.isArray(raw.actionItems)
      ? raw.actionItems.filter((x): x is string => typeof x === "string")
      : undefined;
    const decisions = Array.isArray(raw.decisions) ? raw.decisions.filter((x): x is string => typeof x === "string") : undefined;
    const unresolvedQuestions = Array.isArray(raw.unresolvedQuestions)
      ? raw.unresolvedQuestions.filter((x): x is string => typeof x === "string")
      : undefined;
    const suggestedFollowUps = Array.isArray(raw.suggestedFollowUps)
      ? raw.suggestedFollowUps.filter((x): x is string => typeof x === "string")
      : undefined;
    const source = raw.source === "auto" || raw.source === "manual" ? raw.source : undefined;
    const decidedAt = typeof raw.decidedAt === "number" ? raw.decidedAt : undefined;
    if (
      summary === undefined &&
      !(actionItems && actionItems.length) &&
      !(decisions && decisions.length) &&
      !(unresolvedQuestions && unresolvedQuestions.length) &&
      !(suggestedFollowUps && suggestedFollowUps.length) &&
      decidedAt === undefined
    ) {
      return null;
    }
    const out: CallRecapPayload = {};
    if (summary !== undefined) out.summary = summary;
    if (actionItems !== undefined) out.actionItems = actionItems;
    if (decisions !== undefined) out.decisions = decisions;
    if (unresolvedQuestions !== undefined) out.unresolvedQuestions = unresolvedQuestions;
    if (suggestedFollowUps !== undefined) out.suggestedFollowUps = suggestedFollowUps;
    if (source !== undefined) out.source = source;
    if (decidedAt !== undefined) out.decidedAt = decidedAt;
    return out;
  }

  private isRecapMaterialized(recap: CallRecapPayload | null): boolean {
    if (!recap) return false;
    if (typeof recap.summary === "string" && recap.summary.trim().length > 0) return true;
    if (Array.isArray(recap.actionItems) && recap.actionItems.length > 0) return true;
    if (Array.isArray(recap.decisions) && recap.decisions.length > 0) return true;
    if (Array.isArray(recap.unresolvedQuestions) && recap.unresolvedQuestions.length > 0) return true;
    if (Array.isArray(recap.suggestedFollowUps) && recap.suggestedFollowUps.length > 0) return true;
    return false;
  }

  private trimLines(lines: string[], max = 8): string[] {
    return Array.from(new Set(lines.map((x) => x.trim()).filter(Boolean))).slice(0, max);
  }

  private parseAutoRecapJson(raw: string): CallRecapPayload | null {
    const text = raw.trim();
    if (!text) return null;
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1] ?? text;
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      return this.normalizeRecap({
        summary: parsed.summary,
        actionItems: parsed.actionItems,
        decisions: parsed.decisions,
        unresolvedQuestions: parsed.unresolvedQuestions,
        suggestedFollowUps: parsed.suggestedFollowUps,
        source: "auto",
        decidedAt: Date.now()
      });
    } catch {
      return null;
    }
  }

  private fallbackRecapFromTranscript(lines: Array<{ speakerRole: TranscriptSpeakerRole; content: string }>): CallRecapPayload {
    const normalized = lines
      .map((x) => ({ speakerRole: x.speakerRole, content: x.content.trim() }))
      .filter((x) => x.content.length > 0);
    const summary = normalized.length
      ? `Call ended with ${normalized.length} transcript lines across ${new Set(normalized.map((x) => x.speakerRole)).size} participant role(s).`
      : "Call ended with limited transcript evidence.";
    const actionItems = this.trimLines(
      normalized
        .filter((x) => /\b(todo|follow up|next step|action|will do|i'll|we should|please)\b/i.test(x.content))
        .map((x) => x.content)
    );
    const unresolvedQuestions = this.trimLines(
      normalized.filter((x) => /\?/.test(x.content) || /\b(not sure|unclear|unknown|need to check)\b/i.test(x.content)).map((x) => x.content)
    );
    const decisions = this.trimLines(
      normalized
        .filter((x) => /\b(decide|decided|we will|agreed|ship|approved|go with)\b/i.test(x.content))
        .map((x) => x.content)
    );
    const suggestedFollowUps = this.trimLines(
      [
        actionItems.length ? "Execute action items and report progress in thread." : "",
        unresolvedQuestions.length ? "Resolve open questions and confirm final decisions." : "",
        "Post a short status update in the linked conversation."
      ].filter(Boolean)
    );
    return {
      summary,
      actionItems,
      decisions,
      unresolvedQuestions,
      suggestedFollowUps,
      source: "auto",
      decidedAt: Date.now()
    };
  }

  private buildAutoRecapPrompt(args: {
    session: CallSessionEntity;
    transcript: Array<{ speakerRole: TranscriptSpeakerRole; content: string; startTimeMs: number | null }>;
  }): string {
    return [
      "You are MALV call intelligence summarizer.",
      "Generate structured call recap from transcript evidence only.",
      "Return strict JSON with keys:",
      "{ summary, actionItems[], decisions[], unresolvedQuestions[], suggestedFollowUps[] }",
      "Rules:",
      "- Keep summary concise and factual.",
      "- Action items must be executable tasks.",
      "- Decisions must reflect explicit commitments.",
      "- Unresolved questions must be open issues.",
      "- Suggested follow-ups should be practical next steps.",
      "- No markdown.",
      "",
      `CallSessionId: ${args.session.id}`,
      `Kind: ${args.session.kind}`,
      `ParticipationScope: ${args.session.participationScope}`,
      `ConversationId: ${args.session.conversationId ?? "none"}`,
      "Transcript:",
      JSON.stringify(args.transcript)
    ].join("\n");
  }

  private recapAsMessage(recap: CallRecapPayload): string {
    const lines: string[] = [];
    if (recap.summary) lines.push(`Call recap: ${recap.summary}`);
    if (recap.actionItems?.length) lines.push(`Action items:\n- ${recap.actionItems.join("\n- ")}`);
    if (recap.decisions?.length) lines.push(`Decisions:\n- ${recap.decisions.join("\n- ")}`);
    if (recap.unresolvedQuestions?.length) lines.push(`Unresolved questions:\n- ${recap.unresolvedQuestions.join("\n- ")}`);
    if (recap.suggestedFollowUps?.length) lines.push(`Suggested follow-ups:\n- ${recap.suggestedFollowUps.join("\n- ")}`);
    return lines.join("\n\n").slice(0, 16000);
  }

  private async persistRecapIntoConversation(args: { userId: string; session: CallSessionEntity; recap: CallRecapPayload }): Promise<void> {
    if (!args.session.conversationId) return;
    const conv = await this.conversations.findOne({
      where: { id: args.session.conversationId, user: { id: args.userId } }
    });
    if (!conv) return;
    const recent = await this.messages.find({
      where: {
        conversation: { id: conv.id },
        user: { id: args.userId },
        role: "system",
        source: "call_recap_auto"
      },
      order: { createdAt: "DESC" },
      take: 20
    });
    const already = recent.some((m) => (m.metadata as any)?.callSessionId === args.session.id);
    if (already) return;
    const row = this.messages.create({
      id: randomUUID(),
      conversation: conv,
      user: { id: args.userId } as any,
      role: "system",
      content: this.recapAsMessage(args.recap),
      status: "done",
      source: "call_recap_auto",
      metadata: {
        callSessionId: args.session.id,
        callKind: args.session.kind,
        participationScope: args.session.participationScope,
        recap: args.recap,
        malvContinuityType: "call_recap"
      }
    });
    await this.messages.save(row);
  }

  private async createTasksFromRecap(args: { userId: string; session: CallSessionEntity; recap: CallRecapPayload }): Promise<number> {
    const actionItems = Array.isArray(args.recap.actionItems) ? args.recap.actionItems.map((x) => x.trim()).filter(Boolean) : [];
    if (actionItems.length === 0) return 0;
    let created = 0;
    for (let i = 0; i < actionItems.length; i += 1) {
      const item = actionItems[i]!;
      const fingerprint = `call:${args.session.id}:action:${item.toLowerCase()}`;
      const exists = await this.tasks.findOne({
        where: {
          user: { id: args.userId },
          sourceFingerprint: fingerprint
        }
      });
      if (exists) continue;
      const task = this.tasks.create({
        user: { id: args.userId } as any,
        title: item.slice(0, 220),
        description: `Auto-created from call recap (${args.session.kind} call).`,
        status: "todo",
        source: "call",
        conversationId: args.session.conversationId ?? null,
        callSessionId: args.session.id,
        sourceFingerprint: fingerprint,
        metadata: {
          callSessionId: args.session.id,
          recapGeneratedAt: args.recap.decidedAt ?? Date.now(),
          actionIndex: i
        }
      });
      await this.tasks.save(task);
      this.realtime.emitToUser(args.userId, "workspace:task_changed", { action: "created", task });
      created += 1;
    }
    return created;
  }

  private async generateAutomaticRecap(args: { userId: string; callSessionId: string }): Promise<void> {
    const session = await this.sessions.findOne({ where: { id: args.callSessionId, user: { id: args.userId } } });
    if (!session) return;
    if (session.status !== "ended") return;
    const existing = this.normalizeRecap(session.recapJson as Record<string, unknown> | null | undefined);
    if (this.isRecapMaterialized(existing)) return;
    const rows = await this.transcripts.find({
      where: { callSession: { id: session.id }, user: { id: args.userId } },
      order: { createdAt: "ASC" },
      take: 500
    });
    const transcript = rows.map((r) => ({
      speakerRole: r.speakerRole,
      content: r.content,
      startTimeMs: r.startTimeMs ?? null
    }));
    let recap: CallRecapPayload | null = null;
    if (transcript.length > 0) {
      try {
        const worker = await this.beastWorker.infer({
          mode: "beast",
          prompt: this.buildAutoRecapPrompt({ session, transcript }),
          context: {
            malvPromptAlreadyExpanded: true,
            malvOperatorMode: "analyze",
            callRecap: true
          }
        });
        recap = this.parseAutoRecapJson(worker.reply ?? "");
      } catch (e) {
        this.observability.incRecapFailure("model_infer");
        this.logger.warn(
          JSON.stringify({
            tag: "call.recap.model_infer_failed",
            callSessionId: session.id,
            userId: args.userId,
            error: e instanceof Error ? e.message : String(e)
          })
        );
      }
    }
    if (!recap) {
      recap = this.fallbackRecapFromTranscript(transcript);
    }
    session.recapJson = {
      ...(session.recapJson ?? {}),
      ...recap,
      source: "auto",
      decidedAt: Date.now()
    };
    await this.sessions.save(session);
    await this.persistRecapIntoConversation({ userId: args.userId, session, recap });
    const createdTasks = await this.createTasksFromRecap({ userId: args.userId, session, recap });
    await this.writeAudit({
      actorUserId: args.userId,
      eventType: "call_session_recap_auto_generated",
      message: "Automatic call recap generated.",
      metadata: {
        callSessionId: session.id,
        conversationId: session.conversationId ?? null,
        transcriptCount: transcript.length,
        recapKeys: Object.keys(recap),
        tasksCreated: createdTasks
      }
    });
    this.emitRuntime(args.userId, session);
    await this.activity.record({
      userId: args.userId,
      activityType: "call_recap_ready",
      conversationId: session.conversationId ?? null,
      entityId: session.id,
      title: "Call recap ready",
      payloadJson: { callSessionId: session.id, tasksCreated: createdTasks }
    });
    this.realtime.emitToUser(args.userId, "call:recap_ready", {
      callSessionId: session.id,
      conversationId: session.conversationId ?? null,
      recap: this.normalizeRecap(session.recapJson as Record<string, unknown>)
    });
  }

  private enqueueAutomaticRecap(args: { userId: string; callSessionId: string }) {
    void this.generateAutomaticRecap(args).catch((e) => {
      this.observability.incRecapFailure("pipeline");
      this.logger.warn(
        JSON.stringify({
          tag: "call.recap.failed",
          callSessionId: args.callSessionId,
          userId: args.userId,
          error: e instanceof Error ? e.message : String(e)
        })
      );
    });
  }

  private async assertConversationOwned(userId: string, conversationId: string) {
    const conv = await this.conversations.findOne({ where: { id: conversationId, user: { id: userId } } });
    if (!conv) throw new BadRequestException("Conversation not found or not owned by user.");
  }

  private phaseOf(session: CallSessionEntity): "active" | "ended" {
    return session.status === "ended" ? "ended" : "active";
  }

  private computeVoiceState(session: CallSessionEntity, desired: CallVoiceState): CallVoiceState {
    if (session.micMuted || session.malvPaused) return "muted";
    return desired;
  }

  private toSnapshot(session: CallSessionEntity): CallRuntimeSnapshot {
    return {
      callSessionId: session.id,
      kind: session.kind,
      status: session.status,
      phase: this.phaseOf(session),
      connectionState: session.connectionState,
      voiceState: this.computeVoiceState(session, session.voiceState),
      micMuted: Boolean(session.micMuted),
      malvPaused: Boolean(session.malvPaused),
      voiceFlowMode: session.voiceFlowMode,
      callTranscriptEnabled: Boolean(session.callTranscriptEnabled),
      cameraAssistEnabled: Boolean(session.cameraAssistEnabled),
      callStartedAt: session.startedAt.getTime(),
      callEndedAt: session.endedAt ? session.endedAt.getTime() : null,
      lastHeartbeatAt: session.lastHeartbeatAt ? session.lastHeartbeatAt.getTime() : null,
      transcriptStreamingStatus: session.transcriptStreamingStatus,
      operatorActivityStatus: session.operatorActivityStatus,
      reconnectCount: Number(session.reconnectCount ?? 0),
      updatedAt: session.updatedAt.getTime(),
      conversationId: session.conversationId ?? null,
      recap: this.normalizeRecap(session.recapJson as Record<string, unknown> | null | undefined),
      participationScope: (session.participationScope === "group" ? "group" : "direct") as CallParticipationScope
    };
  }

  /** Blueprint §10 — auto-close open vault when a call ends (silent backend control). */
  private async closeOpenVaultSessionsOnCallEnd(userId: string) {
    const open = await this.vaultSessions.find({
      where: { user: { id: userId }, status: "open" as VaultSessionStatus }
    });
    if (open.length === 0) return;
    const now = new Date();
    for (const s of open) {
      s.status = "closed";
      s.closedAt = now;
      await this.vaultSessions.save(s);
    }
    await this.writeAudit({
      actorUserId: userId,
      eventType: "vault_sessions_closed_on_call_end",
      message: "Closed open vault session(s) after call ended.",
      metadata: { count: open.length, closedIds: open.map((x) => x.id) }
    });
  }

  private async writeAudit(args: {
    actorUserId: string;
    eventType: string;
    level?: AuditEventLevel;
    message?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    await this.audits.save(
      this.audits.create({
        actorUser: { id: args.actorUserId } as any,
        eventType: args.eventType,
        level: args.level ?? "info",
        message: args.message ?? null,
        metadata: args.metadata ?? null
      })
    );
  }

  private emitLegacyState(userId: string, session: CallSessionEntity) {
    this.realtime.emitToUser(userId, "call:state", {
      callSessionId: session.id,
      status: session.status,
      kind: session.kind,
      startedAt: session.startedAt.getTime(),
      endedAt: session.endedAt ? session.endedAt.getTime() : null
    });
  }

  private emitRuntime(userId: string, session: CallSessionEntity) {
    const snapshot = this.toSnapshot(session);
    this.realtime.emitToUser(userId, "call:runtime", snapshot);
    this.realtime.emitToCallSession(session.id, "call:runtime", snapshot);
    this.emitLegacyState(userId, session);
  }

  private async validateVaultOwnership(userId: string, vaultSessionId?: string | null) {
    if (!vaultSessionId) return;
    const vault = await this.vaultSessions.findOne({
      where: { id: vaultSessionId, user: { id: userId }, status: "open" as VaultSessionStatus }
    });
    if (!vault) throw new BadRequestException("Vault session is not open or not owned by user.");
  }

  private isStaleActiveSession(session: CallSessionEntity) {
    if (session.status !== "active") return false;
    const heartbeatAt = session.lastHeartbeatAt?.getTime() ?? session.updatedAt.getTime();
    return Date.now() - heartbeatAt > this.activeReuseStaleMs;
  }

  private deriveConnectionState(
    current: CallConnectionState,
    observedRttMs?: number | null,
    disconnected?: boolean
  ): CallConnectionState {
    if (disconnected) return "reconnecting";
    if (observedRttMs == null || !Number.isFinite(observedRttMs)) {
      return current === "reconnecting" ? "healthy" : current;
    }
    if (observedRttMs >= 1800) return "unstable";
    if (observedRttMs >= 800) return "weak";
    return "healthy";
  }

  private clearPlaybackResetTimer(callSessionId: string) {
    const timer = this.playbackResetTimers.get(callSessionId);
    if (!timer) return;
    clearTimeout(timer);
    this.playbackResetTimers.delete(callSessionId);
  }

  private estimatePlaybackDurationMs(content: string) {
    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
    if (!wordCount) return 1800;
    return Math.max(1800, Math.min(12000, wordCount * 340 + 900));
  }

  private schedulePlaybackReset(args: { userId: string; callSessionId: string; delayMs: number }) {
    this.clearPlaybackResetTimer(args.callSessionId);
    const timer = setTimeout(() => {
      this.playbackResetTimers.delete(args.callSessionId);
      void this.markPlaybackState({
        userId: args.userId,
        callSessionId: args.callSessionId,
        isSpeaking: false
      }).catch(() => {
        /* noop */
      });
    }, Math.max(250, Math.round(args.delayMs)));
    this.playbackResetTimers.set(args.callSessionId, timer);
  }

  private async findOwnedSession(userId: string, callSessionId: string) {
    return await this.authz.assertCallOwnerOrThrow({ userId, callSessionId });
  }

  private async findActiveSession(userId: string, kind: CallSessionKind) {
    return await this.sessions.findOne({
      where: { user: { id: userId }, kind, status: "active" as CallSessionStatus },
      order: { updatedAt: "DESC" }
    });
  }

  async assertUserOwnsCall(args: { userId: string; callSessionId: string }) {
    return await this.findOwnedSession(args.userId, args.callSessionId);
  }

  async getCall(args: { userId: string; callSessionId: string }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    return { session, runtime: this.toSnapshot(session) };
  }

  async listRecentSessions(args: { userId: string; limit: number }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "calls_read" });
    const take = Math.min(50, Math.max(1, args.limit));
    const rows = await this.sessions.find({
      where: { user: { id: args.userId }, status: "ended" as CallSessionStatus },
      order: { endedAt: "DESC" },
      take
    });
    return {
      sessions: rows.map((s) => ({
        callSessionId: s.id,
        kind: s.kind,
        conversationId: s.conversationId ?? null,
        endedAt: s.endedAt ? s.endedAt.toISOString() : null,
        recap: this.normalizeRecap(s.recapJson as Record<string, unknown> | null | undefined)
      }))
    };
  }

  async getActiveCall(args: { userId: string; kind: CallSessionKind }) {
    const session = await this.findActiveSession(args.userId, args.kind);
    if (!session) return null;
    if (this.isStaleActiveSession(session)) {
      this.clearPlaybackResetTimer(session.id);
      session.status = "ended";
      session.endedAt = session.endedAt ?? new Date();
      session.connectionState = "reconnecting";
      session.voiceState = "idle";
      session.transcriptStreamingStatus = "idle";
      session.operatorActivityStatus = "idle";
      await this.sessions.save(session);
      await this.writeAudit({
        actorUserId: args.userId,
        eventType: "call_session_stale_ended",
        message: "Ended stale active call before reuse.",
        metadata: { callSessionId: session.id, kind: session.kind }
      });
      await this.closeOpenVaultSessionsOnCallEnd(args.userId);
      return null;
    }
    return { session, runtime: this.toSnapshot(session) };
  }

  async createCall(args: {
    userId: string;
    kind: CallSessionKind;
    vaultSessionId?: string | null;
    conversationId?: string | null;
    participationScope?: CallParticipationScope | null;
  }) {
    this.logger.log(
      `createCall: start userId=${args.userId} kind=${args.kind} vaultSessionId=${args.vaultSessionId ?? null} conversationId=${args.conversationId ?? null} participationScope=${args.participationScope ?? "direct"}`
    );

    try {
      this.logger.debug("createCall: step killSwitch.ensureSystemOnOrThrow");
      await this.killSwitch.ensureSystemOnOrThrow({ reason: "call_session_mutation" });
      this.logger.debug("createCall: killSwitch ok");

      this.logger.debug("createCall: step validateVaultOwnership");
      await this.validateVaultOwnership(args.userId, args.vaultSessionId ?? null);
      this.logger.debug("createCall: vault validation ok (or skipped)");

      if (args.conversationId) {
        await this.assertConversationOwned(args.userId, args.conversationId);
      }

      this.logger.debug("createCall: step getActiveCall (DB read)");
      const existing = await this.getActiveCall({ userId: args.userId, kind: args.kind });
      this.logger.debug(`createCall: getActiveCall done existing=${Boolean(existing)}`);
      if (existing) {
        const session = existing.session;
        session.lastHeartbeatAt = new Date();
        session.connectionState = "healthy";
        this.logger.debug(`createCall: step sessions.save (resume) callSessionId=${session.id}`);
        await this.sessions.save(session);
        this.logger.debug("createCall: step writeAudit (resumed)");
        await this.writeAudit({
          actorUserId: args.userId,
          eventType: "call_session_resumed",
          message: "Reused existing active call session.",
          metadata: { callSessionId: session.id, kind: session.kind }
        });
        this.logger.debug("createCall: step emitRuntime (resumed)");
        this.emitRuntime(args.userId, session);
        this.logger.log(`createCall: resumed callSessionId=${session.id}`);
        return { session, runtime: this.toSnapshot(session), resumed: true };
      }

      this.logger.debug("createCall: building new CallSessionEntity (in-memory)");
      const participationScope: CallParticipationScope = args.participationScope === "group" ? "group" : "direct";
      const session = this.sessions.create({
        user: { id: args.userId } as any,
        kind: args.kind,
        status: "active" as CallSessionStatus,
        startedAt: new Date(),
        connectionState: "healthy",
        voiceState: "idle",
        micMuted: false,
        malvPaused: false,
        lastHeartbeatAt: new Date(),
        transcriptStreamingStatus: "idle",
        voiceFlowMode: (args.kind === "voice" ? "onboarding" : "active") as VoiceFlowMode,
        callTranscriptEnabled: false,
        operatorActivityStatus: "awaiting_user",
        reconnectCount: 0,
        conversationId: args.conversationId ?? null,
        recapJson: null,
        participationScope
      });
      this.logger.debug(
        "createCall: step sessions.save (insert); fails if DB missing voice_flow_mode or call_transcript_enabled"
      );
      await this.sessions.save(session);
      this.logger.debug(`createCall: insert ok id=${session.id}`);

      this.logger.debug("createCall: step writeAudit (created)");
      await this.writeAudit({
        actorUserId: args.userId,
        eventType: "call_session_created",
        message: "Call session created.",
        metadata: { callSessionId: session.id, kind: session.kind }
      });
      this.logger.debug("createCall: step emitRuntime (created)");
      this.emitRuntime(args.userId, session);
      this.logger.log(`createCall: created callSessionId=${session.id}`);
      return { session, runtime: this.toSnapshot(session), resumed: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`createCall: FAILED at userId=${args.userId} kind=${args.kind}: ${message}`, stack);
      throw err;
    }
  }

  async joinCall(args: { userId: string; callSessionId: string }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.status === "active") {
      session.lastHeartbeatAt = new Date();
      session.connectionState = "healthy";
      await this.sessions.save(session);
    }
    await this.writeAudit({
      actorUserId: args.userId,
      eventType: "call_session_joined",
      message: "Call session joined.",
      metadata: { callSessionId: session.id, kind: session.kind, status: session.status }
    });
    this.realtime.emitToUser(args.userId, "call:joined", {
      callSessionId: session.id,
      status: session.status,
      kind: session.kind,
      runtime: this.toSnapshot(session)
    });
    this.emitRuntime(args.userId, session);
    return { session, runtime: this.toSnapshot(session) };
  }

  async heartbeat(args: { userId: string; callSessionId: string; observedRttMs?: number | null }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.status === "active") {
      const previousConnectionState = session.connectionState;
      session.lastHeartbeatAt = new Date();
      session.connectionState = this.deriveConnectionState(session.connectionState, args.observedRttMs ?? null, false);
      await this.sessions.save(session);
      if (session.connectionState !== previousConnectionState) {
        this.emitRuntime(args.userId, session);
      }
    }
    return { session, runtime: this.toSnapshot(session) };
  }

  async updateControls(args: {
    userId: string;
    callSessionId: string;
    micMuted?: boolean;
    malvPaused?: boolean;
    cameraAssistEnabled?: boolean;
  }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "call_session_mutation" });
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    const changes: Record<string, unknown> = {};
    if (typeof args.micMuted === "boolean" && args.micMuted !== session.micMuted) {
      session.micMuted = args.micMuted;
      changes.micMuted = args.micMuted;
    }
    if (typeof args.malvPaused === "boolean" && args.malvPaused !== session.malvPaused) {
      session.malvPaused = args.malvPaused;
      session.operatorActivityStatus = args.malvPaused ? "paused" : "awaiting_user";
      changes.malvPaused = args.malvPaused;
      if (args.malvPaused && session.voiceFlowMode === "active") {
        session.voiceFlowMode = "paused";
        changes.voiceFlowMode = "paused";
      }
      if (!args.malvPaused && session.voiceFlowMode === "paused") {
        session.voiceFlowMode = "active";
        changes.voiceFlowMode = "active";
      }
    }
    if (typeof args.cameraAssistEnabled === "boolean" && args.cameraAssistEnabled !== session.cameraAssistEnabled) {
      if (args.cameraAssistEnabled && !this.flags.cameraAssistEnabled()) {
        throw new BadRequestException("Camera assist is currently unavailable.");
      }
      if (args.cameraAssistEnabled && session.kind !== "video") {
        throw new BadRequestException("Camera assist is only available for video calls.");
      }
      if (args.cameraAssistEnabled && session.participationScope === "group") {
        throw new BadRequestException("Camera assist is not available in group calls.");
      }
      if (session.status !== "active") {
        throw new BadRequestException("Camera assist can only be changed during an active call.");
      }
      session.cameraAssistEnabled = args.cameraAssistEnabled;
      changes.cameraAssistEnabled = args.cameraAssistEnabled;
    }
    if (Object.keys(changes).length === 0) {
      return { session, runtime: this.toSnapshot(session) };
    }
    session.voiceState = this.computeVoiceState(session, session.voiceState === "muted" ? "idle" : session.voiceState);
    if (session.transcriptStreamingStatus === "final" && !session.malvPaused && !session.micMuted) {
      session.transcriptStreamingStatus = "idle";
    }
    await this.sessions.save(session);
    await this.writeAudit({
      actorUserId: args.userId,
      eventType: "call_session_controls_updated",
      message: "Updated live call controls.",
      metadata: { callSessionId: session.id, ...changes }
    });
    this.emitRuntime(args.userId, session);
    return { session, runtime: this.toSnapshot(session) };
  }

  async updateCallState(args: { userId: string; callSessionId: string; status: CallSessionStatus }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "call_session_mutation" });
    const session = await this.findOwnedSession(args.userId, args.callSessionId);

    /** Idempotent: second end must not corrupt or throw; still emit runtime for sync. */
    if (args.status === "ended" && session.status === "ended") {
      this.clearPlaybackResetTimer(session.id);
      this.emitRuntime(args.userId, session);
      return { session, runtime: this.toSnapshot(session) };
    }

    if (args.status === "ended") {
      this.clearPlaybackResetTimer(session.id);
      if (!session.endedAt) session.endedAt = new Date();
      session.status = "ended";
      session.cameraAssistEnabled = false;
      session.voiceState = "idle";
      session.connectionState = "healthy";
      session.transcriptStreamingStatus = "idle";
      session.operatorActivityStatus = "idle";
    } else {
      session.status = "active";
      session.connectionState = "healthy";
      session.lastHeartbeatAt = new Date();
      session.operatorActivityStatus = session.malvPaused ? "paused" : "awaiting_user";
      session.voiceState = this.computeVoiceState(session, "idle");
    }

    await this.sessions.save(session);
    await this.writeAudit({
      actorUserId: args.userId,
      eventType: args.status === "ended" ? "call_session_ended" : "call_session_activated",
      message: args.status === "ended" ? "Call session ended." : "Call session re-activated.",
      metadata: { callSessionId: session.id, kind: session.kind, status: session.status }
    });
    if (args.status === "ended") {
      await this.closeOpenVaultSessionsOnCallEnd(args.userId);
      this.enqueueAutomaticRecap({ userId: args.userId, callSessionId: session.id });
    }
    this.emitRuntime(args.userId, session);
    return { session, runtime: this.toSnapshot(session) };
  }

  async markReconnecting(args: { userId: string; callSessionId: string; reason?: string | null }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.status !== "active") return { session, runtime: this.toSnapshot(session) };
    this.clearPlaybackResetTimer(session.id);
    session.connectionState = "reconnecting";
    session.reconnectCount = Number(session.reconnectCount ?? 0) + 1;
    await this.sessions.save(session);
    await this.writeAudit({
      actorUserId: args.userId,
      eventType: "call_session_reconnecting",
      level: "warn",
      message: "Call session entered reconnecting state.",
      metadata: { callSessionId: session.id, reason: args.reason ?? null }
    });
    this.emitRuntime(args.userId, session);
    return { session, runtime: this.toSnapshot(session) };
  }

  async markCaptureStarted(args: { userId: string; callSessionId: string }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.status !== "active") return { session, runtime: this.toSnapshot(session) };
    this.clearPlaybackResetTimer(session.id);
    session.transcriptStreamingStatus = "capturing";
    session.operatorActivityStatus = session.malvPaused ? "paused" : "awaiting_user";
    session.voiceState = this.computeVoiceState(session, "listening");
    await this.sessions.save(session);
    this.emitRuntime(args.userId, session);
    return { session, runtime: this.toSnapshot(session) };
  }

  async markCaptureFinalizing(args: { userId: string; callSessionId: string }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.status !== "active") return { session, runtime: this.toSnapshot(session) };
    this.clearPlaybackResetTimer(session.id);
    session.transcriptStreamingStatus = "finalizing";
    session.operatorActivityStatus = session.malvPaused ? "paused" : "processing";
    session.voiceState = this.computeVoiceState(session, "thinking");
    await this.sessions.save(session);
    this.emitRuntime(args.userId, session);
    return { session, runtime: this.toSnapshot(session) };
  }

  async markPartialTranscript(args: { userId: string; callSessionId: string }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.status !== "active") return { session, runtime: this.toSnapshot(session) };
    this.clearPlaybackResetTimer(session.id);
    session.transcriptStreamingStatus = "partial";
    session.operatorActivityStatus = session.malvPaused ? "paused" : "awaiting_user";
    session.voiceState = this.computeVoiceState(session, "listening");
    await this.sessions.save(session);
    this.emitRuntime(args.userId, session);
    return { session, runtime: this.toSnapshot(session) };
  }

  async markThinking(args: { userId: string; callSessionId: string }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.status !== "active") return { session, runtime: this.toSnapshot(session) };
    this.clearPlaybackResetTimer(session.id);
    session.transcriptStreamingStatus = "final";
    session.operatorActivityStatus = session.malvPaused ? "paused" : "processing";
    session.voiceState = this.computeVoiceState(session, "thinking");
    await this.sessions.save(session);
    this.emitRuntime(args.userId, session);
    return { session, runtime: this.toSnapshot(session) };
  }

  async markPlaybackState(args: {
    userId: string;
    callSessionId: string;
    isSpeaking: boolean;
    expectedPlaybackMs?: number | null;
  }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.status !== "active") return { session, runtime: this.toSnapshot(session) };
    this.clearPlaybackResetTimer(session.id);
    session.operatorActivityStatus = session.malvPaused ? "paused" : args.isSpeaking ? "responding" : "awaiting_user";
    session.voiceState = this.computeVoiceState(session, args.isSpeaking ? "speaking" : "idle");
    if (!args.isSpeaking && session.transcriptStreamingStatus === "final") {
      session.transcriptStreamingStatus = "idle";
    }
    await this.sessions.save(session);
    this.emitRuntime(args.userId, session);
    if (args.isSpeaking && !session.malvPaused) {
      this.schedulePlaybackReset({
        userId: args.userId,
        callSessionId: session.id,
        delayMs: args.expectedPlaybackMs ?? this.estimatePlaybackDurationMs("")
      });
    }
    return { session, runtime: this.toSnapshot(session) };
  }

  async markOperatorStarted(args: { userId: string; callSessionId: string; aiJobId?: string | null; sandboxRunId?: string | null }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.status !== "active") return { session, runtime: this.toSnapshot(session) };
    this.clearPlaybackResetTimer(session.id);
    session.operatorActivityStatus = session.malvPaused ? "paused" : "running_workflow";
    session.voiceState = this.computeVoiceState(session, "thinking");
    session.transcriptStreamingStatus = "final";
    await this.sessions.save(session);
    await this.writeAudit({
      actorUserId: args.userId,
      eventType: "call_operator_workflow_started",
      message: "Voice call triggered operator workflow.",
      metadata: {
        callSessionId: session.id,
        aiJobId: args.aiJobId ?? null,
        sandboxRunId: args.sandboxRunId ?? null
      }
    });
    this.emitRuntime(args.userId, session);
    return { session, runtime: this.toSnapshot(session) };
  }

  async markVoiceError(args: { userId: string; callSessionId: string; message: string; code?: string | null }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    this.clearPlaybackResetTimer(session.id);
    session.operatorActivityStatus = "error";
    session.transcriptStreamingStatus = "idle";
    session.voiceState = this.computeVoiceState(session, "idle");
    await this.sessions.save(session);
    await this.writeAudit({
      actorUserId: args.userId,
      eventType: "call_voice_error",
      level: "error",
      message: args.message,
      metadata: { callSessionId: session.id, code: args.code ?? null }
    });
    this.emitRuntime(args.userId, session);
    return { session, runtime: this.toSnapshot(session) };
  }

  async isCallPaused(args: { userId: string; callSessionId: string }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    return Boolean(session.malvPaused);
  }

  async addTranscript(args: {
    userId: string;
    callSessionId: string;
    speakerRole: TranscriptSpeakerRole;
    content: string;
    startTimeMs?: number | null;
    vaultTriggerCandidate?: boolean;
  }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.status !== "active") throw new BadRequestException("Call session not found/active or not owned by user.");

    const tx = this.transcripts.create({
      callSession: session,
      user: { id: args.userId } as any,
      speakerRole: args.speakerRole,
      content: args.content,
      startTimeMs: args.startTimeMs ?? null
    });
    await this.transcripts.save(tx);

    const transcriptPayload = {
      callSessionId: session.id,
      transcriptId: tx.id,
      speakerRole: tx.speakerRole,
      content: tx.content,
      startTimeMs: tx.startTimeMs ?? null,
      vaultTriggerCandidate: Boolean(args.vaultTriggerCandidate)
    };
    this.realtime.emitToUser(args.userId, "call:transcript", transcriptPayload);
    this.realtime.emitToCallSession(session.id, "call:transcript", transcriptPayload);

    return tx;
  }

  async listTranscripts(args: { userId: string; callSessionId: string; limit?: number }) {
    await this.findOwnedSession(args.userId, args.callSessionId);
    const take = Math.min(Math.max(args.limit ?? 500, 1), 2000);
    const rows = await this.transcripts.find({
      where: { callSession: { id: args.callSessionId }, user: { id: args.userId } },
      order: { createdAt: "ASC" },
      take
    });
    return rows.map((r) => ({
      transcriptId: r.id,
      speakerRole: r.speakerRole,
      content: r.content,
      startTimeMs: r.startTimeMs ?? null,
      createdAt: r.createdAt.getTime()
    }));
  }

  async patchCallRecap(args: { userId: string; callSessionId: string; body: Partial<CallRecapPayload> }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "call_session_mutation" });
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    const prev = (session.recapJson ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...prev };
    if (args.body.summary !== undefined) next.summary = args.body.summary;
    if (args.body.actionItems !== undefined) next.actionItems = args.body.actionItems;
    if (args.body.decisions !== undefined) next.decisions = args.body.decisions;
    if (args.body.unresolvedQuestions !== undefined) next.unresolvedQuestions = args.body.unresolvedQuestions;
    if (args.body.suggestedFollowUps !== undefined) next.suggestedFollowUps = args.body.suggestedFollowUps;
    next.source = "manual";
    next.decidedAt = Date.now();
    session.recapJson = next;
    await this.sessions.save(session);
    const recap = this.normalizeRecap(next);
    if (recap && this.isRecapMaterialized(recap)) {
      await this.createTasksFromRecap({ userId: args.userId, session, recap });
      await this.persistRecapIntoConversation({ userId: args.userId, session, recap });
    }
    await this.writeAudit({
      actorUserId: args.userId,
      eventType: "call_session_recap_updated",
      message: "Call recap updated.",
      metadata: { callSessionId: session.id, keys: Object.keys(args.body) }
    });
    this.emitRuntime(args.userId, session);
    return { session, runtime: this.toSnapshot(session) };
  }

  async recordUserTranscript(args: { userId: string; callSessionId: string; content: string; startTimeMs?: number | null }) {
    await this.addTranscript({
      userId: args.userId,
      callSessionId: args.callSessionId,
      speakerRole: "user",
      content: args.content,
      startTimeMs: args.startTimeMs ?? null
    });
    await this.markThinking({ userId: args.userId, callSessionId: args.callSessionId });
  }

  async recordMalvTranscript(args: { userId: string; callSessionId: string; content: string }) {
    await this.addTranscript({
      userId: args.userId,
      callSessionId: args.callSessionId,
      speakerRole: "malv",
      content: args.content,
      startTimeMs: null
    });
    await this.markPlaybackState({
      userId: args.userId,
      callSessionId: args.callSessionId,
      isSpeaking: true,
      expectedPlaybackMs: this.estimatePlaybackDurationMs(args.content)
    });
  }

  /** Public helper for boxed TTS duration hints (orb / playback reset). */
  estimateTtsPlaybackMs(content: string) {
    return this.estimatePlaybackDurationMs(content);
  }

  /**
   * After final STT on a voice call: persist user line only when transcript capture is enabled.
   */
  async recordOperatorUserUtteranceIfEnabled(args: { userId: string; callSessionId: string; content: string }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.callTranscriptEnabled) {
      await this.recordUserTranscript({
        userId: args.userId,
        callSessionId: args.callSessionId,
        content: args.content
      });
    } else {
      await this.markThinking({ userId: args.userId, callSessionId: args.callSessionId });
    }
  }

  /**
   * If an utterance arrives before join advanced onboarding (race), move into consent state without re-speaking the prompt.
   */
  async nudgeVoiceFlowFromOnboarding(args: { userId: string; callSessionId: string }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.voiceFlowMode !== "onboarding") return session;
    session.voiceFlowMode = "awaiting_transcript_consent";
    await this.sessions.save(session);
    this.emitRuntime(args.userId, session);
    return session;
  }

  async finalizeTranscriptConsent(args: { userId: string; callSessionId: string; transcriptEnabled: boolean }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    session.callTranscriptEnabled = args.transcriptEnabled;
    session.voiceFlowMode = "active";
    if (!session.malvPaused) {
      session.operatorActivityStatus = "awaiting_user";
    }
    await this.sessions.save(session);
    this.emitRuntime(args.userId, session);
    return session;
  }

  /**
   * First client join after a new voice call: speak transcript-consent prompt, enter awaiting state.
   */
  async beginVoiceOnboardingIfNeeded(args: { userId: string; callSessionId: string }) {
    const session = await this.findOwnedSession(args.userId, args.callSessionId);
    if (session.kind !== "voice" || session.status !== "active") return null;
    if (session.voiceFlowMode !== "onboarding") return null;
    session.voiceFlowMode = "awaiting_transcript_consent";
    await this.sessions.save(session);
    this.emitRuntime(args.userId, session);
    const text = VOICE_ONBOARDING_TRANSCRIPT_QUESTION;
    this.realtime.emitToUser(args.userId, "voice:response", {
      intent: "voice_onboarding_transcript_question",
      response: text,
      callSessionId: session.id,
      source: "boxed",
      playbackMessageId: `boxed-onboard-${session.id}-${Date.now()}`,
      voiceFlowMode: session.voiceFlowMode,
      callTranscriptEnabled: session.callTranscriptEnabled,
      awaitingTranscriptConsent: true
    });
    await this.markPlaybackState({
      userId: args.userId,
      callSessionId: session.id,
      isSpeaking: true,
      expectedPlaybackMs: this.estimatePlaybackDurationMs(text)
    });
    return session;
  }
}

