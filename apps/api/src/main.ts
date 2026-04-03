import "./envload";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import express, { type NextFunction, type Request, type Response } from "express";
import { AppModule } from "./app.module";
import { ObservabilityService } from "./common/observability.service";
import { validateProductionSecurityOrThrow, validateProductionSecretsGroupsOrThrow } from "./common/production-config-validation";

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

function logApiInferenceEnvSnapshot(): void {
  const log = new Logger("MalvInferenceEnv");
  const rawBase = process.env.MALV_OPENAI_COMPAT_BASE_URL ?? "";
  const resolvedV1 =
    rawBase.trim().length === 0
      ? null
      : rawBase.replace(/\/+$/, "").toLowerCase().endsWith("/v1")
        ? rawBase.replace(/\/+$/, "")
        : `${rawBase.replace(/\/+$/, "")}/v1`;
  log.log(
    JSON.stringify({
      tag: "MALV_API_INFERENCE_ENV",
      envFiles: "repo root .env then apps/api/.env (see src/envload.ts)",
      MALV_INFERENCE_BACKEND: process.env.MALV_INFERENCE_BACKEND ?? null,
      MALV_OPENAI_COMPAT_BASE_URL_raw: rawBase || null,
      MALV_OPENAI_COMPAT_API_ROOT_resolved_like_worker: resolvedV1,
      MALV_INFERENCE_MODEL: process.env.MALV_INFERENCE_MODEL ?? null,
      note: "Chat inference is executed by beast-worker; values must match the worker process (restart worker after .env edits)."
    })
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
  logApiInferenceEnvSnapshot();
  logProductionReadinessSnapshot();
  const isProd = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
  const corsOrigins = (process.env.SOCKET_CORS_ORIGIN || process.env.WEB_ORIGIN || "http://localhost:5173,http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  validateProductionSecurityOrThrow({ isProd, corsOrigins });
  validateProductionSecretsGroupsOrThrow({ isProd });
  const app = await NestFactory.create(AppModule);
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
