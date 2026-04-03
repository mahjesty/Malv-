import { Body, Controller, Get, HttpException, HttpStatus, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { InferenceConfigService } from "./inference-config.service";
import { InferenceSettingsService } from "./inference-settings.service";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import { InferenceBackendSettingsPatchDto } from "./inference-admin.dto";
import type { InferenceFallbackPolicy, InferenceBackendType } from "./inference-config.types";

function isAdminActor(req: Request): { userId: string } | null {
  const auth = (req as any).user as { userId?: string; role?: string };
  if (!auth?.userId) return null;
  return { userId: auth.userId };
}

function shouldAcceptWorkerHealth(args: {
  desiredBackendType: InferenceBackendType;
  fallbackEnabled: boolean;
  fallbackPolicy: InferenceFallbackPolicy;
  worker: Awaited<ReturnType<BeastWorkerClient["health"]>>;
}): boolean {
  const { desiredBackendType, fallbackEnabled, fallbackPolicy, worker } = args;
  if (desiredBackendType === "disabled") return true;
  if (desiredBackendType === "fallback") return true;

  if (worker.inferenceReady) return true;
  if (fallbackPolicy === "disabled") return false;
  if (!fallbackEnabled) return false;
  return Boolean(worker.fallbackInChain);
}

@Controller("v1/admin/inference")
export class InferenceAdminController {
  constructor(
    private readonly inferenceConfig: InferenceConfigService,
    private readonly inferenceSettings: InferenceSettingsService,
    private readonly beastWorker: BeastWorkerClient
  ) {}

  @Get("settings")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.inference.settings.read", limit: 30, windowSeconds: 60 })
  async getSettings(@Req() req: Request) {
    const admin = isAdminActor(req);
    if (!admin) throw new HttpException("Invalid session", HttpStatus.UNAUTHORIZED);

    const effective = await this.inferenceConfig.getAdminSettingsPayload();
    const worker = await this.beastWorker.health();

    const fallbackActive =
      !worker.inferenceReady && Boolean(worker.fallbackEnabled) && Boolean(worker.fallbackInChain) && effective.effectiveBackend !== "fallback";

    return {
      ok: true,
      configSource: effective.configSource,
      configRevision: effective.configRevision,
      configuredBackend: effective.effectiveBackend,
      effectiveBackend: effective.effectiveBackend,
      inferenceConfigured: worker.inferenceConfigured,
      inferenceReady: worker.inferenceReady,
      fallbackEnabled: Boolean(worker.fallbackEnabled),
      fallbackActive,
      model: worker.selectedModel ?? null,
      primaryBackend: worker.primaryBackend ?? null,
      primarySkipReason: worker.primarySkipReason ?? null,
      baseUrlRedacted:
        typeof effective.effectiveConfig.baseUrl === "string"
          ? effective.effectiveConfig.baseUrl.endsWith("/v1")
            ? effective.effectiveConfig.baseUrl.slice(0, -3)
            : effective.effectiveConfig.baseUrl
          : null,
      effectiveConfig: {
        ...effective.effectiveConfig,
        apiKeyRedacted: effective.effectiveConfig.apiKeyRedacted ?? null
      },
      worker: {
        reachable: worker.reachable,
        streamingSupported: worker.streamingSupported ?? null,
        chain: worker.chain ?? null,
        backendNotes: worker.backendNotes ?? null,
        inferenceTelemetry: worker.inferenceTelemetry ?? null
      }
    };
  }

  @Patch("settings")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.inference.settings.patch", limit: 10, windowSeconds: 60 })
  async patchSettings(@Req() req: Request, @Body() dto: InferenceBackendSettingsPatchDto) {
    const admin = isAdminActor(req);
    if (!admin) throw new HttpException("Invalid session", HttpStatus.UNAUTHORIZED);

    await this.inferenceSettings.upsertOverride(dto, admin.userId);

    // Immediately verify worker posture so we don't “silently accept” broken configs.
    const effective = await this.inferenceConfig.getAdminSettingsPayload();
    const worker = await this.beastWorker.health();
    const fallbackPolicy = effective.effectiveConfig.fallbackPolicy;
    const fallbackEnabled = Boolean(effective.effectiveConfig.fallbackEnabled);
    const desiredBackendType = effective.effectiveBackend as InferenceBackendType;

    const ok = shouldAcceptWorkerHealth({
      desiredBackendType,
      fallbackEnabled,
      fallbackPolicy,
      worker
    });

    if (!ok) {
      await this.inferenceSettings.resetOverride(admin.userId);
      throw new HttpException(
        {
          ok: false,
          error: "Worker rejected the requested inference backend (post-persist health check failed).",
          worker
        },
        HttpStatus.BAD_REQUEST
      );
    }

    return { ok: true, configSource: effective.configSource, configRevision: effective.configRevision, effectiveConfig: effective.effectiveConfig };
  }

  @Post("settings/test")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.inference.settings.test", limit: 20, windowSeconds: 60 })
  async testSettings() {
    const worker = await this.beastWorker.health();
    const effective = await this.inferenceConfig.getAdminSettingsPayload();
    return {
      ok: true,
      configSource: effective.configSource,
      configRevision: effective.configRevision,
      effectiveBackend: effective.effectiveBackend,
      workerHealth: worker
    };
  }

  @Get("catalog")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.inference.catalog.read", limit: 30, windowSeconds: 60 })
  async getBackendCatalog() {
    return {
      ok: true,
      catalog: this.inferenceConfig.getBackendCapabilityCatalog()
    };
  }

  @Post("settings/reset")
  @UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
  @RequirePermissions("admin.dashboard.read")
  @RateLimit({ key: "admin.inference.settings.reset", limit: 10, windowSeconds: 60 })
  async resetSettings(@Req() req: Request) {
    const admin = isAdminActor(req);
    if (!admin) throw new HttpException("Invalid session", HttpStatus.UNAUTHORIZED);
    await this.inferenceSettings.resetOverride(admin.userId);
    const effective = await this.inferenceConfig.getAdminSettingsPayload();
    return { ok: true, configSource: effective.configSource, configRevision: effective.configRevision, effectiveConfig: effective.effectiveConfig };
  }
}

