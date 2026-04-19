/**
 * Intake layer: live delta → canonical assistant string (chunk join + light boundary repair).
 * Does not run when hydrating persisted rows — only {@link appendAssistantStreamCanonical} from the hook.
 */
export type AssistantStreamCanonical = { messageId: string; text: string };

const CODE_FENCE = "```";

function countTripleBackticks(s: string): number {
  let n = 0;
  let i = 0;
  while ((i = s.indexOf(CODE_FENCE, i)) !== -1) {
    n++;
    i += CODE_FENCE.length;
  }
  return n;
}

export function isBaseInsideStreamingCodeFence(base: string): boolean {
  return countTripleBackticks(base) % 2 === 1;
}

export function isBaseInsideStreamingUrlTail(base: string): boolean {
  return /(?:https?:\/\/|www\.)[^\s]*$/i.test(base);
}

const TINY_GAP_WHOLE_DELTA =
  /^(up|in|on|at|if|or|as|is|it|an|we|to|of|the|a|with|from|for|by|via|per|vs|me|my|us|do|so|no|go|be|am|id|ok|hi|re|un)$/i;

function endsWithClauseOrClosingPunctForLetter(baseTrimEnd: string): boolean {
  const ch = baseTrimEnd[baseTrimEnd.length - 1];
  if (!ch) return false;
  switch (ch) {
    case ".":
    case "!":
    case "?":
    case ",":
    case ";":
    case ":":
    case ")":
    case "]":
    case "}":
      return true;
    default:
      return false;
  }
}

function deltaStartsWithPunctuationNoGap(first: string): boolean {
  return /^[.,;:!?)\]}>'"`~\-_/\\]$/.test(first);
}

export function computeStreamJoinGap(base: string, delta: string): string {
  if (!base.length || !delta.length) return "";
  if (/^\s/.test(delta)) return "";
  if (/\s$/.test(base)) return "";

  if (isBaseInsideStreamingCodeFence(base) || isBaseInsideStreamingUrlTail(base)) {
    return "";
  }

  const last = base[base.length - 1]!;
  const first = delta[0]!;

  const baseTrimEnd = base.replace(/\s+$/, "");
  const lastSig = baseTrimEnd.length ? baseTrimEnd[baseTrimEnd.length - 1]! : last;

  if (lastSig && endsWithClauseOrClosingPunctForLetter(baseTrimEnd) && /^[A-Za-z]/.test(delta)) {
    return " ";
  }

  const lastIsLower = /[a-z]$/.test(last);
  const lastIsDigit = /\d$/.test(last);
  const firstIsLower = /^[a-z]/.test(delta);
  const firstIsUpper = /^[A-Z]/.test(delta);

  if (lastIsDigit && /^\d/.test(delta)) return "";

  if ((lastIsLower || /[A-Za-z]$/.test(last)) && deltaStartsWithPunctuationNoGap(first)) {
    return "";
  }

  if ((lastIsLower || lastIsDigit) && firstIsUpper) {
    return " ";
  }

  if (lastIsDigit && firstIsUpper) {
    return " ";
  }

  if (lastIsLower && /^\d/.test(delta)) return "";

  if (lastIsLower && firstIsLower) {
    if (delta.length >= 4) return " ";
    if (TINY_GAP_WHOLE_DELTA.test(delta)) return " ";
    return "";
  }

  if (lastIsDigit && firstIsLower) return "";

  return "";
}

export function applyLowerUpperWordBreaksOutsideFences(text: string): string {
  const parts = text.split(CODE_FENCE);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i]!.replace(/([a-z])([A-Z])/g, "$1 $2");
  }
  return parts.join(CODE_FENCE);
}

export function shouldInsertStreamGapBetweenChunks(base: string, delta: string): boolean {
  return computeStreamJoinGap(base, delta) === " ";
}

export function appendAssistantStreamCanonical(
  current: AssistantStreamCanonical | null,
  messageId: string,
  rowContentFallback: string,
  delta: string
): AssistantStreamCanonical {
  const base = current && current.messageId === messageId ? current.text : rowContentFallback;
  if (!delta.length) {
    return { messageId, text: base };
  }
  const gap = computeStreamJoinGap(base, delta);
  const merged = base + gap + delta;
  const text = applyLowerUpperWordBreaksOutsideFences(merged);
  return {
    messageId,
    text
  };
}
