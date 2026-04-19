/**
 * Opt-in dev instrumentation for websocket streaming latency validation.
 * Enable: `VITE_MALV_CHAT_STREAM_LATENCY_AUDIT=true` in apps/web .env.local
 */
import { resetAssistantStreamCadenceDebug } from "./malvAssistantStreamCadenceDebug";
import { cancelAssistantStreamVisualRafFromRegistry } from "./malvAssistantStreamVisualRegistry";
import type { MalvChatMessage } from "./types";
export type MalvStreamLatencyReport = {
  /** Milliseconds from `send_click_at` (t=0) for each milestone. */
  perceived_latency_ms: {
    optimistic_row: number | null;
    first_delta: number | null;
    first_visible_text: number | null;
    /** Same moment as `assistant_done_received_at` — time from send until done event handled. */
    completion: number | null;
    /** Double-rAF after done — approximate “paint settled” for final state. */
    final_render_complete: number | null;
  };
  streaming_quality: {
    progressive_rendering: boolean;
    transcript_in_sync: boolean;
    end_of_turn_jump: boolean;
  };
  render_behavior: {
    only_active_row_updates: boolean;
    memo_effective: boolean;
    render_counts_by_message_id: Record<string, number>;
  };
  regressions: string[];
  notes: string[];
};

type Times = {
  sendClickAt: number | null;
  optimisticRowAt: number | null;
  firstDeltaAt: number | null;
  firstVisibleApproxAt: number | null;
  assistantDoneAt: number | null;
  finalRenderApproxAt: number | null;
};

const state: {
  enabled: boolean;
  turnAssistantId: string | null;
  times: Times;
  renderById: Record<string, number>;
  streamedTrimmedAtDone: boolean;
  contentUnchangedAtDone: boolean | null;
  doneEventRecorded: boolean;
  finalLogScheduled: boolean;
} = {
  enabled: false,
  turnAssistantId: null,
  times: {
    sendClickAt: null,
    optimisticRowAt: null,
    firstDeltaAt: null,
    firstVisibleApproxAt: null,
    assistantDoneAt: null,
    finalRenderApproxAt: null
  },
  renderById: {},
  streamedTrimmedAtDone: false,
  contentUnchangedAtDone: null,
  doneEventRecorded: false,
  finalLogScheduled: false
};

export function isMalvStreamLatencyAuditEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_MALV_CHAT_STREAM_LATENCY_AUDIT === "true";
}

function rel(base: number | null, t: number | null): number | null {
  if (base == null || t == null) return null;
  return Math.round(t - base);
}

export function malvStreamLatencyAuditBeginTurn(assistantMessageId: string): void {
  resetAssistantStreamCadenceDebug();
  if (!isMalvStreamLatencyAuditEnabled()) return;
  const now = performance.now();
  state.enabled = true;
  state.turnAssistantId = assistantMessageId;
  state.times = {
    sendClickAt: now,
    optimisticRowAt: now,
    firstDeltaAt: null,
    firstVisibleApproxAt: null,
    assistantDoneAt: null,
    finalRenderApproxAt: null
  };
  state.renderById = {};
  state.streamedTrimmedAtDone = false;
  state.contentUnchangedAtDone = null;
  state.doneEventRecorded = false;
  state.finalLogScheduled = false;
  // eslint-disable-next-line no-console
  console.info("[MALV stream audit] turn_begin", { assistantMessageId, t: now });
}

export function malvStreamLatencyAuditFirstDelta(): void {
  if (!isMalvStreamLatencyAuditEnabled() || !state.turnAssistantId) return;
  if (state.times.firstDeltaAt != null) return;
  state.times.firstDeltaAt = performance.now();
  // eslint-disable-next-line no-console
  console.info("[MALV stream audit] first_delta", { t: state.times.firstDeltaAt });
}

export function malvStreamLatencyAuditFirstVisibleText(assistantMessageId: string): void {
  if (!isMalvStreamLatencyAuditEnabled() || assistantMessageId !== state.turnAssistantId) return;
  if (state.times.firstVisibleApproxAt != null) return;
  state.times.firstVisibleApproxAt = performance.now();
  // eslint-disable-next-line no-console
  console.info("[MALV stream audit] first_visible_text_approx", { t: state.times.firstVisibleApproxAt });
}

/** Count assistant bubbles only (user rows are expected to render for pending→sent, etc.). */
export function malvStreamLatencyAuditBubbleRender(messageId: string, role: MalvChatMessage["role"]): void {
  if (!isMalvStreamLatencyAuditEnabled() || !state.turnAssistantId) return;
  if (role !== "assistant") return;
  state.renderById[messageId] = (state.renderById[messageId] ?? 0) + 1;
}

/**
 * Call with content before/after assistant_done reducer for the active assistant row.
 */
export function malvStreamLatencyAuditAssistantDone(
  streamedHadText: boolean,
  contentBefore: string,
  contentAfter: string
): void {
  if (!isMalvStreamLatencyAuditEnabled() || !state.turnAssistantId) return;
  if (state.doneEventRecorded) return;
  state.doneEventRecorded = true;
  state.times.assistantDoneAt = performance.now();
  state.streamedTrimmedAtDone = streamedHadText;
  state.contentUnchangedAtDone = streamedHadText ? contentBefore === contentAfter : null;
  // eslint-disable-next-line no-console
  console.info("[MALV stream audit] assistant_done", {
    t: state.times.assistantDoneAt,
    streamedHadText,
    contentUnchanged: state.contentUnchangedAtDone
  });
}

export function malvStreamLatencyAuditScheduleFinalRenderLog(): void {
  if (!isMalvStreamLatencyAuditEnabled() || !state.turnAssistantId) return;
  if (state.finalLogScheduled) return;
  state.finalLogScheduled = true;
  const turnId = state.turnAssistantId;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (state.turnAssistantId !== turnId) return;
      state.times.finalRenderApproxAt = performance.now();
      const report = buildMalvStreamLatencyReport();
      // eslint-disable-next-line no-console
      console.info("[MALV stream audit] report", report);
      state.turnAssistantId = null;
      state.enabled = false;
    });
  });
}

export function malvStreamLatencyAuditAbortTurn(): void {
  cancelAssistantStreamVisualRafFromRegistry();
  if (!isMalvStreamLatencyAuditEnabled()) return;
  state.turnAssistantId = null;
  state.enabled = false;
}

/** Exposed for unit tests — resets module state. */
export function __resetMalvStreamLatencyAuditForTests(): void {
  state.enabled = false;
  state.turnAssistantId = null;
  state.times = {
    sendClickAt: null,
    optimisticRowAt: null,
    firstDeltaAt: null,
    firstVisibleApproxAt: null,
    assistantDoneAt: null,
    finalRenderApproxAt: null
  };
  state.renderById = {};
  state.streamedTrimmedAtDone = false;
  state.contentUnchangedAtDone = null;
  state.doneEventRecorded = false;
  state.finalLogScheduled = false;
}

export function buildMalvStreamLatencyReport(): MalvStreamLatencyReport {
  const base = state.times.sendClickAt;
  const regressions: string[] = [];
  const notes: string[] = [];

  const firstDelta = state.times.firstDeltaAt;
  const doneAt = state.times.assistantDoneAt;
  const progressive = firstDelta != null && doneAt != null && firstDelta < doneAt;
  const firstVis = state.times.firstVisibleApproxAt;
  const transcriptInSync = progressive && firstVis != null && doneAt != null && firstVis <= doneAt;

  const endJump = Boolean(state.streamedTrimmedAtDone && state.contentUnchangedAtDone === false);

  if (state.streamedTrimmedAtDone && state.contentUnchangedAtDone == null) {
    notes.push("Streamed turn: could not compare content before/after done (audit not wired for this path).");
  }

  const aid = state.turnAssistantId;
  let otherAssistantRenders = 0;
  for (const [id, n] of Object.entries(state.renderById)) {
    if (id !== aid) otherAssistantRenders += n;
  }

  const onlyActive = aid != null ? otherAssistantRenders === 0 : true;
  if (aid != null && otherAssistantRenders > 0) {
    notes.push(
      `Other assistant rows re-rendered during turn: ${otherAssistantRenders} (expected 0 with memo + stable props).`
    );
  }

  const memoEffective = aid != null ? otherAssistantRenders === 0 : true;

  if (doneAt != null && firstDelta == null) {
    regressions.push("assistant_done without prior assistant_delta in audit window");
  }

  return {
    perceived_latency_ms: {
      optimistic_row: rel(base, state.times.optimisticRowAt),
      first_delta: rel(base, firstDelta),
      first_visible_text: rel(base, firstVis),
      completion: rel(base, doneAt),
      final_render_complete: rel(base, state.times.finalRenderApproxAt)
    },
    streaming_quality: {
      progressive_rendering: progressive,
      transcript_in_sync: transcriptInSync,
      end_of_turn_jump: endJump
    },
    render_behavior: {
      only_active_row_updates: onlyActive,
      memo_effective: memoEffective,
      render_counts_by_message_id: { ...state.renderById }
    },
    regressions,
    notes
  };
}
