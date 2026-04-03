import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SandboxIsolationProvider } from "../sandbox/sandbox-isolation.provider";
import { SecurityEventService } from "./security-event.service";
import {
  buildRedactedEnvSnapshot,
  validateProductionSecretsGroupsOrThrow,
  type SecretsValidationSummary
} from "../common/production-config-validation";

@Injectable()
export class SecurityPostureService {
  constructor(
    private readonly cfg: ConfigService,
    private readonly isolation: SandboxIsolationProvider,
    private readonly securityEvents: SecurityEventService
  ) {}

  getSnapshot(args: { isProd: boolean }): {
    generatedAt: string;
    environment: string;
    sandbox: {
      providerMode: string;
      enforcementClass: string;
      dockerHealth: "ok" | "unknown" | "not_applicable";
      dockerImage: string;
    };
    cookies: {
      refreshSecure: boolean | null;
      refreshHttpOnly: boolean | null;
      sameSite: string | null;
    };
    cors: { explicitOriginsCount: number; wildcardForbiddenInProd: boolean };
    diagnostics: { metricsEndpoint: string; inferenceEnvLoggedAtBoot: boolean };
    legacyFlags: { legacyStorageUriRegister: boolean };
    auditSink: ReturnType<SecurityEventService["getAuditSinkHealth"]>;
    secretsSummary: SecretsValidationSummary;
    redactedCriticalEnv: Record<string, string>;
  } {
    const providerMode = String(this.cfg.get<string>("SANDBOX_ISOLATION_PROVIDER") ?? "local")
      .trim()
      .toLowerCase();
    const dockerOk = providerMode === "docker" ? this.isolation.getDockerHealthSnapshot() : "not_applicable";
    let secretsSummary: SecretsValidationSummary;
    try {
      secretsSummary = validateProductionSecretsGroupsOrThrow({ isProd: args.isProd });
    } catch (e) {
      secretsSummary = {
        ok: false,
        failures: [e instanceof Error ? e.message : String(e)],
        groups: {
          jwt: { ok: false, detail: "validation_error" },
          database: { ok: false, detail: "validation_error" },
          vault: { ok: false, detail: "validation_error" },
          redisRateLimit: { ok: false, detail: "validation_error" }
        }
      };
    }

    const corsRaw = this.cfg.get<string>("SOCKET_CORS_ORIGIN") || this.cfg.get<string>("WEB_ORIGIN") || "";
    const origins = corsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      generatedAt: new Date().toISOString(),
      environment: args.isProd ? "production" : "non_production",
      sandbox: {
        providerMode,
        enforcementClass: this.isolation.getEnforcementClassSnapshot(),
        dockerHealth: dockerOk,
        dockerImage: String(this.cfg.get<string>("SANDBOX_DOCKER_IMAGE") ?? "node:20-alpine")
      },
      cookies: {
        refreshSecure: this.parseBool(this.cfg.get<string>("AUTH_REFRESH_COOKIE_SECURE")),
        refreshHttpOnly: this.parseBool(this.cfg.get<string>("AUTH_REFRESH_COOKIE_HTTP_ONLY")),
        sameSite: (this.cfg.get<string>("AUTH_REFRESH_COOKIE_SAMESITE") ?? "lax").toLowerCase()
      },
      cors: {
        explicitOriginsCount: origins.length,
        wildcardForbiddenInProd: args.isProd && origins.includes("*")
      },
      diagnostics: {
        metricsEndpoint: "/metrics (internal metrics controller)",
        inferenceEnvLoggedAtBoot: true
      },
      legacyFlags: {
        legacyStorageUriRegister: (this.cfg.get<string>("MALV_ALLOW_LEGACY_STORAGE_URI_REGISTER") ?? "false").toLowerCase() === "true"
      },
      auditSink: this.securityEvents.getAuditSinkHealth(),
      secretsSummary,
      redactedCriticalEnv: buildRedactedEnvSnapshot([
        "JWT_ACCESS_SECRET",
        "JWT_REFRESH_SECRET",
        "DB_PASSWORD",
        "MALV_VAULT_MASTER_KEY",
        "REDIS_RATE_LIMIT_URL",
        "REDIS_URL",
        "NODE_ENV"
      ])
    };
  }

  private parseBool(raw: string | undefined): boolean | null {
    if (raw == null || raw === "") return null;
    return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
  }
}
