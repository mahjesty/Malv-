import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import { InferenceConfigService } from "./inference-config.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("v1/health")
export class InferenceHealthController {
  constructor(private readonly inferenceConfig: InferenceConfigService, private readonly beastWorker: BeastWorkerClient) {}

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

    return {
      ok: true,
      configuredBackend: effective.effectiveBackend,
      effectiveBackend,
      configSource: effective.configSource,
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
      workerDetail: null
    };
  }
}

