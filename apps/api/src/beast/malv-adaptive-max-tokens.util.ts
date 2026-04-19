type MalvAdaptiveTokenBudgetContext = {
  userMessage: string;
  conversationLength: number;
  routeType?: string;
};

const DEFAULT_MIN_TOKENS = 320;
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_BASE_TOKENS = 640;
const DEFAULT_STRUCTURED_BOOST = 220;
const DEFAULT_CONVERSATION_BOOST = 28;
const DEFAULT_BREVITY_PENALTY = 120;
const HARD_MAX_TOKENS_BOUND = 4096;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

function resolveTokenBudgetConfig() {
  const minTokensRaw = parseIntegerEnv("MALV_CHAT_MAXTOKENS_MIN", DEFAULT_MIN_TOKENS);
  const baseTokensRaw = parseIntegerEnv("MALV_CHAT_MAXTOKENS_BASE", DEFAULT_BASE_TOKENS);
  const maxTokensRaw = parseIntegerEnv("MALV_CHAT_MAXTOKENS_MAX", DEFAULT_MAX_TOKENS);
  const structuredBoost = clamp(
    parseIntegerEnv("MALV_CHAT_MAXTOKENS_STRUCTURED_BOOST", DEFAULT_STRUCTURED_BOOST),
    0,
    1200
  );
  const conversationBoost = clamp(
    parseIntegerEnv("MALV_CHAT_MAXTOKENS_CONVERSATION_BOOST", DEFAULT_CONVERSATION_BOOST),
    0,
    200
  );
  const brevityPenalty = clamp(
    parseIntegerEnv("MALV_CHAT_MAXTOKENS_BREVITY_PENALTY", DEFAULT_BREVITY_PENALTY),
    0,
    600
  );

  const minTokens = clamp(minTokensRaw, 64, HARD_MAX_TOKENS_BOUND);
  const maxTokens = clamp(maxTokensRaw, minTokens, HARD_MAX_TOKENS_BOUND);
  const baseTokens = clamp(baseTokensRaw, minTokens, maxTokens);

  return {
    minTokens,
    baseTokens,
    maxTokens,
    structuredBoost,
    conversationBoost,
    brevityPenalty
  };
}

function routeBonus(routeType: string | undefined): number {
  const route = (routeType ?? "").trim().toLowerCase();
  if (!route) return 0;
  if (route.includes("phased")) return 384;
  if (route.includes("execute") || route.includes("operator")) return 320;
  if (route.includes("analysis") || route.includes("plan")) return 256;
  if (route.includes("clarification") || route.includes("social") || route.includes("smalltalk")) return -192;
  return 0;
}

export function computeAdaptiveMaxTokens(context: MalvAdaptiveTokenBudgetContext): number {
  const cfg = resolveTokenBudgetConfig();
  const message = (context.userMessage ?? "").trim();
  const messageChars = message.length;
  const lineCount = message ? message.split(/\r?\n/).length : 0;

  const conversationBonus = clamp(context.conversationLength * cfg.conversationBoost, 0, 280);
  const messageSizeBonus = clamp(Math.floor(messageChars / 3), 0, 420);
  const multilineBonus = lineCount >= 6 ? 140 : lineCount >= 3 ? 80 : 0;
  const structuredAskBonus =
    /\b(json|yaml|table|schema|steps|checklist|plan|migration|refactor|architecture|debug|implement)\b/i.test(
      message
    )
      ? cfg.structuredBoost
      : 0;
  const explicitBrevityPenalty =
    /\bbrief|short|concise|one sentence|tl;dr\b/i.test(message) ? -cfg.brevityPenalty : 0;

  const candidate =
    cfg.baseTokens +
    conversationBonus +
    messageSizeBonus +
    multilineBonus +
    structuredAskBonus +
    routeBonus(context.routeType) +
    explicitBrevityPenalty;

  return clamp(candidate, cfg.minTokens, cfg.maxTokens);
}
