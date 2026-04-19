/**
 * Structural layer: deterministic line/block segmentation for MALV assistant prose (no markdown engine).
 * Used for both live stream paint and settled bubbles so interpretation stays aligned.
 */

export type StreamingAssistantLine =
  | { kind: "heading"; level: number; title: string }
  | { kind: "list_item"; text: string }
  | { kind: "ordered_item"; index: number; text: string }
  | { kind: "divider" }
  | { kind: "plain"; text: string };

export type StreamingFenceSegment = { kind: "prose"; text: string } | { kind: "code"; text: string };

/** Split on ``` boundaries — prose vs fenced code (same rules streaming + settled). */
export function splitAssistantFenceSegments(content: string): StreamingFenceSegment[] {
  const parts = content.split("```");
  return parts.map((text, i) => (i % 2 === 1 ? { kind: "code", text } : { kind: "prose", text }));
}

/** @deprecated Use {@link splitAssistantFenceSegments} — kept for backward-compatible imports. */
export const splitStreamingAssistantFenceSegments = splitAssistantFenceSegments;

function stripTrailingUnmatchedBoldMarkers(line: string): string {
  let s = line;
  while (s.endsWith("**")) {
    const count = (s.match(/\*\*/g) ?? []).length;
    if (count % 2 === 1) s = s.slice(0, -2);
    else break;
  }
  return s;
}

function stripTrailingUnmatchedInlineCodeMarker(line: string): string {
  const ticks = (line.match(/`/g) ?? []).length;
  if (ticks % 2 === 0) return line;
  return line.replace(/`+\s*$/, "");
}

function stripTrailingUnmatchedSingleEmphasisMarker(line: string): string {
  let s = line;
  if (s.endsWith("*") && !s.endsWith("**")) {
    const singles = (s.match(/\*/g) ?? []).length;
    const doubles = (s.match(/\*\*/g) ?? []).length * 2;
    if ((singles - doubles) % 2 === 1) s = s.slice(0, -1);
  }
  if (s.endsWith("_") && !s.endsWith("__")) {
    const singles = (s.match(/_/g) ?? []).length;
    const doubles = (s.match(/__/g) ?? []).length * 2;
    if ((singles - doubles) % 2 === 1) s = s.slice(0, -1);
  }
  return s;
}

function stripTrailingIncompleteMarkerOnlyLine(line: string): string {
  if (/^\s{0,3}#{1,6}\s*$/.test(line)) return "";
  if (/^\s{0,3}[-*+]\s*$/.test(line)) return "";
  if (/^\s{0,3}\d{1,4}[.)]?\s*$/.test(line)) return "";
  return line;
}

/**
 * Presentation-safe cleanup: last prose line only — strip dangling unmatched `**` openers.
 * Safe on settled text (usually no-op); keeps stream/final parity when the same bytes are shown.
 */
export function sanitizeProseForIncompleteMarkup(prose: string): string {
  const lastBreak = prose.lastIndexOf("\n");
  const sanitizeLastLine = (line: string) =>
    stripTrailingUnmatchedSingleEmphasisMarker(
      stripTrailingUnmatchedInlineCodeMarker(stripTrailingUnmatchedBoldMarkers(line))
    );
  if (lastBreak < 0) return sanitizeLastLine(prose);
  return prose.slice(0, lastBreak + 1) + sanitizeLastLine(prose.slice(lastBreak + 1));
}

/** @deprecated Use {@link sanitizeProseForIncompleteMarkup} */
export const sanitizeStreamingAssistantProseForIncompleteMarkup = sanitizeProseForIncompleteMarkup;

/**
 * Streaming-only tail polish: hide obviously incomplete marker-only final line fragments.
 * This only touches the trailing prose line and never mutates fenced code segments.
 */
export function softenLiveTrailingProseLine(prose: string): string {
  const lastBreak = prose.lastIndexOf("\n");
  if (lastBreak < 0) return stripTrailingIncompleteMarkerOnlyLine(prose);
  return prose.slice(0, lastBreak + 1) + stripTrailingIncompleteMarkerOnlyLine(prose.slice(lastBreak + 1));
}

/** Classify one prose line (headings, lists, dividers, incomplete markers → empty plain). */
export function classifyAssistantProseLine(line: string): StreamingAssistantLine {
  const t = line;
  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(t)) {
    return { kind: "divider" };
  }

  if (/^\s{0,3}[-*+]\s*$/.test(t)) {
    return { kind: "plain", text: "" };
  }

  if (/^\s{0,3}\d{1,4}[.)]\s*$/.test(t)) {
    return { kind: "plain", text: "" };
  }

  const hm = t.match(/^(\s{0,3})(#{1,6})(?:\s+(.+)|([^#\s].*))?$/);
  if (hm) {
    const rawTitle = (hm[3] ?? hm[4] ?? "").replace(/\s+#+\s*$/, "").trimEnd();
    const level = hm[2].length;
    const title = rawTitle.trim();
    if (title.length > 0) return { kind: "heading", level, title };
    return { kind: "plain", text: "" };
  }

  const ulm = t.match(/^\s{0,3}[-*+]\s+(.+)$/);
  if (ulm) {
    const body = ulm[1].trimEnd();
    if (body.length > 0) return { kind: "list_item", text: body };
  }

  const olm = t.match(/^\s{0,3}(\d{1,4})[.)]\s+(.+)$/);
  if (olm) {
    const body = olm[2].trimEnd();
    if (body.length > 0) return { kind: "ordered_item", index: Number(olm[1]), text: body };
  }

  return { kind: "plain", text: line };
}

/** @deprecated Use {@link classifyAssistantProseLine} */
export const classifyStreamingAssistantLine = classifyAssistantProseLine;
