import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from "class-validator";
import type { InferenceBackendType, InferenceFallbackPolicy } from "./inference-config.types";

export const INFERENCE_BACKEND_TYPES: InferenceBackendType[] = [
  "openai_compatible",
  "ollama",
  "llamacpp",
  "transformers",
  "fallback",
  "disabled"
];

export const INFERENCE_FALLBACK_POLICIES: InferenceFallbackPolicy[] = ["always_allow", "allow_on_error", "disabled"];

function isBackendRequiresBaseUrl(backendType: InferenceBackendType): boolean {
  return backendType === "openai_compatible" || backendType === "ollama" || backendType === "llamacpp";
}

export class InferenceBackendSettingsPatchDto {
  @IsBoolean()
  enabled!: boolean;

  @ValidateIf((o) => o.enabled)
  @IsIn(INFERENCE_BACKEND_TYPES)
  backendType!: InferenceBackendType;

  @ValidateIf((o) => o.enabled && o.backendType && isBackendRequiresBaseUrl(o.backendType))
  @IsString()
  // URL format guard; we normalize openai_compatible base URLs to /v1 in the service.
  baseUrl!: string;

  @ValidateIf((o) => o.enabled && o.backendType === "openai_compatible")
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ValidateIf((o) => o.enabled && o.backendType && o.backendType !== "disabled" && o.backendType !== "fallback")
  @IsString()
  model!: string;

  @ValidateIf((o) => o.enabled && typeof o.timeoutMs !== "undefined")
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(600000)
  timeoutMs?: number;

  @ValidateIf((o) => o.enabled)
  @IsOptional()
  @IsBoolean()
  fallbackEnabled?: boolean;

  @ValidateIf((o) => o.enabled)
  @IsOptional()
  @IsIn(INFERENCE_FALLBACK_POLICIES)
  fallbackPolicy?: InferenceFallbackPolicy;
}

export class InferenceBackendSettingsTestDto {
  @IsOptional()
  @IsString()
  note?: string;
}

