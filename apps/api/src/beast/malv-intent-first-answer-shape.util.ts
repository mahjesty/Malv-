/**
 * Lightweight, deterministic question-shape routing for reply style (not product-intent taxonomy).
 * Drives intent-first instructions in {@link buildMalvChatPrompt}.
 */

export type MalvQuestionAnswerShape = "yes_no" | "factual" | "exploratory" | "deep_analysis";

/**
 * Prefer the line that actually carries the question (follow-ups, multi-line prompts),
 * without an extra model pass. Strips weight from trivial leading lines.
 */
function primaryUserIntentSlice(userMessage: string, maxChars: number): string {
  const raw = typeof userMessage === "string" ? userMessage : "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lines = trimmed
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length <= 1) {
    return trimmed.slice(0, maxChars);
  }

  let best = lines[lines.length - 1] ?? trimmed;
  let bestScore = -Infinity;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lower = line.toLowerCase();
    const alnum = line.replace(/[^a-z0-9]/gi, "").length;
    let score = 0;
    if (line.includes("?")) score += 4;
    if (/^\s*why\b/i.test(line)) score += 3;
    if (/^\s*(?:is|are|was|were|does|did|do|can|could|would|will|should|has|have|had)\b/i.test(lower)) score += 2;
    if (/^(?:lol|lmao|ok|okay|k\b|hmm|thanks|thank you|thx|got it|right|sure)\b/i.test(lower) && alnum < 16) score -= 4;
    score += Math.min(alnum, 56) / 12;
    score += i * 0.12;
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  return best.slice(0, maxChars);
}

/**
 * Classify how tightly the assistant should answer for this turn.
 */
export function classifyMalvQuestionAnswerShape(userMessage: string): MalvQuestionAnswerShape {
  const t = primaryUserIntentSlice(userMessage, 520);
  if (!t) return "factual";

  const lower = t.toLowerCase();
  const len = t.length;

  if (
    len > 360 ||
    /\b(deep\s+dive|trade-?offs?|pros\s+and\s+cons|literature\s+review|peer[- ]reviewed|white\s*paper|in[- ]depth\s+analysis)\b/i.test(
      lower
    ) ||
    /\b(compare|contrast|evaluate|critique|analyze\s+(?:the|this|your))\b/i.test(lower)
  ) {
    return "deep_analysis";
  }

  if (
    /^\s*why\b/i.test(t) ||
    /\bexplain\s+(?:why|how)\b/i.test(lower) ||
    /\btell\s+me\s+(?:more\s+)?about\b/i.test(lower) ||
    /^\s*how\s+(?:does|do|is|are|can|could)\b/i.test(t) ||
    /\bwhat\s+(?:are|is)\s+the\s+(?:reasons|implications|risks)\b/i.test(lower)
  ) {
    return "exploratory";
  }

  if (
    /^\s*(?:what|who|when|where|which|how\s+many|how\s+much|how\s+long|how\s+often|define|list|name)\b/i.test(t)
  ) {
    return "factual";
  }

  if (
    len < 200 &&
    /^\s*(?:is|are|was|were|does|did|do|can|could|would|will|should|has|have|had|am|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|won't|shouldn't|hasn't|haven't|hadn't)\b/i.test(
      t
    ) &&
    !/\b(compare|analyze|explain|discuss|describe\s+in\s+detail)\b/i.test(lower)
  ) {
    return "yes_no";
  }

  if (len > 220 && /\b(why|because|implication|argument|thesis)\b/i.test(lower)) {
    return "exploratory";
  }

  return "factual";
}

const SHAPE_RULES: Record<MalvQuestionAnswerShape, string> = {
  yes_no:
    "Treat this as a **yes/no or direct judgment** question: answer it in the **first sentence** (no preamble). Keep the whole reply to **2–4 short sentences** unless the user explicitly asks for more.",
  factual:
    "Treat this as **factual / lookup**: state the answer immediately — **no** scene-setting intro (no “There are several factors…”). Stay on the fact they asked for.",
  exploratory:
    "Treat this as **exploratory**: give a **short** explanation that stays on their question — no filler framing, no tutorial voice, no generic essay layout unless they asked for depth.",
  deep_analysis:
    "Treat this as **deep analysis**: structured sections are fine when they improve clarity — still avoid tutorial drift, unrelated sections, and generic closers."
};

/**
 * Injected into the worker prompt so the model sizes the answer before generation.
 */
export function buildMalvIntentFirstAnswerShapePromptSection(shape: MalvQuestionAnswerShape): string {
  const rule = SHAPE_RULES[shape];
  return `### Intent-first answering (this turn)
Question type: **${shape}**.
${rule}
- **Contract precedence**: if MODE instructions below conflict with this block, follow **intent-first** for how you open and how long you stay (still obey safety, identity lock, and factual honesty).
- **Hard block tutorial mode**: do not write “you can search”, “you can visit”, “to find images”, “steps to” (for discovery), “here’s how to find”, or similar hand-holding.
- **Images / media**: never narrate images or apologize for missing images — the client shows media when it exists.
- **UI**: do not reference buttons, pills, rails, panels, or other interface chrome.
- **Focus**: every sentence should directly help answer what they asked; drop tangents and extra sections.`;
}
