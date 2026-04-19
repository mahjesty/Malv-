import { MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL } from "./local-inference.constants";
import { malvEnvFirst, MALV_LOCAL_CPU_INFERENCE_ENV } from "./malv-inference-env.util";

/** Beast-worker FastAPI — POST /v1/infer (default port 9090). Never reuse the llama-server URL. */
export const MALV_BEAST_WORKER_DEFAULT_BASE_URL = "http://127.0.0.1:9090";

export function normalizeMalvHttpBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Resolved worker base for HTTP calls. Uses only `BEAST_WORKER_BASE_URL` — no fallback to local inference env.
 */
export function resolveBeastWorkerBaseUrl(get: (key: string) => string | undefined): string {
  const raw = get("BEAST_WORKER_BASE_URL");
  const chosen = raw != null && raw.trim() !== "" ? raw.trim() : MALV_BEAST_WORKER_DEFAULT_BASE_URL;
  return normalizeMalvHttpBaseUrl(chosen);
}

export function resolveBeastWorkerBaseUrls(get: (key: string) => string | undefined): string[] {
  const rawList = (get("BEAST_WORKER_BASE_URLS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => normalizeMalvHttpBaseUrl(s));
  if (rawList.length > 0) return Array.from(new Set(rawList));
  return [resolveBeastWorkerBaseUrl(get)];
}

/**
 * Resolved OpenAI-compatible model server base (llama-server on the API host).
 * Prefers `MALV_LOCAL_CPU_INFERENCE_BASE_URL`, then legacy `MALV_LOCAL_INFERENCE_BASE_URL`.
 */
export function resolveMalvLocalInferenceBaseUrl(get: (key: string) => string | undefined): string {
  const raw = malvEnvFirst(get, MALV_LOCAL_CPU_INFERENCE_ENV.BASE_URL);
  const chosen = raw != null && raw !== "" ? raw : MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL;
  return normalizeMalvHttpBaseUrl(chosen);
}

export function buildBeastWorkerLocalModelCollisionMessage(workerBaseNormalized: string): string {
  return (
    `BEAST_WORKER_BASE_URL (${workerBaseNormalized}) equals MALV local CPU model base ` +
    `(MALV_LOCAL_CPU_INFERENCE_BASE_URL / MALV_LOCAL_INFERENCE_BASE_URL or default ${MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL}). ` +
    `Beast-worker serves POST /v1/infer on ${MALV_BEAST_WORKER_DEFAULT_BASE_URL} by default; ` +
    `llama-server uses POST /v1/chat/completions on ${MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL}. ` +
    `These bases must differ.`
  );
}

export function assertBeastWorkerBaseDistinctFromLocalModelOrThrow(
  workerBaseNormalized: string,
  get: (key: string) => string | undefined
): void {
  const localNorm = resolveMalvLocalInferenceBaseUrl(get);
  if (workerBaseNormalized === localNorm) {
    throw new Error(buildBeastWorkerLocalModelCollisionMessage(workerBaseNormalized));
  }
}

/**
 * Fail fast at API startup when env points worker and local model at the same origin.
 */
export function validateMalvInferenceBaseUrlsFromProcessEnv(env: NodeJS.ProcessEnv): void {
  const get = (k: string) => env[k];
  const worker = resolveBeastWorkerBaseUrl(get);
  const local = resolveMalvLocalInferenceBaseUrl(get);
  if (worker === local) {
    throw new Error(
      `[MALV inference config] ${buildBeastWorkerLocalModelCollisionMessage(worker)} ` +
        `Fix .env so BEAST_WORKER_BASE_URL targets beast-worker and MALV_LOCAL_CPU_INFERENCE_BASE_URL (or legacy MALV_LOCAL_INFERENCE_BASE_URL) targets llama-server.`
    );
  }
}
