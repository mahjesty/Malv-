/**
 * Rich beast-worker infer failure text for **structured server logs** (and Error.message for internal catch paths).
 * Must not be shown to end users; chat uses a generic unavailable notice and logs this string separately.
 * When BEAST_WORKER_BASE_URL points at a chat-completions server, POST /v1/infer returns 404 with an OpenAI-shaped body.
 */

const OPENAI_NOT_FOUND_MARKERS = /not_found_error|"type"\s*:\s*"not_found|file not found/i;

export function formatBeastWorkerInferFailureMessage(status: number, bodyText: string, requestUrl: string): string {
  const trimmed = bodyText.trim();
  const head = trimmed.length > 480 ? `${trimmed.slice(0, 480)}…` : trimmed;

  if (status === 404 && OPENAI_NOT_FOUND_MARKERS.test(trimmed) && requestUrl.includes("/v1/infer")) {
    const hint =
      "Likely cause: BEAST_WORKER_BASE_URL targets an OpenAI-compatible chat-completions server (e.g. llama-server on :8081), which has no POST /v1/infer. Point BEAST_WORKER_BASE_URL at the MALV beast-worker FastAPI app (default http://127.0.0.1:9090). For API→local CPU model directly, enable MALV_LOCAL_CPU_INFERENCE_ENABLED (legacy MALV_LOCAL_INFERENCE_ENABLED) and set MALV_LOCAL_CPU_INFERENCE_BASE_URL (legacy MALV_LOCAL_INFERENCE_BASE_URL).";
    return head ? `${head} — ${hint}` : `HTTP 404 on ${requestUrl} — ${hint}`;
  }

  return head || `Beast worker HTTP ${status}`;
}
