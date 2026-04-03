import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchAuthMe } from "../api/dataPlane";
import { getApiBaseUrl } from "../api/http-core";
import { refreshSessionOnceDetailed } from "./refreshSession";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./AuthContext";
import { clearStoredSession, getStoredSession, isAccessTokenExpired, SESSION_CHANGE_EVENT } from "./session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  const bootstrap = useCallback(async () => {
    const s = getStoredSession();
    if (!s?.accessToken) {
      const refreshed = await refreshSessionOnceDetailed({
        context: "bootstrap",
        hadActiveSession: false
      });
      const after = getStoredSession();
      if (!refreshed.ok || !after?.accessToken) {
        if (!refreshed.ok && refreshed.reason === "backend_unavailable" && import.meta.env.DEV) {
          console.error("[MALV auth] bootstrap refresh unavailable; continuing unauthenticated");
        }
        setAccessToken(null);
        setUserId(null);
        setEmail(null);
        setDisplayName(null);
        setRole(null);
        setPermissions([]);
        setStatus("unauthenticated");
        return;
      }
    }
    const current = getStoredSession();
    const token = current?.accessToken ?? null;
    if (!token) {
      setAccessToken(null);
      setUserId(null);
      setEmail(null);
      setDisplayName(null);
      setRole(null);
      setPermissions([]);
      setStatus("unauthenticated");
      return;
    }
    let activeToken = token;
    if (isAccessTokenExpired(activeToken, 60)) {
      const refreshed = await refreshSessionOnceDetailed({
        context: "bootstrap",
        hadActiveSession: true
      });
      const next = getStoredSession();
      if (!refreshed.ok || !next?.accessToken) {
        setAccessToken(null);
        setUserId(null);
        setEmail(null);
        setDisplayName(null);
        setRole(null);
        setPermissions([]);
        setStatus("unauthenticated");
        return;
      }
      activeToken = next.accessToken;
    }
    try {
      const me = await fetchAuthMe(activeToken);
      setAccessToken(activeToken);
      setUserId(me.userId ?? null);
      setEmail(typeof me.email === "string" ? me.email : null);
      setDisplayName(typeof me.displayName === "string" ? me.displayName : null);
      setRole(me.role ?? null);
      setPermissions(Array.isArray(me.permissions) ? me.permissions : []);
      setStatus("authenticated");
    } catch {
      setAccessToken(null);
      setUserId(null);
      setEmail(null);
      setDisplayName(null);
      setRole(null);
      setPermissions([]);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const onSession = () => {
      const s = getStoredSession();
      setAccessToken(s?.accessToken ?? null);
      if (!s?.accessToken) {
        setUserId(null);
        setEmail(null);
        setDisplayName(null);
        setRole(null);
        setPermissions([]);
        setStatus("unauthenticated");
      } else {
        void bootstrap();
      }
    };
    window.addEventListener(SESSION_CHANGE_EVENT, onSession);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, onSession);
  }, [bootstrap]);

  const logout = useCallback((reason?: string) => {
    if (import.meta.env.DEV) {
      console.info(`[MALV auth] logout${reason ? ` - ${reason}` : ""}`);
    }
    void fetch(`${getApiBaseUrl()}/v1/auth/logout`, {
      method: "POST",
      credentials: "include"
    }).catch(() => void 0);
    clearStoredSession();
    setAccessToken(null);
    setUserId(null);
    setEmail(null);
    setDisplayName(null);
    setRole(null);
    setPermissions([]);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, accessToken, userId, email, displayName, role, permissions, logout }),
    [status, accessToken, userId, email, displayName, role, permissions, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
