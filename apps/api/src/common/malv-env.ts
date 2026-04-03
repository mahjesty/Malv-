/**
 * `MALV_FALLBACK_ENABLED` — shared with beast-worker (`app/core/settings.py` `_truthy`).
 * When unset or empty, default is true (failover to synthetic fallback allowed).
 * Set to false/0/off to disable that path. Brain-health `fallbackEnabled` requires both
 * API env and worker-reported inference fallback to allow fallback (AND).
 */
export function malvFallbackEnabledFromEnv(raw: string | undefined): boolean {
  if (raw == null || raw === "") return true;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

/**
 * Aggregated fallback availability for GET /v1/chat/brain-health.
 * False if either the API disables `MALV_FALLBACK_ENABLED` or the worker reports fallback off.
 */
export function brainHealthFallbackEnabled(args: {
  malvFallbackEnabledEnv: string | undefined;
  workerFallbackEnabled: boolean | undefined;
}): boolean {
  const api = malvFallbackEnabledFromEnv(args.malvFallbackEnabledEnv);
  const worker = args.workerFallbackEnabled ?? true;
  return api && worker;
}
