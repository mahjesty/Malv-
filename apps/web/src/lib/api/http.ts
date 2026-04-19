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

/** GET returning raw bytes (no JSON). Sends Bearer when provided; uses cookies either way. Retries once on 401 like apiFetch when a bearer was sent. */
export async function apiFetchBlob(args: {
  path: string;
  accessToken?: string;
  signal?: AbortSignal;
  skipAuthRefresh?: boolean;
}): Promise<Blob> {
  const doFetch = async (bearer: string | undefined) =>
    fetch(`${getApiBaseUrl()}${args.path}`, {
      method:      "GET",
      credentials: "include",
      headers:     bearer ? { authorization: `Bearer ${bearer}` } : {},
      signal:      args.signal
    });

  let res: Response;
  try {
    res = await doFetch(args.accessToken);
  } catch (e) {
    throw mapFetchFailure(e);
  }

  const hadBearer = Boolean(args.accessToken);
  if (res.status === 401 && !args.skipAuthRefresh && hadBearer) {
    const refreshed = await refreshSessionOnce({
      context:          "authenticated_request",
      hadActiveSession:   true
    });
    if (refreshed) {
      const next = getStoredSession();
      const nextBearer = next?.accessToken;
      if (nextBearer) {
        try {
          res = await doFetch(nextBearer);
        } catch (e) {
          throw mapFetchFailure(e);
        }
      }
    }
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const msg = parseNestErrorMessage(new Error(txt || `HTTP ${res.status}`));
    throw new Error(msg || `Request failed (${res.status})`);
  }

  return res.blob();
}

/** Like `apiFetchBlob` but returns HTTP status and does not throw on non-2xx (for precise client diagnostics). */
export async function apiFetchBlobWithStatus(args: {
  path: string;
  accessToken?: string;
  signal?: AbortSignal;
  skipAuthRefresh?: boolean;
}): Promise<
  | { ok: true; status: number; blob: Blob }
  | { ok: false; status: number; errorMessage: string; rawBody: string }
> {
  const doFetch = async (bearer: string | undefined) =>
    fetch(`${getApiBaseUrl()}${args.path}`, {
      method: "GET",
      credentials: "include",
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      signal: args.signal
    });

  let res: Response;
  try {
    res = await doFetch(args.accessToken);
  } catch (e) {
    const mapped = mapFetchFailure(e);
    return { ok: false, status: 0, errorMessage: mapped.message, rawBody: "" };
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
      if (nextBearer) {
        try {
          res = await doFetch(nextBearer);
        } catch (e) {
          const mapped = mapFetchFailure(e);
          return { ok: false, status: 0, errorMessage: mapped.message, rawBody: "" };
        }
      }
    }
  }

  if (!res.ok) {
    const rawBody = await res.text().catch(() => "");
    const msg = parseNestErrorMessage(new Error(rawBody || `HTTP ${res.status}`));
    return {
      ok: false,
      status: res.status,
      errorMessage: msg || `Request failed (${res.status})`,
      rawBody: rawBody.slice(0, 2000)
    };
  }

  const blob = await res.blob();
  return { ok: true, status: res.status, blob };
}

/** Multipart upload — do not set Content-Type (browser sets boundary). */
export async function apiUpload<T>(args: {
  path: string;
  accessToken: string;
  formData: FormData;
  signal?: AbortSignal;
  skipAuthRefresh?: boolean;
}): Promise<T> {
  const doFetch = async (bearer: string | undefined) =>
    fetch(`${getApiBaseUrl()}${args.path}`, {
      method: "POST",
      credentials: "include",
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      body: args.formData,
      signal: args.signal
    });

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
      if (nextBearer) {
        try {
          res = await doFetch(nextBearer);
        } catch (e) {
          throw mapFetchFailure(e);
        }
      }
    } else if (import.meta.env.DEV) {
      console.warn("[MALV auth] apiUpload 401 — refresh failed or no session");
    }
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const msg = parseNestErrorMessage(new Error(txt || `HTTP ${res.status}`));
    throw new Error(msg || `Request failed (${res.status})`);
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new Error("Upload response was not valid JSON.");
  }
  return parsed as T;
}
