import { malvPruneExternalOpenQuickActions } from "../device/malv-external-open";

export type MalvRichImageItem = { url: string; alt?: string; source?: string };
export type MalvRichSourceItem = { title: string; url: string };

export type MalvRichActionId =
  | "open_primary_source"
  | "open_externally"
  | "summarize_sources"
  | "compare_sources"
  | "save_turn"
  | "send_to_task";

export type MalvRichActionItem = { id: MalvRichActionId; label: string; url?: string };

export type MalvRichMediaImageCard = { kind: "image"; url: string; alt?: string; source?: string };
export type MalvRichMediaChartCard = {
  kind: "chart";
  title: string;
  subtitle?: string;
  series: Array<{ t: string; v: number }>;
  source?: string;
};
export type MalvRichMediaSourceCard = { kind: "source_preview"; title: string; url: string; hint?: string };
export type MalvRichMediaCard = MalvRichMediaImageCard | MalvRichMediaChartCard | MalvRichMediaSourceCard;

const ACTION_IDS = new Set<MalvRichActionId>([
  "open_primary_source",
  "open_externally",
  "summarize_sources",
  "compare_sources",
  "save_turn",
  "send_to_task"
]);

export type ParsedMalvRichResponse = {
  images: MalvRichImageItem[];
  sources: MalvRichSourceItem[];
  media: MalvRichMediaCard[];
  actions: MalvRichActionItem[];
  /** Server hint — default true when omitted (legacy payloads). */
  showSourcesInChrome: boolean;
  /** Execution summary (e.g. finance lead-in) when deferred from inline reply for WS parity. */
  executionLeadIn?: string;
};

export type RichSurfaceStripTargets = { sourceUrls: string[]; imageUrls: string[] };

function humanLabelFromUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./i, "");
    const base = host.split(".")[0] ?? host;
    if (!base) return "Open article";
    const frag = base.replace(/[-_]/g, " ").trim();
    if (!frag) return "Open article";
    return frag.length <= 1 ? host : frag.slice(0, 1).toUpperCase() + frag.slice(1);
  } catch {
    return "Open article";
  }
}

/** Short label for source pill (domain-first when titles are noisy). */
export function malvFormatSourcePillLabel(s: MalvRichSourceItem): string {
  const t = s.title.trim();
  if (!t) return humanLabelFromUrl(s.url);
  if (/^https?:\/\//i.test(t)) return humanLabelFromUrl(s.url);
  const m = t.match(/^(.{2,36}?)\s*[—–-]\s+/);
  if (m?.[1] && m[1].trim().length >= 2 && m[1].trim().length <= 28) {
    return m[1].trim();
  }
  if (t.length <= 34) return t;
  try {
    return humanLabelFromUrl(s.url);
  } catch {
    return `${t.slice(0, 30)}…`;
  }
}

function parseMediaFromUnknown(raw: unknown): MalvRichMediaCard[] {
  if (!Array.isArray(raw)) return [];
  const out: MalvRichMediaCard[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const kind = o.kind;
    if (kind === "image") {
      const url = typeof o.url === "string" ? o.url.trim() : "";
      if (!url) continue;
      out.push({
        kind: "image",
        url,
        alt: typeof o.alt === "string" ? o.alt : undefined,
        source: typeof o.source === "string" ? o.source : undefined
      });
      continue;
    }
    if (kind === "chart") {
      const title = typeof o.title === "string" ? o.title.trim() : "";
      const seriesRaw = o.series;
      const series: Array<{ t: string; v: number }> = Array.isArray(seriesRaw)
        ? (seriesRaw as unknown[]).flatMap((p) => {
            if (!p || typeof p !== "object") return [];
            const pt = p as Record<string, unknown>;
            const t = typeof pt.t === "string" ? pt.t : "";
            const v = typeof pt.v === "number" && Number.isFinite(pt.v) ? pt.v : NaN;
            if (!t || !Number.isFinite(v)) return [];
            return [{ t, v }];
          })
        : [];
      if (!title || !series.length) continue;
      out.push({
        kind: "chart",
        title,
        subtitle: typeof o.subtitle === "string" ? o.subtitle : undefined,
        series,
        source: typeof o.source === "string" ? o.source : undefined
      });
      continue;
    }
    if (kind === "source_preview") {
      const url = typeof o.url === "string" ? o.url.trim() : "";
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!url || !title) continue;
      out.push({
        kind: "source_preview",
        title,
        url,
        hint: typeof o.hint === "string" ? o.hint : undefined
      });
    }
  }
  return out;
}

function parseActionsFromUnknown(raw: unknown): MalvRichActionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MalvRichActionItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = o.id;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (typeof id !== "string" || !label || !ACTION_IDS.has(id as MalvRichActionId)) continue;
    out.push({
      id: id as MalvRichActionId,
      label,
      url: typeof o.url === "string" ? o.url.trim() : undefined
    });
  }
  return out;
}

function dedupeStrings(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function parseMalvRichResponse(meta: Record<string, unknown> | undefined): ParsedMalvRichResponse | null {
  const raw = meta?.malvRichResponse;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const images: MalvRichImageItem[] = Array.isArray(o.images)
    ? (o.images as unknown[]).flatMap((x) => {
        if (!x || typeof x !== "object") return [];
        const im = x as Record<string, unknown>;
        const url = typeof im.url === "string" ? im.url.trim() : "";
        if (!url) return [];
        return [
          {
            url,
            alt: typeof im.alt === "string" ? im.alt : undefined,
            source: typeof im.source === "string" ? im.source : undefined
          }
        ];
      })
    : [];
  const sources: MalvRichSourceItem[] = Array.isArray(o.sources)
    ? (o.sources as unknown[]).flatMap((x) => {
        if (!x || typeof x !== "object") return [];
        const s = x as Record<string, unknown>;
        const url = typeof s.url === "string" ? s.url.trim() : "";
        const title = typeof s.title === "string" ? s.title.trim() : "";
        if (!url || !title) return [];
        return [{ title, url }];
      })
    : [];
  let media = parseMediaFromUnknown(o.media);
  if (!media.length && images.length) {
    media = images.map((im) => ({ kind: "image" as const, url: im.url, alt: im.alt, source: im.source }));
  }
  const actions = parseActionsFromUnknown(o.actions);
  const showFlag = o.showSourcesInChrome;
  const showSourcesInChrome = typeof showFlag === "boolean" ? showFlag : true;
  const executionLeadInRaw = typeof o.executionLeadIn === "string" ? o.executionLeadIn.trim() : "";
  const executionLeadIn = executionLeadInRaw.length > 0 ? executionLeadInRaw : undefined;
  if (images.length === 0 && sources.length === 0 && media.length === 0 && actions.length === 0 && !executionLeadIn)
    return null;
  return {
    images,
    sources,
    media,
    actions: limitMalvRichQuickActions(actions),
    showSourcesInChrome,
    executionLeadIn
  };
}

export function shouldRenderMalvSourcePills(parsed: ParsedMalvRichResponse): boolean {
  return parsed.sources.length > 0 && parsed.showSourcesInChrome;
}

const QUICK_ACTION_PRIORITY: MalvRichActionId[] = [
  "send_to_task",
  "compare_sources",
  "open_primary_source",
  "summarize_sources",
  "save_turn",
  "open_externally"
];

/** Graceful cap for legacy payloads — prefers task/compare over copy-first chips. */
export function limitMalvRichQuickActions(actions: MalvRichActionItem[], max = 2): MalvRichActionItem[] {
  const rank = (id: MalvRichActionId) => {
    const i = QUICK_ACTION_PRIORITY.indexOf(id);
    return i === -1 ? 99 : i;
  };
  const sorted = [...actions].sort((a, b) => rank(a.id) - rank(b.id));
  return sorted.slice(0, max);
}

export function malvRichResponseHasSurface(parsed: ParsedMalvRichResponse): boolean {
  const hasQuickActionSurface = limitMalvRichQuickActions(malvPruneExternalOpenQuickActions(parsed.actions)).length > 0;
  const hasExecutionLeadIn = Boolean(parsed.executionLeadIn?.trim());
  return shouldRenderMalvSourcePills(parsed) || parsed.media.length > 0 || hasQuickActionSurface || hasExecutionLeadIn;
}

export function deriveRichSurfaceStripTargets(meta: Record<string, unknown> | undefined): RichSurfaceStripTargets | null {
  if (!meta || meta.malvStructuredRichSurface !== true) return null;
  const parsed = parseMalvRichResponse(meta);
  if (!parsed) return null;
  const sourceUrls: string[] = [];
  const imageUrls: string[] = [];
  for (const s of parsed.sources) sourceUrls.push(s.url);
  for (const im of parsed.images) imageUrls.push(im.url);
  for (const m of parsed.media) {
    if (m.kind === "image") imageUrls.push(m.url);
    if (m.kind === "source_preview") sourceUrls.push(m.url);
  }
  return { sourceUrls: dedupeStrings(sourceUrls), imageUrls: dedupeStrings(imageUrls) };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes URLs and markdown link/image syntax that duplicate structured chrome,
 * so the answer body stays clean when `malvStructuredRichSurface` is on.
 */
export function stripAssistantBodyForStructuredSurface(text: string, targets: RichSurfaceStripTargets): string {
  const urls = dedupeStrings([...targets.sourceUrls, ...targets.imageUrls]);
  if (!urls.length) return text;

  const processChunk = (chunk: string): string => {
    let out = chunk;
    for (const url of urls) {
      const esc = escapeRegExp(url);
      out = out.replace(new RegExp(`!\\[[^\\]\\n]*\\]\\(${esc}\\)`, "gi"), "");
      out = out.replace(new RegExp(`\\[[^\\]\\n]{1,240}\\]\\(${esc}\\)`, "gi"), "");
      out = out.replace(new RegExp(`\\b${esc}\\b`, "gi"), "");
    }
    return out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trimEnd();
  };

  const parts = text.split("```");
  return parts.map((part, i) => (i % 2 === 1 ? part : processChunk(part))).join("```").trim();
}

export function malvFaviconUrlForHttpUrl(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname;
    if (!host) return null;
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
  } catch {
    return null;
  }
}

export function malvHostBadgeForUrl(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}
