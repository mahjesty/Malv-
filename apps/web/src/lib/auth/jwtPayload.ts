/** Decode JWT payload (no verification — server validates). */
export function parseAccessTokenPayload(token: string): { sub?: string; role?: string } | null {
  try {
    const p = token.split(".")[1];
    if (!p) return null;
    return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string; role?: string };
  } catch {
    return null;
  }
}
