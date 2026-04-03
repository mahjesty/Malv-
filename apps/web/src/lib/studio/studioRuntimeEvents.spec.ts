import assert from "node:assert/strict";
import { mergeStudioRuntimeEvent, mergeStudioRuntimeReplay, type StudioLiveMergeState } from "./studioRuntimeEvents";

function base(): StudioLiveMergeState {
  return {
    plan: [],
    console: [],
    terminal: [],
    previewLiveState: "idle"
  };
}

(() => {
  const s1 = mergeStudioRuntimeEvent(base(), {
    sessionId: "s1",
    at: 1000,
    type: "phase_update",
    payload: { phaseId: "rebuild", status: "in_progress", detail: "running" }
  });
  assert.equal(s1.plan.length, 1);
  assert.equal(String(s1.plan[0]?.status), "in_progress");
})();

(() => {
  const seen = new Set<string>();
  const s0 = base();
  const events = [
    { sessionId: "s1", at: 2, type: "console_event" as const, payload: { group: "g", severity: "info", message: "b" } },
    { sessionId: "s1", at: 1, type: "console_event" as const, payload: { group: "g", severity: "info", message: "a" } },
    { sessionId: "s1", at: 1, type: "console_event" as const, payload: { group: "g", severity: "info", message: "a" } }
  ];
  const s1 = mergeStudioRuntimeReplay(s0, events, seen, 10);
  assert.equal(s1.console.length, 2);
  assert.equal(String(s1.console[0]?.message), "a");
})();

(() => {
  const s1 = mergeStudioRuntimeEvent(base(), {
    sessionId: "s1",
    at: 1000,
    type: "preview_state",
    payload: { state: "ready" }
  });
  assert.equal(s1.previewLiveState, "ready");
})();

