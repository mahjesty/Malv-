/**
 * Post-process model output: operator tone, no third-party model branding leakage,
 * generic filler / repetition dampening.
 */

import { MALV_OPERATOR_PIVOT_FALLBACK } from "./malv-personality";

/** When leakage strips everything — avoid generic assistant recovery loops. */
export const MALV_IDENTITY_SAFE_FALLBACK = MALV_OPERATOR_PIVOT_FALLBACK;

/** Detected generic assistant closers / filler (low-signal when repeated). */
const GENERIC_CLOSER_PATTERNS: RegExp[] = [
  /\bhow\s+can\s+i\s+(help|assist)\s+you(?:\s+today)?\s*[?.!]?\s*$/i,
  /\bwhat\s+do\s+you\s+need\??\s*$/i,
  /\bwhat\s+else\s+can\s+i\s+(do|help)\s+for\s+you\s*[?.!]?\s*$/i,
  /\bis\s+there\s+anything\s+else\s+i\s+can\s+help\s+(you\s+)?with\s*[?.!]?\s*$/i,
  /\blet\s+me\s+know\s+if\s+you\s+need\s+anything\s+else\s*[?.!]?\s*$/i,
  /\bplease\s+let\s+me\s+know\s+how\s+i\s+can\s+help\s*[?.!]?\s*$/i,
  /\bi'?m\s+here\s+to\s+(help|assist)\b[^.!?\n]*[.!?]?\s*$/i,
  /\bi\s+can\s+help\s+with\s+that\b[^.!?\n]*[.!?]?\s*$/i,
  /\bfeel\s+free\s+to\b[^.!?\n]*[.!?]?\s*$/i
];

const GENERIC_WHOLE_REPLY =
  /^(?:\s*(?:how\s+can\s+i\s+(?:help|assist)\s+you(?:\s+today)?|what\s+do\s+you\s+need\??|hello[!.,\s]*|hi[!.,\s]*)[?.!,\s]*)+$/i;

/** Hollow enthusiasm at the very start — strip when followed by substance. */
const LEADING_HOLLOW_OPENERS: RegExp[] = [
  /^(certainly|sure|of course|absolutely)[!.,:—\s]+/i,
  /^(i['']d\s+be\s+(happy|delighted|glad)\s+to\s+help[!.,\s]+)/i
];

function stripLeadingHollowOpeners(text: string): string {
  let out = text.trim();
  let guard = 0;
  while (guard++ < 8) {
    let changed = false;
    for (const re of LEADING_HOLLOW_OPENERS) {
      const next = out.replace(re, "").trim();
      if (next !== out) {
        out = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

function normalizeClosingFragment(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

function lastNonEmptyLine(text: string): string {
  const lines = text.trim().split(/\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const L = (lines[i] ?? "").trim();
    if (L.length) return L;
  }
  return text.trim();
}

function stripTrailingGenericClosers(text: string): string {
  let out = text.trim();
  let changed = true;
  while (changed && out.length > 0) {
    changed = false;
    for (const re of GENERIC_CLOSER_PATTERNS) {
      const next = out.replace(re, "").trim();
      if (next !== out) {
        out = next;
        changed = true;
      }
    }
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * If the model echoed the same generic closer as a recent assistant turn, drop it once.
 */
export function applyRepetitionGuard(
  reply: string,
  priorAssistantTexts: string[]
): { text: string; triggered: boolean; matchedAgainst?: string } {
  const trimmed = reply.trim();
  if (!trimmed || priorAssistantTexts.length === 0) {
    return { text: trimmed, triggered: false };
  }

  const lastLine = lastNonEmptyLine(trimmed);
  const normLast = normalizeClosingFragment(lastLine);
  if (normLast.length < 12) return { text: trimmed, triggered: false };

  let matched: string | undefined;
  for (const prev of priorAssistantTexts) {
    const pLast = lastNonEmptyLine(prev);
    const normPrev = normalizeClosingFragment(pLast);
    if (normPrev.length < 12) continue;
    if (normLast === normPrev) {
      matched = pLast;
      break;
    }
  }
  if (!matched) return { text: trimmed, triggered: false };

  for (const re of GENERIC_CLOSER_PATTERNS) {
    if (re.test(lastLine)) {
      const stripped = stripTrailingGenericClosers(trimmed.replace(lastLine, "").trim());
      const out = stripped.length > 0 ? stripped : trimmed;
      return { text: out, triggered: true, matchedAgainst: matched };
    }
  }

  const stem = lastLine.slice(0, 48);
  if (/^(how can i|what else|is there anything)/i.test(stem)) {
    const stripped = stripTrailingGenericClosers(trimmed.replace(lastLine, "").trim());
    if (stripped.length > 0) {
      return { text: stripped, triggered: true, matchedAgainst: matched };
    }
  }

  return { text: trimmed, triggered: false };
}

export type ShapeMalvReplyOptions = {
  priorAssistantTexts?: string[];
};

export type ShapeMalvReplyResult = {
  text: string;
  repetitionGuardTriggered: boolean;
  hadModelIdentityLeak: boolean;
};

/** Legacy / extra leakage (training meta, browsing claims) — strip without full rewrite. */
const AUX_STRIP_PATTERNS: RegExp[] = [
  /\bmy (training|knowledge) (cutoff|date|includes)[^.!?\n]*[.!?]?/gi,
  /\bI cannot browse the (internet|web)[^.!?\n]{0,80}(?:but|however)[^.!?\n]*[.!?]?/gi,
  /\b(as (a |an )?)?(OpenAI|Anthropic|Meta AI|Google AI|Microsoft)[^.!?\n]{0,100}\b(?:model|assistant|LLM)\b[^.!?\n]*[.!?]?/gi,
  /\btrained by (OpenAI|Anthropic|Alibaba|Meta|Google)[^.!?\n]*/gi
];

/**
 * Vendor / base-model self-identification — one phrase or sentence at a time.
 */
const IDENTITY_LEAK_PATTERNS: RegExp[] = [
  /\bI['']m\s+Qwen\b[^.!?\n]*[.!?]?/gi,
  /\bI\s+am\s+Qwen\b[^.!?\n]*[.!?]?/gi,
  /\bI['']m\s+(?:a\s+)?(?:large\s+language\s+model\s+)?(?:Qwen|GPT|Claude|Gemini|Llama|Mistral|Mixtral|DeepSeek)\b[^.!?\n]*[.!?]?/gi,
  /\bI\s+am\s+(?:a\s+)?(?:large\s+language\s+model\s+)?(?:Qwen|GPT|Claude|Gemini|Llama|Mistral|Mixtral|DeepSeek)\b[^.!?\n]*[.!?]?/gi,
  /\bI['']m\s+an\s+AI\s+assistant\s+created\s+by\b[^.!?\n]*[.!?]?/gi,
  /\bI\s+am\s+an\s+AI\s+assistant\s+created\s+by\b[^.!?\n]*[.!?]?/gi,
  /\blarge\s+language\s+model\s+created\s+by\b[^.!?\n]*[.!?]?/gi,
  /\bcreated\s+by\s+Alibaba\s+Cloud\b[^.!?\n]*[.!?]?/gi,
  /\bI['']m[^.!?\n]{0,160}Alibaba\s+Cloud\b[^.!?\n]*[.!?]?/gi,
  /\bI\s+am[^.!?\n]{0,160}Alibaba\s+Cloud\b[^.!?\n]*[.!?]?/gi,
  /\bI['']m\s+(?:a\s+)?(?:assistant\s+)?(?:developed|created|trained)\s+by\b[^.!?\n]*[.!?]?/gi,
  /\bI\s+am\s+(?:a\s+)?(?:assistant\s+)?(?:developed|created|trained)\s+by\b[^.!?\n]*[.!?]?/gi
];

function stripWithPatterns(text: string, patterns: RegExp[]): string {
  let out = text;
  for (const re of patterns) {
    re.lastIndex = 0;
    out = out.replace(re, "");
  }
  return out;
}

function stripIdentityPatterns(text: string): { out: string; hadLeak: boolean } {
  let out = text;
  let hadLeak = false;
  for (const re of IDENTITY_LEAK_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, () => {
      hadLeak = true;
      return "";
    });
  }
  return { out, hadLeak };
}

/**
 * Strip common model self-identification; replace collapsed intro with MALV-safe identity when needed.
 */
export function stripModelIdentityLeakage(text: string): string {
  const raw = text.trim();
  if (!raw) return raw;

  const identityPass = stripIdentityPatterns(raw);
  let out = identityPass.out;
  const hadIdentityLeak = identityPass.hadLeak;

  out = stripWithPatterns(out, AUX_STRIP_PATTERNS);
  out = out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "").trim();

  out = out.replace(/^[,.;:\s]+/, "").trim();
  out = out.replace(/\n{3,}/g, "\n\n").trim();

  if (hadIdentityLeak && out.length === 0) {
    return MALV_IDENTITY_SAFE_FALLBACK;
  }

  if (hadIdentityLeak && out.length > 0) {
    const startsLower = /^[a-z]/.test(out);
    const startsWithGap = /^(and|but|also|so|here|,)/i.test(out);
    if (startsLower || startsWithGap) {
      const rest = out.replace(/^(and|but|also|so|here|,)\s*/i, "").trim();
      return `${MALV_IDENTITY_SAFE_FALLBACK}\n\n${rest}`;
    }
  }

  return out;
}

/**
 * If the model only returned generic assistant filler, replace with MALV-grounded line.
 */
function replaceContentFreeGenericShell(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (GENERIC_WHOLE_REPLY.test(t)) {
    return MALV_IDENTITY_SAFE_FALLBACK;
  }
  return t;
}

/**
 * Combine shaping passes for a final user-visible reply.
 */
export function shapeMalvReply(raw: string, options?: ShapeMalvReplyOptions): ShapeMalvReplyResult {
  const prior = (options?.priorAssistantTexts ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .slice(-4);

  const leakProbe = stripIdentityPatterns(raw.trim());

  let text = stripModelIdentityLeakage(raw);
  text = replaceContentFreeGenericShell(text);

  const rep = applyRepetitionGuard(text, prior);
  text = rep.text;
  text = stripTrailingGenericClosers(text);
  text = stripLeadingHollowOpeners(text);
  text = stripTrailingGenericClosers(text);

  if (!text.trim()) {
    text = MALV_IDENTITY_SAFE_FALLBACK;
  }

  return {
    text: text.trim(),
    repetitionGuardTriggered: rep.triggered,
    hadModelIdentityLeak: leakProbe.hadLeak
  };
}
