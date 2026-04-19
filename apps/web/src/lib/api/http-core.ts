const MALV_DEFAULT_API_BASE_URL = "http://localhost:8080";
let warnedInvalidApiBase = false;

function isAbsoluteHttpUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw);
}

export function getApiBaseUrl() {
  const env = import.meta.env.VITE_API_BASE_URL;
  const raw = env && typeof env === "string" ? env.trim() : "";
  if (raw.length === 0) return MALV_DEFAULT_API_BASE_URL;
  if (isAbsoluteHttpUrl(raw)) return raw.replace(/\/+$/, "");

  // This app uses an explicit MALV API origin. Relative values ("/", "/v1") hit Vite origin.
  if (!warnedInvalidApiBase && import.meta.env.DEV) {
    warnedInvalidApiBase = true;
    console.warn(
      `[MALV web] Ignoring invalid VITE_API_BASE_URL="${raw}". Use an absolute URL like ${MALV_DEFAULT_API_BASE_URL}.`
    );
  }
  return MALV_DEFAULT_API_BASE_URL;
}

/**
 * User-facing copy when the browser cannot complete the request (API down, wrong host, CORS, etc.).
 * Includes the resolved base URL so local dev mistakes are obvious.
 */
export function formatUnreachableApiMessage(): string {
  const base = getApiBaseUrl();
  return `Can't reach MALV at ${base}. From the repo root run npm run dev:api, or npm run dev to start web and API together. If the API uses another host or port, set VITE_API_BASE_URL.`;
}

function isAbortError(e: unknown): boolean {
  if (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") {
    return true;
  }
  return e instanceof Error && e.name === "AbortError";
}

export function mapFetchFailure(e: unknown): Error {
  if (isAbortError(e)) {
    return e instanceof Error ? e : new Error(String(e));
  }
  if (e instanceof TypeError) {
    return new Error(formatUnreachableApiMessage());
  }
  return e instanceof Error ? e : new Error(String(e));
}

/** Best-effort parse of NestJS JSON error bodies thrown as `Error(message)`. */
export function isExploreImagePayloadTooLargeMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("request entity too large") ||
    m.includes("entity too large") ||
    m.includes("payload too large") ||
    m.includes("body exceeded") ||
    m.includes("request body is too large") ||
    /\b413\b/.test(message)
  );
}

/** Shown near the upload flow instead of raw HTTP / Nest text. */
export const EXPLORE_IMAGE_PAYLOAD_TOO_LARGE_HINT =
  "That photo couldn’t be sent in one request. MALV usually fixes this by resizing and staging your upload—try again once, or pick a slightly smaller export.";

export function parseNestErrorMessage(err: Error): string {
  const raw = err.message?.trim() ?? "";
  if (!raw.startsWith("{") && !raw.startsWith("[")) return raw;
  try {
    const j = JSON.parse(raw) as { message?: unknown; error?: unknown; statusCode?: number };
    const m = j.message;
    if (Array.isArray(m) && m.length) {
      const joined = m.map(String).join(", ").trim();
      if (joined) return joined;
    }
    if (typeof m === "string" && m.trim()) return m.trim();
    if (typeof j.error === "string" && j.error.trim()) return j.error.trim();
  } catch {
    /* keep raw */
  }
  return raw.length > 280 ? `${raw.slice(0, 280)}…` : raw;
}
