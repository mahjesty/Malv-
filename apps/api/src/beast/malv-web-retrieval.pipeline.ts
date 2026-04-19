import type { MalvUniversalCapabilityRoute, MalvUniversalResponseMode } from "./malv-universal-capability-router.util";
import { malvControlledFetchText } from "./malv-controlled-fetch.util";
import {
  filterMalvTrustedRichImages,
  filterMalvTrustedRichSources,
  isMalvUntrustedDemonstrationImageUrl
} from "./malv-web-source-trust.util";
import type {
  MalvFinanceExecutionData,
  MalvRichImageItem,
  MalvRichResponse,
  MalvRichSourceItem,
  MalvWebResearchExecutionData
} from "./malv-rich-response.types";
import { extractFinanceSymbolHint } from "./malv-finance-symbol-hint.util";

export type MalvWebRetrievalTelemetry = {
  malvWebRetrievalSelectedRoute: MalvUniversalResponseMode;
  malvWebRetrievalRan: boolean;
  malvWebRetrievalProvider: "brave" | "none";
  malvWebCandidateSources: number;
  malvWebFilteredSources: number;
  malvWebCandidateImages: number;
  malvWebFilteredImages: number;
  malvWebMediaSuppressedReason: string | null;
  malvWebFinanceProvenance: "coingecko" | "yahoo" | "none";
  malvWebFailureReason: string | null;
};

export type MalvWebCapabilityPipelineOutput = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  promptInjection: string;
  rich: MalvRichResponse | null;
  telemetry: MalvWebRetrievalTelemetry;
};

function envBool(key: string): boolean {
  const v = (process.env[key] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function braveApiKey(): string | null {
  const k = (process.env.MALV_BRAVE_SEARCH_API_KEY ?? "").trim();
  return k.length > 0 ? k : null;
}

/** When true, disables Brave search + HTML snippet fetch (airgap / tests). Live finance HTTP may still run. */
function webSearchAndFetchDisabled(): boolean {
  return envBool("MALV_WEB_RETRIEVAL_DISABLED");
}

function financeQuotesDisabled(): boolean {
  return envBool("MALV_FINANCE_QUOTES_DISABLED");
}

function fetchTimeoutMs(): number {
  const raw = (process.env.MALV_WEB_FETCH_TIMEOUT_MS ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 500 && n <= 60_000) return Math.floor(n);
  return 8_000;
}

function searchResultCap(): number {
  const raw = (process.env.MALV_WEB_SEARCH_COUNT ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 20) return Math.floor(n);
  return 8;
}

function buildPromptInjectionHeader(): string {
  return [
    "### MALV verified execution bundle (internal — use verbatim facts)",
    "The following JSON and bullets were produced by MALV capability execution for this turn. Prefer these numbers, URLs, and image pointers over speculation.",
    ""
  ].join("\n");
}

function formatFinancePrompt(data: MalvFinanceExecutionData, sources: MalvRichSourceItem[]): string {
  const seriesNote =
    data.chartSeries && data.chartSeries.length > 0
      ? `- Chart series (${data.range?.label ?? "recent"}): ${data.chartSeries.map((p) => `${p.t}=${p.v}`).join(", ")}`
      : "";
  const lines = [
    buildPromptInjectionHeader(),
    "```json",
    JSON.stringify({ finance: data, referenceSources: sources }, null, 2),
    "```",
    "",
    "**Snapshot (for synthesis)**",
    `- ${data.label} (${data.symbol}) last **${data.current}** ${data.currency} as of ${data.asOf}`,
    `- Change **${data.changeAbs >= 0 ? "+" : ""}${data.changeAbs}** (${data.changePct >= 0 ? "+" : ""}${data.changePct}%)`,
    data.range ? `- Range (${data.range.label}): **${data.range.low}** – **${data.range.high}** ${data.currency}` : "",
    seriesNote
  ].filter(Boolean);
  return lines.join("\n");
}

function formatResearchPrompt(data: MalvWebResearchExecutionData, sources: MalvRichSourceItem[]): string {
  return [
    buildPromptInjectionHeader(),
    "```json",
    JSON.stringify({ research: data, referenceSources: sources }, null, 2),
    "```",
    "",
    "**Grounded excerpts (from retrieval)**",
    ...data.keyFacts.map((f) => `- ${f}`),
    "",
    `**Synthesis anchor:** ${data.shortExplanation}`
  ].join("\n");
}

function formatImagePrompt(images: MalvRichImageItem[]): string {
  if (!images.length) return "";
  return [
    buildPromptInjectionHeader(),
    "**Image pointers (describe using these URLs only when they remain in structured chrome)**",
    ...images.map((im, i) => `- [${i + 1}] ${im.url}${im.alt ? ` — ${im.alt}` : ""}${im.source ? ` (${im.source})` : ""}`)
  ].join("\n");
}

type BraveWebResult = { title: string; url: string; description?: string };

async function braveWebSearch(query: string, signal: AbortSignal | undefined, apiKey: string): Promise<BraveWebResult[]> {
  const q = encodeURIComponent(query.slice(0, 400));
  const count = searchResultCap();
  const url = `https://api.search.brave.com/res/v1/web/search?q=${q}&count=${count}`;
  const res = await malvControlledFetchText({
    url,
    signal,
    timeoutMs: fetchTimeoutMs(),
    maxBytes: 400_000,
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey
    }
  });
  if (!res.ok) return [];
  try {
    const j = JSON.parse(res.text) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
    const rows = j.web?.results ?? [];
    const out: BraveWebResult[] = [];
    for (const r of rows) {
      const title = typeof r.title === "string" ? r.title.trim() : "";
      const u = typeof r.url === "string" ? r.url.trim() : "";
      const description = typeof r.description === "string" ? r.description.trim() : undefined;
      if (!title || !u) continue;
      out.push({ title, url: u, description });
    }
    return out;
  } catch {
    return [];
  }
}

type BraveImageResult = { url: string; title?: string; source?: string };

async function braveImageSearch(query: string, signal: AbortSignal | undefined, apiKey: string): Promise<BraveImageResult[]> {
  const q = encodeURIComponent(query.slice(0, 200));
  const url = `https://api.search.brave.com/res/v1/images/search?q=${q}&count=6`;
  const res = await malvControlledFetchText({
    url,
    signal,
    timeoutMs: fetchTimeoutMs(),
    maxBytes: 400_000,
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey
    }
  });
  if (!res.ok) return [];
  try {
    const j = JSON.parse(res.text) as {
      results?: Array<{ properties?: { url?: string }; title?: string; url?: string; source?: string }>;
    };
    const rows = j.results ?? [];
    const out: BraveImageResult[] = [];
    for (const r of rows) {
      const u = (typeof r.properties?.url === "string" ? r.properties.url : r.url)?.trim() ?? "";
      if (!u) continue;
      out.push({
        url: u,
        title: typeof r.title === "string" ? r.title : undefined,
        source: typeof r.source === "string" ? r.source : undefined
      });
    }
    return out;
  } catch {
    return [];
  }
}

function extractSnippetFromHtml(html: string): string {
  const t = html.slice(0, 800_000);
  const og = t.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return decodeHtmlEntities(og[1]).trim().slice(0, 480);
  const md = t.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (md?.[1]) return decodeHtmlEntities(md[1]).trim().slice(0, 480);
  const title = t.match(/<title[^>]*>([^<]{1,240})<\/title>/i);
  if (title?.[1]) return decodeHtmlEntities(title[1]).trim().slice(0, 240);
  return "";
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function enrichSourcesWithSnippets(
  sources: MalvRichSourceItem[],
  signal: AbortSignal | undefined,
  maxFetches: number
): Promise<MalvRichSourceItem[]> {
  if (webSearchAndFetchDisabled()) return sources;
  const limited = sources.slice(0, maxFetches);
  const out: MalvRichSourceItem[] = [];
  for (const s of limited) {
    const res = await malvControlledFetchText({ url: s.url, signal, timeoutMs: Math.min(fetchTimeoutMs(), 6_000), maxBytes: 350_000 });
    const snippet = res.ok && res.text ? extractSnippetFromHtml(res.text) : "";
    out.push({
      title: s.title,
      url: s.url,
      ...(snippet ? { snippet } : {})
    });
  }
  for (const s of sources.slice(maxFetches)) {
    out.push(s);
  }
  return out;
}

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  DOGE: "dogecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  LINK: "chainlink"
};

async function fetchCryptoMarketSnapshot(
  symbol: string,
  signal: AbortSignal | undefined
): Promise<{ data: MalvFinanceExecutionData; sources: MalvRichSourceItem[] } | null> {
  if (financeQuotesDisabled()) return null;
  const id = COINGECKO_IDS[symbol.toUpperCase()];
  if (!id) return null;
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&community_data=false&developer_data=false`;
  const res = await malvControlledFetchText({ url, signal, timeoutMs: fetchTimeoutMs(), maxBytes: 900_000 });
  if (!res.ok) return null;
  try {
    const j = JSON.parse(res.text) as {
      name?: string;
      symbol?: string;
      market_data?: {
        current_price?: { usd?: number };
        price_change_24h?: number;
        price_change_percentage_24h?: number;
        high_24h?: { usd?: number };
        low_24h?: { usd?: number };
      };
    };
    const md = j.market_data;
    const current = typeof md?.current_price?.usd === "number" ? md.current_price.usd : NaN;
    if (!Number.isFinite(current)) return null;
    const changePct = typeof md?.price_change_percentage_24h === "number" ? md.price_change_percentage_24h : 0;
    const changeAbs = typeof md?.price_change_24h === "number" ? md.price_change_24h : (current * changePct) / 100;
    const high = typeof md?.high_24h?.usd === "number" ? md.high_24h.usd : current * 1.02;
    const low = typeof md?.low_24h?.usd === "number" ? md.low_24h.usd : current * 0.98;
    const label = j.name ?? symbol;
    const asOf = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";
    const mcUrl = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=7`;
    const mc = await malvControlledFetchText({ url: mcUrl, signal, timeoutMs: fetchTimeoutMs(), maxBytes: 600_000 });
    const series: Array<{ t: string; v: number }> = [];
    if (mc.ok && mc.text) {
      const chart = JSON.parse(mc.text) as { prices?: [number, number][] };
      const pts = chart.prices ?? [];
      const step = Math.max(1, Math.floor(pts.length / 7));
      for (let i = 0; i < pts.length; i += step) {
        const p = pts[i];
        if (!p) continue;
        const d = new Date(p[0]);
        series.push({ t: d.toISOString().slice(5, 10), v: Math.round(p[1] * 100) / 100 });
        if (series.length >= 8) break;
      }
    }
    const data: MalvFinanceExecutionData = {
      kind: "malv_finance_snapshot",
      symbol: symbol.toUpperCase(),
      label,
      currency: "USD",
      current: Math.round(current * 100) / 100,
      asOf,
      range: { label: "24h / 7d band (CoinGecko)", low: Math.round(low * 100) / 100, high: Math.round(high * 100) / 100 },
      changeAbs: Math.round(changeAbs * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      chartSeries: series.length ? series : undefined
    };
    const sources: MalvRichSourceItem[] = [
      { title: `${label} (${symbol.toUpperCase()}) — CoinGecko market data`, url: `https://www.coingecko.com/en/coins/${id}` }
    ];
    return { data, sources };
  } catch {
    return null;
  }
}

async function fetchYahooFinanceSnapshot(
  symbol: string,
  label: string,
  signal: AbortSignal | undefined
): Promise<{ data: MalvFinanceExecutionData; sources: MalvRichSourceItem[] } | null> {
  if (financeQuotesDisabled()) return null;
  const sym = encodeURIComponent(symbol.toUpperCase());
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=7d&interval=1d`;
  const res = await malvControlledFetchText({ url, signal, timeoutMs: fetchTimeoutMs(), maxBytes: 400_000 });
  if (!res.ok) return null;
  try {
    const j = JSON.parse(res.text) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; currency?: string; symbol?: string }; timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
    };
    const r0 = j.chart?.result?.[0];
    if (!r0) return null;
    const meta = r0.meta;
    const current = typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : NaN;
    if (!Number.isFinite(current)) return null;
    const currency = typeof meta?.currency === "string" ? meta.currency : "USD";
    const closes = r0.indicators?.quote?.[0]?.close ?? [];
    const valid = closes.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    const first = valid[0] ?? current;
    const changeAbs = Math.round((current - first) * 100) / 100;
    const changePct = first !== 0 ? Math.round(((current - first) / first) * 10_000) / 100 : 0;
    const ts = r0.timestamp ?? [];
    const series: Array<{ t: string; v: number }> = [];
    for (let i = 0; i < Math.min(ts.length, closes.length); i++) {
      const v = closes[i];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const d = new Date((ts[i] ?? 0) * 1000);
      series.push({ t: d.toISOString().slice(5, 10), v: Math.round(v * 100) / 100 });
    }
    const slice = series.slice(-8);
    const lows = valid.map((x) => x);
    const high = Math.max(...lows, current);
    const low = Math.min(...lows, current);
    const asOf = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";
    const data: MalvFinanceExecutionData = {
      kind: "malv_finance_snapshot",
      symbol: symbol.toUpperCase(),
      label,
      currency,
      current: Math.round(current * 100) / 100,
      asOf,
      range: { label: "7d session (Yahoo Finance chart)", low: Math.round(low * 100) / 100, high: Math.round(high * 100) / 100 },
      changeAbs,
      changePct,
      chartSeries: slice.length ? slice : undefined
    };
    const sources: MalvRichSourceItem[] = [
      { title: `${label} (${symbol.toUpperCase()}) — Yahoo Finance`, url: `https://finance.yahoo.com/quote/${sym}` }
    ];
    return { data, sources };
  } catch {
    return null;
  }
}

async function resolveLiveFinance(args: {
  userText: string;
  signal: AbortSignal | undefined;
}): Promise<{ data: MalvFinanceExecutionData; sources: MalvRichSourceItem[]; provenance: "coingecko" | "yahoo" } | null> {
  const { symbol, label } = extractFinanceSymbolHint(args.userText);
  const crypto = await fetchCryptoMarketSnapshot(symbol, args.signal);
  if (crypto) return { ...crypto, provenance: "coingecko" };
  const y = await fetchYahooFinanceSnapshot(symbol, label, args.signal);
  if (y) return { ...y, provenance: "yahoo" };
  return null;
}

function braveResultsToSources(rows: BraveWebResult[]): MalvRichSourceItem[] {
  const raw: MalvRichSourceItem[] = rows.map((r) => ({
    title: r.title.slice(0, 240),
    url: r.url,
    ...(r.description ? { snippet: r.description.slice(0, 400) } : {})
  }));
  return filterMalvTrustedRichSources(raw);
}

function researchBundleFromSources(query: string, sources: MalvRichSourceItem[]): MalvWebResearchExecutionData {
  const keyFacts = sources
    .slice(0, 5)
    .map((s) => {
      const sn = typeof s.snippet === "string" ? s.snippet : "";
      const host = (() => {
        try {
          return new URL(s.url).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      })();
      const base = sn ? `${host}: ${sn}` : `${host}: ${s.title}`;
      return base.slice(0, 420);
    })
    .filter((x) => x.trim().length > 8);
  const shortExplanation =
    sources.length > 0
      ? `Grounded on ${sources.length} retrieved source${sources.length === 1 ? "" : "s"}; synthesize a concise answer aligned with the user query.`
      : "No verified web sources were attached for this turn; answer conservatively without inventing outlets or URLs.";
  return {
    kind: "malv_web_research_bundle",
    query: query.slice(0, 400),
    keyFacts: keyFacts.length ? keyFacts : [],
    shortExplanation
  };
}

function braveImagesToRichItems(rows: BraveImageResult[]): MalvRichImageItem[] {
  const raw: MalvRichImageItem[] = rows.map((r) => ({
    url: r.url,
    alt: (r.title ?? "").slice(0, 400) || undefined,
    source: r.source ? r.source.slice(0, 200) : undefined
  }));
  return filterMalvTrustedRichImages(raw).filter((im) => !isMalvUntrustedDemonstrationImageUrl(im.url));
}

function emptyTelemetry(route: MalvUniversalResponseMode): MalvWebRetrievalTelemetry {
  return {
    malvWebRetrievalSelectedRoute: route,
    malvWebRetrievalRan: false,
    malvWebRetrievalProvider: "none",
    malvWebCandidateSources: 0,
    malvWebFilteredSources: 0,
    malvWebCandidateImages: 0,
    malvWebFilteredImages: 0,
    malvWebMediaSuppressedReason: null,
    malvWebFinanceProvenance: "none",
    malvWebFailureReason: null
  };
}

/**
 * Production web retrieval for universal capability routes (Brave Search + selective page fetch;
 * finance via CoinGecko / Yahoo). When keys are absent or retrieval is disabled, returns `ok: false`
 * with no fabricated sources or media.
 */
export async function runMalvWebCapabilityPipeline(args: {
  userText: string;
  route: MalvUniversalCapabilityRoute;
  signal?: AbortSignal;
}): Promise<MalvWebCapabilityPipelineOutput> {
  const route = args.route;
  const mode = route.responseMode;
  const baseTel = emptyTelemetry(mode);
  const userText = typeof args.userText === "string" ? args.userText : "";
  const signal = args.signal;

  if (mode === "plain_model") {
    return {
      ok: true,
      skipped: true,
      promptInjection: "",
      rich: null,
      telemetry: { ...baseTel, malvWebFailureReason: "plain_model_skip" }
    };
  }

  const braveKey = braveApiKey();
  const needsBraveForResearch =
    mode === "web_research" || mode === "mixed_text_plus_visual" || mode === "mixed_text_plus_sources" || mode === "image_enrichment";
  if (needsBraveForResearch && webSearchAndFetchDisabled()) {
    return {
      ok: false,
      error: "web_retrieval_disabled_by_policy",
      promptInjection: "",
      rich: null,
      telemetry: { ...baseTel, malvWebFailureReason: "web_retrieval_disabled_by_policy" }
    };
  }
  if (needsBraveForResearch && !braveKey) {
    return {
      ok: false,
      error: "web_retrieval_missing_brave_api_key",
      promptInjection: "",
      rich: null,
      telemetry: { ...baseTel, malvWebFailureReason: "missing_brave_api_key" }
    };
  }

  try {
    switch (mode) {
      case "finance_data": {
        const fin = await resolveLiveFinance({ userText, signal });
        if (!fin) {
          return {
            ok: false,
            error: "finance_live_quote_unavailable",
            promptInjection: "",
            rich: null,
            telemetry: { ...baseTel, malvWebFailureReason: "finance_live_quote_unavailable" }
          };
        }
        const rich: MalvRichResponse = { text: "", sources: fin.sources, data: fin.data };
        return {
          ok: true,
          promptInjection: formatFinancePrompt(fin.data, fin.sources),
          rich,
          telemetry: {
            ...baseTel,
            malvWebRetrievalRan: true,
            malvWebRetrievalProvider: "none",
            malvWebFinanceProvenance: fin.provenance,
            malvWebCandidateSources: fin.sources.length,
            malvWebFilteredSources: fin.sources.length
          }
        };
      }
      case "web_research": {
        const rows = await braveWebSearch(userText, signal, braveKey!);
        const candSources = braveResultsToSources(rows);
        const enriched = await enrichSourcesWithSnippets(candSources, signal, 3);
        const sources = filterMalvTrustedRichSources(enriched);
        const data = researchBundleFromSources(userText, sources);
        if (!sources.length) {
          return {
            ok: false,
            error: "web_research_no_trusted_sources",
            promptInjection: "",
            rich: null,
            telemetry: {
              ...baseTel,
              malvWebRetrievalRan: true,
              malvWebRetrievalProvider: "brave",
              malvWebCandidateSources: rows.length,
              malvWebFilteredSources: 0,
              malvWebFailureReason: "no_trusted_sources_after_filter"
            }
          };
        }
        const rich: MalvRichResponse = { text: "", sources, data };
        return {
          ok: true,
          promptInjection: formatResearchPrompt(data, sources),
          rich,
          telemetry: {
            ...baseTel,
            malvWebRetrievalRan: true,
            malvWebRetrievalProvider: "brave",
            malvWebCandidateSources: rows.length,
            malvWebFilteredSources: sources.length,
            malvWebMediaSuppressedReason: "route_web_research_no_image_rail"
          }
        };
      }
      case "image_enrichment": {
        const imgRows = await braveImageSearch(userText, signal, braveKey!);
        const candidates = braveImagesToRichItems(imgRows);
        let mediaReason: string | null = null;
        const images = candidates.slice(0, 4);
        if (!images.length) mediaReason = "no_trusted_images_after_filter";
        const promptInjection = images.length ? formatImagePrompt(images) : "";
        const rich: MalvRichResponse = images.length ? { text: "", images } : { text: "" };
        return {
          ok: true,
          promptInjection,
          rich,
          telemetry: {
            ...baseTel,
            malvWebRetrievalRan: true,
            malvWebRetrievalProvider: "brave",
            malvWebCandidateImages: imgRows.length,
            malvWebFilteredImages: images.length,
            malvWebMediaSuppressedReason: mediaReason
          }
        };
      }
      case "mixed_text_plus_visual": {
        const [webRows, imgRows] = await Promise.all([
          braveWebSearch(userText, signal, braveKey!),
          braveImageSearch(userText, signal, braveKey!)
        ]);
        const candSources = braveResultsToSources(webRows);
        const enriched = await enrichSourcesWithSnippets(candSources, signal, 3);
        const sources = filterMalvTrustedRichSources(enriched);
        const data = researchBundleFromSources(userText, sources);
        const imgCandidates = braveImagesToRichItems(imgRows);
        const images = imgCandidates.slice(0, 3);
        let mediaReason: string | null = null;
        if (!images.length) mediaReason = "no_trusted_images_after_filter";
        if (!sources.length) {
          return {
            ok: false,
            error: "mixed_visual_no_trusted_sources",
            promptInjection: "",
            rich: null,
            telemetry: {
              ...baseTel,
              malvWebRetrievalRan: true,
              malvWebRetrievalProvider: "brave",
              malvWebCandidateSources: webRows.length,
              malvWebFilteredSources: 0,
              malvWebCandidateImages: imgRows.length,
              malvWebFilteredImages: images.length,
              malvWebMediaSuppressedReason: mediaReason,
              malvWebFailureReason: "no_trusted_sources_after_filter"
            }
          };
        }
        const parts = [formatImagePrompt(images), formatResearchPrompt(data, sources)].filter(Boolean);
        const rich: MalvRichResponse = {
          text: "",
          ...(images.length ? { images } : {}),
          sources,
          data
        };
        return {
          ok: true,
          promptInjection: parts.join("\n\n"),
          rich,
          telemetry: {
            ...baseTel,
            malvWebRetrievalRan: true,
            malvWebRetrievalProvider: "brave",
            malvWebCandidateSources: webRows.length,
            malvWebFilteredSources: sources.length,
            malvWebCandidateImages: imgRows.length,
            malvWebFilteredImages: images.length,
            malvWebMediaSuppressedReason: mediaReason
          }
        };
      }
      case "mixed_text_plus_sources": {
        const [webRows, fin] = await Promise.all([
          braveWebSearch(userText, signal, braveKey!),
          resolveLiveFinance({ userText, signal })
        ]);
        const candSources = braveResultsToSources(webRows);
        const enriched = await enrichSourcesWithSnippets(candSources, signal, 3);
        const trustedWeb = filterMalvTrustedRichSources(enriched);
        const research = researchBundleFromSources(userText, trustedWeb);
        let financeSources: MalvRichSourceItem[] = [];
        let financeData: MalvFinanceExecutionData | null = null;
        let finProv: "coingecko" | "yahoo" | "none" = "none";
        if (fin) {
          financeData = fin.data;
          financeSources = fin.sources;
          finProv = fin.provenance;
        }
        const sourcesMerged = filterMalvTrustedRichSources([...trustedWeb, ...financeSources]);
        if (!trustedWeb.length && !financeData) {
          return {
            ok: false,
            error: "mixed_sources_insufficient_evidence",
            promptInjection: "",
            rich: null,
            telemetry: {
              ...baseTel,
              malvWebRetrievalRan: true,
              malvWebRetrievalProvider: "brave",
              malvWebCandidateSources: webRows.length,
              malvWebFilteredSources: 0,
              malvWebFinanceProvenance: finProv,
              malvWebFailureReason: "insufficient_evidence"
            }
          };
        }
        const rich: MalvRichResponse = {
          text: "",
          sources: sourcesMerged.length ? sourcesMerged : undefined,
          data: { research, ...(financeData ? { finance: financeData } : {}) }
        };
        const prompts: string[] = [];
        if (trustedWeb.length) prompts.push(formatResearchPrompt(research, trustedWeb));
        if (financeData) prompts.push(formatFinancePrompt(financeData, financeSources));
        return {
          ok: true,
          promptInjection: prompts.join("\n\n"),
          rich,
          telemetry: {
            ...baseTel,
            malvWebRetrievalRan: true,
            malvWebRetrievalProvider: "brave",
            malvWebCandidateSources: webRows.length,
            malvWebFilteredSources: trustedWeb.length,
            malvWebFinanceProvenance: finProv,
            malvWebMediaSuppressedReason: "route_mixed_sources_no_image_rail"
          }
        };
      }
      default:
        return {
          ok: false,
          error: "universal_route_execution_unhandled_mode",
          promptInjection: "",
          rich: null,
          telemetry: { ...baseTel, malvWebFailureReason: "unhandled_mode" }
        };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: msg.slice(0, 400),
      promptInjection: "",
      rich: null,
      telemetry: { ...baseTel, malvWebFailureReason: msg.slice(0, 200) }
    };
  }
}
