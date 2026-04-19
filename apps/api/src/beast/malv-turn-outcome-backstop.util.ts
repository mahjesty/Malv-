import { detectMalvContinuationPlan } from "./malv-continuation.util";

type LoggerLike = {
  error: (message: string) => void;
};

const TRUNCATED_FINISH_REASONS = new Set(["length", "max_tokens", "max_output_tokens", "token_limit", "context_length"]);

function normalizeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v.length > 0 ? v : null;
}

function isTruncatedFinishReason(meta: Record<string, unknown>): boolean {
  const finishReason = normalizeReason(meta.malvLastFinishReason ?? meta.finishReason ?? meta.finish_reason ?? meta.stopReason);
  return finishReason !== null && TRUNCATED_FINISH_REASONS.has(finishReason);
}

function hasContinuationMetadata(meta: Record<string, unknown>): boolean {
  const plan = meta.malvContinuationPlan;
  const continuation = meta.malvContinuation;
  const hasPlanObject = Boolean(plan && typeof plan === "object" && !Array.isArray(plan));
  const hasContinuationObject = Boolean(continuation && typeof continuation === "object" && !Array.isArray(continuation));
  return hasPlanObject || hasContinuationObject;
}

function wasContinuationSkipped(meta: Record<string, unknown>): boolean {
  if (meta.malvContinuationSkipped === true) return true;
  const continuation = meta.malvContinuation;
  if (continuation && typeof continuation === "object" && !Array.isArray(continuation)) {
    const c = continuation as Record<string, unknown>;
    if (c.skipped === true) return true;
    const status = normalizeReason(c.status);
    if (status === "skipped") return true;
  }
  return false;
}

export type MalvAssistantVisiblePersistOutcome = "complete" | "partial_done" | "failed_before_output";

/**
 * Resolves explicit `malvTurnOutcome` from meta and applies {@link enforceMalvTurnOutcomeBackstop}.
 * Shared by main inferencing, phased, and reflex-style assistant-visible persistence paths.
 */
export function applyMalvAssistantVisibleCompletionBackstop(args: {
  meta: Record<string, unknown> | null | undefined;
  reply: string;
  runId: string;
  logger: LoggerLike;
  logContext: "ai_job_persist" | "assistant_message_persist";
}): {
  meta: Record<string, unknown>;
  outcome: MalvAssistantVisiblePersistOutcome;
  invariantBreached: boolean;
} {
  const meta = args.meta ?? {};
  const raw = meta.malvTurnOutcome;
  const currentOutcome: MalvAssistantVisiblePersistOutcome =
    raw === "partial_done" ? "partial_done" : raw === "failed_before_output" ? "failed_before_output" : "complete";
  return enforceMalvTurnOutcomeBackstop({
    meta: meta as Record<string, unknown>,
    reply: args.reply,
    currentOutcome,
    runId: args.runId,
    logger: args.logger,
    logContext: args.logContext
  });
}

export function enforceMalvTurnOutcomeBackstop(args: {
  meta: Record<string, unknown> | null | undefined;
  reply: string;
  currentOutcome: "complete" | "partial_done" | "failed_before_output";
  runId: string;
  logger: LoggerLike;
  logContext: "ai_job_persist" | "assistant_message_persist";
}): {
  meta: Record<string, unknown>;
  outcome: "complete" | "partial_done" | "failed_before_output";
  invariantBreached: boolean;
} {
  const meta = { ...(args.meta ?? {}) } as Record<string, unknown>;
  const continuationMetadataMissingAtPersist = !hasContinuationMetadata(meta);
  if (continuationMetadataMissingAtPersist) {
    meta.malvContinuationPlan = detectMalvContinuationPlan({ meta, reply: args.reply });
  }

  const truncated = isTruncatedFinishReason(meta);
  const continuationSkipped = wasContinuationSkipped(meta);
  const shouldDowngrade =
    truncated && (continuationMetadataMissingAtPersist || continuationSkipped) && args.currentOutcome === "complete";
  const outcome = shouldDowngrade ? "partial_done" : args.currentOutcome;

  if (truncated && continuationMetadataMissingAtPersist) {
    args.logger.error(
      `[MALV TURN INVARIANT] truncated_finish_without_continuation_meta runId=${args.runId} context=${args.logContext} finishReason=${String(
        meta.malvLastFinishReason ?? meta.finishReason ?? meta.finish_reason ?? meta.stopReason ?? "unknown"
      )} currentOutcome=${args.currentOutcome} persistedOutcome=${outcome}`
    );
  }

  return {
    meta,
    outcome,
    invariantBreached: truncated && continuationMetadataMissingAtPersist
  };
}
