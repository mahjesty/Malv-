const KEY = "malv_explore_continue_v1";
const MAX = 14;
const TTL_MS = 1000 * 60 * 60 * 24 * 21;

export type ExploreContinueRecord = {
  href: string;
  title: string;
  subtitle: string;
  at: number;
};

function readRaw(): ExploreContinueRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const o = JSON.parse(raw) as unknown;
    if (!Array.isArray(o)) return [];
    const now = Date.now();
    const out: ExploreContinueRecord[] = [];
    for (const row of o) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const href = typeof r.href === "string" ? r.href.trim() : "";
      const title = typeof r.title === "string" ? r.title.trim() : "";
      const subtitle = typeof r.subtitle === "string" ? r.subtitle.trim() : "";
      const at = typeof r.at === "number" ? r.at : 0;
      if (!href.startsWith("/app/explore") || !title) continue;
      if (now - at > TTL_MS) continue;
      out.push({ href, title, subtitle, at });
    }
    return out;
  } catch {
    return [];
  }
}

function writeRaw(items: ExploreContinueRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    /* quota / private mode */
  }
}

export function pushExploreContinue(rec: Omit<ExploreContinueRecord, "at">) {
  const href = rec.href.trim();
  const title = rec.title.trim();
  if (!href.startsWith("/app/explore") || !title) return;
  const next: ExploreContinueRecord = {
    href,
    title,
    subtitle: rec.subtitle.trim(),
    at: Date.now()
  };
  const prev = readRaw().filter((x) => x.href !== href);
  writeRaw([next, ...prev].slice(0, MAX));
}

export function readExploreContinue(): ExploreContinueRecord[] {
  return readRaw().sort((a, b) => b.at - a.at);
}
