/**
 * Lightweight "Beast signal" — high-confidence hints only; avoid spam.
 */

export type BeastSignalResult = {
  suggestion: string | null;
  /** Why we attached (for logs only). */
  reason?: string;
};

function lastUserTexts(
  prior: Array<{ role: string; content?: string }>,
  take: number
): string[] {
  const users = prior.filter((m) => m.role === "user" && (m.content ?? "").trim());
  return users.slice(-take).map((m) => (m.content ?? "").toLowerCase());
}

/**
 * Detect repeated failure language, stuck loops, or unfinished-task phrasing.
 */
export function detectBeastSignal(args: {
  userMessage: string;
  priorMessages: Array<{ role: string; content?: string }>;
}): BeastSignalResult {
  const msg = args.userMessage.toLowerCase();
  const recent = lastUserTexts(args.priorMessages, 5);

  const failureHits = recent.filter(
    (t) => /\b(still|again|doesn'?t work|same error|not working|failed)\b/.test(t)
  ).length;
  if (failureHits >= 2 && /\b(error|fail|broken|still)\b/.test(msg)) {
    return {
      suggestion:
        "Suggestion: capture one failing command, full stderr, and the last change — then isolate whether it is environment, dependency, or code path.",
      reason: "repeated_failure_language"
    };
  }

  const stuckPattern = /\b(stuck|blocked|can'?t (figure|get)|don'?t know what to do)\b/;
  if (stuckPattern.test(msg) && recent.some((t) => stuckPattern.test(t))) {
    return {
      suggestion:
        "Suggestion: narrow to a single measurable outcome (one command or one file), then verify that outcome before expanding scope.",
      reason: "stuck_pattern"
    };
  }

  if (/\b(todo|unfinished|left off|resume|continue where)\b/.test(msg)) {
    return {
      suggestion: "Suggestion: restate the last concrete step completed and the next checkpoint so the thread stays aligned.",
      reason: "unfinished_task"
    };
  }

  if (/\b(slow|redundant|twice|unnecessary work)\b/.test(msg) && /\b(optimize|faster|better)\b/.test(msg)) {
    return {
      suggestion:
        "Suggestion: profile or time one hot path before changing architecture — often one bottleneck dominates.",
      reason: "optimization_opportunity"
    };
  }

  return { suggestion: null };
}

export function appendBeastSuggestionBlock(reply: string, suggestion: string | null): string {
  if (!suggestion?.trim()) return reply;
  const base = reply.trimEnd();
  const block = `\n\n---\n${suggestion.trim()}`;
  if (base.includes(suggestion.trim())) return reply;
  return `${base}${block}`;
}
