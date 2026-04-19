/**
 * Persists optional **DB compatibility** overrides for primary inference when `MALV_INFERENCE_PRIMARY_AUTHORITY` is unset
 * or `db_compat` (default). When authority is `env`, `InferenceAdminController` rejects enabling new overrides;
 * runtime primary targets still come from process env via `InferenceConfigService`.
 */
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import { InferenceBackendSettingsEntity } from "../db/entities/inference-backend-settings.entity";
import type { InferenceBackendType, InferenceFallbackPolicy } from "./inference-config.types";
import { InferenceBackendSettingsPatchDto } from "./inference-admin.dto";

function normalizeOpenAICompatBaseUrl(raw: string | undefined): string | null {
  const x = (raw ?? "").trim();
  if (!x) return null;
  const noSlash = x.replace(/\/+$/, "");
  if (noSlash.toLowerCase().endsWith("/v1")) return noSlash;
  return `${noSlash}/v1`;
}

function validateHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException(`Invalid URL: ${url}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new BadRequestException(`URL must be http(s): ${url}`);
  }
}

function safeDefaultFallbackPolicy(dtoPolicy: InferenceFallbackPolicy | undefined, nodeEnv: string | undefined): InferenceFallbackPolicy {
  if (dtoPolicy) return dtoPolicy;
  const prod = (nodeEnv ?? "").trim().toLowerCase() === "production";
  return prod ? "disabled" : "allow_on_error";
}

@Injectable()
export class InferenceSettingsService {
  constructor(
    @InjectRepository(InferenceBackendSettingsEntity) private readonly repo: Repository<InferenceBackendSettingsEntity>,
    private readonly cfg: ConfigService
  ) {}

  async getLatestRow(): Promise<InferenceBackendSettingsEntity | null> {
    const rows = await this.repo.find({ order: { updatedAt: "DESC" }, take: 1 });
    return rows[0] ?? null;
  }

  async resetOverride(actorUserId: string): Promise<void> {
    const latest = await this.getLatestRow();
    if (!latest) {
      // Create a disabled row to keep admin experience consistent.
      await this.repo.save(
        this.repo.create({
          enabled: false,
          backendType: "openai_compatible",
          baseUrl: null,
          apiKey: null,
          model: null,
          timeoutMs: null,
          fallbackEnabled: false,
          fallbackBackend: "fallback",
          fallbackPolicy: "disabled",
          lastUpdatedByUserId: actorUserId
        })
      );
      return;
    }

    latest.enabled = false;
    latest.lastUpdatedByUserId = actorUserId;
    await this.repo.save(latest);
  }

  async upsertOverride(dto: InferenceBackendSettingsPatchDto, actorUserId: string): Promise<InferenceBackendSettingsEntity> {
    const nodeEnv = this.cfg.get<string>("NODE_ENV");

    if (!dto.enabled) {
      await this.resetOverride(actorUserId);
      // Return a disabled snapshot; controller will re-resolve effective config anyway.
      const latest = await this.getLatestRow();
      if (!latest) throw new BadRequestException("Failed to disable override.");
      return latest;
    }

    const latest = await this.getLatestRow();

    const backendType = dto.backendType as InferenceBackendType;
    let baseUrl: string | null = dto.baseUrl ?? null;
    if (backendType === "openai_compatible") {
      baseUrl = normalizeOpenAICompatBaseUrl(baseUrl ?? undefined);
      if (!baseUrl) throw new BadRequestException("baseUrl is required for openai_compatible.");
      validateHttpUrl(baseUrl);
    } else if (backendType === "ollama" || backendType === "llamacpp") {
      if (!baseUrl) throw new BadRequestException("baseUrl is required for selected backend.");
      baseUrl = baseUrl.trim().replace(/\/+$/, "");
      validateHttpUrl(baseUrl);
    } else {
      baseUrl = null;
    }

    // Preserve apiKey if admin PATCH omitted it.
    const apiKey =
      dto.apiKey === undefined
        ? latest?.apiKey ?? null
        : dto.apiKey.trim().length === 0
          ? ""
          : dto.apiKey;

    const model = dto.model ?? latest?.model ?? null;

    const fallbackEnabled = dto.fallbackEnabled ?? latest?.fallbackEnabled ?? false;
    const fallbackPolicy: InferenceFallbackPolicy = safeDefaultFallbackPolicy(dto.fallbackPolicy, nodeEnv);

    // If the operator explicitly selected the fallback template as the backend, always allow it.
    const normalizedFallbackEnabled =
      backendType === "fallback" ? true : fallbackPolicy === "disabled" ? false : Boolean(fallbackEnabled);

    const row = latest
      ? Object.assign(latest, {
          enabled: true,
          backendType,
          baseUrl,
          apiKey,
          model,
          timeoutMs: dto.timeoutMs ?? null,
          fallbackEnabled: normalizedFallbackEnabled,
          fallbackPolicy,
          fallbackBackend: "fallback" as any,
          lastUpdatedByUserId: actorUserId
        })
      : this.repo.create({
          enabled: true,
          backendType,
          baseUrl,
          apiKey,
          model,
          timeoutMs: dto.timeoutMs ?? null,
          fallbackEnabled: normalizedFallbackEnabled,
          fallbackPolicy,
          fallbackBackend: "fallback" as any,
          lastUpdatedByUserId: actorUserId
        });

    return this.repo.save(row);
  }
}

