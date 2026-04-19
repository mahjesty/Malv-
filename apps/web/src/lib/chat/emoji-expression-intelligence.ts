/**
 * MALV Emoji Expression Intelligence — surface-level polish only.
 * Decides whether, how many, and which emoji may appear on assistant chat replies.
 * Core model reasoning stays unchanged; this layer runs on finalized text before display.
 */

export type MalvResponseSurfaceKind = "assistant_chat_reply" | "error_message" | "system_notice";

/** Coarse communication mode for policy (derived deterministically from text + context). */
export type MalvExpressionTone =
  | "professional"
  | "warm"
  | "playful"
  | "reassuring"
  | "celebratory"
  | "empathetic"
  | "focused"
  | "serious"
  | "corrective"
  | "excited";

export type EmojiVocabularyTier = "premium_subtle" | "conditional_expressive" | "rare_special" | "forbidden";

export type EmojiDensity = "none" | "subtle" | "expressive";

export type EmojiInsertionPlacement = "prose_prefix" | "prose_suffix";

export type EmojiInsertion = {
  emoji: string;
  placement: EmojiInsertionPlacement;
  tier: EmojiVocabularyTier;
};

export type EmojiPolicyContext = {
  responseText: string;
  responseKind: MalvResponseSurfaceKind;
  /** Plain last user turn (for mirroring / formality / frustration heuristics). */
  lastUserMessage?: string;
};

export type EmojiPolicyDecision = {
  shouldUseEmoji: boolean;
  allowedCount: 0 | 1 | 2;
  emojiDensity: EmojiDensity;
  emojiStyle: "none" | "subtle" | "expressive";
  inferredTone: MalvExpressionTone;
  insertions: EmojiInsertion[];
  /** Short stable code for dev logs — not shown to end users. */
  reasoning: string;
  /** Longer explanation when `includeDebugReason` is true. */
  debugPolicyReason?: string;
};

export type EmojiExpressionResult = {
  transformedText: string;
  decision: EmojiPolicyDecision;
};

/** Brand-safe vocabulary — centralized for tuning. */
export const MALV_EMOJI_VOCABULARY = {
  premiumSubtle: ["✨", "🙂", "💛", "🙌", "👍", "🚀", "✅"] as const,
  conditionalExpressive: ["🎉", "🔥", "😌", "🤍"] as const,
  rareSpecial: ["😄", "😅"] as const
} as const;

const ALL_ALLOWED = new Set<string>([
  ...MALV_EMOJI_VOCABULARY.premiumSubtle,
  ...MALV_EMOJI_VOCABULARY.conditionalExpressive,
  ...MALV_EMOJI_VOCABULARY.rareSpecial
]);

const SENSITIVE_ASSISTANT = /\b(legal advice|not a lawyer|attorney|medical advice|not a doctor|diagnos|prescription|suicide|self-?harm|crisis hotline|confidential data|password|credential|api key|token leak)\b/i;

const SENSITIVE_USER = /\b(suicide|self-?harm|kill myself|depressed|abuse|lawyer|lawsuit|medical|diagnos|prescription)\b/i;

const ERROR_LIKE = /^(error|fatal)\b|exception\b|stack trace|ECONNREFUSED|timed out|failed to (connect|fetch)|\b502\b|\b503\b/i;

const CELEBRATORY = /\b(congratulations|congrats|great work|well done|you('ve| have) (shipped|nailed|done)|milestone|breakthrough|launched|ship(ped)?|victory|we did it)\b/i;

const ENCOURAGING = /\b(you're on the right|on the right track|nice progress|solid work|keep going|making progress|almost there)\b/i;

const PLAYFUL_USER = /\b(lol|haha|lmao|jk|😄|🎉|✨|🚀)\b/i;

const FRUSTRATED_USER = /\b(doesn't work|does not work|broken|useless|frustrat|annoyed|angry|wtf|terrible|awful|hate this|garbage)\b/i;

const FORMAL_USER = /\b(dear sir|dear madam|sincerely|best regards|kind regards|to whom it may)\b/i;

function countEmoji(s: string): number {
  const m = s.match(/\p{Extended_Pictographic}/gu);
  return m?.length ?? 0;
}

function splitPreservingFences(text: string): { segments: string[]; isFence: boolean[] } {
  const re = /(```[\s\S]*?```)/g;
  const segments: string[] = [];
  const isFence: boolean[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push(text.slice(last, m.index));
      isFence.push(false);
    }
    segments.push(m[0]);
    isFence.push(true);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push(text.slice(last));
    isFence.push(false);
  }
  if (segments.length === 0) {
    segments.push(text);
    isFence.push(false);
  }
  return { segments, isFence };
}

function hasFencedCode(text: string): boolean {
  return /```[\s\S]*?```/.test(text);
}

function nonFenceProseText(text: string): string {
  const { segments, isFence } = splitPreservingFences(text);
  return segments.filter((_, i) => !isFence[i]).join("\n");
}

function looksHighlyTechnical(text: string): boolean {
  /** Code-first replies: little prose outside fences → keep emoji out entirely. */
  if (hasFencedCode(text) && nonFenceProseText(text).trim().length < 72) return true;
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length >= 12) {
    const codey = lines.filter((l) => /[{}\[\];]|^\s{4,}\S|^\s*\w+\(|=>|import |export |def |fn |const |let |var /.test(l)).length;
    if (codey / lines.length > 0.45) return true;
  }
  return /\b(stack|heap|segmentation fault|typescript|javascript|python|rust|kubernetes|dockerfile)\b/i.test(text) && lines.length > 8;
}

function userUsedEmojiRecently(user?: string): boolean {
  if (!user?.trim()) return false;
  return countEmoji(user) > 0 || PLAYFUL_USER.test(user);
}

function userSeemsFormal(user?: string): boolean {
  if (!user?.trim()) return false;
  return FORMAL_USER.test(user);
}

function userSeemsFrustrated(user?: string): boolean {
  if (!user?.trim()) return false;
  return FRUSTRATED_USER.test(user);
}

function userSeemsCelebratory(user?: string): boolean {
  if (!user?.trim()) return false;
  return /\b(yay|woohoo|finally|shipped|won|nailed it|love it|amazing)\b/i.test(user) || countEmoji(user) > 0;
}

function inferTone(response: string, user?: string): MalvExpressionTone {
  const r = response.toLowerCase();
  if (ERROR_LIKE.test(response) || SENSITIVE_ASSISTANT.test(response)) return "serious";
  if (/\b(incorrect|wrong|actually,|that won't work|misunderstanding)\b/i.test(r)) return "corrective";
  if (looksHighlyTechnical(response)) return "focused";
  if (/\b(per our policy|compliance|pursuant|legally binding)\b/i.test(r)) return "professional";
  if (CELEBRATORY.test(r)) return "celebratory";
  if (/\b(i understand this is|i'm sorry|that sounds hard|take care)\b/i.test(r)) return "empathetic";
  if (ENCOURAGING.test(r)) return "reassuring";
  if (/\b(fun|playful|silly|wild idea|brainstorm)\b/i.test(r) || (user && PLAYFUL_USER.test(user))) return "playful";
  if (/\b(let's|we can|together|collaborate)\b/i.test(r)) return "warm";
  return "warm";
}

function relationalEmoji(args: {
  tone: MalvExpressionTone;
  density: EmojiDensity;
  response: string;
  user?: string;
}): { emoji: string; tier: EmojiVocabularyTier } | null {
  const { tone, density, response, user } = args;
  const r = response.toLowerCase();

  if (tone === "celebratory" || tone === "excited") {
    if (/\b(ship|launch|release|deploy|production)\b/i.test(r)) return { emoji: "🚀", tier: "premium_subtle" };
    if (density === "expressive") return { emoji: "🎉", tier: "conditional_expressive" };
    return { emoji: "✨", tier: "premium_subtle" };
  }

  if (tone === "reassuring" || tone === "warm") {
    if (/\b(done|complete|finished|fixed|resolved|✓)\b/i.test(r)) return { emoji: "✅", tier: "premium_subtle" };
    return { emoji: "✨", tier: "premium_subtle" };
  }

  if (tone === "playful") {
    if (density === "expressive" && userUsedEmojiRecently(user)) return { emoji: "😌", tier: "conditional_expressive" };
    return { emoji: "🙂", tier: "premium_subtle" };
  }

  if (tone === "empathetic") {
    if (userSeemsFrustrated(user)) return null;
    return { emoji: "🤍", tier: "conditional_expressive" };
  }

  return null;
}

function proseParagraphCount(prose: string): number {
  const parts = prose
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return Math.max(1, parts.length);
}

function bookendParagraphsInProse(prose: string, open: string, close: string): string {
  const paras = prose.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length === 0) return prose;
  if (paras.length === 1) {
    const only = paras[0]!;
    return `${open} ${only.trimStart()}`.trimEnd() + ` ${close}`;
  }
  paras[0] = `${open} ${paras[0]!.trimStart()}`;
  const li = paras.length - 1;
  const last = paras[li]!.trimEnd();
  const spacer = /[.!?,;:…)]$/.test(last) ? " " : " ";
  paras[li] = `${last}${spacer}${close}`;
  return paras.join("\n\n");
}

/** Prefix/suffix across prose segments; never touches fenced code. */
function bookendAcrossProseSegments(text: string, open: string, close: string): string {
  const { segments, isFence } = splitPreservingFences(text);
  const proseIdx = segments.map((_, i) => i).filter((i) => !isFence[i] && segments[i]!.trim());
  if (proseIdx.length === 0) return text;
  const fi = proseIdx[0]!;
  const li = proseIdx[proseIdx.length - 1]!;

  if (fi === li) {
    segments[fi] = bookendParagraphsInProse(segments[fi]!, open, close);
  } else {
    segments[fi] = `${open} ${segments[fi]!.trimStart()}`;
    const last = segments[li]!.trimEnd();
    const spacer = /[.!?,;:…)]$/.test(last) ? " " : " ";
    segments[li] = `${last}${spacer}${close}`;
  }
  return segments.join("");
}

/** Append a single allowed emoji to the end of the last prose segment (never inside fences). */
function appendEmojiOutsideFences(text: string, emoji: string): string {
  const { segments, isFence } = splitPreservingFences(text);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (isFence[i]) continue;
    const prose = segments[i]!;
    if (!prose.trim()) continue;
    const trimmed = prose.trimEnd();
    const spacer = /[.!?,;:…)]$/.test(trimmed) ? " " : " ";
    segments[i] = `${trimmed}${spacer}${emoji}`;
    return segments.join("");
  }
  return text;
}

/**
 * Deterministic policy: same context + text → same decision (given stable heuristics).
 */
export function decideEmojiPolicy(ctx: EmojiPolicyContext, opts?: { includeDebugReason?: boolean }): EmojiPolicyDecision {
  const text = ctx.responseText ?? "";
  const user = ctx.lastUserMessage;
  const debug: string[] = [];

  const none = (reasoning: string, tone: MalvExpressionTone = "professional"): EmojiPolicyDecision => ({
    shouldUseEmoji: false,
    allowedCount: 0,
    emojiDensity: "none",
    emojiStyle: "none",
    inferredTone: tone,
    insertions: [],
    reasoning,
    debugPolicyReason: opts?.includeDebugReason ? debug.join(" | ") : undefined
  });

  if (ctx.responseKind !== "assistant_chat_reply") {
    debug.push("surface_not_chat_reply");
    return none("not_chat_surface");
  }

  const trimmed = text.trim();
  if (!trimmed) {
    debug.push("empty_response");
    return none("empty");
  }

  if (SENSITIVE_ASSISTANT.test(text) || SENSITIVE_USER.test(user ?? "")) {
    debug.push("sensitive_context");
    return none("sensitive", "serious");
  }

  if (ERROR_LIKE.test(text)) {
    debug.push("error_like_copy");
    return none("error_like", "serious");
  }

  if (userSeemsFrustrated(user)) {
    debug.push("user_frustrated");
    return none("user_frustrated", "serious");
  }

  if (looksHighlyTechnical(text)) {
    debug.push("technical_density");
    return none("technical", "focused");
  }

  const existing = countEmoji(text);
  if (existing >= 2) {
    debug.push("already_emoji_rich");
    return none("already_two_plus_emoji");
  }
  if (existing >= 1) {
    debug.push("preserve_model_emoji");
    return none("already_has_emoji");
  }

  const tone = inferTone(text, user);
  debug.push(`tone=${tone}`);

  if (tone === "serious" || tone === "corrective" || tone === "focused" || tone === "professional") {
    return {
      shouldUseEmoji: false,
      allowedCount: 0,
      emojiDensity: "none",
      emojiStyle: "none",
      inferredTone: tone,
      insertions: [],
      reasoning: "tone_blocks_emoji",
      debugPolicyReason: opts?.includeDebugReason ? debug.join(" | ") : undefined
    };
  }

  let density: EmojiDensity = "subtle";
  if (tone === "celebratory" || tone === "excited") density = "expressive";
  else if (tone === "playful" && userUsedEmojiRecently(user)) density = "expressive";
  else if (userSeemsCelebratory(user) && (tone === "warm" || tone === "reassuring")) density = "expressive";

  if (userSeemsFormal(user)) {
    density = "subtle";
    if (tone === "playful") {
      return {
        shouldUseEmoji: false,
        allowedCount: 0,
        emojiDensity: "none",
        emojiStyle: "none",
        inferredTone: tone,
        insertions: [],
        reasoning: "formal_user_playful_clash",
        debugPolicyReason: opts?.includeDebugReason ? debug.join(" | ") : undefined
      };
    }
  }

  let allowedCount: 0 | 1 | 2 = density === "expressive" ? 2 : 1;
  if (userSeemsFormal(user)) allowedCount = 1;
  if (density === "expressive" && !userUsedEmojiRecently(user) && tone !== "celebratory" && tone !== "excited") {
    allowedCount = 1;
  }
  if (proseParagraphCount(text) < 2) allowedCount = Math.min(allowedCount, 1) as 0 | 1 | 2;

  const picked = relationalEmoji({ tone, density, response: text, user });
  if (!picked || !ALL_ALLOWED.has(picked.emoji)) {
    debug.push("no_relational_fit");
    return {
      shouldUseEmoji: false,
      allowedCount: 0,
      emojiDensity: "none",
      emojiStyle: "none",
      inferredTone: tone,
      insertions: [],
      reasoning: "no_emoji_selected",
      debugPolicyReason: opts?.includeDebugReason ? debug.join(" | ") : undefined
    };
  }

  const insertions: EmojiInsertion[] = [];
  if (allowedCount === 2 && density === "expressive" && (tone === "celebratory" || tone === "excited") && userUsedEmojiRecently(user)) {
    insertions.push({ emoji: "✨", placement: "prose_prefix", tier: "premium_subtle" });
    insertions.push({ emoji: "🎉", placement: "prose_suffix", tier: "conditional_expressive" });
  } else {
    insertions.push({ emoji: picked.emoji, placement: "prose_suffix", tier: picked.tier });
    allowedCount = 1;
  }

  return {
    shouldUseEmoji: true,
    allowedCount,
    emojiDensity: density,
    emojiStyle: density,
    inferredTone: tone,
    insertions,
    reasoning: "applied",
    debugPolicyReason: opts?.includeDebugReason ? debug.join(" | ") : undefined
  };
}

function applyInsertions(text: string, decision: EmojiPolicyDecision): string {
  if (!decision.shouldUseEmoji || decision.insertions.length === 0) return text;
  if (decision.insertions.length === 2) {
    return bookendAcrossProseSegments(text, decision.insertions[0]!.emoji, decision.insertions[1]!.emoji);
  }
  const one = decision.insertions[0]!;
  if (one.placement === "prose_prefix") {
    const { segments, isFence } = splitPreservingFences(text);
    for (let i = 0; i < segments.length; i++) {
      if (!isFence[i] && segments[i]!.trim()) {
        segments[i] = `${one.emoji} ${segments[i]!.trimStart()}`;
        return segments.join("");
      }
    }
    return text;
  }
  return appendEmojiOutsideFences(text, one.emoji);
}

/**
 * Public entry: run policy and return possibly adjusted surface text for rendering.
 */
export function applyMalvEmojiExpressionLayer(
  ctx: EmojiPolicyContext,
  opts?: { includeDebugReason?: boolean }
): EmojiExpressionResult {
  const decision = decideEmojiPolicy(ctx, opts);
  if (!decision.shouldUseEmoji) {
    return { transformedText: ctx.responseText, decision };
  }
  const transformedText = applyInsertions(ctx.responseText, decision);
  return { transformedText, decision };
}
