/**
 * Deterministic comparison for when server `assistant_done.finalContent` should override
 * a streamed buffer on **complete** turns (WebSocket stream-first UX).
 */

function normalizeForPrefixCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function oddMarkdownCodeFenceCount(text: string): boolean {
  const n = (text.match(/```/g) ?? []).length;
  return n % 2 === 1;
}

/**
 * Conservative: true only when `finalTrim` is clearly a strict improvement over `streamedTrim`
 * for a **complete** turn (caller must still enforce interrupted / partial_done / failed rules).
 */
export function shouldPreferAssistantFinalContent(args: {
  streamedTrim: string;
  finalTrim: string;
  streamedRaw: string;
  finalRaw: string;
}): boolean {
  const { streamedTrim, finalTrim, streamedRaw, finalRaw } = args;
  if (!finalTrim) return false;
  if (!streamedTrim) return true;

  if (finalTrim.length < streamedTrim.length) return false;

  if (streamedTrim === finalTrim) {
    return oddMarkdownCodeFenceCount(streamedRaw) && !oddMarkdownCodeFenceCount(finalRaw);
  }

  if (finalTrim.length > streamedTrim.length) {
    if (finalTrim.startsWith(streamedTrim)) return true;

    const ns = normalizeForPrefixCompare(streamedTrim);
    const nfHead = normalizeForPrefixCompare(finalTrim.slice(0, streamedTrim.length));
    if (nfHead === ns) return true;

    const window = Math.min(120, streamedTrim.length, finalTrim.length);
    if (window > 0) {
      const sSlice = normalizeForPrefixCompare(streamedTrim.slice(0, window));
      const fSlice = normalizeForPrefixCompare(finalTrim.slice(0, window));
      if (sSlice === fSlice && finalTrim.length > streamedTrim.length) return true;
    }

    const prefixLen = Math.min(40, streamedTrim.length, finalTrim.length);
    if (prefixLen > 0) {
      const sp = normalizeForPrefixCompare(streamedTrim.slice(0, prefixLen));
      const fp = normalizeForPrefixCompare(finalTrim.slice(0, prefixLen));
      if (sp !== fp) return false;
    }

    if (/(?:\.\.\.|…)\s*$/.test(streamedTrim) && !/(?:\.\.\.|…)\s*$/.test(finalTrim)) return true;

    if (oddMarkdownCodeFenceCount(streamedRaw) && !oddMarkdownCodeFenceCount(finalRaw)) return true;

    return false;
  }

  return false;
}
