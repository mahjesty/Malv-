/**
 * Central precedence for MALV-owned inference env names vs legacy `INFERENCE_*` / vendor-prefixed aliases.
 * Transport identifiers (e.g. `openai_compatible`) describe wire format, not a vendor product.
 */

export function malvEnvFirst(get: (key: string) => string | undefined, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = get(k);
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

/** API-side local CPU llama-server (OpenAI-compatible `/v1/chat/completions`). */
export const MALV_LOCAL_CPU_INFERENCE_ENV = {
  ENABLED: ["MALV_LOCAL_CPU_INFERENCE_ENABLED", "MALV_LOCAL_INFERENCE_ENABLED"],
  BASE_URL: ["MALV_LOCAL_CPU_INFERENCE_BASE_URL", "MALV_LOCAL_INFERENCE_BASE_URL"],
  MODEL: ["MALV_LOCAL_CPU_INFERENCE_MODEL", "MALV_LOCAL_INFERENCE_MODEL"],
  TIMEOUT_MS: ["MALV_LOCAL_CPU_INFERENCE_TIMEOUT_MS", "MALV_LOCAL_INFERENCE_TIMEOUT_MS"],
  FAILURE_COOLDOWN_MS: ["MALV_LOCAL_CPU_INFERENCE_FAILURE_COOLDOWN_MS", "MALV_LOCAL_INFERENCE_FAILURE_COOLDOWN_MS"],
  SKIP_HEALTH_PROBE: ["MALV_LOCAL_CPU_INFERENCE_SKIP_HEALTH_PROBE", "MALV_LOCAL_INFERENCE_SKIP_HEALTH_PROBE"],
  /** When > 0, reuse last successful GET probe result for this many ms (skips redundant probes on hot path). */
  PROBE_OK_CACHE_MS: ["MALV_LOCAL_CPU_INFERENCE_PROBE_OK_CACHE_MS", "MALV_LOCAL_INFERENCE_PROBE_OK_CACHE_MS"],
  RESPECT_ROUTING_TIER: ["MALV_LOCAL_CPU_INFERENCE_RESPECT_ROUTING_TIER", "MALV_LOCAL_INFERENCE_RESPECT_ROUTING_TIER"],
  DISABLE_CHAT_PATH: ["MALV_LOCAL_CPU_INFERENCE_DISABLE_CHAT_PATH", "MALV_LOCAL_INFERENCE_DISABLE_CHAT_PATH"]
} as const;

/** Primary chain served to beast-worker (effective-config). */
export const MALV_PRIMARY_INFERENCE_ENV = {
  PROVIDER: ["MALV_INFERENCE_PROVIDER", "INFERENCE_BACKEND", "MALV_INFERENCE_BACKEND"],
  BASE_URL: ["MALV_INFERENCE_BASE_URL", "INFERENCE_BASE_URL"],
  MODEL: ["MALV_INFERENCE_MODEL", "INFERENCE_MODEL"],
  API_KEY: ["MALV_INFERENCE_API_KEY", "INFERENCE_API_KEY", "MALV_OPENAI_COMPAT_API_KEY"],
  TIMEOUT_MS: ["MALV_INFERENCE_TIMEOUT_MS", "INFERENCE_TIMEOUT_MS"]
} as const;

/**
 * Who wins for the **primary** GPU / remote inference chain the API serves to beast-worker.
 * - `db_compat` (default): legacy behavior — a valid enabled row in `inference_backend_settings` may override env.
 * - `env`: deployment env (`MALV_INFERENCE_*` / legacy `INFERENCE_*`) is canonical; DB rows are not applied to runtime
 *   (see `InferenceConfigService` and admin PATCH guard). Physical `.env` / process env is still updated out-of-band
 *   in production; admin cannot safely rewrite the host filesystem from this API.
 */
export const MALV_INFERENCE_AUTHORITY_ENV = {
  PRIMARY: ["MALV_INFERENCE_PRIMARY_AUTHORITY"]
} as const;
