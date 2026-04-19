import type { MalvUniversalResponseMode } from "./malv-universal-capability-router.util";
import type { MalvFinanceExecutionData, MalvRichImageItem, MalvRichSourceItem } from "./malv-rich-response.types";

export type MalvRichSurfaceCurationInput = {
  mode: MalvUniversalResponseMode;
  sources: MalvRichSourceItem[];
  images: MalvRichImageItem[];
  /** Execution `data` — used only to detect finance chart presence for media strictness. */
  data: unknown;
  /** From {@link resolveMalvRichSurfaceDisplayPolicy}; bounds curated lists. */
  maxStructuredSources: number;
  maxImageRail: number;
  /** Original user message — lightweight keyword overlap for image relevance (no extra I/O). */
  userText?: string;
};

export type MalvRichSurfaceCurationResult = {
  sources: MalvRichSourceItem[];
  images: MalvRichImageItem[];
};

function asFinanceSnapshot(x: unknown): MalvFinanceExecutionData | null {
  return x && typeof x === "object" && (x as MalvFinanceExecutionData).kind === "malv_finance_snapshot"
    ? (x as MalvFinanceExecutionData)
    : null;
}

export function malvFinanceChartPresentInRichData(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as { finance?: unknown };
  const fin = asFinanceSnapshot(d.finance) ?? asFinanceSnapshot(data);
  return Boolean(fin?.chartSeries?.length);
}

function hostKeyFromUrl(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizedTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
}

/** Deterministic trust / evidence weight for ranking (higher = prefer in chrome). */
function malvSourceEvidenceScore(source: MalvRichSourceItem): number {
  const host = hostKeyFromUrl(source.url);
  let score = 35;
  if (host.endsWith(".gov") || host.endsWith(".mil")) score = 100;
  else if (
    host === "reuters.com" ||
    host.endsWith(".reuters.com") ||
    host === "apnews.com" ||
    host.endsWith(".apnews.com") ||
    host === "ft.com" ||
    host.endsWith(".ft.com") ||
    host === "wsj.com" ||
    host.endsWith(".wsj.com") ||
    host === "nytimes.com" ||
    host.endsWith(".nytimes.com") ||
    host === "bbc.com" ||
    host === "bbc.co.uk" ||
    host.endsWith(".bbc.com") ||
    host.endsWith(".bbc.co.uk") ||
    host === "nature.com" ||
    host.endsWith(".nature.com") ||
    host === "science.org" ||
    host.endsWith(".science.org")
  )
    score = 88;
  else if (host === "wikipedia.org" || host.endsWith(".wikipedia.org") || host === "britannica.com") score = 72;
  else if (host === "theguardian.com" || host.endsWith(".theguardian.com") || host === "bloomberg.com" || host.endsWith(".bloomberg.com"))
    score = 80;
  else if (host === "coindesk.com" || host.endsWith(".coindesk.com") || host === "sec.gov" || host.endsWith(".sec.gov")) score = 78;
  else if (host.endsWith(".edu") || host.endsWith(".ac.uk")) score = 85;
  else if (/pinterest\.|facebook\.|tiktok\.|instagram\./i.test(host)) score = 18;

  const title = typeof source.title === "string" ? source.title.trim() : "";
  if (title.length >= 24) score += 4;
  if (/\b(mock|lorem|placeholder|todo)\b/i.test(`${title} ${host}`)) score -= 25;
  return score;
}

type ScoredSource = MalvRichSourceItem & { _score: number };

function pickBestSourcePerDomain(sources: ScoredSource[]): MalvRichSourceItem[] {
  const byHost = new Map<string, ScoredSource>();
  for (const s of sources) {
    const hk = hostKeyFromUrl(s.url) || s.url;
    const prev = byHost.get(hk);
    if (!prev || s._score > prev._score || (s._score === prev._score && s.url < prev.url)) byHost.set(hk, s);
  }
  return [...byHost.values()].map(({ _score: _x, ...rest }) => rest);
}

function dedupeNearIdenticalTitles(sources: MalvRichSourceItem[]): MalvRichSourceItem[] {
  const scored = scoreAndSortSources(sources);
  const byTitle = new Map<string, ScoredSource>();
  for (const s of scored) {
    const tk = normalizedTitleKey(s.title);
    if (!tk) continue;
    const prev = byTitle.get(tk);
    if (!prev || s._score > prev._score || (s._score === prev._score && s.url < prev.url)) byTitle.set(tk, s);
  }
  return [...byTitle.values()].map(({ _score: _x, ...rest }) => rest);
}

function scoreAndSortSources(sources: MalvRichSourceItem[]): ScoredSource[] {
  const rows: ScoredSource[] = sources.map((s) => ({
    ...s,
    title: typeof s.title === "string" ? s.title.trim() : "",
    url: typeof s.url === "string" ? s.url.trim() : "",
    _score: malvSourceEvidenceScore(s)
  }));
  return rows.sort((a, b) => b._score - a._score || a.url.localeCompare(b.url));
}

/** When at least one strong outlet is present, drop tail-tier domains so chrome stays evidence-first. */
function pruneWeakSourcesWhenStrongEvidenceExists(sources: ScoredSource[]): ScoredSource[] {
  if (sources.length === 0) return sources;
  const maxScore = Math.max(...sources.map((s) => s._score));
  if (maxScore < 72) return sources;
  const pruned = sources.filter((s) => s._score >= 38);
  return pruned.length > 0 ? pruned : sources;
}

function curateSourcesForMode(mode: MalvUniversalResponseMode, sources: MalvRichSourceItem[], maxStructuredSources: number): MalvRichSourceItem[] {
  if (maxStructuredSources <= 0 || sources.length === 0) return [];

  let scored = scoreAndSortSources(sources);
  if (mode === "web_research" || mode === "finance_data" || mode === "mixed_text_plus_sources") {
    scored = scoreAndSortSources(pickBestSourcePerDomain(scored));
    scored = scoreAndSortSources(dedupeNearIdenticalTitles(scored));
    if (mode === "web_research" || mode === "mixed_text_plus_sources") {
      scored = scoreAndSortSources(pruneWeakSourcesWhenStrongEvidenceExists(scored));
    }
  } else if (mode === "mixed_text_plus_visual") {
    scored = scoreAndSortSources(pickBestSourcePerDomain(scored));
  }

  const out: MalvRichSourceItem[] = [];
  for (const s of scored) {
    if (out.length >= maxStructuredSources) break;
    if (!s.title || !s.url) continue;
    out.push({ title: s.title, url: s.url });
  }
  return out;
}

function imageLooksLikeWeakStock(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("picsum.photos") ||
    u.includes("lorempixel.com") ||
    u.includes("via.placeholder") ||
    u.includes("placeholder.com") ||
    u.includes("placehold.it") ||
    u.includes("dummyimage.com")
  );
}

function malvImageEvidenceScore(im: MalvRichImageItem): number {
  const url = typeof im.url === "string" ? im.url.trim() : "";
  const alt = typeof im.alt === "string" ? im.alt.trim() : "";
  const src = typeof im.source === "string" ? im.source.trim() : "";
  let score = 40;
  if (alt.length >= 16) score += 28;
  else if (alt.length >= 6) score += 16;
  else if (alt.length >= 3) score += 8;
  else score -= 12;
  if (src.length >= 4) score += 10;
  if (imageLooksLikeWeakStock(url)) score -= 30;
  if (/\b(icon|favicon|logo)\b/i.test(`${alt} ${src}`)) score -= 18;
  return score;
}

const RELEVANCE_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "what",
  "when",
  "your",
  "you",
  "are",
  "was",
  "has",
  "have",
  "will",
  "into",
  "over",
  "been",
  "some",
  "any",
  "about",
  "using",
  "like",
  "also",
  "just",
  "get",
  "out",
  "all",
  "new",
  "via",
  "see",
  "how",
  "can",
  "does",
  "did",
  "its",
  "our",
  "not",
  "but",
  "may",
  "now",
  "more",
  "most",
  "very",
  "such",
  "than",
  "then",
  "them",
  "they",
  "their",
  "there",
  "these",
  "those",
  "update",
  "latest",
  "news",
  "today",
  "please",
  "tell",
  "give",
  "show",
  "want",
  "need",
  "help",
  "find",
  "look",
  "make",
  "take",
  "come",
  "use",
  "used",
  "many",
  "much",
  "each",
  "other",
  "only",
  "same",
  "well",
  "even",
  "still",
  "being",
  "both",
  "while",
  "where",
  "which",
  "who",
  "why",
  "would",
  "could",
  "should"
]);

function extractResearchQueryFromData(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as { research?: unknown; kind?: unknown; query?: unknown };
  const read = (o: unknown): string => {
    if (!o || typeof o !== "object") return "";
    const x = o as { kind?: unknown; query?: unknown };
    if (x.kind === "malv_web_research_bundle" && typeof x.query === "string") return x.query.trim();
    return "";
  };
  return read(d.research) || read(data);
}

function collectRelevanceTokens(userText: string, sources: MalvRichSourceItem[], data: unknown): string[] {
  const parts: string[] = [];
  const ut = (userText ?? "").trim();
  if (ut) parts.push(ut);
  for (const s of sources) {
    if (typeof s.title === "string" && s.title.trim()) parts.push(s.title);
    if (typeof s.snippet === "string" && s.snippet.trim()) parts.push(s.snippet.slice(0, 400));
  }
  const rq = extractResearchQueryFromData(data);
  if (rq) parts.push(rq);
  const blob = parts.join(" ").toLowerCase();
  const raw = blob
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !RELEVANCE_STOPWORDS.has(w));
  return [...new Set(raw)];
}

function urlPathHaystack(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.hostname} ${u.pathname}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  } catch {
    return url.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  }
}

function imageRelevanceOverlapScore(tokens: string[], im: MalvRichImageItem): number {
  if (tokens.length === 0) return 0;
  const alt = typeof im.alt === "string" ? im.alt.toLowerCase() : "";
  const src = typeof im.source === "string" ? im.source.toLowerCase() : "";
  const url = typeof im.url === "string" ? im.url.trim() : "";
  const bag = `${alt} ${src} ${urlPathHaystack(url)}`;
  let hits = 0;
  for (const t of tokens) {
    if (t.length < 3) continue;
    if (bag.includes(t)) hits++;
  }
  return Math.min(34, hits * 9);
}

function genericImageLabelPenalty(im: MalvRichImageItem): number {
  const url = typeof im.url === "string" ? im.url.trim() : "";
  const alt = typeof im.alt === "string" ? im.alt.trim() : "";
  const src = typeof im.source === "string" ? im.source.trim() : "";
  const bag = `${url} ${alt} ${src}`.toLowerCase();
  let p = 0;
  if (/\bplaceholder\b/.test(bag)) p += 28;
  if (/\bwallpaper\b/.test(bag)) p += 24;
  if (/\bbackground\b/.test(bag)) p += 18;
  if (/\bstock\s+photo|\bstock\s+image|\broyalty[- ]free\b/.test(bag)) p += 30;
  if (/\bstocks?\s+imagery\b|\bstock\s+footage\b/.test(bag)) p += 22;
  if (/\b(?:free\s+)?stock\b/.test(bag) && /\b(image|photo|picture|imagery)\b/.test(bag)) p += 20;
  if (/\b(icon|favicon|logo)\b/.test(bag)) p += 14;
  return p;
}

function imageRelevanceStrictness(mode: MalvUniversalResponseMode): { minTotal: number; noOverlapPenalty: number; minTokensForPenalty: number } {
  if (mode === "web_research" || mode === "mixed_text_plus_sources") {
    return { minTotal: 50, noOverlapPenalty: 22, minTokensForPenalty: 2 };
  }
  if (mode === "mixed_text_plus_visual") {
    return { minTotal: 44, noOverlapPenalty: 12, minTokensForPenalty: 3 };
  }
  return { minTotal: 38, noOverlapPenalty: 0, minTokensForPenalty: 99 };
}

function totalImageCurationScore(
  im: MalvRichImageItem,
  mode: MalvUniversalResponseMode,
  tokens: string[]
): number {
  const strict = imageRelevanceStrictness(mode);
  const base = malvImageEvidenceScore(im);
  const overlap = imageRelevanceOverlapScore(tokens, im);
  const genPen = genericImageLabelPenalty(im);
  let score = base + overlap - genPen;
  if (strict.noOverlapPenalty > 0 && tokens.length >= strict.minTokensForPenalty && overlap === 0) {
    score -= strict.noOverlapPenalty;
  }
  return score;
}

function effectiveImageBudget(args: {
  mode: MalvUniversalResponseMode;
  maxImageRail: number;
  chartPresent: boolean;
}): number {
  const { mode, maxImageRail, chartPresent } = args;
  if (maxImageRail <= 0) return 0;
  if (!chartPresent) return maxImageRail;

  if (mode === "finance_data") return 0;
  if (mode === "mixed_text_plus_sources" || mode === "web_research") return 0;
  if (mode === "mixed_text_plus_visual") return Math.min(maxImageRail, 1);
  if (mode === "image_enrichment") return maxImageRail;
  return maxImageRail;
}

function curateImagesForMode(
  mode: MalvUniversalResponseMode,
  images: MalvRichImageItem[],
  maxImageRail: number,
  chartPresent: boolean,
  relevanceCtx: { userText: string; sources: MalvRichSourceItem[]; data: unknown }
): MalvRichImageItem[] {
  const budget = effectiveImageBudget({ mode, maxImageRail, chartPresent });
  if (budget <= 0 || images.length === 0) return [];

  const tokens = collectRelevanceTokens(relevanceCtx.userText, relevanceCtx.sources, relevanceCtx.data);
  const strict = imageRelevanceStrictness(mode);

  const scored = [...images]
    .map((im) => ({
      im,
      score: totalImageCurationScore(im, mode, tokens)
    }))
    .sort((a, b) => b.score - a.score || a.im.url.localeCompare(b.im.url));

  const maxAmong = scored.length ? Math.max(...scored.map((r) => r.score)) : 0;
  if (maxAmong < strict.minTotal) {
    return [];
  }

  const out: MalvRichImageItem[] = [];
  for (const { im, score } of scored) {
    if (out.length >= budget) break;
    const url = typeof im.url === "string" ? im.url.trim() : "";
    if (!url) continue;
    if (score < strict.minTotal) continue;
    out.push({
      url,
      alt: typeof im.alt === "string" ? im.alt : undefined,
      source: typeof im.source === "string" ? im.source : undefined
    });
  }
  return out;
}

/**
 * Deterministic, route-aware trimming/ranking for structured rich chrome **after** merge + renderability filters.
 * Does not replace sanitization or validation — run before media/actions composition.
 */
export function curateMalvRichSurfaceStructuredContent(input: MalvRichSurfaceCurationInput): MalvRichSurfaceCurationResult {
  const maxSrc = Math.max(0, Number(input.maxStructuredSources) || 0);
  const maxImg = Math.max(0, Number(input.maxImageRail) || 0);
  const chartPresent = malvFinanceChartPresentInRichData(input.data);

  const sources = curateSourcesForMode(input.mode, input.sources, maxSrc);
  const images = curateImagesForMode(input.mode, input.images, maxImg, chartPresent, {
    userText: typeof input.userText === "string" ? input.userText : "",
    sources: input.sources,
    data: input.data
  });

  return { sources, images };
}
