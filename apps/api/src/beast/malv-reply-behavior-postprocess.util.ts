/**
 * Last-mile text cleanup for generic tutorial drift and meta-commentary (all reply paths).
 * Conservative: removes low-signal phrases, not technical “steps to reproduce” in bug reports.
 */

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

/**
 * Strip tutorial / search-engine coaching the user did not ask for.
 */
export function stripMalvTutorialGuidancePhrasing(text: string): string {
  let out = (typeof text === "string" ? text : "").replace(/\r\n/g, "\n");
  const sentenceHunks: RegExp[] = [
    /\byou may want to check\b[^.!?\n]*[.!?]?/gi,
    /\byou might want to check\b[^.!?\n]*[.!?]?/gi,
    /\bit may be worth checking\b[^.!?\n]*[.!?]?/gi,
    /\byou can search\b[^.!?\n]*[.!?]?/gi,
    /\byou may search\b[^.!?\n]*[.!?]?/gi,
    /\byou can visit\b[^.!?\n]*[.!?]?/gi,
    /\byou may visit\b[^.!?\n]*[.!?]?/gi,
    /\btry searching\b[^.!?\n]*[.!?]?/gi,
    /\bto find images?\b[^.!?\n]*[.!?]?/gi,
    /\bhere'?s? how to find\b[^.!?\n]*[.!?]?/gi,
    /\bhere is how to find\b[^.!?\n]*[.!?]?/gi,
    /\bgo to google\b[^.!?\n]*[.!?]?/gi,
    /\bsearch (?:on|in) google\b[^.!?\n]*[.!?]?/gi,
    /\bsteps\s+to\s+(?:find|locate|search|get|view|see|visit|look\s+up)\b[^.!?\n]*[.!?]?/gi
  ];
  for (const re of sentenceHunks) {
    re.lastIndex = 0;
    out = out.replace(re, "");
  }
  out = out.replace(/^\s*(?:[-*+]|\d+\.)\s*(?:you can (?:search|visit)|try searching|to find images?)\b[^\n]*\n/gim, "");
  return collapseBlankLines(out);
}

/**
 * Remove lines that only meta-comment on images or UI surfacing.
 */
export function stripMalvImagePresenceMetaCommentary(text: string): string {
  const lines = (typeof text === "string" ? text : "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      out.push(line);
      continue;
    }
    if (/^(?:note:?\s*)?(?:I\s+)?(?:couldn'?t|can'?t|wasn'?t able to)\s+(?:find|locate|retrieve|pull\s+up)\s+(?:any\s+)?images?\b/i.test(t))
      continue;
    if (/\b(?:there\s+are\s+)?no\s+images?\s+(?:to\s+)?(?:show|display|include|attach)\b/i.test(t)) continue;
    if (/^(?:below|above),?\s*(?:you(?:'ll)?\s+)?(?:will\s+)?(?:see|find)\s+(?:some\s+)?images?\b/i.test(t)) continue;
    if (
      /\bimages?\s+(?:are\s+)?(?:shown|displayed)\s+(?:below|above|in\s+the\s+(?:carousel|rail|media\s+deck|panel))\b/i.test(
        t
      )
    )
      continue;
    if (/\bI(?:'ve| have)\s+(?:also\s+)?(?:included|attached)\s+(?:some\s+)?images?\b/i.test(t)) continue;
    out.push(line);
  }
  return collapseBlankLines(out.join("\n"));
}
