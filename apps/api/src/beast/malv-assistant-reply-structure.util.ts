/**
 * Deterministic, local hints for whether an assistant reply still looks structurally incomplete.
 * Used by bounded auto-continuation to avoid stopping too aggressively on a short continuation append.
 */

function countMarkdownCodeFenceDelimiters(text: string): number {
  const matches = text.match(/```/g);
  return matches ? matches.length : 0;
}

/** True when the body has an odd number of ``` fences (unclosed markdown code block). */
export function malvAssistantReplyHasOpenCodeFence(text: string): boolean {
  return countMarkdownCodeFenceDelimiters(text) % 2 === 1;
}

/**
 * Conservative structural-incompleteness check (no LLM judgment).
 * Intended as a secondary signal combined with continuation metadata / append length.
 */
export function malvAssistantReplyLooksStructurallyIncomplete(reply: string): boolean {
  const t = reply.trimEnd();
  if (!t) return false;

  if (malvAssistantReplyHasOpenCodeFence(reply)) return true;

  if (/(?:\.\.\.|…)\s*$/.test(t)) return true;

  // Dangling markdown list marker at EOF
  if (/(?:^|\n)[-*+]\s*$/m.test(reply)) return true;

  // Trailing sentence-continuation connectors (often mid-thought when truncated)
  if (/\b(and|or|but|because|so that|such that|as well as)\s*$/i.test(t)) return true;

  return false;
}
