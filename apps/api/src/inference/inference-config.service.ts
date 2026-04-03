import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import { InferenceBackendSettingsEntity } from "../db/entities/inference-backend-settings.entity";
import type {
  InferenceBackendType,
  InferenceFallbackPolicy,
  InferenceConfigSecret,
  InferenceConfigSummary,
  InferenceEffectiveConfig,
  InferenceBackendCapability
} from "./inference-config.types";

function isTruthy(raw: string | undefined): boolean {
  if (raw == null || raw === "") return false;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function safeLower(raw: string | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

function normalizeOpenAICompatBaseUrl(raw: string | undefined): string | null {
  const x = (raw ?? "").trim();
  if (!x) return null;
  const noSlash = x.replace(/\/+$/, "");
  if (noSlash.toLowerCase().endsWith("/v1")) return noSlash;
  return `${noSlash}/v1`;
}

function maskSecret(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw);
  if (s.length <= 4) return "****";
  return `${"****"}${s.slice(-4)}`;
}

function healthCheckPathForBackend(backendType: InferenceBackendType): string | null {
  switch (backendType) {
    case "openai_compatible":
      return "/v1/models";
    case "ollama":
      return "/api/tags";
    case "llamacpp":
      return "/health";
    case "transformers":
      return "/local";
    case "fallback":
      return "/template";
    case "disabled":
      return null;
    default:
      return null;
  }
}

function parseBackendType(raw: string | undefined): InferenceBackendType | null {
  const n = safeLower(raw);
  if (!n) return null;
  if (n === "vllm") return "openai_compatible";
  if (n === "openai") return "openai_compatible";
  if (n === "offline" || n === "disabled") return "disabled";
  if (n === "openai_compatible" || n === "ollama" || n === "llamacpp" || n === "transformers" || n === "fallback") return n as any;
  return null;
}

function asValidInt(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const v = Number(s);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.floor(v);
}

type EnvConfigInput = {
  backendType?: InferenceBackendType | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
  timeoutMs?: number | null;
  fallbackEnabled?: boolean;
  fallbackPolicy?: InferenceFallbackPolicy;
};

function validateConfigCandidate(candidate: EnvConfigInput & { backendType: InferenceBackendType }): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const { backendType, baseUrl, model, timeoutMs, fallbackEnabled, fallbackPolicy } = candidate;

  if (backendType === "disabled") {
    return { ok: true, errors };
  }

  if (backendType === "fallback") {
    // Template fallback does not require a model/baseUrl.
  }

  if (backendType === "openai_compatible") {
    if (!baseUrl) errors.push("INFERENCE_BASE_URL (or MALV_OPENAI_COMPAT_BASE_URL) is required for openai_compatible.");
    if (!model) errors.push("INFERENCE_MODEL (or MALV_INFERENCE_MODEL) is required for openai_compatible.");
  }

  if (backendType === "ollama") {
    if (!baseUrl) errors.push("INFERENCE_BASE_URL (or MALV_INFERENCE_BASE_URL) is required for ollama.");
    if (!model) errors.push("INFERENCE_MODEL (or MALV_INFERENCE_MODEL) is required for ollama.");
  }

  if (backendType === "llamacpp") {
    if (!baseUrl) errors.push("INFERENCE_BASE_URL (or MALV_LLAMACPP_BASE_URL) is required for llamacpp.");
    if (!model) errors.push("INFERENCE_MODEL (or MALV_INFERENCE_MODEL) is required for llamacpp.");
  }

  if (backendType === "transformers") {
    if (!model) errors.push("INFERENCE_MODEL (or MALV_MODEL_PATH / MALV_TRANSFORMERS_MODEL_PATH) is required for transformers.");
  }

  if (timeoutMs != null && (!Number.isFinite(timeoutMs) || timeoutMs < 1000)) {
    errors.push("INFERENCE_TIMEOUT_MS must be >= 1000.");
  }

  if (fallbackEnabled == null) errors.push("INFERENCE_FALLBACK_ENABLED must be set or derivable.");
  if (!fallbackPolicy) errors.push("INFERENCE_FALLBACK_POLICY must be set or derivable.");

  return { ok: errors.length === 0, errors };
}

function buildBackendCapabilityCatalog(): InferenceBackendCapability[] {
  return [
    {
      backendType: "openai_compatible",
      supportsText: true,
      supportsStreaming: true,
      supportsMultimodalInput: true,
      supportsToolCalling: true,
      requiresBaseUrl: true,
      requiresModel: true,
      requiresApiKey: false,
      productionRecommended: true,
      notes: "Best default for model plug-in flexibility and external provider portability."
    },
    {
      backendType: "ollama",
      supportsText: true,
      supportsStreaming: true,
      supportsMultimodalInput: false,
      supportsToolCalling: false,
      requiresBaseUrl: true,
      requiresModel: true,
      requiresApiKey: false,
      productionRecommended: true,
      notes: "Strong local/private path; depends on local model availability and host performance."
    },
    {
      backendType: "llamacpp",
      supportsText: true,
      supportsStreaming: true,
      supportsMultimodalInput: false,
      supportsToolCalling: false,
      requiresBaseUrl: true,
      requiresModel: true,
      requiresApiKey: false,
      productionRecommended: false,
      notes: "Useful for constrained deployments and edge/local scenarios."
    },
    {
      backendType: "transformers",
      supportsText: true,
      supportsStreaming: false,
      supportsMultimodalInput: false,
      supportsToolCalling: false,
      requiresBaseUrl: false,
      requiresModel: true,
      requiresApiKey: false,
      productionRecommended: false,
      notes: "On-box model path mode; good for offline but requires robust host resource controls."
    },
    {
      backendType: "fallback",
      supportsText: true,
      supportsStreaming: false,
      supportsMultimodalInput: false,
      supportsToolCalling: false,
      requiresBaseUrl: false,
      requiresModel: false,
      requiresApiKey: false,
      productionRecommended: false,
      notes: "Template safety fallback only; not primary intelligence."
    },
    {
      backendType: "disabled",
      supportsText: false,
      supportsStreaming: false,
      supportsMultimodalInput: false,
      supportsToolCalling: false,
      requiresBaseUrl: false,
      requiresModel: false,
      requiresApiKey: false,
      productionRecommended: false,
      notes: "Inference offline state."
    }
  ];
}

@Injectable()
export class InferenceConfigService {
  // Intentionally no logging by default: we return config details through admin/UI endpoints.

  constructor(
    @InjectRepository(InferenceBackendSettingsEntity) private readonly overrides: Repository<InferenceBackendSettingsEntity>,
    private readonly cfg: ConfigService
  ) {}

  private getCanonicalEnv(): EnvConfigInput & { rawSource: "env" } {
    const backendType =
      parseBackendType(this.cfg.get<string>("INFERENCE_BACKEND")) ??
      parseBackendType(this.cfg.get<string>("MALV_INFERENCE_BACKEND"));

    const envBaseUrl = this.cfg.get<string>("INFERENCE_BASE_URL");
    const legacyOpenAICompatBase = this.cfg.get<string>("MALV_OPENAI_COMPAT_BASE_URL");
    const legacyOllamaBase = this.cfg.get<string>("MALV_INFERENCE_BASE_URL");
    const legacyLlamaCppBase = this.cfg.get<string>("MALV_LLAMACPP_BASE_URL");

    const baseUrlCandidate =
      envBaseUrl ??
      (backendType === "openai_compatible"
        ? legacyOpenAICompatBase
        : backendType === "ollama"
          ? legacyOllamaBase
          : backendType === "llamacpp"
            ? legacyLlamaCppBase
            : undefined);
    let baseUrl: string | null = baseUrlCandidate ? String(baseUrlCandidate) : null;
    if (backendType === "openai_compatible") {
      baseUrl = normalizeOpenAICompatBaseUrl(baseUrl ?? undefined);
    } else if (backendType) {
      baseUrl = (baseUrl ?? "").trim().replace(/\/+$/, "") || null;
    }

    const apiKey = this.cfg.get<string>("INFERENCE_API_KEY") ?? this.cfg.get<string>("MALV_OPENAI_COMPAT_API_KEY") ?? null;
    const model = this.cfg.get<string>("INFERENCE_MODEL") ?? this.cfg.get<string>("MALV_INFERENCE_MODEL") ?? null;

    const timeoutMs = asValidInt(this.cfg.get<string>("INFERENCE_TIMEOUT_MS") ?? this.cfg.get<string>("MALV_INFERENCE_TIMEOUT_MS") ?? undefined);

    // Production-safe default: disabled fallback by default.
    const nodeEnv = safeLower(this.cfg.get<string>("NODE_ENV"));
    const prod = nodeEnv === "production";

    const fallbackEnabledRaw = this.cfg.get<string>("INFERENCE_FALLBACK_ENABLED") ?? this.cfg.get<string>("MALV_FALLBACK_ENABLED");
    const fallbackEnabled =
      fallbackEnabledRaw != null && fallbackEnabledRaw !== ""
        ? isTruthy(fallbackEnabledRaw)
        : !prod;

    const fallbackPolicyRaw = this.cfg.get<string>("INFERENCE_FALLBACK_POLICY") ?? undefined;
    const fallbackPolicy: InferenceFallbackPolicy =
      (fallbackPolicyRaw
        ? (safeLower(fallbackPolicyRaw) as InferenceFallbackPolicy)
        : prod
          ? ("disabled" as const)
          : ("allow_on_error" as const)) ?? ("allow_on_error" as const);

    // Production-safe behavior: if fallback is disabled by policy, disable fallback unless the operator explicitly selected the fallback template backend.
    if (fallbackPolicy === "disabled" && backendType !== "fallback") {
      // Keep explicit operator fallback-enabled intent out of production risk; policy is the source of truth here.
      // (Admin UI can still switch to "fallback template" backend for a forced template response.)
      // This also keeps worker health fields consistent.
      if (backendType !== "disabled") {
        // Only adjust fallbackEnabled for inference-backed backends.
        // backendType === "disabled" means inference is offline anyway.
      }
    }

    return {
      rawSource: "env",
      backendType: backendType ?? "openai_compatible",
      baseUrl,
      apiKey: backendType === "openai_compatible" ? apiKey : null,
      model,
      timeoutMs,
      fallbackEnabled:
        (backendType ?? "openai_compatible") === "fallback"
          ? true
          : fallbackPolicy === "disabled"
            ? false
            : fallbackEnabled,
      fallbackPolicy
    };
  }

  async getEnabledDbOverride(): Promise<InferenceBackendSettingsEntity | null> {
    // Convention: only one override row; pick the most recently updated.
    // If multiple exist, "enabled" rows win, then newest updatedAt.
    const enabled = await this.overrides.find({ where: { enabled: true }, order: { updatedAt: "DESC" }, take: 1 });
    if (!enabled?.length) return null;
    return enabled[0];
  }

  async getEffectiveConfigForWorker(): Promise<InferenceEffectiveConfig> {
    // Worker needs secrets, so this is an internal method guarded by internal auth in the controller.
    const envCandidate = this.getCanonicalEnv();
    const db = await this.getEnabledDbOverride();

    const dbValidation = db
      ? validateConfigCandidate({
          backendType: db.backendType,
          baseUrl: db.baseUrl,
          apiKey: db.apiKey,
          model: db.model,
          timeoutMs: db.timeoutMs,
          fallbackEnabled: db.fallbackEnabled,
          fallbackPolicy: db.fallbackPolicy
        })
      : { ok: false, errors: [] };

    if (db && dbValidation.ok) {
      return {
        configSource: "db_override",
        configRevision: `db:${db.updatedAt.getTime()}:${db.id}`,
        effective: this.buildSummaryFromEntity(db, true),
        validation: { ok: true, errors: [] }
      };
    }

    // DB missing/invalid -> env-backed config.
    const backendType = (envCandidate.backendType ?? "openai_compatible") as InferenceBackendType;
    const envValidation = validateConfigCandidate({
      backendType,
      baseUrl: envCandidate.baseUrl,
      apiKey: envCandidate.apiKey,
      model: envCandidate.model,
      timeoutMs: envCandidate.timeoutMs,
      fallbackEnabled: envCandidate.fallbackEnabled,
      fallbackPolicy: envCandidate.fallbackPolicy
    });
    return {
      configSource: "env",
      configRevision: `env:${safeLower(this.cfg.get<string>("INFERENCE_BACKEND") ?? this.cfg.get<string>("MALV_INFERENCE_BACKEND") ?? "")}:${safeLower(
        this.cfg.get<string>("INFERENCE_MODEL") ?? this.cfg.get<string>("MALV_INFERENCE_MODEL") ?? ""
      )}`,
      effective: this.buildSummaryFromEnv(envCandidate),
      validation: envValidation.ok ? { ok: true, errors: [] } : envValidation
    };
  }

  async getEffectiveConfigForAdmin(): Promise<InferenceEffectiveConfig> {
    const v = await this.getEffectiveConfigForWorker();
    // Redact secrets for admin/UI while keeping the validation and configSource consistent.
    const apiKeyRedacted = v.effective.apiKey ? maskSecret(v.effective.apiKey) : null;
    return {
      ...v,
      effective: {
        ...v.effective,
        apiKey: undefined,
        apiKeyRedacted
      }
    };
  }

  private buildSummaryFromEnv(envCandidate: EnvConfigInput): InferenceConfigSummary & InferenceConfigSecret {
    const backendType = (envCandidate.backendType ?? "openai_compatible") as InferenceBackendType;
    const baseUrl =
      backendType === "openai_compatible" ? normalizeOpenAICompatBaseUrl(envCandidate.baseUrl ?? undefined) : envCandidate.baseUrl ?? null;
    const healthCheckPath = healthCheckPathForBackend(backendType);
    return {
      enabled: backendType !== "disabled",
      backendType,
      baseUrl,
      apiKey: backendType === "openai_compatible" ? envCandidate.apiKey ?? null : null,
      model: envCandidate.model ?? null,
      timeoutMs: envCandidate.timeoutMs ?? null,
      fallbackEnabled: Boolean(envCandidate.fallbackEnabled),
      fallbackBackend: "fallback",
      fallbackPolicy: envCandidate.fallbackPolicy ?? "allow_on_error",
      healthCheckPath,
      apiKeyRedacted: null
    };
  }

  private buildSummaryFromEntity(
    entity: InferenceBackendSettingsEntity,
    includeSecret: boolean
  ): InferenceConfigSummary & InferenceConfigSecret {
    const backendType = entity.backendType;
    const healthCheckPath = healthCheckPathForBackend(backendType);
    const baseUrl = backendType === "openai_compatible" ? normalizeOpenAICompatBaseUrl(entity.baseUrl ?? undefined) : entity.baseUrl ?? null;
    const fallbackBackend = entity.fallbackBackend ?? "fallback";
    return {
      enabled: backendType !== "disabled",
      backendType,
      baseUrl,
      apiKey: includeSecret ? entity.apiKey : null,
      model: entity.model ?? null,
      timeoutMs: entity.timeoutMs ?? null,
      fallbackEnabled: Boolean(entity.fallbackEnabled),
      fallbackBackend,
      fallbackPolicy: entity.fallbackPolicy ?? "allow_on_error",
      healthCheckPath,
      apiKeyRedacted: includeSecret ? null : maskSecret(entity.apiKey)
    };
  }

  /**
   * For the internal worker config endpoint.
   * Worker only needs the effective configuration; it does not need separate env/db.
   */
  async getWorkerConfigPayload() {
    const resolved = await this.getEffectiveConfigForWorker();
    return {
      ok: true,
      configSource: resolved.configSource,
      configRevision: resolved.configRevision,
      config: resolved.effective
    };
  }

  /**
   * Helper for admin GET:
   * returns effective config summary (secrets redacted) and the selected backend.
   */
  async getAdminSettingsPayload() {
    const resolved = await this.getEffectiveConfigForAdmin();
    const effectiveBackend = resolved.effective.enabled ? resolved.effective.backendType : "disabled";
    return {
      ok: resolved.validation.ok,
      validation: resolved.validation,
      configSource: resolved.configSource,
      configRevision: resolved.configRevision,
      effectiveBackend,
      effectiveConfig: resolved.effective
    };
  }

  async getEnvBackendCandidateForDocs() {
    const envCandidate = this.getCanonicalEnv();
    const backendType = (envCandidate.backendType ?? "openai_compatible") as InferenceBackendType;
    return {
      backendType,
      baseUrl: envCandidate.baseUrl ?? null,
      model: envCandidate.model ?? null,
      timeoutMs: envCandidate.timeoutMs ?? null,
      fallbackEnabled: envCandidate.fallbackEnabled ?? true,
      fallbackPolicy: envCandidate.fallbackPolicy ?? ("allow_on_error" as InferenceFallbackPolicy)
    };
  }

  getBackendCapabilityCatalog() {
    return buildBackendCapabilityCatalog();
  }
}

