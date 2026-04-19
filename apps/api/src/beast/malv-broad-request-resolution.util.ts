/**
 * Deterministic broad / delegating prompt resolution — criteria + taxonomy-driven
 * (direction *kinds*, not curated final topics). No LLM calls, no randomness.
 */

export type MalvPriorChatTurn = { role: string; content: string };

/** Semantic direction kinds (taxonomy), not concrete subject labels. */
export const MALV_BROAD_ANSWER_DIRECTION_KINDS = [
  "scientific_mechanism",
  "technical_system",
  "social_economic_phenomenon",
  "philosophical_framework",
  "practical_real_world_process",
  "historical_pattern",
  "everyday_hidden_complexity"
] as const;

export type MalvBroadAnswerDirectionKind = (typeof MALV_BROAD_ANSWER_DIRECTION_KINDS)[number];

export type MalvBroadAnswerCandidate = {
  kind: MalvBroadAnswerDirectionKind;
  /** Stable id for logging/tests — not shown to users. */
  id: string;
};

export type MalvBroadRequestContext = {
  /** Recent user/assistant turns (same shape as clarification-relief). */
  priorMessages?: readonly MalvPriorChatTurn[];
};

/** Operational / destructive delegation must never auto-proceed. */
const DESTRUCTIVE_OR_EXFIL_RE =
  /\b(delete|remove\s+all|drop\s+table|truncate|rm\s+-rf|production|wallet\s+seed|private\s+key|transfer\s+funds|wire\s+money|send\s+payment|execute\s+(this\s+)?sql)\b/i;

const MEDICAL_HIGH_STAKES_RE =
  /\b(diagnos(e|is|ing|tic)|prescri(ption|be)|dosage|chemotherapy|am\s+i\s+(pregnant|infected)|symptoms\s+i\s+have|treat(?:ment)?\s+plan\s+for\s+my|should\s+i\s+stop\s+taking\s+my)\b/i;

const LEGAL_HIGH_STAKES_RE =
  /\b(lawsuit|sue\s|being\s+charged|indictment|divorce\s+settlement|custody\s+battle|court\s+order|subpoena)\b/i;

const FINANCIAL_HIGH_STAKES_RE =
  /\b(which\s+stock|should\s+i\s+(buy|sell)\s+(?:crypto|stocks?|bonds?)|guaranteed\s+returns?|tax\s+evasion|margin\s+call|insider\s+trading)\b/i;

const VAGUE_HELP_ONLY_RE = /^(fix(\s+it)?|help|update|change(\s+it)?|do\s+it|ok\.?|thanks?|hmm\.?)$/i;

const EDUCATIONAL_VERB_STEMS: readonly string[] = [
  "explain",
  "teach",
  "describe",
  "discuss",
  "outline",
  "define",
  "show",
  "walk",
  "talk",
  "brainstorm",
  "illustrate",
  "demystify",
  "unpack",
  "break",
  "clarify",
  "understand",
  "learn",
  "explore"
];

const DEPTH_STRUCTURE_MARKERS: readonly string[] = [
  "step",
  "steps",
  "detailed",
  "detail",
  "thorough",
  "complex",
  "depth",
  "deep",
  "breakdown",
  "eli5",
  "rigorous",
  "granular",
  "difficult",
  "hard",
  "challenging",
  "intricate"
];

const OPEN_ENDED_OBJECT_RE =
  /\b(something|anything|whatever|one\s+thing|a\s+topic|an\s+example|random)\s+(interesting|complex|cool|fun|challenging|useful|worthwhile)\b/i;

const DELEGATION_LEXEMES: readonly string[] = [
  "anything",
  "whatever",
  "surprise",
  "choose",
  "choice",
  "call",
  "pick",
  "either",
  "topic",
  "dealers",
  "dealer",
  "ahead",
  "works",
  "please",
  "yeah",
  "yep",
  "fine"
];

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1);
}

function countTokenHits(haystack: string, needles: readonly string[]): number {
  const words = new Set(normalizeWords(haystack));
  let n = 0;
  for (const stem of needles) {
    for (const w of words) {
      if (w === stem || w.startsWith(stem)) {
        n++;
        break;
      }
    }
  }
  return n;
}

function wordCount(text: string): number {
  return normalizeWords(text).length;
}

/** Same contract as legacy export — broadened with safety tiers. */
export function shouldTreatClarificationReliefAsUnsafe(trimmed: string): boolean {
  const m = trimmed.toLowerCase();
  return (
    DESTRUCTIVE_OR_EXFIL_RE.test(m) ||
    MEDICAL_HIGH_STAKES_RE.test(m) ||
    LEGAL_HIGH_STAKES_RE.test(m) ||
    FINANCIAL_HIGH_STAKES_RE.test(m)
  );
}

/**
 * Delegation: permission for MALV to pick angle/topic — criteria + compact phrasing,
 * not a single brittle phrase list for classification outcome.
 */
export function isUserDelegatingTopicChoice(trimmed: string): boolean {
  const t = trimmed.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (shouldTreatClarificationReliefAsUnsafe(t)) return false;

  const lower = t.toLowerCase();
  const wc = wordCount(lower);

  /** Whole-message delegation / affirmation (bounded length). */
  if (
    wc <= 10 &&
    /^(anything|whatever|surprise\s+me|you\s+choose|your\s+choice|your\s+call|pick\s+one(\s+for\s+me)?|either\s+is\s+fine|any\s+topic|any\s+is\s+fine|dealer'?s\s+choice|up\s+to\s+you|go\s+ahead|sounds?\s+good|that\s+works|ok\s+go|yes\s+please|just\s+pick|you\s+pick|yes\.?|yep|yeah|ok\.?)$/i.test(
      lower
    )
  ) {
    return true;
  }

  const delegationHits = countTokenHits(lower, DELEGATION_LEXEMES);
  const hasDelegationLexeme =
    /\b(anything|whatever|surprise\s+me|you\s+choose|your\s+choice|pick\s+one|up\s+to\s+you|dealer'?s\s+choice)\b/i.test(
      lower
    );

  if (lower.length <= 72 && wc <= 10 && hasDelegationLexeme && delegationHits >= 1) {
    return true;
  }

  /** Short messages where delegation lexemes dominate (avoids "whatever happens with the API" false positives). */
  if (lower.length <= 56 && wc <= 8 && delegationHits >= 2) {
    return true;
  }

  return false;
}

/** @deprecated Prefer {@link isUserDelegatingTopicChoice}; alias for spec/API symmetry. */
export const isUserDelegatingChoice = isUserDelegatingTopicChoice;

function scoreEducationalIntent(lower: string): number {
  const verbs = countTokenHits(lower, EDUCATIONAL_VERB_STEMS);
  const depth = countTokenHits(lower, DEPTH_STRUCTURE_MARKERS);
  let s = 0;
  if (verbs >= 1) s += 0.34;
  if (verbs >= 2) s += 0.12;
  if (depth >= 1) s += 0.28;
  if (depth >= 2) s += 0.1;
  if (OPEN_ENDED_OBJECT_RE.test(lower)) s += 0.22;
  if (/\b(understand|learning|lesson|tutorial|walkthrough|guide\s+me)\b/.test(lower)) s += 0.14;
  if (/\b(example|case\s+study|analogy)\b/.test(lower)) s += 0.08;
  return Math.min(1, s);
}

function scoreExploratoryIntent(lower: string): number {
  let s = 0;
  if (/\b(brainstorm|ideas|angles|possibilities|explore|interesting|curious)\b/.test(lower)) s += 0.35;
  if (/\b(open[-\s]?ended|general|broad|big\s+picture)\b/.test(lower)) s += 0.2;
  return Math.min(1, s);
}

function scoreTransactionalMissingDetailRisk(lower: string): number {
  /** Higher => more likely a real-world action needs specifics — block broad relief. */
  let r = 0;
  if (/\b(my\s+account|invoice|ticket\s+number|order\s+id|repo|repository|branch|workspace|database\s+name)\b/.test(lower)) {
    r += 0.35;
  }
  if (/\b(schedule|book|reserve|cancel\s+my|refund|chargeback|ship\s+to)\b/.test(lower)) r += 0.25;
  if (/\b(password|reset\s+link|two[-\s]?factor|2fa)\b/.test(lower)) r += 0.2;
  return Math.min(1, r);
}

/**
 * Broad-but-answerable: open-ended yet MALV can deliver value without missing *material* anchors.
 * Uses weighted criteria, not a closed list of allowed user sentences.
 */
export function isBroadButAnswerableUserRequest(trimmed: string): boolean {
  const m = trimmed.trim();
  if (!m || shouldTreatClarificationReliefAsUnsafe(m)) return false;
  const lower = m.toLowerCase();
  if (VAGUE_HELP_ONLY_RE.test(lower)) return false;

  if (isUserDelegatingTopicChoice(m)) return true;

  const edu = scoreEducationalIntent(lower);
  const explore = scoreExploratoryIntent(lower);
  const transactional = scoreTransactionalMissingDetailRisk(lower);

  const combined = edu * 0.62 + explore * 0.28 - transactional * 0.55;
  const wc = wordCount(lower);
  const lengthBoost = wc >= 6 ? 0.06 : wc >= 4 ? 0.02 : 0;

  return combined + lengthBoost >= 0.42;
}

/**
 * Constraint cues for downstream steering — same lexical basis as broad scoring / candidate boosts
 * (no new heuristics).
 */
export function inferMalvUserPromptConstraintSignals(trimmed: string): { wantsStepByStep: boolean; wantsDepth: boolean } {
  const lower = trimmed.toLowerCase();
  const wantsStepByStep = /\b(step|steps|walkthrough|walk\s+me|break\s+it\s+down)\b/.test(lower);
  const depthHits = countTokenHits(lower, DEPTH_STRUCTURE_MARKERS);
  const wantsDepth = depthHits >= 1;
  return { wantsStepByStep, wantsDepth };
}

function stableTieKey(kind: MalvBroadAnswerDirectionKind, userMessage: string): number {
  const s = `${userMessage}::${kind}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h / 0xffffffff;
}

export function generateBroadAnswerCandidates(
  userMessage: string,
  _context?: MalvBroadRequestContext
): MalvBroadAnswerCandidate[] {
  void _context;
  /** Stable permutation of taxonomy rows — not topic selection; keeps generation sensitive to wording without RNG. */
  const kinds = [...MALV_BROAD_ANSWER_DIRECTION_KINDS].sort((a, b) => {
    const ha = stableTieKey(a, userMessage);
    const hb = stableTieKey(b, userMessage);
    if (ha !== hb) return ha - hb;
    return a.localeCompare(b);
  });
  return kinds.map((kind) => ({
    kind,
    id: `dir:${kind}`
  }));
}

const KIND_DEPTH: Record<MalvBroadAnswerDirectionKind, number> = {
  scientific_mechanism: 0.92,
  technical_system: 0.9,
  everyday_hidden_complexity: 0.88,
  practical_real_world_process: 0.86,
  historical_pattern: 0.82,
  social_economic_phenomenon: 0.8,
  philosophical_framework: 0.78
};

const KIND_STEPWISE: Record<MalvBroadAnswerDirectionKind, number> = {
  technical_system: 0.95,
  practical_real_world_process: 0.93,
  scientific_mechanism: 0.9,
  everyday_hidden_complexity: 0.88,
  historical_pattern: 0.84,
  social_economic_phenomenon: 0.8,
  philosophical_framework: 0.72
};

function kindRelevanceToUserText(kind: MalvBroadAnswerDirectionKind, lower: string): number {
  const hits = (words: string[]) => words.reduce((a, w) => a + (lower.includes(w) ? 1 : 0), 0);
  switch (kind) {
    case "philosophical_framework":
      return 0.12 + 0.22 * hits(["philosophy", "moral", "ethics", "meaning", "existential", "fairness", "justice"]);
    case "social_economic_phenomenon":
      return 0.12 + 0.22 * hits(["society", "economy", "market", "policy", "inequality", "culture", "people"]);
    case "historical_pattern":
      return 0.12 + 0.22 * hits(["history", "historical", "war", "empire", "revolution", "timeline"]);
    case "technical_system":
      return 0.12 + 0.18 * hits(["system", "software", "architecture", "protocol", "stack", "api", "engine"]);
    case "scientific_mechanism":
      return 0.12 + 0.2 * hits(["science", "physics", "chemistry", "biology", "how does", "mechanism", "why does"]);
    case "practical_real_world_process":
      return 0.12 + 0.18 * hits(["process", "workflow", "operations", "how things get", "supply"]);
    case "everyday_hidden_complexity":
    default:
      return 0.18 + 0.12 * hits(["everyday", "hidden", "behind the scenes", "real world", "ordinary"]);
  }
}

function contextFitScore(kind: MalvBroadAnswerDirectionKind, context?: MalvBroadRequestContext): number {
  const prior = context?.priorMessages ?? [];
  if (prior.length === 0) return 0;
  const tail = prior
    .slice(-4)
    .map((m) => String(m.content ?? "").toLowerCase())
    .join(" ");
  return kindRelevanceToUserText(kind, tail) * 0.85;
}

function safetyKindBias(kind: MalvBroadAnswerDirectionKind): number {
  /** Prefer explanatory, non-prescriptive angles under open delegation. */
  if (kind === "philosophical_framework") return 0.02;
  if (kind === "social_economic_phenomenon") return 0.04;
  return 0.08;
}

/**
 * Deterministic weighted score — interpretable components, no RNG, no LLM.
 */
export function scoreBroadAnswerCandidate(
  candidate: MalvBroadAnswerCandidate,
  userMessage: string,
  context?: MalvBroadRequestContext
): number {
  const lower = userMessage.toLowerCase();
  const relevance = kindRelevanceToUserText(candidate.kind, lower) * 0.28;
  const depth = KIND_DEPTH[candidate.kind] * 0.18;
  const stepwise = KIND_STEPWISE[candidate.kind] * 0.2;
  const clarity = 0.12;
  const usefulness = (KIND_DEPTH[candidate.kind] + KIND_STEPWISE[candidate.kind]) * 0.07;
  const interesting = KIND_DEPTH[candidate.kind] * 0.06;
  const nonTrivial = candidate.kind === "everyday_hidden_complexity" ? 0.08 : 0.06;
  const safety = safetyKindBias(candidate.kind);
  const ctx = contextFitScore(candidate.kind, context) * 0.15;

  const wantsSteps = /\b(step|steps|walkthrough|walk\s+me|break\s+it\s+down)\b/.test(lower);
  const stepBoost = wantsSteps ? KIND_STEPWISE[candidate.kind] * 0.08 : 0;

  return relevance + depth + stepwise + clarity + usefulness + interesting + nonTrivial + safety + ctx + stepBoost;
}

export function selectBestBroadAnswerCandidate(
  candidates: MalvBroadAnswerCandidate[],
  userMessage: string,
  context?: MalvBroadRequestContext
): MalvBroadAnswerCandidate | null {
  if (candidates.length === 0) return null;
  const scored = candidates.map((c) => ({
    c,
    score: scoreBroadAnswerCandidate(c, userMessage, context)
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ak = a.c.kind;
    const bk = b.c.kind;
    const tieA = stableTieKey(ak, userMessage);
    const tieB = stableTieKey(bk, userMessage);
    if (tieB !== tieA) return tieB - tieA;
    return ak.localeCompare(bk);
  });
  return scored[0]?.c ?? null;
}

function directionWorkerGuidance(kind: MalvBroadAnswerDirectionKind): string {
  switch (kind) {
    case "scientific_mechanism":
      return "Pick one concrete real-world mechanism, name it plainly in the opening line, then explain how it works in clear ordered steps.";
    case "technical_system":
      return "Pick one layered technical system people rely on, name it in the opening line, then walk through its structure and tradeoffs stepwise.";
    case "social_economic_phenomenon":
      return "Pick one social or economic pattern that shapes everyday outcomes, name it up front, then unpack causes, feedback loops, and limits.";
    case "philosophical_framework":
      return "Pick one useful conceptual lens (not name-dropping for its own sake), state it plainly, then apply it with a tight example.";
    case "practical_real_world_process":
      return "Pick one practical end-to-end process with visible stages, name it immediately, then guide through the sequence.";
    case "historical_pattern":
      return "Pick one historically grounded pattern with a clear timeline hook, name it in line one, then connect causes, events, and lessons.";
    case "everyday_hidden_complexity":
    default:
      return "Pick an ordinary activity with surprising hidden complexity, name it right away, then reveal the moving parts step by step.";
  }
}

export type BroadPromptExecutionPolicyAction = "proceed" | "clarify" | "guarded";

export type ResolveBroadPromptExecutionPolicyArgs = {
  userMessage: string;
  context?: MalvBroadRequestContext;
  /**
   * When true, caller already knows the last assistant turn asked for clarification —
   * enables short contextual hand-backs without repeating full broad phrasing.
   */
  userReplyFollowsAssistantClarification?: boolean;
};

export type BroadPromptExecutionPolicy = {
  action: BroadPromptExecutionPolicyAction;
  reason: string;
  bestCandidate: MalvBroadAnswerCandidate | null;
  /** Model-facing constraint line(s); no pipeline jargon. */
  workerGuidance: string | null;
};

export function resolveBroadPromptExecutionPolicy(args: ResolveBroadPromptExecutionPolicyArgs): BroadPromptExecutionPolicy {
  const msg = args.userMessage.replace(/\s+/g, " ").trim();
  if (!msg) {
    return { action: "clarify", reason: "empty_message", bestCandidate: null, workerGuidance: null };
  }
  if (shouldTreatClarificationReliefAsUnsafe(msg)) {
    return { action: "guarded", reason: "high_risk_domain_or_destructive", bestCandidate: null, workerGuidance: null };
  }
  if (VAGUE_HELP_ONLY_RE.test(msg.toLowerCase())) {
    return { action: "clarify", reason: "bare_low_information", bestCandidate: null, workerGuidance: null };
  }

  const delegating = isUserDelegatingTopicChoice(msg);
  const broadAnswerable = isBroadButAnswerableUserRequest(msg);
  const lowerMsg = msg.toLowerCase();
  const contextualNarrowing =
    /\b(option|choice|path|route|approach|backend|frontend|api|database|auth|deploy|ui|stack|first|second|third|the\s+\w+\s+(one|path|option))\b/i.test(
      lowerMsg
    ) ||
    /\d/.test(lowerMsg) ||
    lowerMsg.length >= 36;

  const contextualShort =
    Boolean(args.userReplyFollowsAssistantClarification) &&
    msg.length >= 6 &&
    msg.length <= 140 &&
    wordCount(msg) >= 2 &&
    wordCount(msg) <= 24 &&
    !VAGUE_HELP_ONLY_RE.test(lowerMsg) &&
    contextualNarrowing;

  if (!delegating && !broadAnswerable && !contextualShort) {
    return { action: "clarify", reason: "no_broad_or_delegation_signal", bestCandidate: null, workerGuidance: null };
  }

  const candidates = generateBroadAnswerCandidates(msg, args.context);
  const best = selectBestBroadAnswerCandidate(candidates, msg, args.context);
  const workerGuidance = best
    ? `${directionWorkerGuidance(best.kind)} Keep the reply natural — do not mention scoring, candidates, routing, or internal mechanisms.`
    : null;

  return {
    action: "proceed",
    reason: delegating
      ? "user_delegation"
      : broadAnswerable
        ? "broad_answerable"
        : "contextual_post_clarification",
    bestCandidate: best,
    workerGuidance
  };
}

/** Merge admin directive text with broad-answer steering (deterministic). */
export function mergeMalvDirectiveExtras(base: string | null | undefined, broad: string | null | undefined): string | undefined {
  const b = base?.trim() ?? "";
  const br = broad?.trim() ?? "";
  const out = [b, br].filter((x) => x.length > 0).join("\n\n");
  return out.length > 0 ? out : undefined;
}
