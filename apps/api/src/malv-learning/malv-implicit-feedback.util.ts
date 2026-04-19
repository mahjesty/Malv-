const USER_CORRECTION_RE =
  /\b(no,? i meant|actually i meant|not what i|that'?s wrong|wrong answer|you misunderstood|i didn'?t mean|i said)\b/i;

const FOLLOWUP_CLARIFY_RE =
  /\b(clarify|what i mean|to be clear|let me rephrase|in other words|specifically i want)\b/i;

export function detectUserCorrectionPhrase(userMessage: string): boolean {
  return USER_CORRECTION_RE.test(userMessage.trim());
}

export function detectImmediateFollowupClarification(userMessage: string): boolean {
  const t = userMessage.trim();
  if (t.length < 24) return false;
  return FOLLOWUP_CLARIFY_RE.test(t);
}

function tokenizeForOverlap(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2);
}

/** Cheap overlap vs the previous user turn — implicit “same question again”. */
export function detectLikelyUserReask(userMessage: string, priorUserMessages: string[]): boolean {
  const cur = tokenizeForOverlap(userMessage);
  if (cur.length < 4) return false;
  const prev = priorUserMessages
    .map((m) => tokenizeForOverlap(m))
    .filter((t) => t.length >= 4)
    .pop();
  if (!prev || prev.length === 0) return false;
  const set = new Set(prev);
  let hit = 0;
  for (const w of cur) {
    if (set.has(w)) hit++;
  }
  const denom = Math.min(cur.length, prev.length);
  return denom > 0 && hit / denom >= 0.55;
}

export function detectClarificationFrustrationLoop(userMessage: string, lastAssistantContent: string | null): boolean {
  const a = (lastAssistantContent ?? "").trim();
  if (a.length < 14 || !a.includes("?")) return false;
  return USER_CORRECTION_RE.test(userMessage.trim());
}
