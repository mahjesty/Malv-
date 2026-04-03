import { getStoredSession } from "../auth/session";
import { refreshSessionOnce } from "../auth/refreshSession";
import { getApiBaseUrl, mapFetchFailure, parseNestErrorMessage } from "./http-core";

export { getApiBaseUrl } from "./http-core";

export async function apiFetch<T>(args: {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  accessToken?: string;
  body?: unknown;
  signal?: AbortSignal;
  /**
   * When false (default), a 401 on an authenticated request triggers one refresh + retry.
   * Set true for login/signup/refresh callers that must not recurse.
   */
  skipAuthRefresh?: boolean;
}): Promise<T> {
  const doFetch = async (bearer: string | undefined) => {
    return fetch(`${getApiBaseUrl()}${args.path}`, {
      method: args.method ?? "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {})
      },
      body: args.body ? JSON.stringify(args.body) : undefined,
      signal: args.signal
    });
  };

  let res: Response;
  try {
    res = await doFetch(args.accessToken);
  } catch (e) {
    throw mapFetchFailure(e);
  }

  const hadBearer = Boolean(args.accessToken);
  if (res.status === 401 && !args.skipAuthRefresh && hadBearer) {
    const refreshed = await refreshSessionOnce({
      context: "authenticated_request",
      hadActiveSession: true
    });
    if (refreshed) {
      const next = getStoredSession();
      const nextBearer = next?.accessToken;
      if (!nextBearer) {
        if (import.meta.env.DEV) {
          console.warn("[MALV auth] apiFetch 401 — refresh ok but no access token in storage");
        }
      } else {
        try {
          res = await doFetch(nextBearer);
        } catch (e) {
          throw mapFetchFailure(e);
        }
      }
    } else {
      if (import.meta.env.DEV) {
        console.warn("[MALV auth] apiFetch 401 — refresh failed or no session");
      }
    }
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const msg = parseNestErrorMessage(new Error(txt || `HTTP ${res.status}`));
    throw new Error(msg || `Request failed (${res.status})`);
  }

  return (await res.json()) as T;
}

/** Multipart upload — do not set Content-Type (browser sets boundary). */
export async function apiUpload<T>(args: {
  path: string;
  accessToken: string;
  formData: FormData;
  signal?: AbortSignal;
}): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${args.path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      authorization: `Bearer ${args.accessToken}`
    },
    body: args.formData,
    signal: args.signal
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const msg = parseNestErrorMessage(new Error(txt || `HTTP ${res.status}`));
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}
