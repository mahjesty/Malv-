import type { BeastInferenceResponse } from "./client/beast-worker.client";
import type { ExecutionStrategyResult } from "./execution-strategy.service";
import { runMalvChatWorkerAutoContinuation } from "./malv-chat-worker-auto-continuation.util";

describe("runMalvChatWorkerAutoContinuation", () => {
  const strategy: ExecutionStrategyResult = {
    mode: "single_step",
    internalPhases: [],
    preferBeastWorker: false,
    riskTier: "low"
  };

  it("stops on empty continuation candidate (bounded)", async () => {
    const base: BeastInferenceResponse = {
      reply: "Partial …",
      meta: { finishReason: "length", malvTurnOutcome: "complete" }
    };
    const infer = jest.fn().mockResolvedValue({ reply: "", meta: {} });
    const out = await runMalvChatWorkerAutoContinuation(base, {
      userMessage: "Explain quantum computing in depth",
      malvExecutionStrategy: strategy,
      continuationMax: 2,
      runId: "run-x",
      inferContinuation: infer,
      onThinking: jest.fn(),
      logger: { log: jest.fn() }
    });
    expect(infer).toHaveBeenCalledTimes(1);
    const cont = (out.meta as Record<string, unknown>).malvContinuation as Record<string, unknown>;
    expect(cont.stopReason).toBe("empty");
    expect(cont.max).toBe(2);
  });

  it("tolerates one weak append when the prior reply still looks structurally incomplete", async () => {
    const base: BeastInferenceResponse = {
      reply: "Code:\n```ts\nconst x = 1;",
      meta: { finishReason: "length", malvTurnOutcome: "complete" }
    };
    const infer = jest.fn().mockResolvedValue({
      reply: "Code:\n```ts\nconst x = 1;\n```\nshort",
      meta: { finishReason: "stop", malvTurnOutcome: "complete" }
    });
    const out = await runMalvChatWorkerAutoContinuation(base, {
      userMessage: "Show code",
      malvExecutionStrategy: strategy,
      continuationMax: 2,
      runId: "run-y",
      inferContinuation: infer,
      onThinking: jest.fn(),
      forwardStreamAppend: jest.fn(),
      logger: { log: jest.fn() }
    });
    expect(infer).toHaveBeenCalled();
    const cont = (out.meta as Record<string, unknown>).malvContinuation as Record<string, unknown>;
    expect(cont.weakAppendCount).toBeGreaterThanOrEqual(1);
    expect(cont).toMatchObject({ finalCanContinue: expect.any(Boolean) });
    expect(Object.prototype.hasOwnProperty.call(cont, "finalContinueReason")).toBe(true);
  });

  it("still respects max attempts when continuation remains flagged", async () => {
    const base: BeastInferenceResponse = {
      reply: "Tail and …",
      meta: { finishReason: "length", malvTurnOutcome: "complete" }
    };
    const infer = jest.fn().mockResolvedValue({
      reply: "Tail and … tiny",
      meta: { finishReason: "length", malvTurnOutcome: "complete" }
    });
    const out = await runMalvChatWorkerAutoContinuation(base, {
      userMessage: "Go on",
      malvExecutionStrategy: strategy,
      continuationMax: 2,
      runId: "run-z",
      inferContinuation: infer,
      onThinking: jest.fn(),
      logger: { log: jest.fn() }
    });
    const cont = (out.meta as Record<string, unknown>).malvContinuation as Record<string, unknown>;
    expect(cont.count).toBeLessThanOrEqual(2);
    expect(["bounded_max_reached", "no_meaningful_new_text", "completed", "completed_after_weak_append"]).toContain(
      cont.stopReason
    );
  });
});
