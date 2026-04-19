/**
 * Dev-only metrics for visible streaming cadence vs raw deltas.
 * Enable: `VITE_MALV_CHAT_STREAM_CADENCE_DEBUG=true` in apps/web .env.local
 */

function median(sortedOrAny: number[]): number {
  if (!sortedOrAny.length) return 0;
  const s = [...sortedOrAny].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

let deltaCharLens: number[] = [];
let visibleCharIncrements: number[] = [];
let lastVisibleTotalLen = 0;

export function isMalvAssistantStreamCadenceDebugEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_MALV_CHAT_STREAM_CADENCE_DEBUG === "true";
}

export function resetAssistantStreamCadenceDebug(): void {
  if (!isMalvAssistantStreamCadenceDebugEnabled()) return;
  deltaCharLens = [];
  visibleCharIncrements = [];
  lastVisibleTotalLen = 0;
}

/** Call once per real assistant_delta (before coalescing). */
export function recordAssistantStreamCadenceDelta(deltaLen: number): void {
  if (!isMalvAssistantStreamCadenceDebugEnabled()) return;
  if (deltaLen > 0) deltaCharLens.push(deltaLen);
}

/**
 * Call when visible assistant content commits (e.g. rAF flush to message state).
 * Pass total **painted visible** character count (prefix length); canonical may be longer until coalesce catches up.
 */
export function recordAssistantStreamCadenceVisiblePaint(visibleTotalLen: number): void {
  if (!isMalvAssistantStreamCadenceDebugEnabled()) return;
  const inc = Math.max(0, visibleTotalLen - lastVisibleTotalLen);
  lastVisibleTotalLen = visibleTotalLen;
  visibleCharIncrements.push(inc);
}

export function logAssistantStreamCadenceSummary(context: string): void {
  if (!isMalvAssistantStreamCadenceDebugEnabled()) return;
  const nDelta = deltaCharLens.length;
  const sumD = deltaCharLens.reduce((a, b) => a + b, 0);
  const paintsWithChars = visibleCharIncrements.filter((x) => x > 0);
  const nPaint = visibleCharIncrements.length;
  const tiny3 = visibleCharIncrements.filter((x) => x > 0 && x <= 3).length;
  const tiny5 = visibleCharIncrements.filter((x) => x > 0 && x <= 5).length;
  // eslint-disable-next-line no-console
  console.info(`[MALV stream cadence] ${context}`, {
    assistant_delta_count: nDelta,
    avg_chars_per_delta: nDelta ? Math.round((sumD / nDelta) * 10) / 10 : 0,
    median_chars_per_delta: Math.round(median(deltaCharLens) * 10) / 10,
    visible_commit_count: nPaint,
    visible_paints_with_new_chars: paintsWithChars.length,
    median_chars_per_visible_increment: Math.round(median(paintsWithChars) * 10) / 10,
    avg_chars_per_visible_increment: Math.round(avg(paintsWithChars) * 10) / 10,
    visible_increments_leq_3_chars: tiny3,
    visible_increments_leq_5_chars: tiny5,
    note:
      "Transcript and main bubble both read message.content — same visible cadence. Deltas append to canonical refs immediately; paints use rAF-only adaptive catch-up (no wall-clock hold / word-boundary stepping; no flushSync per delta)."
  });
}

/** @internal */
export function __resetAssistantStreamCadenceDebugForTests(): void {
  deltaCharLens = [];
  visibleCharIncrements = [];
  lastVisibleTotalLen = 0;
}
