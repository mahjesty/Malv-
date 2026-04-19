import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMalvStreamLatencyAuditForTests,
  buildMalvStreamLatencyReport,
  malvStreamLatencyAuditAssistantDone,
  malvStreamLatencyAuditBeginTurn,
  malvStreamLatencyAuditBubbleRender,
  malvStreamLatencyAuditFirstDelta,
  malvStreamLatencyAuditFirstVisibleText
} from "./malvChatStreamLatencyAudit";

describe("malvChatStreamLatencyAudit", () => {
  let now = 0;
  beforeEach(() => {
    __resetMalvStreamLatencyAuditForTests();
    now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      now += 5;
      return now;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetMalvStreamLatencyAuditForTests();
  });

  it("orders milestones and flags progressive streaming", () => {
    malvStreamLatencyAuditBeginTurn("asst-1");
    malvStreamLatencyAuditFirstDelta();
    malvStreamLatencyAuditFirstVisibleText("asst-1");
    malvStreamLatencyAuditAssistantDone(true, "hello", "hello");

    const r = buildMalvStreamLatencyReport();
    expect(r.streaming_quality.progressive_rendering).toBe(true);
    expect(r.streaming_quality.transcript_in_sync).toBe(true);
    expect(r.streaming_quality.end_of_turn_jump).toBe(false);
    expect(r.perceived_latency_ms.optimistic_row).toBe(0);
    expect(r.perceived_latency_ms.first_delta).toBeGreaterThanOrEqual(0);
    expect(r.perceived_latency_ms.first_visible_text).toBeGreaterThanOrEqual(
      r.perceived_latency_ms.first_delta ?? 0
    );
    expect(r.perceived_latency_ms.completion).toBeGreaterThanOrEqual(
      r.perceived_latency_ms.first_visible_text ?? 0
    );
  });

  it("detects end-of-turn content jump when streamed body changes at done", () => {
    malvStreamLatencyAuditBeginTurn("asst-1");
    malvStreamLatencyAuditAssistantDone(true, "streamed text", "different text");
    const r = buildMalvStreamLatencyReport();
    expect(r.streaming_quality.end_of_turn_jump).toBe(true);
  });

  it("counts assistant bubble renders per message id", () => {
    malvStreamLatencyAuditBeginTurn("asst-new");
    malvStreamLatencyAuditBubbleRender("asst-old", "assistant");
    malvStreamLatencyAuditBubbleRender("asst-new", "assistant");
    malvStreamLatencyAuditBubbleRender("asst-new", "assistant");
    const r = buildMalvStreamLatencyReport();
    expect(r.render_behavior.render_counts_by_message_id["asst-new"]).toBe(2);
    expect(r.render_behavior.render_counts_by_message_id["asst-old"]).toBe(1);
    expect(r.render_behavior.only_active_row_updates).toBe(false);
    expect(r.render_behavior.memo_effective).toBe(false);
  });

  it("ignores user-role renders in assistant render map", () => {
    malvStreamLatencyAuditBeginTurn("asst-1");
    malvStreamLatencyAuditBubbleRender("user-1", "user");
    const r = buildMalvStreamLatencyReport();
    expect(r.render_behavior.render_counts_by_message_id["user-1"]).toBeUndefined();
  });
});
