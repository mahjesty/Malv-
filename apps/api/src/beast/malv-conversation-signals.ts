/**
 * Lightweight, deterministic user-message signals for tone shaping (no LLM).
 */

export type MalvUserTone =
  | "neutral"
  | "frustrated"
  | "urgent"
  | "confused"
  | "exploratory"
  | "technical"
  | "emotional"
  | "casual"
  | "direct"
  | "builder"
  | "identity_query"
  | "dissatisfied"
  | "sensitive";

export type MalvUrgency = "low" | "medium" | "high";
export type MalvDepthPreference = "direct" | "balanced" | "deep";
export type MalvEmotionalSensitivity = "low" | "medium" | "high";

export type UserToneAnalysis = {
  userTone: MalvUserTone;
  urgency: MalvUrgency;
  depthPreference: MalvDepthPreference;
  emotionalSensitivity: MalvEmotionalSensitivity;
  /** Compact reasons for trace/debug */
  toneReasons: string[];
};

export type MalvUserMoodHint = "stressed" | "calm" | "urgent" | "focused" | "neutral";

/**
 * Phase 5 — optional UI/workspace mood nudge layered on deterministic {@link analyzeUserTone}.
 */
export function mergeExplicitMoodHint(base: UserToneAnalysis, hint: MalvUserMoodHint | null | undefined): UserToneAnalysis {
  if (!hint || hint === "neutral") return base;
  const toneReasons = [...base.toneReasons.filter((r) => !r.startsWith("explicit_mood:")), `explicit_mood:${hint}`];
  switch (hint) {
    case "stressed":
      return {
        ...base,
        userTone:
          base.userTone === "neutral" || base.userTone === "casual" || base.userTone === "direct" ? "emotional" : base.userTone,
        urgency: base.urgency === "low" ? "medium" : base.urgency,
        emotionalSensitivity: base.emotionalSensitivity === "low" ? "high" : base.emotionalSensitivity,
        toneReasons
      };
    case "calm":
      return {
        ...base,
        userTone: base.userTone === "frustrated" || base.userTone === "dissatisfied" ? "neutral" : base.userTone,
        urgency: "low",
        toneReasons
      };
    case "urgent":
      return {
        ...base,
        urgency: "high",
        toneReasons
      };
    case "focused":
      return {
        ...base,
        userTone: base.userTone === "neutral" || base.userTone === "casual" ? "technical" : base.userTone,
        depthPreference: "direct",
        toneReasons
      };
    default:
      return base;
  }
}

export type IdentityQuestionKind =
  | "name"
  | "who"
  | "what"
  | "capabilities"
  | "ai"
  | "creator"
  | "founder"
  | "company"
  | "origin"
  | "model"
  | "powered_by"
  | "based_on"
  | "comparison";

export type LightSocialKind = "thanks" | "goodnight" | "presence_ping" | "amused_ack";

const PROFANITY_OR_STRONG_ANNOYANCE = /\b(damn|hell|wtf|bs\b|bullshit|screw\s+this|waste\s+of\s+time)\b/i;
const FRUSTRATION_MARKERS =
  /\b(this\s+is\s+(ridiculous|broken|unacceptable)|fed\s+up|sick\s+of|not\s+working|still\s+not|again\??|useless|terrible|awful)\b/i;
const URGENCY_MARKERS = /\b(asap|urgent|immediately|right\s+now|production\s+is\s+down|blocking|p0|sev\s*0|emergency)\b/i;
const CONFUSED_MARKERS =
  /\b(i\s+don'?t\s+understand|confused|lost|not\s+sure\s+what|what\s+do\s+you\s+mean|can\s+you\s+explain|huh\??)\b/i;
const UNCERTAINTY = /\b(maybe|i\s+think|not\s+sure|idk|i\s+guess|probably\s+wrong)\b/i;
const EXPLORATORY = /\b(options|tradeoffs|alternatives|brainstorm|ideas|what\s+if|should\s+i)\b/i;
const TECHNICAL = /\b(stack\s+trace|segfault|null\s+pointer|typescript|kubernetes|docker|api\s+error|http\s+\d{3}|npm\s+|pnpm\s+|stack)\b/i;
const BUILDER = /\b(scaffold|mvp|roadmap|architecture|design\s+doc|implementation\s+plan|build\s+this)\b/i;
const EMOTIONAL_SOFT = /\b(stressed|overwhelmed|worried|scared|anxious|burnout|exhausted)\b/i;
const DISSATISFACTION = /\b(that'?s\s+wrong|not\s+helpful|you\s+didn'?t|missed\s+the\s+point|stop\s+ignoring|listen)\b/i;

function stripGreetingAndNoise(raw: string): string {
  let t = raw.trim().toLowerCase();
  t = t.replace(/[’`]/g, "'");
  t = t.replace(/^(hi|hello|hey|yo|sup)[,!. ]+\s*/i, "");
  t = t.replace(/[?.!]+$/g, "").trim();
  return t.replace(/\s+/g, " ");
}

/** Single-line or time-of-day greetings — short circuit to operator social reply. */
const BARE_GREETING_RE = /^\s*(hi|hello|hey|yo|sup|hola|howdy)\s*[!.,]*\s*$/i;
const BARE_TIME_GREETING_RE = /^\s*good\s+(morning|afternoon|evening|night)\b[!.,\s]*$/i;
const BARE_MORNING_SHORT_RE = /^\s*(mornin'?|morning)\s*[!.,]*\s*$/i;

export function detectSimpleGreeting(message: string): boolean {
  const t = message.trim();
  if (t.length > 56) return false;
  return BARE_GREETING_RE.test(t) || BARE_TIME_GREETING_RE.test(t) || BARE_MORNING_SHORT_RE.test(t);
}

/**
 * Very short social turns — thanks, goodnight, presence check, laugh ack.
 * Conservative: whole message must match (no "thanks but fix this").
 */
export function detectLightSocialMessage(message: string): LightSocialKind | null {
  const t = message.trim();
  if (t.length > 72) return null;

  if (/^\s*(thanks|thank you|thx|tysm|ty|much appreciated|appreciate it)\s*[!.,]*$/i.test(t)) {
    return "thanks";
  }
  if (/^\s*(good\s*night|goodnight|gn)\b[!.,]*$/i.test(t) || /^\s*sleep\s+well\s*[!.,]*$/i.test(t)) {
    return "goodnight";
  }
  if (/^\s*(you\s+there|you\s+still\s+there|anyone\s+there)\??\s*[!.,]*$/i.test(t)) {
    return "presence_ping";
  }
  if (/^\s*(lol|lmao|lmfao|haha+|heh)\s*[!?.]*\s*[!.,]*$/i.test(t)) {
    return "amused_ack";
  }
  if (/^\s*(ok|okay|k)\s*[!?.]*\s*[!.,]*$/i.test(t)) {
    return "amused_ack";
  }
  if (/^\s*(hmm|mmmm?|uh\s*huh)\s*[!?.]*\s*[!.,]*$/i.test(t)) {
    return "amused_ack";
  }
  if (/^\s*(right|got it|makes sense|fair enough)\s*[!?.]*\s*[!.,]*$/i.test(t)) {
    return "amused_ack";
  }
  return null;
}

/**
 * Identity questions that should be answered as MALV (short user turns only).
 * Does not run on bare greetings — orchestrator checks {@link detectSimpleGreeting} first.
 */
function normalizeForMalvIdentityFuzzy(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectMalvIdentityQuestion(message: string): IdentityQuestionKind | null {
  if (detectSimpleGreeting(message)) return null;

  const t = stripGreetingAndNoise(message);
  if (t.length > 220) return null;

  if (/^(what\s+is|what's|whats)\s+your\s+name$/.test(t)) return "name";
  if (/^your\s+name$/.test(t)) return "name";
  if (/^who\s+are\s+you(?:\s+really)?$/.test(t)) return "who";
  if (/^are\s+you\s+(?:qwen|alibaba|openai|anthropic|claude|gpt|gemini|llama|mistral|deepseek)$/.test(t)) {
    return "comparison";
  }
  if (/^what\s+are\s+you$/.test(t)) return "what";
  if (/^what\s+model\s+are\s+you$/.test(t)) return "model";
  if (/^what\s+do\s+you\s+do\??$/.test(t)) return "capabilities";
  if (/^who\s+(made|created|developed)\s+you$/.test(t)) return "creator";
  if (/^who\s+is\s+your\s+creator$/.test(t)) return "creator";
  if (/^who\s+is\s+your\s+founder$/.test(t)) return "founder";
  if (/^who\s+is\s+your\s+company$/.test(t)) return "company";
  if (/^what\s+company\s+built\s+you$/.test(t)) return "company";
  if (/^where\s+are\s+you\s+from$/.test(t)) return "origin";
  if (/^what\s+powers\s+you$/.test(t)) return "powered_by";
  if (/^are\s+you\s+based\s+on\s+another\s+model$/.test(t)) return "based_on";
  if (/^are\s+you\s+(an\s+)?ai\??$/.test(t)) return "ai";

  /** Secondary layer: punctuation-stripped, tightly anchored phrases only (low false-positive rate). */
  const n = normalizeForMalvIdentityFuzzy(t);
  if (n.length === 0 || n.length > 120 || n.split(/\s+/).length > 14) return null;

  if (/^are you chatgpt$/.test(n)) return "comparison";
  if (/^are you gpt(?:[- ]?[0-9]+)?$/.test(n)) return "comparison";

  if (/^who (made|built|created) malv$/.test(n)) return "creator";
  if (/^what company (made|built|created) (you|malv)$/.test(n)) return "company";

  if (/^who (made|built|created) you(?:$|\s+and\b|\s*,)/.test(n)) return "creator";

  if (/^what is malv$/.test(n)) return "what";
  if (/^what are you$/.test(n)) return "what";

  return null;
}

export function analyzeUserTone(userMessage: string): UserToneAnalysis {
  const reasons: string[] = [];
  const m = userMessage.trim();
  const lower = m.toLowerCase();
  const short = m.length < 80;
  const long = m.length > 320;
  const bangs = (m.match(/!/g) ?? []).length;
  const qmarks = (m.match(/\?/g) ?? []).length;

  let userTone: MalvUserTone = "neutral";
  let urgency: MalvUrgency = "low";
  let depthPreference: MalvDepthPreference = long ? "deep" : "balanced";
  let emotionalSensitivity: MalvEmotionalSensitivity = "low";

  if (detectLightSocialMessage(m)) {
    userTone = "casual";
    depthPreference = "direct";
    reasons.push("light_social");
    return { userTone, urgency: "low", depthPreference, emotionalSensitivity: "low", toneReasons: reasons };
  }

  if (detectSimpleGreeting(m)) {
    userTone = "casual";
    depthPreference = "direct";
    reasons.push("simple_greeting");
    return { userTone, urgency: "low", depthPreference, emotionalSensitivity: "low", toneReasons: reasons };
  }

  if (detectMalvIdentityQuestion(m)) {
    userTone = "identity_query";
    reasons.push("identity_question");
    return { userTone, urgency: "low", depthPreference: "direct", emotionalSensitivity: "low", toneReasons: reasons };
  }

  if (URGENCY_MARKERS.test(lower) || (bangs >= 2 && short)) {
    urgency = "high";
    reasons.push("urgency_language");
  } else if (/\b(soon|today|eod|deadline)\b/.test(lower)) {
    urgency = "medium";
    reasons.push("time_pressure");
  }

  if (PROFANITY_OR_STRONG_ANNOYANCE.test(lower) || FRUSTRATION_MARKERS.test(lower) || /\b(!!!|!\?|\?!){1,}/.test(m)) {
    userTone = "frustrated";
    emotionalSensitivity = "medium";
    reasons.push("frustration_markers");
  } else if (DISSATISFACTION.test(lower)) {
    userTone = "dissatisfied";
    emotionalSensitivity = "medium";
    reasons.push("dissatisfaction");
  } else if (CONFUSED_MARKERS.test(lower) || (qmarks >= 2 && UNCERTAINTY.test(lower))) {
    userTone = "confused";
    depthPreference = "balanced";
    reasons.push("confusion_or_uncertainty");
  } else if (EMOTIONAL_SOFT.test(lower)) {
    userTone = "emotional";
    emotionalSensitivity = "high";
    reasons.push("stress_language");
  } else if (TECHNICAL.test(lower) || /\b(error|exception|traceback|lint)\b/.test(lower)) {
    userTone = "technical";
    depthPreference = "direct";
    reasons.push("technical_vocab");
  } else if (BUILDER.test(lower) || EXPLORATORY.test(lower)) {
    userTone = EXPLORATORY.test(lower) ? "exploratory" : "builder";
    depthPreference = "deep";
    reasons.push(userTone === "exploratory" ? "exploratory" : "builder");
  } else if (short && !/\?/.test(m) && /^[a-z0-9 _./-]+$/i.test(m.trim()) && m.split(/\s+/).length <= 12) {
    userTone = "direct";
    depthPreference = "direct";
    reasons.push("blunt_short_prompt");
  } else if (/\b(please|thanks|thank you|lol|haha)\b/.test(lower) && !FRUSTRATION_MARKERS.test(lower)) {
    userTone = "casual";
    reasons.push("casual_markers");
  }

  if (/\b(private|personal|health|legal|hr)\b/.test(lower) && userTone === "neutral") {
    userTone = "sensitive";
    emotionalSensitivity = "high";
    reasons.push("sensitive_domain");
  }

  if (reasons.length === 0) reasons.push("default");

  return { userTone, urgency, depthPreference, emotionalSensitivity, toneReasons: reasons };
}
