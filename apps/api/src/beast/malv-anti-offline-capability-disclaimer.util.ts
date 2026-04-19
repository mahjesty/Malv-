import type { MalvUniversalCapabilityRoute } from "./malv-universal-capability-router.util";

/**
 * Model phrases that contradict MALV's routed capability posture (retrieval / finance / sources / visuals).
 * Used only when {@link malvRouteExpectsLiveOrGroundedCapabilities} is true.
 */
/**
 * When a tool route is active, strip “go search yourself / check this URL” deferrals from model text.
 */
export const MALV_INSTRUCTION_ONLY_CAPABILITY_PATTERNS: RegExp[] = [
  /\b(?:please |)(?:check|visit|see)\s+(?:the\s+)?(?:official\s+)?(?:web\s*site|website|site)\b[^.!?\n]{0,160}[.!?]?/gi,
  /\b(?:you can|you should|you may)\s+(?:try\s+)?(?:searching|googling|looking\s+up)\b[^.!?\n]{0,160}[.!?]?/gi,
  /\btry\s+(?:a\s+|an\s+|)(?:quick\s+|)(?:web\s+)?search\b[^.!?\n]{0,160}[.!?]?/gi,
  /\bsearch\s+(?:online|the\s+web)\s+for\b[^.!?\n]{0,160}[.!?]?/gi,
  /\bfor\s+the\s+latest,?\s+(?:see|check|visit)\b[^.!?\n]{0,160}[.!?]?/gi,
  /\blook\s+it\s+up\s+(?:on\s+)?(?:google|the\s+web)\b[^.!?\n]{0,160}[.!?]?/gi
];

export const MALV_OFFLINE_CAPABILITY_DISCLAIMER_PATTERNS: RegExp[] = [
  /\bI don'?t have (?:access to |)(?:real[- ]?time|live|current)\b[^.!?\n]{0,120}[.!?]?/gi,
  /\bI (?:can'?t|cannot) browse (?:the )?(?:web|internet)\b[^.!?\n]*[.!?]?/gi,
  /\bI (?:can'?t|cannot) (?:access|search) (?:the )?internet\b[^.!?\n]*[.!?]?/gi,
  /\bI don'?t have internet access\b[^.!?\n]*[.!?]?/gi,
  /\bmy (?:training|knowledge) (?:cutoff|is (?:fixed|static)|does not include (?:today|current))\b[^.!?\n]*[.!?]?/gi,
  /\bI (?:can'?t|cannot) (?:look up|fetch|pull) (?:live|current|up[- ]to[- ]date)\b[^.!?\n]*[.!?]?/gi,
  /\bcheck (?:the )?(?:official )?(?:website|site)\b[^.!?\n]{0,120}[.!?]?/gi,
  /\byou (?:should |)(?:can |)check (?:online|the web|a financial site)\b[^.!?\n]*[.!?]?/gi,
  /\bI (?:can'?t|cannot) provide (?:real[- ]?time|live) (?:quotes?|prices?)\b[^.!?\n]*[.!?]?/gi
];

export function malvRouteExpectsLiveOrGroundedCapabilities(route: MalvUniversalCapabilityRoute | null | undefined): boolean {
  if (!route) return false;
  return route.responseMode !== "plain_model";
}

function stripWithPatterns(text: string, patterns: RegExp[]): string {
  let out = text;
  for (const re of patterns) {
    re.lastIndex = 0;
    out = out.replace(re, "");
  }
  return out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "").trim();
}

const ANTI_LIMITATION_BRIDGE =
  "MALV is running this turn under an external-grounding route — answer with concrete facts from context or tool output, and skip capability disclaimers.\n\n";

/**
 * Removes offline-model disclaimers when this turn was routed for live / sourced / finance / visual grounding.
 */
export function stripMalvOfflineCapabilityDisclaimers(text: string, route: MalvUniversalCapabilityRoute | null | undefined): string {
  if (!malvRouteExpectsLiveOrGroundedCapabilities(route)) return text;
  const stripped = stripWithPatterns(text, MALV_OFFLINE_CAPABILITY_DISCLAIMER_PATTERNS);
  if (stripped.length < 8 && text.trim().length > 40) {
    return `${ANTI_LIMITATION_BRIDGE}${stripped}`.trim();
  }
  if (stripped.length < text.trim().length * 0.35 && stripped.length < 24) {
    return `${ANTI_LIMITATION_BRIDGE}${stripped}`.trim();
  }
  return stripped;
}

/** Removes “do your own web research” phrasing when this turn is already on an execution-backed route. */
export function stripMalvInstructionOnlyCapabilityDeferrals(
  text: string,
  route: MalvUniversalCapabilityRoute | null | undefined
): string {
  if (!malvRouteExpectsLiveOrGroundedCapabilities(route)) return text;
  return stripWithPatterns(text, MALV_INSTRUCTION_ONLY_CAPABILITY_PATTERNS);
}
