import { getApiBaseUrl } from "../api/http-core";
import { clearStoredSession, getStoredSession, isAccessTokenExpired, setStoredSession } from "./session";

type LoginResponse = {
  accessToken: string;
};

export type RefreshFailureReason =
  | "no_session"
  | "session_invalid"
  | "backend_unavailable"
  | "network_failure"
  | "unknown_error";

export type RefreshSessionResult =
  | { ok: true }
  | {
      ok: false;
      reason: RefreshFailureReason;
      status?: number;
      detail?: string;
    };

type RefreshSessionOptions = {
  context?: "bootstrap" | "authenticated_request" | "token_rotation";
  hadActiveSession?: boolean;
};

let refreshDetailedPromise: Promise<RefreshSessionResult> | null = null;

function logAuth(kind: string, detail?: string) {
  if (import.meta.env.DEV) {
    console.info(`[MALV auth] ${kind}${detail ? ` — ${detail}` : ""}`);
  }
}

function logRefreshFailure(result: Extract<RefreshSessionResult, { ok: false }>, options?: RefreshSessionOptions) {
  // Quiet expected bootstrap case: user is logged out and has no refresh cookie/session yet.
  if (options?.context === "bootstrap" && !options.hadActiveSession && result.reason === "no_session") {
    return;
  }

  const suffix = result.detail ? `${result.reason}: ${result.detail}` : result.reason;
  if (result.reason === "backend_unavailable" || result.reason === "network_failure") {
    console.error(`[MALV auth] refresh failed — ${suffix}`);
    return;
  }
  logAuth("refresh failed", suffix);
}

/**
 * Single-flight refresh: exchanges refresh token for new access + refresh tokens.
 * Clears local session on failure.
 */
export async function refreshSessionOnce(options?: RefreshSessionOptions): Promise<boolean> {
  const result = await refreshSessionOnceDetailed(options);
  return result.ok;
}

export async function refreshSessionOnceDetailed(options?: RefreshSessionOptions): Promise<RefreshSessionResult> {
  if (refreshDetailedPromise) return refreshDetailedPromise;

  refreshDetailedPromise = (async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/v1/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({})
      });
      if (!res.ok) {
        const text = (await res.text().catch(() => "")).slice(0, 160);
        const trimmed = text.trim();

        let reason: RefreshFailureReason = "unknown_error";
        if (res.status === 401 || res.status === 403) {
          reason = options?.hadActiveSession ? "session_invalid" : "no_session";
        } else if (res.status >= 500) {
          reason = "backend_unavailable";
        }

        const failure: Extract<RefreshSessionResult, { ok: false }> = {
          ok: false,
          reason,
          status: res.status,
          detail: `HTTP ${res.status}${trimmed ? ` ${trimmed}` : ""}`
        };
        logRefreshFailure(failure, options);
        clearStoredSession();
        return failure;
      }
      const data = (await res.json()) as LoginResponse;
      setStoredSession({ accessToken: data.accessToken });
      logAuth("refresh success");
      return { ok: true };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const failure: Extract<RefreshSessionResult, { ok: false }> = {
        ok: false,
        reason: "network_failure",
        detail
      };
      logRefreshFailure(failure, options);
      clearStoredSession();
      return failure;
    } finally {
      refreshDetailedPromise = null;
    }
  })();

  return refreshDetailedPromise;
}

/**
 * Returns a non-expired access token for API calls, preferring in-memory session over React state.
 * Refreshes once when the access token is missing exp or within the skew window of expiry
 * so the first request is not a guaranteed 401 + refresh race.
 */
export async function ensureAccessTokenForApi(contextToken: string | null): Promise<string | null> {
  const stored = getStoredSession();
  let token = stored?.accessToken ?? contextToken ?? null;
  if (!token) return null;
  if (isAccessTokenExpired(token, 60)) {
    const ok = await refreshSessionOnce({ context: "token_rotation", hadActiveSession: true });
    if (!ok) return null;
    token = getStoredSession()?.accessToken ?? null;
  }
  return token;
}
