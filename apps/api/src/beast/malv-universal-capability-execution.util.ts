import type { MalvUniversalCapabilityRoute } from "./malv-universal-capability-router.util";
import type { MalvRichResponse } from "./malv-rich-response.types";
import { runMalvWebCapabilityPipeline, type MalvWebRetrievalTelemetry } from "./malv-web-retrieval.pipeline";

export type MalvUniversalCapabilityExecutionResult = {
  ok: boolean;
  /** True when route was plain_model — no tool run. */
  skipped?: boolean;
  error?: string;
  /**
   * Grounding block merged into worker context (facts, numbers, URLs) — not user-facing instructions.
   */
  promptInjection: string;
  /** When ok and not skipped, structured payload for UI + optional `text` seed. */
  rich: MalvRichResponse | null;
};

export { extractFinanceSymbolHint } from "./malv-finance-symbol-hint.util";

function simulateExecutionFailureFromEnv(): boolean {
  const v = (process.env.MALV_SIMULATE_CAPABILITY_EXECUTION_FAILURE ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Async universal capability execution (live finance quotes, Brave-backed search, bounded HTML fetch).
 * Plain model returns immediately; failures never fabricate sources or media.
 */
export async function runMalvUniversalCapabilityExecution(args: {
  userText: string;
  route: MalvUniversalCapabilityRoute;
  signal?: AbortSignal;
}): Promise<{ execution: MalvUniversalCapabilityExecutionResult; webTelemetry: MalvWebRetrievalTelemetry | null }> {
  const { route, userText } = args;
  if (route.responseMode === "plain_model") {
    return {
      execution: { ok: true, skipped: true, promptInjection: "", rich: null },
      webTelemetry: null
    };
  }

  if (simulateExecutionFailureFromEnv()) {
    return {
      execution: {
        ok: false,
        error: "simulated_capability_execution_failure",
        promptInjection: "",
        rich: null
      },
      webTelemetry: null
    };
  }

  const out = await runMalvWebCapabilityPipeline({
    userText,
    route,
    signal: args.signal
  });

  return {
    execution: {
      ok: out.ok,
      skipped: out.skipped,
      error: out.error,
      promptInjection: out.promptInjection,
      rich: out.rich
    },
    webTelemetry: out.telemetry
  };
}
