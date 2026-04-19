import type { BeastInferenceResponse } from "./client/beast-worker.client";
import type { ExecutionStrategyResult } from "./execution-strategy.service";
import {
  buildMalvContinuationPrompt,
  detectMalvContinuationPlan,
  extractMeaningfulContinuationAppend,
  type MalvContinuationPlan
} from "./malv-continuation.util";
import { malvAssistantReplyLooksStructurallyIncomplete } from "./malv-assistant-reply-structure.util";

const MEANINGFUL_APPEND_MIN_CHARS = 24;

type LoggerLike = { log: (message: string) => void };

export type MalvChatWorkerAutoContinuationDeps = {
  userMessage: string;
  malvExecutionStrategy: ExecutionStrategyResult;
  continuationMax: number;
  runId: string;
  signal?: AbortSignal;
  inferContinuation: (args: {
    prompt: string;
    attempt: number;
    maxAttempts: number;
    continueReason: MalvContinuationPlan["continueReason"];
  }) => Promise<BeastInferenceResponse>;
  onThinking: (detail: string) => void;
  forwardStreamAppend?: (text: string) => void;
  logger: LoggerLike;
};

/**
 * Bounded worker auto-continuation shared by phased and non-phased inferencing paths.
 * Preserves prior telemetry shape under `meta.malvContinuation` while adding clearer stop metadata.
 */
export async function runMalvChatWorkerAutoContinuation(
  workerRes: BeastInferenceResponse,
  deps: MalvChatWorkerAutoContinuationDeps
): Promise<BeastInferenceResponse> {
  const continuationMax = deps.continuationMax;
  let continuationCount = 0;
  let continuationStopReason = "not_triggered";
  let continuationMeaningful = false;
  let weakAppendCount = 0;
  const continuationSnapshots: Array<Record<string, unknown>> = [];

  const initialPlan = detectMalvContinuationPlan({
    reply: workerRes.reply ?? "",
    meta: (workerRes.meta ?? {}) as Record<string, unknown>
  });

  if (initialPlan.canContinue && continuationMax > 0) {
    continuationStopReason = "max_not_reached";
    deps.logger.log(
      `[MALV CONTINUATION] start runId=${deps.runId} reason=${String(initialPlan.continueReason)} max=${continuationMax}`
    );
  }

  let out: BeastInferenceResponse = workerRes;

  while (initialPlan.canContinue && continuationCount < continuationMax) {
    if (deps.signal?.aborted) {
      continuationStopReason = "aborted";
      break;
    }
    continuationCount += 1;
    deps.onThinking(`continuing ${continuationCount}/${continuationMax}`);
    const continuationPrompt = buildMalvContinuationPrompt({
      userMessage: deps.userMessage,
      priorReply: out.reply ?? "",
      continuationCursor: initialPlan.continuationCursor,
      plan: initialPlan,
      executionStrategy: deps.malvExecutionStrategy,
      continuationIndex: continuationCount
    });
    const continuationRes = await deps.inferContinuation({
      prompt: continuationPrompt,
      attempt: continuationCount,
      maxAttempts: continuationMax,
      continueReason: initialPlan.continueReason
    });
    const continuationCandidate = (continuationRes.reply ?? "").trim();
    const continuationAppend = extractMeaningfulContinuationAppend({
      prior: out.reply ?? "",
      candidate: continuationCandidate
    });
    const meaningful = continuationAppend.length >= MEANINGFUL_APPEND_MIN_CHARS;
    const hasAppend = continuationAppend.trim().length > 0;
    const priorReply = out.reply ?? "";
    const structuralIncomplete = malvAssistantReplyLooksStructurallyIncomplete(priorReply);
    const weakAppendEligible =
      !meaningful && hasAppend && weakAppendCount < 1 && structuralIncomplete && continuationCandidate.length > 0;

    continuationSnapshots.push({
      attempt: continuationCount,
      reason: initialPlan.continueReason,
      candidateChars: continuationCandidate.length,
      appendChars: continuationAppend.length,
      meaningful,
      weakAppendEligible,
      structuralIncompletePrior: structuralIncomplete
    });

    if (continuationCandidate.length === 0) {
      continuationStopReason = "empty";
      break;
    }

    if (!meaningful && !weakAppendEligible) {
      continuationStopReason = "no_meaningful_new_text";
      break;
    }

    if (weakAppendEligible) {
      weakAppendCount += 1;
    }

    if (meaningful) {
      continuationMeaningful = true;
    }

    const separator = (out.reply ?? "").endsWith("\n") ? "\n" : "\n\n";
    out = {
      ...out,
      reply: `${out.reply ?? ""}${separator}${continuationAppend}`,
      meta: {
        ...(out.meta ?? {}),
        ...(continuationRes.meta ?? {}),
        malvContinuationAppended: true
      }
    };
    deps.forwardStreamAppend?.(`${separator}${continuationAppend}`);

    const nextPlan = detectMalvContinuationPlan({
      reply: out.reply ?? "",
      meta: (continuationRes.meta ?? {}) as Record<string, unknown>
    });
    if (!nextPlan.canContinue) {
      continuationStopReason = weakAppendEligible ? "completed_after_weak_append" : "completed";
      break;
    }
    if (continuationCount >= continuationMax) {
      continuationStopReason = "bounded_max_reached";
      break;
    }
  }

  if (initialPlan.canContinue && continuationStopReason === "max_not_reached") {
    continuationStopReason = "completed";
  }

  const finalPlan = detectMalvContinuationPlan({
    reply: out.reply ?? "",
    meta: (out.meta ?? {}) as Record<string, unknown>
  });

  out = {
    ...out,
    meta: {
      ...(out.meta ?? {}),
      malvContinuation: {
        triggered: initialPlan.canContinue,
        reason: initialPlan.continueReason,
        count: continuationCount,
        max: continuationMax,
        meaningful: continuationMeaningful,
        stopReason: continuationStopReason,
        weakAppendCount,
        finalCanContinue: finalPlan.canContinue,
        finalContinueReason: finalPlan.continueReason,
        attempts: continuationSnapshots
      }
    }
  };

  deps.logger.log(
    `[MALV CONTINUATION] end runId=${deps.runId} triggered=${initialPlan.canContinue} count=${continuationCount} meaningful=${continuationMeaningful} stop=${continuationStopReason} weak=${weakAppendCount}`
  );

  return out;
}
