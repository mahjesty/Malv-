/**
 * Unified assistant payload for capability execution (finance, research, images, mixed).
 * Serialized on assistant message `metadata.malvRichResponse` for the web client.
 */

export type MalvRichImageItem = {
  url: string;
  alt?: string;
  /** Citation or provider label (not necessarily a full attribution string). */
  source?: string;
};

export type MalvRichSourceItem = {
  title: string;
  url: string;
  /** Optional excerpt from retrieved page HTML (internal / chrome; not always shown). */
  snippet?: string;
};

/** Client / transport quick actions (rendered as a compact contextual row). */
export type MalvRichActionId =
  | "open_primary_source"
  | "open_externally"
  | "summarize_sources"
  | "compare_sources"
  | "save_turn"
  | "send_to_task";

export type MalvRichActionItem = {
  id: MalvRichActionId;
  /** Short verb label for chip-style UI */
  label: string;
  /** Primary URL when `id` is `open_externally` or for internal preview fallbacks */
  url?: string;
};

export type MalvRichMediaImageCard = {
  kind: "image";
  url: string;
  alt?: string;
  source?: string;
};

export type MalvRichMediaChartCard = {
  kind: "chart";
  title: string;
  subtitle?: string;
  series: Array<{ t: string; v: number }>;
  source?: string;
};

export type MalvRichMediaSourceCard = {
  kind: "source_preview";
  title: string;
  url: string;
  hint?: string;
};

export type MalvRichMediaCard = MalvRichMediaImageCard | MalvRichMediaChartCard | MalvRichMediaSourceCard;

/** Structured finance snapshot attached under `data` when execution ran for finance routes. */
export type MalvFinanceExecutionData = {
  kind: "malv_finance_snapshot";
  symbol: string;
  label: string;
  currency: string;
  /** Last traded / snapshot level */
  current: number;
  /** ISO-like display string */
  asOf: string;
  range?: {
    label: string;
    low: number;
    high: number;
  };
  changeAbs: number;
  changePct: number;
  /** Optional OHLC-style series for charts */
  chartSeries?: Array<{ t: string; v: number }>;
};

export type MalvWebResearchExecutionData = {
  kind: "malv_web_research_bundle";
  query: string;
  keyFacts: string[];
  shortExplanation: string;
};

export type MalvRichResponse = {
  text: string;
  /**
   * When set, a short execution summary (e.g. finance snapshot lead-in) rendered as structured chrome.
   * Used for live WS turns so the reply body matches streamed tokens while the client still shows context.
   */
  executionLeadIn?: string;
  /** Legacy image rail — mirrored into {@link MalvRichResponse.media} by the composer when absent. */
  images?: MalvRichImageItem[];
  /**
   * Mixed visual rail: images, sparkline charts, optional source preview tiles.
   * Preferred over `images` alone for premium clients.
   */
  media?: MalvRichMediaCard[];
  sources?: MalvRichSourceItem[];
  /**
   * When true, clients render `sources` as compact pills (not inline URLs).
   * Omitted treated as true for backward compatibility when sources exist.
   */
  showSourcesInChrome?: boolean;
  /** Contextual affordances (preview, external, compare, etc.) */
  actions?: MalvRichActionItem[];
  /** Structured tool payload (finance snapshot, research bundle, etc.) */
  data?: unknown;
};
