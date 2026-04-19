import { applyMalvAssistantVisibleCompletionBackstop, enforceMalvTurnOutcomeBackstop } from "./malv-turn-outcome-backstop.util";

describe("enforceMalvTurnOutcomeBackstop", () => {
  it("downgrades length finish reason with skipped continuation to partial_done", () => {
    const logger = { error: jest.fn() };
    const out = enforceMalvTurnOutcomeBackstop({
      meta: {
        malvLastFinishReason: "length",
        malvTurnOutcome: "complete",
        malvContinuationSkipped: true
      },
      reply: "partial answer ...",
      currentOutcome: "complete",
      runId: "run-1",
      logger,
      logContext: "assistant_message_persist"
    });

    expect(out.outcome).toBe("partial_done");
  });

  it("keeps normal stop as complete", () => {
    const logger = { error: jest.fn() };
    const out = enforceMalvTurnOutcomeBackstop({
      meta: {
        malvLastFinishReason: "stop",
        malvTurnOutcome: "complete"
      },
      reply: "done answer",
      currentOutcome: "complete",
      runId: "run-2",
      logger,
      logContext: "ai_job_persist"
    });

    expect(out.outcome).toBe("complete");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("keeps completion metadata when continuation already exists", () => {
    const logger = { error: jest.fn() };
    const out = enforceMalvTurnOutcomeBackstop({
      meta: {
        malvLastFinishReason: "length",
        malvTurnOutcome: "partial_done",
        malvContinuationPlan: {
          canContinue: true,
          continueReason: "length",
          continuationCursor: "cursor",
          continuationMode: "auto"
        }
      },
      reply: "partial answer ...",
      currentOutcome: "partial_done",
      runId: "run-3",
      logger,
      logContext: "ai_job_persist"
    });

    expect(out.meta.malvContinuationPlan).toEqual(
      expect.objectContaining({
        canContinue: true,
        continueReason: "length"
      })
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("applyMalvAssistantVisibleCompletionBackstop derives outcome from meta.malvTurnOutcome", () => {
    const logger = { error: jest.fn() };
    const out = applyMalvAssistantVisibleCompletionBackstop({
      meta: { malvTurnOutcome: "complete", malvLastFinishReason: "stop" },
      reply: "ok",
      runId: "run-apply",
      logger,
      logContext: "ai_job_persist"
    });
    expect(out.outcome).toBe("complete");
  });

  it("reflex-shaped greeting meta still downgrades when truncation risk appears on meta", () => {
    const logger = { error: jest.fn() };
    const out = applyMalvAssistantVisibleCompletionBackstop({
      meta: {
        malvTurnOutcome: "complete",
        malvReplySource: "malv_greeting_short_circuit",
        malvLastFinishReason: "length"
      },
      reply: "Hello …",
      runId: "run-reflex-shape",
      logger,
      logContext: "ai_job_persist"
    });
    expect(out.outcome).toBe("partial_done");
    expect(out.meta.malvContinuationPlan).toEqual(expect.objectContaining({ canContinue: true }));
  });

  it("logs invariant when truncated finish arrives without continuation metadata", () => {
    const logger = { error: jest.fn() };
    const out = enforceMalvTurnOutcomeBackstop({
      meta: {
        malvLastFinishReason: "length",
        malvTurnOutcome: "complete"
      },
      reply: "partial answer ...",
      currentOutcome: "complete",
      runId: "run-4",
      logger,
      logContext: "assistant_message_persist"
    });

    expect(out.outcome).toBe("partial_done");
    expect(out.meta.malvContinuationPlan).toEqual(
      expect.objectContaining({
        canContinue: true,
        continueReason: "length"
      })
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("runId=run-4"));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("truncated_finish_without_continuation_meta"));
  });
});
