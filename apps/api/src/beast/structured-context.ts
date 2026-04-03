/**
 * Structured context for prompts and inference trace (not raw memory dumps).
 */

export type StructuredContextSignal = {
  kind: "vault" | "device" | "support" | "project" | "operator";
  text: string;
};

export type StructuredContext = {
  /** One-line synthesis for the model. */
  summary: string;
  relevantMemory: Array<{ title: string | null; summary: string; scope: string }>;
  recentMessages: Array<{ role: string; content: string; createdAt?: string }>;
  signals: StructuredContextSignal[];
};

export function estimateContextChars(s: StructuredContext): number {
  let n = s.summary.length;
  for (const m of s.relevantMemory) n += (m.title ?? "").length + m.summary.length + m.scope.length;
  for (const r of s.recentMessages) n += r.role.length + r.content.length;
  for (const g of s.signals) n += g.kind.length + g.text.length;
  return n;
}

function summarizeText(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "…";
}

/**
 * Compact prompt block from structured context; trims recent thread to fit `maxChars`.
 */
export function formatStructuredContextForPrompt(structured: StructuredContext, maxChars: number): string {
  const lines: string[] = [];
  lines.push(`Summary: ${structured.summary}`);

  if (structured.signals.length) {
    lines.push("Signals:");
    for (const g of structured.signals) {
      lines.push(`- [${g.kind}] ${g.text}`);
    }
  }

  if (structured.relevantMemory.length) {
    lines.push("Relevant memory (summarized; vault boundaries respected):");
    for (const m of structured.relevantMemory) {
      const label = m.title ? `${m.title}` : "note";
      lines.push(`- [${m.scope}] ${label}: ${m.summary}`);
    }
  }

  const headerLen = lines.join("\n").length + 32;
  const budget = Math.max(2000, maxChars - headerLen);

  let recent = structured.recentMessages;
  let threadBlock = formatThreadBlock(recent);
  while (threadBlock.length > budget && recent.length > 2) {
    recent = recent.slice(-Math.max(2, recent.length - 2));
    threadBlock = formatThreadBlock(recent);
  }
  if (threadBlock.length > budget) {
    threadBlock = summarizeText(threadBlock, budget);
  }

  lines.push("Recent thread (most recent at bottom):");
  lines.push(threadBlock);

  let out = lines.join("\n");
  if (out.length > maxChars) {
    out = summarizeText(out, maxChars);
  }
  return out;
}

function formatThreadBlock(messages: Array<{ role: string; content: string; createdAt?: string }>): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role === "user" || m.role === "assistant" || m.role === "system") {
      const text = summarizeText((m.content ?? "").replace(/\s+/g, " "), 900);
      parts.push(`${m.role}: ${text}`);
    }
  }
  return parts.join("\n");
}
