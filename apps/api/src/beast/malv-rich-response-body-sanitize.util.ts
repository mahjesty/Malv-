import type { MalvRichImageItem, MalvRichSourceItem } from "./malv-rich-response.types";
import { isMalvUntrustedDemonstrationImageUrl } from "./malv-web-source-trust.util";

function sourceDedupeKey(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.hostname.toLowerCase()}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function dedupeSources(items: MalvRichSourceItem[]): MalvRichSourceItem[] {
  const seen = new Set<string>();
  const out: MalvRichSourceItem[] = [];
  for (const s of items) {
    const url = typeof s.url === "string" ? s.url.trim() : "";
    const title = typeof s.title === "string" ? s.title.trim() : "";
    if (!url || !title) continue;
    const k = sourceDedupeKey(url);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ title, url });
  }
  return out;
}

/** Human-readable pill label from a URL (site name / host). */
export function malvHumanLabelFromUrl(url: string): string {
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

function trimTrailingPunct(s: string): string {
  return s.replace(/[),.;:!?]+$/g, "");
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

/**
 * Strip markdown links and bare URLs from assistant-visible text.
 * When `mergeDiscoveredIntoSources` is true, discovered links are returned for structured chrome.
 * When false (e.g. image-only route), bare URLs become a short parenthetical host instead of raw URLs.
 */
export function liftMarkdownLinksAndBareUrlsFromAssistantBody(
  text: string,
  existingSources: MalvRichSourceItem[] | undefined,
  opts: { mergeDiscoveredIntoSources: boolean }
): { text: string; discovered: MalvRichSourceItem[] } {
  const discovered: MalvRichSourceItem[] = [];
  const existingKeys = new Set((existingSources ?? []).map((s) => sourceDedupeKey(s.url)));

  const processChunk = (chunk: string): string => {
    let out = chunk;

    // Markdown [title](url)
    out = out.replace(/\[([^\]\n]{1,240})\]\((https?:\/\/[^\s)\]]+)\)/gi, (_full, titleRaw: string, urlRaw: string) => {
      const url = trimTrailingPunct(String(urlRaw).trim());
      const title = String(titleRaw).trim();
      if (!/^https?:\/\//i.test(url)) return _full;
      const label = looksLikeUrl(title) ? malvHumanLabelFromUrl(url) : title.slice(0, 120);
      if (opts.mergeDiscoveredIntoSources && !existingKeys.has(sourceDedupeKey(url))) {
        existingKeys.add(sourceDedupeKey(url));
        discovered.push({ title: label || malvHumanLabelFromUrl(url), url });
      }
      if (opts.mergeDiscoveredIntoSources) {
        return label;
      }
      return label;
    });

    // Bare URLs (avoid touching already-linked text)
    out = out.replace(/\bhttps?:\/\/[^\s\[\]<>"']+/gi, (raw) => {
      const url = trimTrailingPunct(raw.trim());
      if (!/^https?:\/\//i.test(url)) return raw;
      if (opts.mergeDiscoveredIntoSources && !existingKeys.has(sourceDedupeKey(url))) {
        existingKeys.add(sourceDedupeKey(url));
        discovered.push({ title: malvHumanLabelFromUrl(url), url });
        return "";
      }
      const host = malvHumanLabelFromUrl(url);
      return ` (${host})`;
    });

    out = out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trimEnd();
    return out;
  };

  const parts = text.split("```");
  const rebuilt = parts.map((part, i) => (i % 2 === 1 ? part : processChunk(part))).join("```");

  return { text: rebuilt.trim(), discovered };
}

export function mergeMalvRichSources(
  primary: MalvRichSourceItem[] | undefined,
  discovered: MalvRichSourceItem[]
): MalvRichSourceItem[] {
  return dedupeSources([...(primary ?? []), ...discovered]);
}

function imageDedupeKey(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    return u.href.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function dedupeImages(items: MalvRichImageItem[]): MalvRichImageItem[] {
  const seen = new Set<string>();
  const out: MalvRichImageItem[] = [];
  for (const im of items) {
    const url = typeof im.url === "string" ? im.url.trim() : "";
    if (!url) continue;
    const k = imageDedupeKey(url);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      url,
      alt: typeof im.alt === "string" ? im.alt : undefined,
      source: typeof im.source === "string" ? im.source : undefined
    });
  }
  return out;
}

/**
 * Strip `![alt](url)` image markdown from assistant-visible text.
 * When `mergeIntoImages` is true, discovered images are returned for the structured media rail.
 */
export function liftMarkdownImagesFromAssistantBody(
  text: string,
  existingImages: MalvRichImageItem[] | undefined,
  opts: { mergeIntoImages: boolean }
): { text: string; discovered: MalvRichImageItem[] } {
  const discovered: MalvRichImageItem[] = [];
  const existingKeys = new Set((existingImages ?? []).map((im) => imageDedupeKey(im.url)));

  const processChunk = (chunk: string): string => {
    let out = chunk;
    out = out.replace(
      /!\[([^\]\n]{0,500})\]\((https?:\/\/[^\s)\]]+)\)/gi,
      (_full, altRaw: string, urlRaw: string) => {
        const url = trimTrailingPunct(String(urlRaw).trim());
        const alt = String(altRaw ?? "").trim();
        if (!/^https?:\/\//i.test(url)) return _full;
        if (opts.mergeIntoImages && !existingKeys.has(imageDedupeKey(url))) {
          existingKeys.add(imageDedupeKey(url));
          discovered.push({ url, alt: alt || undefined });
        }
        return "";
      }
    );
    out = out.replace(/\n{3,}/g, "\n\n").trimEnd();
    return out;
  };

  const parts = text.split("```");
  const rebuilt = parts.map((part, i) => (i % 2 === 1 ? part : processChunk(part))).join("```");
  return { text: rebuilt.trim(), discovered };
}

export function mergeMalvRichImages(primary: MalvRichImageItem[] | undefined, discovered: MalvRichImageItem[]): MalvRichImageItem[] {
  return dedupeImages([...(primary ?? []), ...discovered]);
}

/** RFC 2606 / obvious non-production hosts — never show in structured chrome or as render targets. */
export function isBlockedMalvRichStructuredUrl(url: string): boolean {
  const t = typeof url === "string" ? url.trim() : "";
  if (!t) return true;
  try {
    const u = new URL(t);
    if (!/^https?:$/i.test(u.protocol)) return true;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
    if (
      host === "example.com" ||
      host === "example.org" ||
      host === "example.net" ||
      host === "example.invalid" ||
      host === "example.test" ||
      host.endsWith(".example.com") ||
      host.endsWith(".example.org") ||
      host.endsWith(".example.net")
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function malvRichImagePlaceholderSignals(im: MalvRichImageItem): boolean {
  const bag = `${im.url} ${im.alt ?? ""} ${im.source ?? ""}`.toLowerCase();
  if (/\b(placeholder|dummy|sample\s+image|example\s+image|lorem\s+ipsum)\b/.test(bag)) return true;
  if (/\b(broken|invalid)\s+url\b/.test(bag)) return true;
  return false;
}

/**
 * Drops non-renderable or filler image rows before chrome / carousel.
 * Does not apply to plain_model paths — only call from rich composition.
 */
export function filterMalvRenderableRichImages(items: MalvRichImageItem[] | undefined): MalvRichImageItem[] {
  const raw = dedupeImages([...(items ?? [])]);
  return raw.filter(
    (im) =>
      !isBlockedMalvRichStructuredUrl(im.url) &&
      !malvRichImagePlaceholderSignals(im) &&
      !isMalvUntrustedDemonstrationImageUrl(im.url)
  );
}

/**
 * Drops filler source URLs (same host rules as images) from structured pills.
 */
export function filterMalvRenderableRichSources(items: MalvRichSourceItem[] | undefined): MalvRichSourceItem[] {
  const raw = dedupeSources([...(items ?? [])]);
  return raw.filter((s) => !isBlockedMalvRichStructuredUrl(s.url));
}

export type MalvRichProfessionalBodyContext = {
  /** After filtering — count driving source pills. */
  structuredSourcesCount: number;
  /** Image carousel count (not charts). */
  structuredImagesCount: number;
  /** Sparkline / chart card present in media deck. */
  hasRenderableChartInChrome: boolean;
  showSourcesInChrome: boolean;
};

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

function stripHorizontalRulesAndHeadingLines(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (/^(?:-{3,}|_{3,}|\*{3,})$/.test(t)) return "";
      return line.replace(/^#{1,6}\s+/, "").trimEnd();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function unwrapMarkdownBold(text: string): string {
  let prev = "";
  let out = text;
  while (out !== prev) {
    prev = out;
    out = out.replace(/\*\*([^*][^*]*?)\*\*/g, "$1");
  }
  return out;
}

function unwrapSingleAsteriskItalics(text: string): string {
  return text.replace(/(?<!\*)\*([^*\n]{1,200})\*(?!\*)/g, "$1");
}

function stripResidualMarkdownImages(text: string): string {
  return text.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, "");
}

function stripAttachedImageNarration(text: string, structuredImagesCount: number): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!structuredImagesCount && /\battached\s+\d+\s+(?:reference\s+)?images?\b/i.test(t)) continue;
    if (/\bMALV execution\b.*\battached\b.*\bimage/i.test(t)) continue;
    if (/\breference\s+image\(s\)\s+below\s+the\s+reply\b/i.test(t)) continue;
    out.push(line);
  }
  return out.join("\n");
}

function stripTutorialSourcePhrasing(text: string, ctx: MalvRichProfessionalBodyContext): string {
  if (!ctx.showSourcesInChrome || ctx.structuredSourcesCount < 1) return text;
  let out = text;
  out = out.replace(/\byou can visit these websites?\b[^.!?]*[.!?]?/gi, "");
  out = out.replace(/\bvisit these (?:sites|links|sources)\b[^.!?]*[.!?]?/gi, "");
  out = out.replace(/\bcheck the sources? (?:below|above|listed)\b[^.!?]*[.!?]?/gi, "");
  return out;
}

/** Strip UI- and chrome-aware filler even when pills are off (defense-in-depth with prompt + style passes). */
function stripUiAndScaffoldPhrasing(text: string): string {
  let out = text;
  out = out.replace(/\bhere'?s?\s+(?:an\s+)?overview\b[.:,]?\s+/gi, "");
  out = out.replace(/\bhere\s+is\s+(?:an\s+)?overview\b[.:,]?\s+/gi, "");
  out = out.replace(/\brelevant images?\b[.:,]?\s+/gi, "");
  out = out.replace(/\bimages?\s+(?:below|above|shown|included|attached)\b[.:,]?\s+/gi, "");
  out = out.replace(/\bsources?\s+(?:below|above|listed)\b[.:,]?\s+/gi, "");
  out = out.replace(/\byou can visit\s+(?:these\s+)?(?:websites?|links?|sources?)\b[^.!?\n]{0,120}[.!?]?\s*/gi, "");
  out = out.replace(/\bvisit\s+(?:these\s+)?(?:websites?|links?)\s+for\b[^.!?\n]{0,120}[.!?]?\s*/gi, "");
  out = out.replace(/\byou can search\b[^.!?\n]{0,160}[.!?]?\s*/gi, "");
  out = out.replace(/\bto find images?\b[^.!?\n]{0,160}[.!?]?\s*/gi, "");
  out = out.replace(/\bhere'?s? how to find\b[^.!?\n]{0,160}[.!?]?\s*/gi, "");
  out = out.replace(/\b(?:there\s+are\s+)?no\s+images?\s+available\b[^.!?\n]{0,160}[.!?]?\s*/gi, "");
  return out;
}

function stripLabeledDumpBlocks(text: string, ctx: MalvRichProfessionalBodyContext): string {
  let out = text;
  if (ctx.showSourcesInChrome && ctx.structuredSourcesCount > 0) {
    out = out.replace(
      /\n{1,2}(?:#{1,6}\s*)?(?:sources?|references?|citations?|further reading|see also)\s*:?\s*\n(?:[ \t]*(?:[-*+]|\d+\.)\s+[^\n]+\n)+/gi,
      "\n\n"
    );
  }
  if (ctx.structuredImagesCount > 0) {
    out = out.replace(
      /\n{1,2}(?:#{1,6}\s*)?(?:relevant images?|image references?|visual references?|here are (?:some )?images?|images? related to)\s*:?\s*\n(?:[ \t]*(?:[-*+]|\d+\.)\s+[^\n]+\n)+/gi,
      "\n\n"
    );
  }
  out = out.replace(
    /\n{1,2}(?:#{1,6}\s*)?(?:current \w+ update|today'?s? update)\s*:?\s*\n(?:[ \t]*(?:[-*+]|\d+\.)\s+[^\n]+\n)+/gi,
    "\n\n"
  );
  return out;
}

function stripInlineUrlBulletsWhenSourcesChrome(text: string, ctx: MalvRichProfessionalBodyContext): string {
  if (!ctx.showSourcesInChrome || ctx.structuredSourcesCount < 1) return text;
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (/^\s*(?:[-*+]|\d+\.)\s+.*https?:\/\//i.test(t)) return false;
      return true;
    })
    .join("\n");
}

function stripChartNarrationWhenChartChrome(text: string, ctx: MalvRichProfessionalBodyContext): string {
  if (!ctx.hasRenderableChartInChrome) return text;
  return text
    .split("\n")
    .filter((line) => !/\bchart (?:below|above|attached)\b/i.test(line.trim()))
    .join("\n");
}

/**
 * Final pass for visible assistant text when structured rich chrome is active.
 * Only used from rich-response composition — not for plain_model.
 */
export function sanitizeMalvRichProfessionalAssistantBody(text: string, ctx: MalvRichProfessionalBodyContext): string {
  let out = typeof text === "string" ? text : "";
  out = stripHorizontalRulesAndHeadingLines(out);
  out = stripResidualMarkdownImages(out);
  out = stripAttachedImageNarration(out, ctx.structuredImagesCount);
  out = stripLabeledDumpBlocks(out, ctx);
  out = stripUiAndScaffoldPhrasing(out);
  out = stripTutorialSourcePhrasing(out, ctx);
  out = stripInlineUrlBulletsWhenSourcesChrome(out, ctx);
  out = stripChartNarrationWhenChartChrome(out, ctx);
  out = unwrapMarkdownBold(out);
  out = unwrapSingleAsteriskItalics(out);
  out = collapseBlankLines(out);
  return out.trim();
}

export type MalvRichDeliveryValidationResult = { ok: boolean; issues: string[] };

/**
 * Post-conditions for premium rich replies (defense-in-depth after sanitization).
 */
export function validateMalvRichDeliveryComposition(args: {
  replyText: string;
  structuredSourcesCount: number;
  structuredImagesCount: number;
  showSourcesInChrome: boolean;
}): MalvRichDeliveryValidationResult {
  const replyText = typeof args.replyText === "string" ? args.replyText : "";
  const issues: string[] = [];

  if (/\*\*[^*]+\*\*/.test(replyText)) issues.push("markdown_bold_scaffolding_remainder");
  if (/^#{1,6}\s/m.test(replyText) || /\n#{1,6}\s/.test(replyText)) issues.push("markdown_heading_remainder");
  if (/^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/m.test(replyText)) issues.push("markdown_separator_remainder");
  if (/https?:\/\//i.test(replyText) && args.showSourcesInChrome && args.structuredSourcesCount > 0) {
    issues.push("raw_url_in_body_with_source_chrome");
  }
  if (/\[([^\]]+)]\(\s*https?:\/\//i.test(replyText) && args.showSourcesInChrome && args.structuredSourcesCount > 0) {
    issues.push("markdown_link_remainder_with_source_chrome");
  }
  if (args.structuredImagesCount < 1) {
    if (/\battached\s+\d+\s+(?:reference\s+)?images?\b/i.test(replyText)) issues.push("attached_image_narration_without_images");
    if (/\breference\s+image\(s\)\s+below\b/i.test(replyText)) issues.push("below_reply_image_narration_without_images");
  }
  if (args.structuredImagesCount > 0) {
    if (/!\[/.test(replyText)) issues.push("markdown_image_syntax_in_body_with_structured_images");
  }

  return { ok: issues.length === 0, issues };
}
