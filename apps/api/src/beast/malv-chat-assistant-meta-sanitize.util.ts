type PhasedTraceEntry = Record<string, unknown>;

const TOP_LEVEL_KEYS_TO_STRIP = [
  "workerAttemptError",
  "workerError",
  "malvPhasedStepWorkerError",
  "malvAgentRouterSummary",
  "malvResponsePipelineTrace"
] as const;

const INFERENCE_TRACE_KEYS_TO_STRIP = [
  "malvFallbackExceptionSummary",
  "malvLocalInferenceProbeBaseUrl",
  "malvLocalInferenceProbeDetail",
  "malvLocalInferenceFailureReason",
  "malvResponsePipelineTrace"
] as const;

function toNullableString(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 ? x : null;
}

function toNullableBoolean(x: unknown): boolean | null {
  return typeof x === "boolean" ? x : null;
}

function normalizeUserSafeTraceContract(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    malvChatInferenceTransport: toNullableString(raw.malvChatInferenceTransport),
    malvLearningSignalsCaptured: toNullableBoolean(raw.malvLearningSignalsCaptured),
    malvIntentKind: toNullableString(raw.malvIntentKind),
    malvDecisionRationale: toNullableString(raw.malvDecisionRationale),
    malvChatWsLiveStreamCallback: toNullableBoolean(raw.malvChatWsLiveStreamCallback),
    malvServerPhasedOrchestrationEnabled: toNullableBoolean(raw.malvServerPhasedOrchestrationEnabled)
  };
}

/**
 * Strips internal diagnostics from assistant `meta` before HTTP responses and message persistence.
 * Full fields remain on `AiJobEntity.resultMeta` in the database for admin/ops use.
 */
export function sanitizeMalvChatAssistantMetaForUser(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!meta || typeof meta !== "object") {
    return {};
  }
  const out = { ...meta } as Record<string, unknown>;

  for (const k of TOP_LEVEL_KEYS_TO_STRIP) {
    delete out[k];
  }

  if (out.malvInferenceTrace && typeof out.malvInferenceTrace === "object") {
    const t = { ...(out.malvInferenceTrace as Record<string, unknown>) };
    for (const k of INFERENCE_TRACE_KEYS_TO_STRIP) {
      delete t[k];
    }
    delete t.malvAgentRouter;
    out.malvInferenceTrace = normalizeUserSafeTraceContract(t);
  } else {
    out.malvInferenceTrace = normalizeUserSafeTraceContract({});
  }

  if (Array.isArray(out.malvServerPhasedTrace)) {
    out.malvServerPhasedTrace = (out.malvServerPhasedTrace as PhasedTraceEntry[]).map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const { detail: _omit, ...rest } = entry;
      return rest;
    });
  }

  return out;
}

/**
 * Allowlisted assistant metadata for live turn completion (WS `assistant_done`, HTTP `assistantMeta`).
 * Omits inference traces, routing internals, and other persisted meta — only fields required for
 * structured rich chrome in the web client.
 */
export function pickMalvRichAssistantMetaForCompletionHandoff(
  meta: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const out: Record<string, unknown> = {};
  if (meta.malvStructuredRichSurface === true) {
    out.malvStructuredRichSurface = true;
  }
  const rawRich = meta.malvRichResponse;
  if (rawRich && typeof rawRich === "object" && !Array.isArray(rawRich)) {
    try {
      out.malvRichResponse = JSON.parse(JSON.stringify(rawRich)) as Record<string, unknown>;
    } catch {
      // Non-serializable rich payloads are skipped rather than forwarded partially.
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
