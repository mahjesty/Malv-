import type { MalvUniversalCapabilityRoute, MalvUniversalResponseMode } from "./malv-universal-capability-router.util";
import {
  runMalvUniversalCapabilityExecution,
  type MalvUniversalCapabilityExecutionResult
} from "./malv-universal-capability-execution.util";
import type { MalvWebRetrievalTelemetry } from "./malv-web-retrieval.pipeline";

/**
 * Non-plain universal routes with concrete {@link runMalvUniversalCapabilityExecution} handlers.
 * If {@link MalvUniversalResponseMode} grows, TypeScript requires this map to be updated.
 */
const UNIVERSAL_ROUTE_EXECUTION_IMPLEMENTED: Record<Exclude<MalvUniversalResponseMode, "plain_model">, true> = {
  finance_data: true,
  web_research: true,
  image_enrichment: true,
  mixed_text_plus_visual: true,
  mixed_text_plus_sources: true
};

export function isMalvUniversalRouteExecutionImplemented(mode: MalvUniversalResponseMode): boolean {
  if (mode === "plain_model") return true;
  return Boolean(UNIVERSAL_ROUTE_EXECUTION_IMPLEMENTED[mode]);
}

/** Indirection so tests can `jest.spyOn` policy without module rebinding issues. */
export const malvUniversalRouteExecutionPolicy = {
  isImplemented: isMalvUniversalRouteExecutionImplemented
};

export type MalvUniversalRouteFinalOutputSource = "route_execution" | "plain_model_fallback" | "route_skipped_plain";

export type MalvUniversalRouteExecutionTelemetry = {
  malvUniversalRouteSelected: MalvUniversalResponseMode;
  malvUniversalRouteExecutionAttempted: boolean;
  malvUniversalRouteHandlerImplemented: boolean;
  malvUniversalRouteExecutionOk: boolean | null;
  malvUniversalRouteFallbackTriggered: boolean;
  malvUniversalRouteFallbackReason: string | null;
  malvUniversalRouteFinalOutputSource: MalvUniversalRouteFinalOutputSource;
  malvUniversalRouteExecutionTimedOut: boolean;
  /** Non-user-facing retrieval audit (Brave / finance HTTP). */
  malvWebRetrieval?: MalvWebRetrievalTelemetry;
};

function resolveTimeoutMs(): number {
  const raw = (process.env.MALV_UNIVERSAL_CAPABILITY_EXEC_TIMEOUT_MS ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 100 && n <= 120_000) return Math.floor(n);
  return 12_000;
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as Error & { code?: string };
  return err.name === "AbortError" || err.code === "ABORT_ERR";
}

/**
 * Bounded, telemetry-rich execution for universal capability routes.
 * Never throws: failures downgrade to empty execution bundles so model generation can proceed.
 */
export async function resolveMalvUniversalCapabilityExecutionOutcome(args: {
  userText: string;
  route: MalvUniversalCapabilityRoute;
  signal?: AbortSignal;
}): Promise<{ execution: MalvUniversalCapabilityExecutionResult; telemetry: MalvUniversalRouteExecutionTelemetry }> {
  const selected = args.route.responseMode;
  const baseTelemetry: MalvUniversalRouteExecutionTelemetry = {
    malvUniversalRouteSelected: selected,
    malvUniversalRouteExecutionAttempted: false,
    malvUniversalRouteHandlerImplemented: malvUniversalRouteExecutionPolicy.isImplemented(selected),
    malvUniversalRouteExecutionOk: null,
    malvUniversalRouteFallbackTriggered: false,
    malvUniversalRouteFallbackReason: null,
    malvUniversalRouteFinalOutputSource: "route_skipped_plain",
    malvUniversalRouteExecutionTimedOut: false
  };

  if (args.signal?.aborted) {
    return {
      execution: { ok: false, error: "aborted_before_capability_execution", promptInjection: "", rich: null },
      telemetry: {
        ...baseTelemetry,
        malvUniversalRouteExecutionAttempted: true,
        malvUniversalRouteExecutionOk: false,
        malvUniversalRouteFallbackTriggered: true,
        malvUniversalRouteFallbackReason: "aborted_before_capability_execution",
        malvUniversalRouteFinalOutputSource: "plain_model_fallback"
      }
    };
  }

  if (selected === "plain_model") {
    const { execution, webTelemetry } = await runMalvUniversalCapabilityExecution({ userText: args.userText, route: args.route });
    return {
      execution,
      telemetry: {
        ...baseTelemetry,
        malvUniversalRouteExecutionOk: execution.ok,
        malvUniversalRouteFinalOutputSource: "route_skipped_plain",
        ...(webTelemetry ? { malvWebRetrieval: webTelemetry } : {})
      }
    };
  }

  if (!malvUniversalRouteExecutionPolicy.isImplemented(selected)) {
    return {
      execution: {
        ok: false,
        error: "universal_route_execution_not_implemented",
        promptInjection: "",
        rich: null
      },
      telemetry: {
        ...baseTelemetry,
        malvUniversalRouteExecutionAttempted: false,
        malvUniversalRouteHandlerImplemented: false,
        malvUniversalRouteExecutionOk: false,
        malvUniversalRouteFallbackTriggered: true,
        malvUniversalRouteFallbackReason: "no_handler_registered_for_route",
        malvUniversalRouteFinalOutputSource: "plain_model_fallback"
      }
    };
  }

  const timeoutMs = resolveTimeoutMs();
  let execution: MalvUniversalCapabilityExecutionResult;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const runExec = runMalvUniversalCapabilityExecution({
    userText: args.userText,
    route: args.route,
    signal: args.signal
  }).then((bundle) => {
    if (timeoutId) clearTimeout(timeoutId);
    return bundle;
  });

  let webTelemetry: MalvWebRetrievalTelemetry | null = null;

  try {
    const bundle = await Promise.race([
      runExec,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(Object.assign(new Error("universal_capability_execution_timeout"), { name: "MalvUniversalCapabilityTimeout" }));
        }, timeoutMs);
      })
    ]);
    execution = bundle.execution;
    webTelemetry = bundle.webTelemetry;
  } catch (e) {
    if (timeoutId) clearTimeout(timeoutId);
    if (isAbortError(e)) {
      return {
        execution: { ok: false, error: "aborted_during_capability_execution", promptInjection: "", rich: null },
        telemetry: {
          ...baseTelemetry,
          malvUniversalRouteExecutionAttempted: true,
          malvUniversalRouteExecutionOk: false,
          malvUniversalRouteFallbackTriggered: true,
          malvUniversalRouteFallbackReason: "aborted_during_capability_execution",
          malvUniversalRouteFinalOutputSource: "plain_model_fallback",
          malvUniversalRouteExecutionTimedOut: false
        }
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = (e as Error)?.name === "MalvUniversalCapabilityTimeout" || /timeout/i.test(msg);
    return {
      execution: {
        ok: false,
        error: isTimeout ? "universal_capability_execution_timeout" : msg.slice(0, 400),
        promptInjection: "",
        rich: null
      },
      telemetry: {
        ...baseTelemetry,
        malvUniversalRouteExecutionAttempted: true,
        malvUniversalRouteExecutionOk: false,
        malvUniversalRouteFallbackTriggered: true,
        malvUniversalRouteFallbackReason: isTimeout ? "execution_timeout" : "execution_threw",
        malvUniversalRouteFinalOutputSource: "plain_model_fallback",
        malvUniversalRouteExecutionTimedOut: isTimeout
      }
    };
  }

  const telemetry: MalvUniversalRouteExecutionTelemetry = {
    ...baseTelemetry,
    malvUniversalRouteExecutionAttempted: true,
    malvUniversalRouteExecutionOk: execution.ok,
    malvUniversalRouteFallbackTriggered: !execution.ok || Boolean(execution.skipped),
    malvUniversalRouteFallbackReason: !execution.ok
      ? (execution.error ?? "execution_returned_not_ok")
      : execution.skipped
        ? "execution_skipped_non_plain"
        : null,
    malvUniversalRouteFinalOutputSource:
      execution.ok && !execution.skipped ? "route_execution" : "plain_model_fallback",
    malvUniversalRouteExecutionTimedOut: false,
    ...(webTelemetry ? { malvWebRetrieval: webTelemetry } : {})
  };

  return { execution, telemetry };
}
