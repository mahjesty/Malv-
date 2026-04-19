/**
 * Bounded HTTP fetch for MALV web retrieval — timeouts, size caps, and URL policy.
 */

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 500_000;

function isPrivateOrReservedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0") return true;
  if (h.endsWith(".local")) return true;
  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; /* CGNAT */
    if (a === 255) return true;
  }
  return false;
}

export function isMalvOutboundFetchUrlAllowed(urlStr: string): boolean {
  const t = typeof urlStr === "string" ? urlStr.trim() : "";
  if (!t) return false;
  try {
    const u = new URL(t);
    if (!/^https:$/i.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    if (!host || host.length > 253) return false;
    if (isPrivateOrReservedHost(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export type MalvControlledFetchResult =
  | { ok: true; status: number; text: string; contentType: string }
  | { ok: false; error: string; status?: number };

/**
 * GET with AbortSignal support, response size truncation, and no redirect following beyond same-origin policy (fetch default follows redirects — limit by checking final URL in caller if needed).
 */
export async function malvControlledFetchText(args: {
  url: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
}): Promise<MalvControlledFetchResult> {
  const url = typeof args.url === "string" ? args.url.trim() : "";
  if (!isMalvOutboundFetchUrlAllowed(url)) {
    return { ok: false, error: "fetch_url_policy_blocked" };
  }
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = args.maxBytes ?? DEFAULT_MAX_BYTES;
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeoutMs);
  const signal = args.signal;
  const onAbort = () => ac.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(to);
      return { ok: false, error: "fetch_aborted" };
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "User-Agent": "MALV-WebRetrieval/1.0 (+https://malv.ai)",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        ...args.headers
      }
    });
    const ct = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
    const reader = res.body?.getReader();
    if (!reader) {
      const t = await res.text();
      return { ok: true, status: res.status, text: t.slice(0, maxBytes), contentType: ct };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          chunks.push(value.slice(0, Math.max(0, value.byteLength - (total - maxBytes))));
          break;
        }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const text = buf.toString("utf8");
    return { ok: true, status: res.status, text, contentType: ct };
  } catch (e) {
    const err = e as Error & { name?: string };
    if (err?.name === "AbortError") return { ok: false, error: "fetch_aborted_or_timeout" };
    return { ok: false, error: err?.message ? err.message.slice(0, 200) : "fetch_unknown_error" };
  } finally {
    clearTimeout(to);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}
