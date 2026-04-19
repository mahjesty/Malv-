export type MalvTransportDecisionSnapshot = {
  replySource: string | null;
  turnOutcome: "complete" | "partial_done" | "failed_before_output" | null;
  terminal: string | null;
  selectedTier: string | null;
  preferredTier: string | null;
  executionMode: string | null;
  phasedEnabled: boolean;
  phasedTraceEntries: number | null;
  confidenceClarification: boolean;
  requiresClarification: boolean;
  responseRetryTriggered: boolean;
  policyDenied: boolean;
  tierCorrectionApplied: boolean;
  intentKind: string | null;
  learningSignalsCaptured: boolean | null;
  transport: string | null;
};

function readObj(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : {};
}

function readString(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 ? x : null;
}

function readBoolOrNull(x: unknown): boolean | null {
  return typeof x === "boolean" ? x : null;
}

export function buildMalvTransportDecisionSnapshot(meta: Record<string, unknown> | null | undefined): MalvTransportDecisionSnapshot {
  const m = readObj(meta);
  const trace = readObj(m.malvInferenceTrace);
  const routing = readObj(trace.malvRouting);
  const strategy = readObj(m.malvExecutionStrategy);
  const responseRetry = readObj(trace.malvResponseRetry);
  const tierCorrection = readObj(trace.malvTierCorrection);
  const phasedTrace = Array.isArray(m.malvServerPhasedTrace) ? m.malvServerPhasedTrace : null;
  return {
    replySource: readString(m.malvReplySource),
    turnOutcome:
      m.malvTurnOutcome === "complete" || m.malvTurnOutcome === "partial_done" || m.malvTurnOutcome === "failed_before_output"
        ? m.malvTurnOutcome
        : null,
    terminal: readString(m.malvTerminal),
    selectedTier: readString(routing.malvSelectedTier) ?? readString(routing.malvPreferredTier),
    preferredTier: readString(routing.malvPreferredTier),
    executionMode: readString(strategy.mode),
    phasedEnabled: Boolean(m.malvServerPhasedOrchestration || trace.malvServerPhasedOrchestrationEnabled),
    phasedTraceEntries: phasedTrace ? phasedTrace.length : null,
    confidenceClarification: Boolean(m.malvConfidenceClarification),
    requiresClarification: readString(strategy.mode) === "require_clarification",
    responseRetryTriggered: Boolean(responseRetry.triggered),
    policyDenied: Boolean(m.policyDenied),
    tierCorrectionApplied: Boolean(readString(tierCorrection.fromTier) && readString(tierCorrection.toTier)),
    intentKind: readString(trace.malvIntentKind),
    learningSignalsCaptured: readBoolOrNull(trace.malvLearningSignalsCaptured),
    transport: readString(trace.malvChatInferenceTransport)
  };
}
