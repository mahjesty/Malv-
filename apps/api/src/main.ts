import "./envload";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import express, { type NextFunction, type Request, type Response } from "express";
import { AppModule } from "./app.module";
import { ObservabilityService } from "./common/observability.service";
import {
  resolveMalvDeploymentModeFromEnv,
  validateDistributedSafetyOrThrow,
  validateProductionSecurityOrThrow,
  validateProductionSecretsGroupsOrThrow
} from "./common/production-config-validation";
import { MalvRedisIoAdapter } from "./realtime/malv-redis-io.adapter";
import {
  resolveMalvLocalInferenceBaseUrl,
  validateMalvInferenceBaseUrlsFromProcessEnv
} from "./inference/malv-inference-base-urls.util";
import {
  malvGpuTierEnabledFromEnv,
  malvGpuTierProbeWorkerHealthFromEnv,
  malvLocalInferenceChatPathBlockedFromEnv
} from "./inference/malv-chat-tier-availability.util";
import { malvEnvFirst, MALV_LOCAL_CPU_INFERENCE_ENV, MALV_PRIMARY_INFERENCE_ENV } from "./inference/malv-inference-env.util";

export { validateProductionSecurityOrThrow, validateSandboxIsolationConfigOrThrow } from "./common/production-config-validation";

function isEaddrInUse(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as NodeJS.ErrnoException).code === "EADDRINUSE";
}

/**
 * Binds the HTTP server. If the preferred port is taken (typical duplicate `npm run dev:api`),
 * tries the next ports so the process does not exit with EADDRINUSE.
 * Set API_PORT_STRICT=1 to disable fallback (fail fast on conflict).
 */
async function listenWithPortFallback(
  app: INestApplication,
  preferredPort: number,
  host: string
): Promise<void> {
  const strict = process.env.API_PORT_STRICT === "1" || process.env.API_PORT_STRICT === "true";
  const maxTries = Math.max(1, Number(process.env.API_PORT_FALLBACK_TRIES ?? 32));
  const log = new Logger("Bootstrap");

  for (let i = 0; i < maxTries; i++) {
    const port = preferredPort + i;
    try {
      await app.listen(port, host);
      process.env.API_PORT = String(port);
      if (i > 0) {
        log.warn(
          `Port ${preferredPort} was in use; listening on ${port} instead. Free ${preferredPort} or set API_PORT=${port} in .env.`
        );
      }
      return;
    } catch (err) {
      if (strict || !isEaddrInUse(err) || i === maxTries - 1) {
        throw err;
      }
      log.warn(`Port ${port} in use (EADDRINUSE), trying ${port + 1}…`);
    }
  }
}

function envTruthy(raw: string | undefined, defaultWhenEmpty: boolean): boolean {
  if (raw == null || raw === "") return defaultWhenEmpty;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function logApiInferenceEnvSnapshot(): void {
  const log = new Logger("MalvInferenceEnv");
  const get = (k: string) => process.env[k];
  const primaryBaseRaw =
    malvEnvFirst(get, MALV_PRIMARY_INFERENCE_ENV.BASE_URL) ?? malvEnvFirst(get, ["MALV_OPENAI_COMPAT_BASE_URL"]) ?? "";
  const resolvedV1 =
    primaryBaseRaw.trim().length === 0
      ? null
      : primaryBaseRaw.replace(/\/+$/, "").toLowerCase().endsWith("/v1")
        ? primaryBaseRaw.replace(/\/+$/, "")
        : `${primaryBaseRaw.replace(/\/+$/, "")}/v1`;
  const rawWorker = (process.env.BEAST_WORKER_BASE_URL ?? "").trim();
  const rawLocalCpuBaseMalv = (process.env.MALV_LOCAL_CPU_INFERENCE_BASE_URL ?? "").trim();
  const rawLocalCpuBaseLegacy = (process.env.MALV_LOCAL_INFERENCE_BASE_URL ?? "").trim();
  const localInferenceEnabled = envTruthy(malvEnvFirst(get, MALV_LOCAL_CPU_INFERENCE_ENV.ENABLED), false);
  const localInferenceChatPathBlocked = malvLocalInferenceChatPathBlockedFromEnv(get);
  const localInferenceEffectiveBase = resolveMalvLocalInferenceBaseUrl(get);
  const localModel = (malvEnvFirst(get, MALV_LOCAL_CPU_INFERENCE_ENV.MODEL) ?? "").trim();
  const gpuTierEnabled = malvGpuTierEnabledFromEnv(get);
  const gpuHealthProbeEnabled = malvGpuTierProbeWorkerHealthFromEnv(get);
  const primaryInferenceModel = malvEnvFirst(get, MALV_PRIMARY_INFERENCE_ENV.MODEL) ?? "";

  log.log(
    JSON.stringify({
      tag: "MALV_API_INFERENCE_ENV",
      envFiles: "repo root .env then apps/api/.env (see src/envload.ts)",
      process_note:
        "Primary inference for chat is configured with MALV_INFERENCE_* (preferred), then legacy INFERENCE_* / MALV_OPENAI_COMPAT_* / MALV_INFERENCE_BACKEND. Beast-worker reads effective config from the API. Local CPU llama on the API host uses MALV_LOCAL_CPU_INFERENCE_* (legacy MALV_LOCAL_INFERENCE_*).",
      BEAST_WORKER_BASE_URL_raw: rawWorker || null,
      MALV_LOCAL_CPU_INFERENCE_BASE_URL_raw: rawLocalCpuBaseMalv || null,
      MALV_LOCAL_INFERENCE_BASE_URL_raw: rawLocalCpuBaseLegacy || null,
      MALV_LOCAL_CPU_INFERENCE_ENABLED_raw: process.env.MALV_LOCAL_CPU_INFERENCE_ENABLED ?? null,
      MALV_LOCAL_INFERENCE_ENABLED_raw: process.env.MALV_LOCAL_INFERENCE_ENABLED ?? null,
      malv_local_cpu_inference_enabled_effective: localInferenceEnabled,
      MALV_LOCAL_CPU_INFERENCE_DISABLE_CHAT_PATH_raw: process.env.MALV_LOCAL_CPU_INFERENCE_DISABLE_CHAT_PATH ?? null,
      MALV_LOCAL_INFERENCE_DISABLE_CHAT_PATH_raw: process.env.MALV_LOCAL_INFERENCE_DISABLE_CHAT_PATH ?? null,
      malv_local_inference_chat_path_blocked_effective: localInferenceChatPathBlocked,
      malv_local_cpu_inference_effective_base_url: localInferenceEffectiveBase,
      MALV_LOCAL_CPU_INFERENCE_MODEL: localModel || null,
      MALV_GPU_TIER_ENABLED_raw: process.env.MALV_GPU_TIER_ENABLED ?? null,
      malv_gpu_tier_enabled_effective: gpuTierEnabled,
      MALV_GPU_TIER_PROBE_WORKER_HEALTH: process.env.MALV_GPU_TIER_PROBE_WORKER_HEALTH ?? null,
      malv_gpu_tier_probe_worker_health_effective: gpuHealthProbeEnabled,
      MALV_LIGHTWEIGHT_INFERENCE_ENABLED: process.env.MALV_LIGHTWEIGHT_INFERENCE_ENABLED ?? null,
      MALV_INFERENCE_PROVIDER_raw: process.env.MALV_INFERENCE_PROVIDER ?? null,
      INFERENCE_BACKEND: process.env.INFERENCE_BACKEND ?? null,
      MALV_INFERENCE_BACKEND: process.env.MALV_INFERENCE_BACKEND ?? null,
      MALV_INFERENCE_BASE_URL_raw: malvEnvFirst(get, ["MALV_INFERENCE_BASE_URL"]) || null,
      INFERENCE_BASE_URL_raw: process.env.INFERENCE_BASE_URL ?? null,
      MALV_OPENAI_COMPAT_BASE_URL_raw: malvEnvFirst(get, ["MALV_OPENAI_COMPAT_BASE_URL"]) || null,
      openai_compatible_api_root_resolved_like_worker: resolvedV1,
      MALV_INFERENCE_MODEL_raw: process.env.MALV_INFERENCE_MODEL ?? null,
      MALV_INFERENCE_PRIMARY_AUTHORITY: process.env.MALV_INFERENCE_PRIMARY_AUTHORITY ?? null,
      INFERENCE_MODEL_raw: process.env.INFERENCE_MODEL ?? null,
      note:
        "Set MALV_LOCAL_CPU_INFERENCE_DISABLE_CHAT_PATH=true (or legacy MALV_LOCAL_INFERENCE_DISABLE_CHAT_PATH) to forbid API→local-CPU llama for chat. BEAST_WORKER_BASE_URL must not equal the local CPU llama base."
    })
  );

  log.log(
    `[MalvInferenceEnv] summary: api_local_cpu_inference=${localInferenceEnabled ? "ENABLED" : "disabled"} ` +
      `local_cpu_chat_path_blocked=${localInferenceChatPathBlocked ? "yes" : "no"} ` +
      `local_cpu_base_url=${localInferenceEffectiveBase} ` +
      `local_cpu_model=${localModel || "(unset — server default)"} ` +
      `gpu_tier=${gpuTierEnabled ? "ENABLED" : "disabled"} ` +
      `gpu_health_probe=${gpuHealthProbeEnabled ? "on" : "off"} ` +
      `primary_inference_model=${primaryInferenceModel || "(unset)"}`
  );
}

function logProductionReadinessSnapshot(): void {
  const log = new Logger("ProductionReadiness");
  const isProd = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
  const requiredInProd = [
    "JWT_ACCESS_SECRET",
    "DB_HOST",
    "DB_USER",
    "DB_NAME",
    "MALV_VAULT_MASTER_KEY",
    "AUTH_REFRESH_COOKIE_SECURE",
    "REDIS_RATE_LIMIT_URL"
  ] as const;
  const missing = isProd ? requiredInProd.filter((k) => !(process.env[k] ?? "").trim()) : [];
  const sameSite = (process.env.AUTH_REFRESH_COOKIE_SAMESITE ?? "lax").toLowerCase();
  const secureCookie = (process.env.AUTH_REFRESH_COOKIE_SECURE ?? "").toLowerCase();
  const cookieRisk = isProd && sameSite === "none" && secureCookie !== "true";
  const storageLegacyRegisterEnabled = (process.env.MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER ?? "false").toLowerCase() === "true";
  log.log(
    JSON.stringify({
      tag: "MALV_PRODUCTION_READINESS",
      env: process.env.NODE_ENV ?? "development",
      requiredEnvMissing: missing,
      cookie: {
        secure: process.env.AUTH_REFRESH_COOKIE_SECURE ?? null,
        sameSite,
        risk: cookieRisk ? "invalid_none_without_secure" : null
      },
      vaultMasterKeyConfigured: Boolean((process.env.MALV_VAULT_MASTER_KEY ?? "").trim()),
      rateLimitRedisConfigured: Boolean(((process.env.REDIS_RATE_LIMIT_URL ?? process.env.REDIS_URL) ?? "").trim()),
      uploadHandleLegacyFallbackEnabled: storageLegacyRegisterEnabled,
      deploymentMode: resolveMalvDeploymentModeFromEnv(process.env),
      realtimeEnabled: (process.env.MALV_REALTIME_ENABLED ?? "true").toLowerCase() !== "false",
      backgroundWorkloadsEnabled: (process.env.MALV_BACKGROUND_WORKLOADS_ENABLED ?? "true").toLowerCase() !== "false",
      migrations: {
        synchronize: false,
        migrationsRun: false,
        note: "Run migrations before booting production nodes."
      }
    })
  );
  if (missing.length > 0) {
    log.error(`Missing required production env vars: ${missing.join(", ")}`);
    if ((process.env.MALV_FAIL_ON_READINESS_ERRORS ?? "true").toLowerCase() === "true") {
      throw new Error("Production readiness env validation failed.");
    }
  }
}

async function bootstrap() {
  validateMalvInferenceBaseUrlsFromProcessEnv(process.env);
  logApiInferenceEnvSnapshot();
  logProductionReadinessSnapshot();
  const isProd = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
  const corsOrigins = (process.env.SOCKET_CORS_ORIGIN || process.env.WEB_ORIGIN || "http://localhost:5173,http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  validateProductionSecurityOrThrow({ isProd, corsOrigins });
  validateProductionSecretsGroupsOrThrow({ isProd });
  validateDistributedSafetyOrThrow({ isProd, env: process.env });
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const wsAdapter = new MalvRedisIoAdapter(app);
  await wsAdapter.connectToRedis();
  app.useWebSocketAdapter(wsAdapter);
  /** Safety net for inline data URLs; large sources should use staged `sourceImageFileId`. */
  app.useBodyParser("json", { limit: "12mb" });
  const observability = app.get(ObservabilityService);
  observability.logMonitoringHints();

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      observability.observeHttpRequest({
        method: req.method,
        path: req.originalUrl ?? req.url ?? "/",
        statusCode: res.statusCode,
        durationMs: Date.now() - start
      });
    });
    next();
  });

  app.use(express.urlencoded({ extended: true }));

  app.enableCors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const preferredPort = Number(process.env.API_PORT ?? 8080);
  const host = process.env.API_HOST ?? "0.0.0.0";
  await listenWithPortFallback(app, preferredPort, host);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    const log = new Logger("Bootstrap");
    log.error(err?.message ?? err);
    process.exit(1);
  });
}
