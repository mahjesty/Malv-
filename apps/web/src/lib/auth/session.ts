export type StoredSession = {
  accessToken: string;
};

let inMemoryAccessToken: string | null = null;

/** Dispatched after set/clear so AuthContext and other listeners stay in sync. */
export const SESSION_CHANGE_EVENT = "malv:session-changed";

function dispatchSessionChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT));
  }
}

export function getStoredSession(): StoredSession | null {
  if (!inMemoryAccessToken) return null;
  return { accessToken: inMemoryAccessToken };
}

export function setStoredSession(s: StoredSession) {
  inMemoryAccessToken = s.accessToken;
  dispatchSessionChange();
}

export function clearStoredSession() {
  inMemoryAccessToken = null;
  dispatchSessionChange();
}

/** JWT `exp` in ms, or null if unparsable. */
export function getAccessTokenExpiryMs(token: string): number | null {
  try {
    const p = token.split(".")[1];
    if (!p) return null;
    const json = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True if token is missing exp or is within `skewSeconds` of expiry. */
export function isAccessTokenExpired(token: string, skewSeconds = 60): boolean {
  const exp = getAccessTokenExpiryMs(token);
  if (exp == null) return true;
  return Date.now() >= exp - skewSeconds * 1000;
}

