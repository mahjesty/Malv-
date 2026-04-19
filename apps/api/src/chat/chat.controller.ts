import { Body, Controller, Get, Logger, Post, Req, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { InferenceConfigService } from "../inference/inference-config.service";
import { malvLocalInferenceChatPathBlockedFromEnv } from "../inference/malv-chat-tier-availability.util";
import { ChatRequestDto } from "./dto/chat.dto";
import { ChatService, type ChatHandleResult } from "./chat.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import {
  pickMalvRichAssistantMetaForCompletionHandoff,
  sanitizeMalvChatAssistantMetaForUser
} from "../beast/malv-chat-assistant-meta-sanitize.util";
import { buildMalvTransportDecisionSnapshot } from "./malv-transport-parity.util";
import { MalvFeatureFlagsService } from "../common/malv-feature-flags.service";

@Controller("v1/chat")
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly beastWorker: BeastWorkerClient,
    private readonly inferenceConfig: InferenceConfigService,
    private readonly cfg: ConfigService,
    private readonly flags: MalvFeatureFlagsService
  ) {}

  private rolloutGate(userId: string, role: string | undefined): { allow: true } | { allow: false; reason: string } {
    if (role === "admin") return { allow: true };
    if (this.flags.internalUsersOnlyMode()) {
      const allowlist = this.flags.internalUserAllowlist();
      if (!allowlist.includes(userId)) {
        return { allow: false, reason: "internal_users_only" };
      }
    }
    if (!this.flags.userInRollout(userId)) {
      return { allow: false, reason: "percentage_rollout_gate" };
    }
    return { allow: true };
  }

  @Get("brain-health")
  @UseGuards(JwtAuthGuard)
  async brainHealth(@Req() req: Request) {
    const auth = (req as any).user as { userId: string; role?: string } | undefined;
    if (auth?.role !== "admin") return { ok: false, error: "Forbidden" };
    this.logger.log(`[MALV BRAIN] brain-health requested userId=${auth?.userId ?? "none"}`);
    const worker = await this.beastWorker.health();
    const tel = worker.inferenceTelemetry;

    const effective = await this.inferenceConfig.getAdminSettingsPayload();
    const effectiveBackend =
      worker.effectiveBackend ??
      (worker.inferenceReady ? worker.primaryBackend ?? null : worker.fallbackActive ? "fallback" : null);

    const apiPrimary = effective.effectiveConfig;
    const apiPrimaryBase = apiPrimary?.baseUrl ?? null;
    const apiPrimaryBaseRedacted =
      typeof apiPrimaryBase === "string" && apiPrimaryBase.endsWith("/v1") ? apiPrimaryBase.slice(0, -3) : apiPrimaryBase;

    const inferenceStatus = {
      backend: tel?.lastBackend ?? worker.primaryBackend ?? null,
      model: worker.selectedModel ?? null,
      lastLatencyMs: tel?.lastLatencyMs ?? null,
      lastSuccessAt: tel?.lastSuccessAt ?? null,
      lastFailureClass: tel?.lastFailureClass ?? tel?.lastErrorClass ?? null,
      lastFailureAt: tel?.lastFailureAt ?? null,
      lastCorrelationId: tel?.lastCorrelationId ?? null
    };
    return {
      brainReady: true,
      apiChatReady: true,
      workerReachable: worker.reachable,
      configSource: effective.configSource,
      configRevision: effective.configRevision,
      primaryAuthority: effective.primaryAuthority,
      ...(effective.dbOverridePresentButInactive ? { dbOverridePresentButInactive: true } : {}),
      ...(effective.runtimeAuthorityNote ? { runtimeAuthorityNote: effective.runtimeAuthorityNote } : {}),
      workerRuntimeConfigRevision: worker.runtimeConfigRevision ?? null,
      configuredBackend: effective.effectiveBackend,
      effectiveBackend,
      inferenceConfigured: worker.inferenceConfigured,
      inferenceReady: worker.inferenceReady,
      fallbackActive: worker.fallbackActive ?? false,
      fallbackPolicy: worker.fallbackPolicy ?? null,
      primaryBackend: worker.primaryBackend ?? null,
      primarySkipReason: worker.primarySkipReason ?? null,
      workerInferenceChain: worker.chain ?? null,
      backendNotes: worker.backendNotes ?? null,
      fallbackOnlyMode: worker.fallbackOnlyMode ?? false,
      failoverToFallbackLikely: worker.failoverToFallbackLikely ?? false,
      fallbackInChain: worker.fallbackInChain ?? false,
      selectedModel: worker.selectedModel ?? null,
      workerStreamingSupported: worker.streamingSupported ?? false,
      workerFallbackEnabled: worker.fallbackEnabled ?? false,
      fallbackEnabled: worker.fallbackEnabled ?? false,
      streamingAvailable: worker.streamingSupported ?? true,
      workerDetail: null,
      inferenceTelemetry: tel ?? null,
      inferenceStatus,
      lastCheckAtMs: worker.lastCheckAtMs ?? null,
      latencyMs: tel?.lastLatencyMs ?? null,
      errorSummary: tel?.lastErrorSummary ?? tel?.lastErrorClass ?? null,
      malvLocalInferenceChatPathBlocked: malvLocalInferenceChatPathBlockedFromEnv((k) => this.cfg.get<string>(k)),
      apiConfiguredPrimaryInference: {
        configSource: effective.configSource,
        backendType: apiPrimary?.backendType ?? null,
        openAiCompatibleApiRootRedacted: apiPrimaryBaseRedacted,
        model: apiPrimary?.model ?? null,
        inferenceEnabled: Boolean(apiPrimary && apiPrimary.enabled !== false && apiPrimary.backendType !== "disabled")
      },
      at: Date.now()
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async handleChat(@Req() req: Request, @Body() body: ChatRequestDto) {
    const auth = (req as any).user as { userId: string; role: string } | undefined;
    const userId = auth?.userId;
    this.logger.log(
      `[MALV E2E] api chat request received (HTTP POST /v1/chat) userId=${userId ?? "none"} messageLen=${body.message?.length ?? 0} conversationId=${body.conversationId ?? "new"}`
    );
    if (!userId) {
      return { message: "Session invalid.", reply: "Session invalid." };
    }
    const rollout = this.rolloutGate(userId, auth?.role);
    if (!rollout.allow) {
      return {
        message: "MALV staged validation rollout is currently limited for this account.",
        reply: "MALV staged validation rollout is currently limited for this account.",
        meta: { malvReplySource: "rollout_gate", policyDenied: true, malvRolloutGateReason: rollout.reason }
      };
    }
    const raw = await this.chatService.handleChat({
      userId,
      userRole: auth?.role === "admin" ? "admin" : "user",
      message: body.message,
      conversationId: body.conversationId ?? null,
      workspaceId: body.workspaceId ?? null,
      assistantMessageId: body.assistantMessageId ?? null,
      vaultSessionId: body.vaultSessionId ?? null,
      beastLevel: body.beastLevel,
      inputMeta: {
        inputMode: body.inputMode,
        sessionType: body.sessionType ?? null,
        callId: body.callId ?? null,
        operatorPhase: body.operatorPhase ?? null,
        userMoodHint: body.userMoodHint ?? null,
        exploreHandoffJson: body.exploreHandoffJson ?? null
      }
    });
    const out = this.normalizeChatHttpPayload(raw);
    const trace = raw.meta?.malvInferenceTrace as Record<string, unknown> | undefined;
    this.logger.log(
      `[MALV CHAT HTTP] responseNormalized transport=${String(trace?.malvChatInferenceTransport ?? "unknown")} streamingPath=non_streaming_json replyLen=${out.message.length} bodyKeys=${Object.keys(out).join(",")}`
    );
    // DEBUG-AUDIT: removable after chat inference incident triage
    const replySrc = String((raw.meta as Record<string, unknown> | undefined)?.malvReplySource ?? "");
    const skipLocal = trace?.malvLocalInferenceSkipReason;
    this.logger.log(
      `[MALV-AUDIT] http_exit runId=${raw.runId} assistantMessageId=${raw.assistantMessageId} transport=${String(trace?.malvChatInferenceTransport ?? "unknown")} replySource=${replySrc || "none"} replyLen=${out.message.length} localSkip=${skipLocal != null ? String(skipLocal) : "n/a"} localUsed=${String(trace?.malvLocalInferenceUsed ?? false)} malvReplyCoerced=${String(Boolean((raw.meta as Record<string, unknown> | undefined)?.malvReplyCoerced))}`
    );
    return out;
  }

  /** Stable JSON for the web client: always `message` + `reply` (same text), sanitized meta only. */
  private normalizeChatHttpPayload(r: ChatHandleResult) {
    const text = r.reply ?? "";
    const meta = r.meta ? sanitizeMalvChatAssistantMetaForUser(r.meta as Record<string, unknown>) : undefined;
    const decision = buildMalvTransportDecisionSnapshot(meta);
    const assistantMeta = pickMalvRichAssistantMetaForCompletionHandoff(r.meta as Record<string, unknown> | null);
    return {
      message: text,
      reply: text,
      conversationId: r.conversationId,
      runId: r.runId,
      interrupted: Boolean(r.interrupted),
      assistantMessageId: r.assistantMessageId,
      deferAssistantPersist: Boolean(r.deferAssistantPersist),
      ...(assistantMeta && Object.keys(assistantMeta).length > 0 ? { assistantMeta } : {}),
      ...(meta && Object.keys(meta).length > 0
        ? {
            meta: {
              ...meta,
              malvTransportDecisionSnapshot: decision
            }
          }
        : {})
    };
  }
}
