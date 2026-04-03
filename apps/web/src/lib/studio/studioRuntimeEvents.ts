export type StudioRuntimeEventType = "phase_update" | "console_event" | "terminal_event" | "preview_state" | "apply_state";

export type StudioRuntimeEvent = {
  sessionId: string;
  at: number;
  type: StudioRuntimeEventType;
  payload: Record<string, unknown>;
};

export type StudioLiveMergeState = {
  plan: Array<Record<string, unknown>>;
  console: Array<Record<string, unknown>>;
  terminal: Array<Record<string, unknown>>;
  previewLiveState: "idle" | "refining" | "ready" | "error";
  riskLevel?: string;
  confidence?: string;
  applyState?: string;
};

export function mergeStudioRuntimeEvent(state: StudioLiveMergeState, event: StudioRuntimeEvent): StudioLiveMergeState {
  if (event.type === "phase_update") {
    const phaseId = String(event.payload.phaseId ?? "");
    const next = [...state.plan];
    const idx = next.findIndex((p) => String(p.id ?? p.phaseId ?? "") === phaseId);
    const item = {
      id: phaseId,
      phase: phaseId,
      status: String(event.payload.status ?? "pending"),
      detail: String(event.payload.detail ?? "")
    };
    if (idx >= 0) next[idx] = { ...next[idx], ...item };
    else next.push(item);
    return { ...state, plan: next };
  }
  if (event.type === "console_event") {
    const next = [...state.console, { at: new Date(event.at).toISOString(), ...event.payload }];
    return { ...state, console: next.slice(-120) };
  }
  if (event.type === "terminal_event") {
    const next = [...state.terminal, { at: new Date(event.at).toISOString(), ...event.payload }];
    return { ...state, terminal: next.slice(-120) };
  }
  if (event.type === "preview_state") {
    return { ...state, previewLiveState: String(event.payload.state ?? "idle") as StudioLiveMergeState["previewLiveState"] };
  }
  if (event.type === "apply_state") {
    return {
      ...state,
      applyState: String(event.payload.state ?? "pending_approval"),
      riskLevel: event.payload.riskLevel != null ? String(event.payload.riskLevel) : state.riskLevel,
      confidence: event.payload.confidence != null ? String(event.payload.confidence) : state.confidence
    };
  }
  return state;
}

export function runtimeEventKey(event: StudioRuntimeEvent) {
  return `${event.sessionId}|${event.at}|${event.type}|${JSON.stringify(event.payload)}`;
}

export function mergeStudioRuntimeReplay(
  state: StudioLiveMergeState,
  events: StudioRuntimeEvent[],
  seen: Set<string>,
  seenLimit = 600
) {
  let next = state;
  const ordered = [...events].sort((a, b) => a.at - b.at);
  for (const event of ordered) {
    const key = runtimeEventKey(event);
    if (seen.has(key)) continue;
    next = mergeStudioRuntimeEvent(next, event);
    seen.add(key);
    if (seen.size > seenLimit) {
      const drop = seen.values().next().value;
      if (drop) seen.delete(drop);
    }
  }
  return next;
}

