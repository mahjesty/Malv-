export function getApiBaseUrl() {
  const env = import.meta.env.VITE_API_BASE_URL;
  return env && typeof env === "string" ? env : "http://localhost:8080";
}

export const OFFLINE_MESSAGE = "Cannot reach server. Make sure the MALV API is running.";

export function mapFetchFailure(e: unknown): Error {
  if (e instanceof TypeError) {
    return new Error(OFFLINE_MESSAGE);
  }
  return e instanceof Error ? e : new Error(String(e));
}

/** Best-effort parse of NestJS JSON error bodies thrown as `Error(message)`. */
export function parseNestErrorMessage(err: Error): string {
  const raw = err.message?.trim() ?? "";
  if (!raw.startsWith("{") && !raw.startsWith("[")) return raw;
  try {
    const j = JSON.parse(raw) as { message?: unknown; error?: unknown; statusCode?: number };
    if (typeof j.error === "string" && j.error.trim()) return j.error.trim();
    const m = j.message;
    if (Array.isArray(m)) return m.map(String).join(", ");
    if (typeof m === "string" && m.trim()) return m.trim();
  } catch {
    /* keep raw */
  }
  return raw.length > 280 ? `${raw.slice(0, 280)}…` : raw;
}
