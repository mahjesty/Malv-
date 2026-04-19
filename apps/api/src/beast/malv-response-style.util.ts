/**
 * Post-generation surface cleanup for MALV replies (filler intros, assistant register).
 * Conservative: strips weak phrasing, not technical content. Used inside {@link shapeMalvReply}.
 */

const TRAILING_SPACE_LINES = /[ \t]+$/gm;

/** Entire first line is low-signal — drop it (and following blank lines). */
const FULL_LINE_LEADING_FILLER: RegExp[] = [
  /^(?:hello|hi)\s*[!.,]?\s*(?:there\s*[!.,]?\s*)?$/i,
  /^hi\s+there\s*[!.,]?\s*$/i,
  /^hello\s+there\s*[!.,]?\s*$/i,
  /^(?:good\s+(?:morning|afternoon|evening))[!.,\s]*$/i,
  /^great\s+question[!.,\s]*$/i,
  /^thanks?\s+for\s+(?:asking|reaching\s+out|contacting\s+us)[!.,\s]*$/i,
  /^as an ai (?:assistant|language model)[!.,\s]*$/i,
  /^as a language model[!.,\s]*$/i,
  /^(?:sure|of course|absolutely|certainly)[!.,\s]*$/i,
  /** Role-narration opener as its own line — strip when substantive content follows on the next line. */
  /^(?:i['']m|i am)\s+here\s+to\s+(?:help|assist)(?:\s+you)?\s*[.!?]?\s*$/i
];

/**
 * Hollow affirmations at the start only when a substantive clause follows (avoids "Sure, that's correct.").
 * No `i` flag: case-insensitive `[A-Z]` would let lowercase `t` satisfy the lookahead.
 */
const HOLLOW_AFFIRM_THEN_SUBSTANCE =
  /^(?:[Ss]ure|[Oo]f\s+course|[Aa]bsolutely|[Cc]ertainly)(?:[!.,]+|;|:|\s)+(?=[A-Z0-9#`"'\\[])/;

/**
 * Prefixes at the very start of the reply (may chain; applied in a short loop).
 */
const LEADING_PREFIX_STRIPS: RegExp[] = [
  /^(?:hello|hi)\s*[!.,]?\s+(?:there[!.,]?\s+)?/i,
  /^(?:sure|of course|certainly|absolutely)[!.,]?\s+i[''`]d\s+be\s+(?:happy|delighted|glad)\s+to\s+(?:help|assist)(?:\s+you)?\s*[,!.]*\s+/i,
  /^(?:i[''`]d\s+be\s+(?:happy|delighted|glad)\s+to\s+(?:help|assist)(?:\s+with\s+that)?(?:\s+you)?)\s*[,!.]*\s+/i,
  HOLLOW_AFFIRM_THEN_SUBSTANCE,
  /^as an ai (?:assistant|language model)[,.\s—:-]+\s*/i,
  /^as a language model[,.\s—:-]+\s*/i,
  /^as an ai[,.\s—:-]+\s*/i,
  /^(?:in summary|to summarize|in conclusion),?\s+/i,
  /^(?:here'?s?|here\s+is)\s+(?:an\s+)?overview[.:,]?\s+/i,
  /^(?:here'?s?|here\s+is)\s+(?:the\s+)?(?:current|quick)\s+update[.:,]?\s+/i
];

/** After a paragraph break: assistant-disclaimer paragraphs often start like this. */
const PARAGRAPH_AS_AI = /\n\nAs an ai (?:assistant|language model)[,.\s—:-]+\s*/gi;

/**
 * Remove filler at the start of the string only (avoids touching "…an AI assistant pattern" in code).
 */
const START_AS_AI_PHRASE =
  /^As an ai (?:assistant|language model)[,.\s—:-]+\s*|^As an ai[,.\s—:-]+\s*|^As a language model[,.\s—:-]+\s*/i;

function stripLeadingFillerLines(s: string): string {
  const lines = s.split("\n");
  while (lines.length > 0) {
    const first = (lines[0] ?? "").trim();
    if (first === "") {
      lines.shift();
      continue;
    }
    const isFiller = FULL_LINE_LEADING_FILLER.some((re) => re.test(first));
    if (!isFiller) break;
    lines.shift();
    while (lines.length > 0 && (lines[0] ?? "").trim() === "") lines.shift();
  }
  return lines.join("\n").trim();
}

function stripChainedLeadingPrefixes(s: string): string {
  let out = s;
  for (let i = 0; i < 8; i++) {
    let changed = false;
    const trimmed = out.trimStart();
    const withoutStartAsAi = trimmed.replace(START_AS_AI_PHRASE, "").trimStart();
    if (withoutStartAsAi !== trimmed) {
      out = withoutStartAsAi;
      changed = true;
    }
    for (const re of LEADING_PREFIX_STRIPS) {
      const next = out.trimStart().replace(re, "").trimStart();
      if (next !== out.trimStart()) {
        out = next;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return out;
}

/**
 * Collapse excessive blank lines (soft tightening without truncating explanations).
 */
function softenWhitespace(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").replace(TRAILING_SPACE_LINES, "").trim();
}

/**
 * Light pass: trim assistant-register intros and hollow openers without rewriting body meaning.
 */
export function applyMalvResponseStyle(text: string): string {
  let out = text.replace(/\r\n/g, "\n").trim();
  if (!out) return out;

  out = stripLeadingFillerLines(out);
  out = stripChainedLeadingPrefixes(out);
  out = out.replace(PARAGRAPH_AS_AI, "\n\n");
  out = softenWhitespace(out);
  return out;
}
