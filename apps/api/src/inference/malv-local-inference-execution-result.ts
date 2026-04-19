import type { BeastInferenceResponse } from "../beast/client/beast-worker.client";

/**
 * Deterministic outcome of a single local OpenAI-compatible chat/completions attempt.
 * Drives orchestrator routing, shaping policy, and turn finalization (no ambiguous booleans).
 */
export type MalvLocalInferenceExecutionResult =
  | {
      mode: "stream_complete";
      /** Raw accumulated assistant text from SSE deltas (persist/stream alignment). */
      accumulatedText: string;
      emittedAnyText: true;
      model?: string;
      usage?: unknown;
      correlationId: string;
    }
  | {
      mode: "stream_partial";
      accumulatedText: string;
      emittedAnyText: true;
      errorMessage: string;
      model?: string;
      usage?: unknown;
      correlationId: string;
    }
  | {
      mode: "non_stream_complete";
      text: string;
      emittedAnyText: false;
      model?: string;
      usage?: unknown;
      timings?: unknown;
      correlationId: string;
    }
  | {
      mode: "failed_before_output";
      emittedAnyText: false;
      errorMessage: string;
      correlationId: string;
    };

/** MALV assistant turn outcome for persistence + single client done event. */
export type MalvAssistantTurnOutcome = "complete" | "partial_done" | "failed_before_output";

export function malvLocalInferenceExecutionResultToWorkerResponse(
  r: Exclude<MalvLocalInferenceExecutionResult, { mode: "failed_before_output" }>
): BeastInferenceResponse {
  switch (r.mode) {
    case "stream_complete": {
      const raw = r.accumulatedText;
      return {
        reply: raw,
        meta: {
          malvReplySource: "local_openai_compatible",
          malvInferenceProvider: "local_openai_compatible",
          malvLocalInferenceExecutionMode: r.mode,
          malvLocalStreamingDerived: true,
          malvLocalInferenceModel: r.model,
          malvLocalInferenceUsage: r.usage,
          malvCorrelationId: r.correlationId,
          malvLocalInferenceStreaming: true,
          malvLocalInferenceStreamedToClient: r.emittedAnyText,
          malvTurnOutcome: "complete" satisfies MalvAssistantTurnOutcome
        }
      };
    }
    case "stream_partial": {
      return {
        reply: r.accumulatedText,
        meta: {
          malvReplySource: "local_openai_compatible",
          malvInferenceProvider: "local_openai_compatible",
          malvLocalInferenceExecutionMode: r.mode,
          malvLocalStreamingDerived: true,
          malvLocalInferenceModel: r.model,
          malvLocalInferenceUsage: r.usage,
          malvCorrelationId: r.correlationId,
          malvLocalInferenceStreaming: true,
          malvLocalInferenceStreamedToClient: r.emittedAnyText,
          malvTurnOutcome: "partial_done" satisfies MalvAssistantTurnOutcome,
          malvStreamPartialError: r.errorMessage
        }
      };
    }
    case "non_stream_complete": {
      return {
        reply: r.text,
        meta: {
          malvReplySource: "local_openai_compatible",
          malvInferenceProvider: "local_openai_compatible",
          malvLocalInferenceExecutionMode: r.mode,
          malvLocalStreamingDerived: false,
          malvLocalInferenceModel: r.model,
          malvLocalInferenceUsage: r.usage,
          malvLocalInferenceTimings: r.timings,
          malvCorrelationId: r.correlationId,
          malvLocalInferenceStreaming: false,
          malvLocalInferenceStreamedToClient: false,
          malvTurnOutcome: "complete" satisfies MalvAssistantTurnOutcome
        }
      };
    }
    default: {
      const _never: never = r;
      return _never;
    }
  }
}
