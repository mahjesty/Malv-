export type SourceModelReviewEnvConfig = {
  enabled: boolean;
  providerId: string;
  maxTextBytes: number;
  maxFiles: number;
};

const DEFAULT_MAX_TEXT = 48_000;
const DEFAULT_MAX_FILES = 12;

function readBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return defaultValue;
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadSourceModelReviewConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): SourceModelReviewEnvConfig {
  return {
    enabled: readBool(env.SOURCE_MODEL_REVIEW_ENABLED, false),
    providerId: (env.SOURCE_MODEL_REVIEW_PROVIDER ?? "").trim(),
    maxTextBytes: readPositiveInt(env.SOURCE_MODEL_REVIEW_MAX_TEXT_BYTES, DEFAULT_MAX_TEXT),
    maxFiles: readPositiveInt(env.SOURCE_MODEL_REVIEW_MAX_FILES, DEFAULT_MAX_FILES)
  };
}

export function loadPublishWithWarningsPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return readBool(env.SOURCE_INTAKE_PUBLISH_WITH_WARNINGS, true);
}
