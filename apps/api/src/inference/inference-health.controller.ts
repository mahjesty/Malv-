import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import { InferenceConfigService } from "./inference-config.service";
import { LocalInferenceProvider } from "./local-inference.provider";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { malvLocalInferenceChatPathBlockedFromEnv } from "./malv-chat-tier-availability.util";

@Controller("v1/health")
export class InferenceHealthController {
  constructor(
    private readonly inferenceConfig: InferenceConfigService,
    private readonly beastWorker: BeastWorkerClient,
    private readonly localInference: LocalInferenceProvider
  ) {}

  @Get("inference")
  @UseGuards(JwtAuthGuard)
  async getInferenceHealth(@Req() req: Request) {
    const auth = (req as any).user as { role?: string } | undefined;
    if (auth?.role !== "admin") return { ok: false, error: "Forbidden" };
    const effective = await this.inferenceConfig.getAdminSettingsPayload();
    const worker = await this.beastWorker.health();
    const tel = worker.inferenceTelemetry;
    const effectiveBackend =
      worker.effectiveBackend ??
      (worker.inferenceReady ? worker.primaryBackend ?? null : worker.fallbackActive ? "fallback" : null);

    const baseUrl = effective.effectiveConfig.baseUrl ?? null;
    const baseUrlRedacted = typeof baseUrl === "string" && baseUrl.endsWith("/v1") ? baseUrl.slice(0, -3) : baseUrl;

    const malvLocalOpenAiCompatible = this.localInference.isEnabled()
      ? await this.localInference.probeHealth()
      : null;

    const apiPrimary = effective.effectiveConfig;
    const apiPrimaryBase = apiPrimary?.baseUrl ?? null;
    const apiPrimaryBaseRedacted =
      typeof apiPrimaryBase === "string" && apiPrimaryBase.endsWith("/v1") ? apiPrimaryBase.slice(0, -3) : apiPrimaryBase;

    return {
      ok: true,
      configuredBackend: effective.effectiveBackend,
      effectiveBackend,
      configSource: effective.configSource,
      configRevision: effective.configRevision,
      primaryAuthority: effective.primaryAuthority,
      ...(effective.dbOverridePresentButInactive ? { dbOverridePresentButInactive: true } : {}),
      ...(effective.runtimeAuthorityNote ? { runtimeAuthorityNote: effective.runtimeAuthorityNote } : {}),
      workerRuntimeConfigRevision: worker.runtimeConfigRevision ?? null,
      inferenceReady: worker.inferenceReady,
      inferenceConfigured: worker.inferenceConfigured,
      fallbackEnabled: Boolean(worker.fallbackEnabled),
      fallbackActive: Boolean(worker.fallbackActive),
      fallbackPolicy: worker.fallbackPolicy ?? null,
      baseUrlRedacted,
      model: worker.selectedModel ?? null,
      lastCheckAtMs: worker.lastCheckAtMs ?? null,
      latencyMs: tel?.lastLatencyMs ?? null,
      errorSummary: tel?.lastErrorSummary ?? tel?.lastErrorClass ?? null,
      primaryBackend: worker.primaryBackend ?? null,
      primarySkipReason: worker.primarySkipReason ?? null,
      workerDetail: null,
      malvLocalOpenAiCompatible,
      malvLocalInferenceChatPathBlocked: malvLocalInferenceChatPathBlockedFromEnv((k) => process.env[k]),
      apiConfiguredPrimaryInference: {
        configSource: effective.configSource,
        backendType: apiPrimary?.backendType ?? null,
        openAiCompatibleApiRootRedacted: apiPrimaryBaseRedacted,
        model: apiPrimary?.model ?? null,
        inferenceEnabled: Boolean(apiPrimary && apiPrimary.enabled !== false && apiPrimary.backendType !== "disabled")
      }
    };
  }
}

