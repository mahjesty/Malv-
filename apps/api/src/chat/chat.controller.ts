import { Body, Controller, Get, Logger, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { InferenceConfigService } from "../inference/inference-config.service";
import { ChatRequestDto } from "./dto/chat.dto";
import { ChatService } from "./chat.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";

@Controller("v1/chat")
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly beastWorker: BeastWorkerClient,
    private readonly inferenceConfig: InferenceConfigService
  ) {}

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
      return { reply: "Session invalid." };
    }
    return this.chatService.handleChat({
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
        userMoodHint: body.userMoodHint ?? null
      }
    });
  }
}
