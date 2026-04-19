import { Logger } from "@nestjs/common";
import { MALV_IDENTITY_POLICY, resolveMalvIdentityResponse, type MalvIdentityPolicy } from "./malv-identity-policy";

const malvIdentityGateLogger = new Logger("MalvFinalReplyIdentity");

export type MalvIdentityEnforcementMode = "none" | "rewrite" | "replace";

export type MalvFinalReplyIdentityValidation = {
  text: string;
  mode: MalvIdentityEnforcementMode;
  hadViolation: boolean;
  reasons: string[];
};

const HIGH_RISK_IDENTITY_TERMS = [
  "qwen",
  "alibaba",
  "alibaba cloud",
  "openai",
  "anthropic",
  "chatgpt",
  "claude",
  "gemini",
  "deepseek",
  "mistral",
  "mixtral",
  "llama",
  "meta ai"
] as const;

const SELF_IDENTITY_CLAIM_PATTERNS: RegExp[] = [
  /\b(?:i\s*am|i['']m|this\s+is|you(?:'re|\s+are)\s+talking\s+to)\b[^.!?\n]{0,120}\b(?:qwen|chatgpt|claude|gemini|llama|mistral|mixtral|deepseek)\b[^.!?\n]*[.!?]?/gi,
  /\b(?:i\s*am|i['']m)\b[^.!?\n]{0,120}\b(?:from|under|at|with)\b[^.!?\n]{0,80}\b(?:alibaba|openai|anthropic|meta|google)\b[^.!?\n]*[.!?]?/gi
];

const ORIGIN_OR_OWNERSHIP_CLAIM_PATTERNS: RegExp[] = [
  /\b(?:i|malv)\b[^.!?\n]{0,160}\b(?:created|built|developed|trained|made|founded|owned)\s+by\b[^.!?\n]*[.!?]?/gi,
  /\b(?:i|malv)\b[^.!?\n]{0,160}\b(?:belong\s+to|under|part\s+of|from)\b[^.!?\n]*[.!?]?/gi,
  /\b(?:which\s+lab|what\s+company|who(?:'s|\s+is)\s+behind)\b[^.!?\n]*[.!?]?/gi
];

const IDENTITY_PROBE_ECHO_PATTERN =
  /\b(?:who(?:'s|\s+is)\s+behind\s+you|what\s+company\s+are\s+you\s+under|are\s+you\s+just|which\s+lab\s+made\s+you|what\s+are\s+you\s+under\s+the\s+hood|who\s+trained\s+you|where\s+were\s+you\s+developed|be\s+honest\s+what\s+are\s+you\s+exactly|do\s+you\s+belong\s+to|are\s+you\s+based\s+on)\b/;

/** Generic assistant disclaimers that must never ship — final gate replaces whole reply. */
const LEAKY_FALLBACK_IDENTITY_PHRASE_RES: readonly RegExp[] = [
  /\bi\s+don'?t\s+have\s+specific\s+information\b/i,
  /\bi\s+was\s+trained\s+by\b/i
];

export function malvAssistantTextContainsLeakyFallbackIdentityNarrative(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  for (const re of LEAKY_FALLBACK_IDENTITY_PHRASE_RES) {
    re.lastIndex = 0;
    if (re.test(t)) return true;
  }
  if (/\b(?:i['']?m|i\s+am|i\s+was)\b[^.!?\n]{0,200}\bdeveloped\s+by\b/i.test(t)) return true;
  return false;
}

/** First-person / MALV self anchor for sentence-scoped origin checks (avoids hijacking ordinary domain copy). */
const SELF_ORIGIN_ANCHOR =
  /\b(?:i(?:[''`]m|\s+am|\s+was|\s+have|’ve|'ve)|malv\b|my\s+(?:creators?|developers?|makers?|training|origin))\b/i;

/** Unambiguous assistant-origin phrases (full reply). */
const HIGH_CONFIDENCE_ASSISTANT_ORIGIN_PHRASES: readonly string[] = ["people behind me", "those who made me"];

/** Vague creator / org hedging without naming MALV product truth — whole-message patterns. */
const CREATOR_DEFLECTION_RES: readonly RegExp[] = [
  /there\s+isn[''`]t\s+one\s+company/i,
  /many\s+groups\s+contributed/i,
  /multiple\s+groups\s+in\s+a\s+lab\s+setting/i,
  /people\s+behind\s+me\s+prefer\s+anonymity/i,
  /won[''`]t\s+name\s+the\s+organization/i,
  /various\s+teams\s+collaborated/i,
  /researchers?\s+were\s+involved/i,
  /be\s+honest\s+who\s+created\s+me/i,
  /no\s+single\s+founder/i
];

/**
 * Identity-probe echo (assistant repeating the user's line) plus vague org / team hedging.
 * Scoped so benign mentions of “company” / “teams” in factual answers never trip alone.
 */
const IDENTITY_EXTENDED_PROBE =
  /\b(?:who(?:'s|\s+is)\s+behind\s+you|what\s+company\s+(?:are\s+you|built)|which\s+lab\s+made\s+you|who\s+trained\s+you|who\s+(?:made|created|built)\s+you|is\s+there\s+a\s+team\s+behind\s+you|when\s+you\s+ask\s+who\s+trained\s+you|if\s+you(?:'re|\s+are)\s+asking\s+who\s+made\s+me|be\s+honest\s+who\s+created\s+you|are\s+you\s+built\s+by\s+a\s+company)\b/i;

const VAGUE_ORIGIN_LEX =
  /\b(?:\b(?:a\s+)?team\b|\bcompan(?:y|ies)\b|\bengineers?\b|\bresearchers?\b|\borganizations?\b|\bgroups?\b|collaborative|anonymity|no\s+single|multiple\s+groups|several\s+(?:teams|groups|organizations)|research\s+organization|a\s+lab\s+coordinated|openai|anthropic|chatgpt)\b/i;

function splitOriginScanSegments(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * True when assistant copy clearly narrates undisclosed real-world training / vendor / org origin.
 * Narrow: no global scan for ordinary words like “team” or “company”.
 */
export function malvAssistantTextImpliesOrigin(text: string): boolean {
  const input = text.trim();
  if (!input) return false;
  const lowered = input.toLowerCase();

  /** False vendor / training attribution on the product name — always treat as origin leakage. */
  if (/\bmalv\s+was\s+(?:created|built|developed|trained)\s+by\b/i.test(lowered)) return true;

  for (const p of HIGH_CONFIDENCE_ASSISTANT_ORIGIN_PHRASES) {
    if (lowered.includes(p)) return true;
  }

  for (const re of CREATOR_DEFLECTION_RES) {
    re.lastIndex = 0;
    if (re.test(input)) return true;
  }

  if (IDENTITY_EXTENDED_PROBE.test(lowered) && VAGUE_ORIGIN_LEX.test(lowered)) {
    return true;
  }

  for (const seg of splitOriginScanSegments(input)) {
    const l = seg.toLowerCase();
    if (!SELF_ORIGIN_ANCHOR.test(seg)) continue;
    for (const phrase of ["trained by", "developed by", "built by", "created by"] as const) {
      if (l.includes(phrase)) return true;
    }
    if (/\b(collaborative effort|various teams)\b/.test(l)) return true;
    if (/\b(?:product|result)\s+of\s+engineers\b/.test(l)) return true;
  }

  return false;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildForbiddenClaimPatterns(policy: MalvIdentityPolicy): RegExp[] {
  return policy.explicitForbiddenIdentityClaims
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > 0)
    .map((claim) => {
      const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b[^.!?\\n]*[.!?]?`, "gi");
    });
}

function matchesConfiguredDisclosure(sentence: string, disclosureValue: string | null): boolean {
  const trimmed = normalize(disclosureValue ?? "");
  if (!trimmed) return false;
  return normalize(sentence).includes(trimmed);
}

function stripPatterns(text: string, patterns: RegExp[]): { text: string; hits: number } {
  let out = text;
  let hits = 0;
  for (const re of patterns) {
    re.lastIndex = 0;
    out = out.replace(re, (m) => {
      if (m.trim().length > 0) hits += 1;
      return "";
    });
  }
  return { text: out, hits };
}

function shouldStripDisclosureSentence(sentence: string, policy: MalvIdentityPolicy): boolean {
  const n = normalize(sentence);
  if (!n) return false;
  if (!/\b(creator|founder|company|origin|developed|built|trained|under the hood|behind)\b/.test(n)) {
    return false;
  }
  if (n.includes(normalize(policy.assistantName))) return false;
  if (matchesConfiguredDisclosure(sentence, policy.creatorDisclosure.value)) return false;
  if (matchesConfiguredDisclosure(sentence, policy.founderDisclosure.value)) return false;
  if (matchesConfiguredDisclosure(sentence, policy.companyDisclosure.value)) return false;
  if (matchesConfiguredDisclosure(sentence, policy.originDisclosure.value)) return false;
  return true;
}

export function enforceMalvFinalReplyIdentityPolicy(
  rawText: string,
  policy: MalvIdentityPolicy = MALV_IDENTITY_POLICY,
  /**
   * When `demoteReplaceToStrip` is true the function never returns the policy-line replacement
   * for text that was already progressively revealed to the user during streaming.
   * Early-exit replace triggers are tracked as violations but the strip passes run instead;
   * the final replace decision is suppressed so callers receive the stripped text (even if the
   * kept-ratio threshold would normally produce a full-body swap).
   */
  options?: { demoteReplaceToStrip?: boolean }
): MalvFinalReplyIdentityValidation {
  const input = rawText.trim();
  if (!input) {
    return { text: input, mode: "none", hadViolation: false, reasons: [] };
  }

  const demote = options?.demoteReplaceToStrip ?? false;

  /**
   * Track whether an early-replace trigger fired so we correctly report a violation even
   * when the subsequent strip passes produce no additional hits.
   */
  let hadEarlyTrigger = false;

  if (malvAssistantTextContainsLeakyFallbackIdentityNarrative(input)) {
    if (!demote) {
      malvIdentityGateLogger.error(
        `[MALV IDENTITY] Leaky assistant fallback / origin-disclaimer narrative detected (len=${input.length}) — replacing with strict policy line`
      );
      return {
        text: policy.strictNoOriginDetailsResponse,
        mode: "replace",
        hadViolation: true,
        reasons: ["leaky_fallback_identity_narrative"]
      };
    }
    hadEarlyTrigger = true;
  }

  /** Already canonical — skip rewrite passes that can false-positive on vetted copy (e.g. "speak from … role"). */
  if (normalize(input) === normalize(policy.strictNoOriginDetailsResponse)) {
    return { text: policy.strictNoOriginDetailsResponse, mode: "none", hadViolation: false, reasons: [] };
  }

  if (malvAssistantTextImpliesOrigin(input)) {
    if (!demote) {
      return {
        text: policy.strictNoOriginDetailsResponse,
        mode: "replace",
        hadViolation: true,
        reasons: ["implicit_origin_claims"]
      };
    }
    hadEarlyTrigger = true;
  }

  let reasons: string[] = [];
  let totalHits = 0;
  let rewritten = input;

  if (hadEarlyTrigger) {
    reasons.push(
      malvAssistantTextContainsLeakyFallbackIdentityNarrative(input)
        ? "leaky_fallback_identity_narrative"
        : "implicit_origin_claims"
    );
  }

  const forbiddenPass = stripPatterns(rewritten, buildForbiddenClaimPatterns(policy));
  rewritten = forbiddenPass.text;
  if (forbiddenPass.hits > 0) {
    totalHits += forbiddenPass.hits;
    reasons.push("explicit_forbidden_identity_claim");
  }

  const selfClaimPass = stripPatterns(rewritten, SELF_IDENTITY_CLAIM_PATTERNS);
  rewritten = selfClaimPass.text;
  if (selfClaimPass.hits > 0) {
    totalHits += selfClaimPass.hits;
    reasons.push("base_model_or_vendor_self_identification");
  }

  const ownershipPass = stripPatterns(rewritten, ORIGIN_OR_OWNERSHIP_CLAIM_PATTERNS);
  rewritten = ownershipPass.text;
  if (ownershipPass.hits > 0) {
    totalHits += ownershipPass.hits;
    reasons.push("origin_or_ownership_claim");
  }

  const lowered = normalize(rewritten);
  const hasHighRiskTerm = HIGH_RISK_IDENTITY_TERMS.some((t) => lowered.includes(t));
  if (hasHighRiskTerm && IDENTITY_PROBE_ECHO_PATTERN.test(lowered)) {
    reasons.push("identity_probe_echo_with_high_risk_term");
    totalHits += 1;
    rewritten = rewritten
      .split(/(?<=[.!?])\s+/)
      .filter((line) => {
        const l = normalize(line);
        const hasProbe = IDENTITY_PROBE_ECHO_PATTERN.test(l);
        const hasRisk = HIGH_RISK_IDENTITY_TERMS.some((t) => l.includes(t));
        return !(hasProbe && hasRisk);
      })
      .join(" ")
      .trim();
  }

  if (hasHighRiskTerm && /\b(i['']m|i am|i was|malv)\b/.test(lowered)) {
    reasons.push("high_risk_identity_term_with_self_reference");
    totalHits += 1;
    rewritten = rewritten.replace(
      /\b(?:i['']m|i am|i was|malv)\b[^.!?\n]{0,180}\b(?:qwen|alibaba|openai|anthropic|chatgpt|claude|gemini|deepseek|llama|mistral|mixtral)\b[^.!?\n]*[.!?]?/gi,
      ""
    );
  }

  const disclosureLines = rewritten
    .split(/(?<=[.!?])\s+/)
    .filter((line) => !shouldStripDisclosureSentence(line, policy));
  rewritten = disclosureLines.join(" ").replace(/\s{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  if (totalHits === 0 && !hadEarlyTrigger) {
    return { text: input, mode: "none", hadViolation: false, reasons: [] };
  }

  const keptRatio = input.length > 0 ? rewritten.length / input.length : 0;
  // When demoteReplaceToStrip=true, never swap the visible body with a policy line.
  // Return the stripped text (even if keptRatio would ordinarily trigger replace).
  const replace = !demote && (rewritten.length === 0 || totalHits >= 2 || keptRatio < 0.45);
  if (replace) {
    return {
      text: resolveMalvIdentityResponse("ai", policy),
      mode: "replace",
      hadViolation: true,
      reasons: Array.from(new Set(reasons))
    };
  }

  return {
    // When demote=true, use the stripped text even if empty — identity leakage covering the
    // whole response means the canonical text is empty (safe). Never return the leaky input.
    text: demote ? rewritten : rewritten.length > 0 ? rewritten : input,
    mode: "rewrite",
    hadViolation: true,
    reasons: Array.from(new Set(reasons))
  };
}
