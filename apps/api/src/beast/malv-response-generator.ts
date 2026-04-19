/**
 * Dynamic MALV short replies: composed from small phrase banks + seeds + anti-repetition.
 * No fixed greeting / identity / social sentence lists.
 */

import type { IdentityQuestionKind, LightSocialKind } from "./malv-conversation-signals";
import {
  detectLightSocialMessage,
  detectMalvIdentityQuestion,
  detectSimpleGreeting
} from "./malv-conversation-signals";
import { resolveMalvIdentityResponse } from "./malv-identity-policy";

/** Max length for whole-message social check-ins (avoids matching real questions). */
const SOCIAL_SMALLTALK_CHECKIN_MAX_CHARS = 96;

/**
 * Whole-message social check-in / casual wellbeing probes (no trailing task text).
 * Covers forms like "how are you doing?" that must not hit the inference path when the worker is down.
 */
export function detectSocialSmalltalkCheckin(message: string): boolean {
  const t = message.trim();
  if (t.length > SOCIAL_SMALLTALK_CHECKIN_MAX_CHARS) return false;
  const patterns: RegExp[] = [
    /^what'?s\s+up\s*[!.,?]*\s*$/i,
    /^how\s+are\s+you(\s+doing)?\s*[!.,?]*\s*$/i,
    /^how'?re\s+you(\s+doing)?\s*[!.,?]*\s*$/i,
    /^how'?s\s+it\s+going\s*[!.,?]*\s*$/i,
    /^how\s+you\s+been\s*[!.,?]*\s*$/i,
    /^how\s+you\s+doing\s*[!.,?]*\s*$/i,
    /^you\s+good\s*[!.,?]*\s*$/i,
    /^all\s+good(\s+on\s+your\s+end)?\s*[!.,?]*\s*$/i,
    /^how'?s\s+everything\s*[!.,?]*\s*$/i,
    /^how'?s\s+life\s*[!.,?]*\s*$/i
  ];
  return patterns.some((re) => re.test(t));
}

/** @deprecated Prefer {@link detectSocialSmalltalkCheckin}; kept for callers/tests. */
export function detectBareCasualSmallTalk(message: string): boolean {
  return detectSocialSmalltalkCheckin(message);
}

export type MalvDetectedIntent =
  | "greeting"
  | "identity_question"
  /** Deterministic template path: wellbeing / casual check-in (distinct from task-bearing phrasing). */
  | "social_smalltalk_checkin"
  | "casual_small_talk"
  | "task_request"
  | "technical_request"
  | "emotional_tone"
  | "short_ping"
  | "light_social"
  | "general";

export type UserEnergyLevel = "short" | "long" | "casual" | "serious";

export type LastAssistantStyle = {
  /** Normalized first 1–2 tokens of recent assistant first lines */
  recentOpeningPrefixes: string[];
  /** Rough length bucket of the last assistant reply */
  lastLengthBucket: "tiny" | "short" | "medium" | "long" | "none";
};

export type MalvResponseContext = {
  userMessage: string;
  conversationHistory: ReadonlyArray<{ role: string; content: string }>;
  detectedIntent: MalvDetectedIntent;
  /** Compact tone label e.g. userTone or joined reasons */
  toneSignal: string;
  isFirstMessage: boolean;
  isGreeting: boolean;
  isFollowup: boolean;
  userEnergyLevel: UserEnergyLevel;
  lastAssistantStyle: LastAssistantStyle;
  /** Stable seed per conversation */
  conversationId: string;
  /** When intent is identity_question */
  identityKind?: IdentityQuestionKind | null;
  /** When intent is light_social */
  lightSocialKind?: LightSocialKind | null;
};

const BANNED_IN_SHORT_REPLIES: RegExp[] = [
  /\bhow\s+can\s+i\s+(help|assist)/i,
  /\bwhat\s+do\s+you\s+need\b/i,
  /\bi'?m\s+here\s+to\s+(help|assist)/i,
  /\bplease\s+let\s+me\s+know\b/i,
  /\bfeel\s+free\s+to\b/i,
  /\bhello[!.,\s]*how\s+may\s+i\s+assist/i,
  /\bas\s+an\s+ai\b/i,
  /\bi\s+can\s+help\s+with\s+that\b/i
];

const CLICHE_OPENERS = /^(alright|okay|ok|here'?s|so,|well,)\b/i;

const TECH_HEAVY =
  /\b(api|debug|stack|typescript|error|exception|http\s*\d{3}|kubernetes|docker|npm|pnpm|database|query|latency)\b/i;
const TASK_HEAVY =
  /\b(fix|build|implement|write|create|deploy|refactor|migrate|schedule|plan|help\s+me|can\s+you)\b/i;

function hash32(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function firstLine(text: string): string {
  return (text.trim().split(/\n/)[0] ?? "").trim();
}

function firstTokensNormalized(text: string, count: 2 | 3 = 2): string {
  const line = firstLine(text);
  const cleaned = line
    .toLowerCase()
    .replace(/[👀⚡🫡✨👍🧠👋]/gu, "")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean).slice(0, count);
  return parts.join(" ");
}

function lengthBucket(len: number): LastAssistantStyle["lastLengthBucket"] {
  if (len === 0) return "none";
  if (len < 40) return "tiny";
  if (len < 160) return "short";
  if (len < 520) return "medium";
  return "long";
}

/**
 * Recent assistant texts and opener memory for anti-repetition.
 */
export function deriveLastAssistantStyle(
  conversationHistory: ReadonlyArray<{ role: string; content: string }>
): LastAssistantStyle {
  const assistantTexts = conversationHistory
    .filter((m) => m.role === "assistant")
    .map((m) => String(m.content ?? "").trim())
    .filter((c) => c.length > 0)
    .slice(-5);

  const recentOpeningPrefixes = assistantTexts.map((t) => firstTokensNormalized(t, 2));

  const last = assistantTexts.length ? assistantTexts[assistantTexts.length - 1]! : "";
  return {
    recentOpeningPrefixes,
    lastLengthBucket: lengthBucket(last.length)
  };
}

export function deriveUserEnergyLevel(userMessage: string, toneSignal: string): UserEnergyLevel {
  const m = userMessage.trim();
  const words = m.split(/\s+/).filter(Boolean).length;
  const sig = toneSignal.toLowerCase();
  if (m.length < 48 && words <= 8) return "short";
  if (m.length > 380 || words > 72) return "long";
  if (/\b(casual|emotional|simple_greeting|light_social)\b/.test(sig)) return "casual";
  if (/\b(frustrated|technical|direct|dissatisfied|urgent|identity)\b/.test(sig)) return "serious";
  return "casual";
}

/**
 * Lightweight intent tags (heuristics only).
 */
export function detectMalvIntent(userMessage: string): MalvDetectedIntent {
  const social = detectLightSocialMessage(userMessage);
  if (social) return "light_social";

  if (detectSimpleGreeting(userMessage)) return "greeting";

  if (detectMalvIdentityQuestion(userMessage)) return "identity_question";

  const t = userMessage.trim();
  const lower = t.toLowerCase();

  if (t.length <= 20 && /^(hey|yo|hi|sup|hiya)\b/i.test(t) && /\s/.test(t) === false) return "short_ping";

  if (detectSocialSmalltalkCheckin(userMessage)) return "social_smalltalk_checkin";

  if (TECH_HEAVY.test(lower)) return "technical_request";

  if (TASK_HEAVY.test(lower)) return "task_request";

  if (/\b(stressed|overwhelmed|anxious|scared|worried|burnout|exhausted)\b/i.test(lower)) return "emotional_tone";

  return "general";
}

export type ComposeParts = {
  opener?: string;
  core: string;
  followup?: string;
};

/**
 * Join optional opener / core / follow-up without forcing every slot.
 */
export function composeMalvUtterance(parts: ComposeParts): string {
  const chunks: string[] = [];
  if (parts.opener?.trim()) chunks.push(parts.opener.trim());
  if (parts.core.trim()) chunks.push(parts.core.trim());
  if (parts.followup?.trim()) chunks.push(parts.followup.trim());
  let out = chunks.join(" ");
  out = out.replace(/\s+([.,!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
  return out;
}

function pickIndex(seed: number, modulo: number, step: number): number {
  return (seed + step * 17) % modulo;
}

function tooSimilarOpener(candidate: string, avoid: string[]): boolean {
  const norm = firstTokensNormalized(candidate, 2);
  if (norm.length < 3) return false;
  for (const a of avoid) {
    if (!a) continue;
    if (norm === a) return true;
    if (a.startsWith(norm.slice(0, 5)) || norm.startsWith(a.slice(0, 5))) return true;
  }
  return false;
}

function openerOverused(candidate: string, recentAssistantTexts: string[]): boolean {
  const line = firstLine(candidate);
  if (!CLICHE_OPENERS.test(line)) return false;
  let hits = 0;
  for (const prev of recentAssistantTexts.slice(-4)) {
    if (CLICHE_OPENERS.test(firstLine(prev))) hits++;
  }
  return hits >= 2;
}

function passesQuality(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  for (const re of BANNED_IN_SHORT_REPLIES) {
    if (re.test(t)) return false;
  }
  return true;
}

function recentAssistantBodies(history: ReadonlyArray<{ role: string; content: string }>): string[] {
  return history
    .filter((m) => m.role === "assistant")
    .map((m) => String(m.content ?? "").trim())
    .filter((c) => c.length > 0)
    .slice(-5);
}

function seedBase(ctx: MalvResponseContext, salt: string): number {
  return hash32(`${ctx.conversationId}\0${salt}\0${ctx.userMessage.trim().toLowerCase()}`);
}

// --- Dynamic builders (phrase banks, not full canned lines) ---

function buildGreeting(ctx: MalvResponseContext, seed: number): string {
  const um = ctx.userMessage.trim().toLowerCase();
  const timeMorning = /\b(morning|mornin)\b/.test(um) || /^good\s+morning/.test(um);
  const timeEvening = /evening|night/.test(um) || /^good\s+(evening|night)/.test(um);
  const timeAfternoon = /afternoon/.test(um) || /^good\s+afternoon/.test(um);
  const casualPing = /^(yo|sup)\s*[!.,]*$/i.test(ctx.userMessage.trim());

  const ackTime = timeMorning
    ? ["Morning.", "Mornin.", "Morning —"]
    : timeEvening
      ? ["Evening.", "Hey — evening.", "Night shift energy —"]
      : timeAfternoon
        ? ["Afternoon.", "Hey — afternoon."]
        : [];

  const ackShort = casualPing
    ? ["Yo.", "Hey.", "Yup.", "Hey —"]
    : ["Hey.", "Hi.", "Hey —", "Hi —"];

  const presence = ["On channel.", "Here.", "With you.", "I'm here.", "Present."];

  const inviteFirst = [
    "What's the move?",
    "What are we pushing on?",
    "Where do you want to start?",
    "Drop me into it — task, mess, or goal.",
    "What's in front of us?",
    "What should we tackle first?"
  ];

  const inviteReturn = [
    "What's next?",
    "What's changed?",
    "Where should we push?",
    "What's the thread?",
    "Go ahead.",
    "Bring the update."
  ];

  const softFollow = [
    "I'm listening.",
    "Quiet on the line — your turn.",
    "Surface the target when you're ready."
  ];

  const useFirst = ctx.isFirstMessage;
  const energy = ctx.userEnergyLevel;

  let opener: string | undefined;
  let core: string;
  let followup: string | undefined;

  const roll = pickIndex(seed, 5, 0);

  if (ackTime.length && roll !== 4) {
    opener = ackTime[pickIndex(seed, ackTime.length, 1)]!;
  } else if (!timeMorning && !timeEvening && !timeAfternoon) {
    opener = ackShort[pickIndex(seed, ackShort.length, 2)]!;
  }

  if (useFirst) {
    if (energy === "short" || casualPing) {
      core = presence[pickIndex(seed, presence.length, 3)]!;
      followup =
        pickIndex(seed, 2, 4) === 0
          ? inviteFirst[pickIndex(seed, inviteFirst.length, 5)]!
          : undefined;
      if (!followup) {
        followup = inviteFirst[pickIndex(seed + 1, inviteFirst.length, 5)]!;
      }
    } else {
      core = inviteFirst[pickIndex(seed, inviteFirst.length, 6)]!;
      if (pickIndex(seed, 3, 7) === 0) {
        opener = opener ?? presence[pickIndex(seed, presence.length, 8)]!;
      }
    }
  } else {
    core = inviteReturn[pickIndex(seed, inviteReturn.length, 9)]!;
    if (energy !== "short" && pickIndex(seed, 4, 10) === 0) {
      followup = softFollow[pickIndex(seed, softFollow.length, 11)]!;
    }
    if (casualPing && pickIndex(seed, 2, 12) === 0) {
      opener = "Yo.";
    }
  }

  if (!core) core = inviteFirst[0]!;

  return composeMalvUtterance({ opener, core, followup });
}

function buildLightSocial(kind: LightSocialKind, seed: number): string {
  const thanksA = ["Got you", "Yep", "Bet", "Cool", "Anytime"];
  const thanksB = [".", " — good.", "."];

  const nightA = ["Sleep well", "Rest up", "Night"];
  const nightB = [".", " — I'll be on channel.", "."];

  const presenceA = ["Here", "Yep — here", "On channel", "With you"];
  const presenceB = [".", ".", ".", "."];

  const amuseA = ["Ha — fair", "Yeah", "That tracks", "Nice"];
  const amuseB = [".", ".", ".", "."];

  switch (kind) {
    case "thanks":
      return (
        thanksA[pickIndex(seed, thanksA.length, 0)]! + thanksB[pickIndex(seed, thanksB.length, 1)]!
      );
    case "goodnight":
      return (
        nightA[pickIndex(seed, nightA.length, 2)]! + nightB[pickIndex(seed, nightB.length, 3)]!
      );
    case "presence_ping":
      return (
        presenceA[pickIndex(seed, presenceA.length, 4)]! +
        presenceB[pickIndex(seed, presenceB.length, 5)]!
      );
    case "amused_ack":
    default:
      return (
        amuseA[pickIndex(seed, amuseA.length, 6)]! + amuseB[pickIndex(seed, amuseB.length, 7)]!
      );
  }
}

function buildIdentity(kind: IdentityQuestionKind, ctx: MalvResponseContext, seed: number): string {
  void ctx;
  void seed;
  return resolveMalvIdentityResponse(kind);
}

function buildCasualSmallTalk(ctx: MalvResponseContext, seed: number): string {
  const a = ["Doing good.", "All good.", "Yeah — good.", "Solid.", "Fine — you?"];
  const b = [
    "What's the thread?",
    "What are we working?",
    "Back to it when you're ready."
  ];
  if (ctx.userEnergyLevel === "short") {
    return a[pickIndex(seed, a.length, 0)]!;
  }
  return composeMalvUtterance({
    core: a[pickIndex(seed, a.length, 1)]!,
    followup: pickIndex(seed, 2, 2) === 0 ? b[pickIndex(seed, b.length, 3)]! : undefined
  });
}

/**
 * Build generator context from orchestration state (short-circuit replies).
 */
export function buildMalvGeneratorContext(params: {
  userMessage: string;
  conversationHistory: ReadonlyArray<{ role: string; content: string }>;
  conversationId: string;
  userTone: string;
  toneReasons: readonly string[];
  isFirstThreadTurn: boolean;
  isGreeting: boolean;
  detectedIntent: MalvDetectedIntent;
  identityKind?: IdentityQuestionKind | null;
  lightSocialKind?: LightSocialKind | null;
  /** If omitted, derived from prior user turns in history */
  isFollowup?: boolean;
}): MalvResponseContext {
  const toneSignal = `${params.userTone}:${params.toneReasons.join(",")}`;
  const lastAssistantStyle = deriveLastAssistantStyle(params.conversationHistory);
  const userEnergyLevel = deriveUserEnergyLevel(params.userMessage, toneSignal);
  const userTurns = params.conversationHistory.filter((m) => m.role === "user").length;
  const isFollowup = params.isFollowup ?? userTurns >= 1;

  return {
    userMessage: params.userMessage,
    conversationHistory: params.conversationHistory,
    detectedIntent: params.detectedIntent,
    toneSignal,
    isFirstMessage: params.isFirstThreadTurn,
    isGreeting: params.isGreeting,
    isFollowup,
    userEnergyLevel,
    lastAssistantStyle,
    conversationId: params.conversationId,
    identityKind: params.identityKind ?? undefined,
    lightSocialKind: params.lightSocialKind ?? undefined
  };
}

/**
 * Main entry: synthesize a short MALV reply from context (short-circuit paths).
 */
export function generateMalvResponse(ctx: MalvResponseContext): string {
  const recentAssistant = recentAssistantBodies(ctx.conversationHistory);
  const avoidPrefixes = ctx.lastAssistantStyle.recentOpeningPrefixes;

  let saltStep = 0;
  let text = "";

  const tryGenerate = (): string => {
    const seed = seedBase(ctx, `v1-${saltStep}`);
    switch (ctx.detectedIntent) {
      case "light_social":
        if (!ctx.lightSocialKind) return "Yep.";
        return buildLightSocial(ctx.lightSocialKind, seed);
      case "greeting":
      case "short_ping":
        return buildGreeting(ctx, seed);
      case "identity_question":
        if (!ctx.identityKind) return composeMalvUtterance({ core: "I'm MALV — I work with you directly." });
        return buildIdentity(ctx.identityKind, ctx, seed);
      case "social_smalltalk_checkin":
      case "casual_small_talk":
        return buildCasualSmallTalk(ctx, seed);
      default:
        return composeMalvUtterance({
          core: "On channel — say what you're aiming at and we'll run it down."
        });
    }
  };

  while (saltStep < 10) {
    text = tryGenerate();
    if (!passesQuality(text)) {
      saltStep++;
      continue;
    }
    if (tooSimilarOpener(text, avoidPrefixes) || openerOverused(text, recentAssistant)) {
      saltStep++;
      continue;
    }
    break;
  }

  if (!passesQuality(text)) {
    text = "On channel. What's the move?";
  }

  return text.trim();
}
