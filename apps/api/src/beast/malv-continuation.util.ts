import type { ExecutionStrategyResult } from "./execution-strategy.service";

export type MalvContinuationReason =
  | "length"
  | "partial_done"
  | "truncated"
  | "stream_partial"
  | "non_stop_finish_reason"
  | "unknown";

export type MalvContinuationMode = "auto" | "manual";

export type MalvContinuationPlan = {
  canContinue: boolean;
  continueReason: MalvContinuationReason | null;
  continuationCursor: string | null;
  continuationMode: MalvContinuationMode;
};

const COMPLETE_FINISH_REASONS = new Set(["stop", "completed", "complete", "done", "success", "eos", "end_turn"]);
const TRUNCATED_FINISH_REASONS = new Set(["length", "max_tokens", "max_output_tokens", "token_limit", "context_length"]);

function normalizeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v.length > 0 ? v : null;
}

export function detectMalvContinuationPlan(args: {
  meta?: Record<string, unknown> | null;
  reply: string;
  preferAutoContinuation?: boolean;
}): MalvContinuationPlan {
  const meta = args.meta ?? {};
  const explicitOutcome = normalizeReason(meta.malvTurnOutcome);
  const finishReason = normalizeReason(meta.malvLastFinishReason ?? meta.finishReason ?? meta.finish_reason ?? meta.stopReason);
  const streamMode = normalizeReason(meta.malvLocalInferenceExecutionMode);
  const truncatedFlag = meta.malvTruncated === true || meta.truncated === true;

  let continueReason: MalvContinuationReason | null = null;

  if (explicitOutcome === "partial_done") {
    continueReason = "partial_done";
  } else if (streamMode === "stream_partial") {
    continueReason = "stream_partial";
  } else if (truncatedFlag) {
    continueReason = "truncated";
  } else if (finishReason && TRUNCATED_FINISH_REASONS.has(finishReason)) {
    continueReason = "length";
  } else if (finishReason && !COMPLETE_FINISH_REASONS.has(finishReason)) {
    continueReason = "non_stop_finish_reason";
  }

  if (!continueReason && args.reply.trim().length > 0 && /(?:\.\.\.|…)\s*$/.test(args.reply.trim())) {
    continueReason = "truncated";
  }

  const cursor = buildContinuationCursor(args.reply);
  return {
    canContinue: continueReason !== null,
    continueReason,
    continuationCursor: cursor,
    continuationMode: args.preferAutoContinuation === false ? "manual" : "auto"
  };
}

export function buildMalvContinuationPrompt(args: {
  userMessage: string;
  priorReply: string;
  continuationCursor?: string | null;
  plan: MalvContinuationPlan;
  executionStrategy?: ExecutionStrategyResult | null;
  continuationIndex: number;
}): string {
  const isBuildPhased = isLikelyLargeBuildTask({
    userMessage: args.userMessage,
    executionStrategy: args.executionStrategy ?? null
  });
  const cursor = args.continuationCursor ?? args.plan.continuationCursor ?? "continue from the last unfinished sentence";
  const header = `You are continuing a previously truncated MALV assistant answer. Continuation attempt ${args.continuationIndex}.`;
  const rules = [
    "Continue exactly from where the previous answer stopped.",
    "Do not repeat completed sections, headings, or opening lines.",
    "Start with the next unfinished sentence or section.",
    "Preserve structure, tone, and technical accuracy.",
    isBuildPhased
      ? "Continue with the next phase only; do not restart the whole project."
      : "Only add new content that was missing from the prior output."
  ].join("\n- ");
  return `${header}

Original user request:
${args.userMessage}

Last assistant output (possibly partial):
${args.priorReply}

Continuation cursor:
${cursor}

Follow these rules:
- ${rules}`;
}

export function extractMeaningfulContinuationAppend(args: { prior: string; candidate: string }): string {
  const prior = args.prior.trim();
  const candidate = args.candidate.trim();
  if (!candidate) return "";
  if (!prior) return candidate;
  if (candidate === prior) return "";

  if (candidate.startsWith(prior)) {
    return candidate.slice(prior.length).trim();
  }

  const overlapWindow = Math.min(240, prior.length, candidate.length);
  for (let n = overlapWindow; n >= 24; n--) {
    const suffix = prior.slice(prior.length - n).toLowerCase();
    const prefix = candidate.slice(0, n).toLowerCase();
    if (suffix === prefix) {
      return candidate.slice(n).trim();
    }
  }

  // If the model starts over, avoid appending a near-duplicate body.
  const priorNorm = prior.toLowerCase().replace(/\s+/g, " ");
  const candNorm = candidate.toLowerCase().replace(/\s+/g, " ");
  if (candNorm.includes(priorNorm.slice(0, Math.min(priorNorm.length, 160)))) {
    return "";
  }

  return candidate;
}

function buildContinuationCursor(reply: string): string | null {
  const clean = reply.trim();
  if (!clean) return null;
  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return lines[lines.length - 1]!.slice(0, 180);
}

export function isLikelyLargeBuildTask(args: {
  userMessage: string;
  executionStrategy?: ExecutionStrategyResult | null;
}): boolean {
  const m = args.userMessage.toLowerCase();
  const buildSignals =
    /\b(build|create|develop|generate|ship|scaffold)\b.*\b(website|web app|app|application|full[- ]stack|saas|dashboard|admin panel|platform|backend|frontend)\b/.test(
      m
    ) ||
    /\b(auth|authentication|database|schema|api routes?|deployment|integration)\b/.test(m);
  const longRequest = m.length >= 150;
  const buildScopeSignals = [/\bauth|authentication\b/, /\bdatabase|schema|sql|prisma|orm\b/, /\bapi routes?|backend\b/, /\bfrontend|dashboard|admin panel|ui\b/]
    .map((rx) => (rx.test(m) ? 1 : 0))
    .reduce<number>((a, b) => a + b, 0);
  const strategyPhased = args.executionStrategy?.mode === "phased";
  const manyPhases = (args.executionStrategy?.internalPhases.length ?? 0) >= 6;
  return (buildSignals && (longRequest || strategyPhased || buildScopeSignals >= 2)) || manyPhases;
}
