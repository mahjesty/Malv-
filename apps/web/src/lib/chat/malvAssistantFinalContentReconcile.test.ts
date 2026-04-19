import { describe, expect, it } from "vitest";
import { reconcileAssistantDoneText } from "./malvAssistantFinalContentReconcile";

describe("reconcileAssistantDoneText", () => {
  it("keeps streamed partial when interrupted", () => {
    const r = reconcileAssistantDoneText({
      interrupted: true,
      streamed: "hello ",
      finalContent: "hello world",
      malvTurnOutcome: "complete"
    });
    expect(r.text).toBe("hello ");
    expect(r.source).toBe("interrupted_stream");
    expect(r.applyEmojiLayer).toBe(false);
  });

  it("uses final when stream is empty", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "   ",
      finalContent: "done",
      malvTurnOutcome: "complete"
    });
    expect(r).toMatchObject({ text: "done", source: "final", applyEmojiLayer: true });
  });

  it("uses stream when final is empty", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "only stream",
      finalContent: "",
      malvTurnOutcome: "complete"
    });
    expect(r).toMatchObject({ text: "only stream", source: "stream", applyEmojiLayer: false });
  });

  it("uses stream when trimmed bodies match", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: " hi ",
      finalContent: "hi",
      malvTurnOutcome: "complete"
    });
    expect(r.text).toBe(" hi ");
    expect(r.source).toBe("stream");
    expect(r.applyEmojiLayer).toBe(false);
  });

  it("complete: longer finalContent that strictly extends streamed prefix wins", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "abc",
      finalContent: "abc def",
      malvTurnOutcome: "complete"
    });
    expect(r.text).toBe("abc def");
    expect(r.source).toBe("final_strict_improvement");
    expect(r.applyEmojiLayer).toBe(true);
  });

  it("complete: keeps longer streamed body when final is shorter prefix", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "abc def",
      finalContent: "abc",
      malvTurnOutcome: "complete"
    });
    expect(r.text).toBe("abc def");
    expect(r.source).toBe("stream");
    expect(r.applyEmojiLayer).toBe(false);
  });

  it("complete: divergent finalContent keeps streamed visible answer", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "stream version",
      finalContent: "totally different",
      malvTurnOutcome: "complete"
    });
    expect(r.text).toBe("stream version");
    expect(r.source).toBe("stream");
    expect(r.applyEmojiLayer).toBe(false);
  });

  it("complete: empty finalContent keeps stream", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "visible stream",
      finalContent: "",
      malvTurnOutcome: "complete"
    });
    expect(r).toMatchObject({ text: "visible stream", source: "stream", applyEmojiLayer: false });
  });

  it("complete: stream already longer than final keeps stream", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "already complete stream text",
      finalContent: "short",
      malvTurnOutcome: "complete"
    });
    expect(r.text).toBe("already complete stream text");
    expect(r.source).toBe("stream");
  });

  it("complete: omits malvTurnOutcome like older servers — still stream-first", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "live tokens",
      finalContent: "server only"
    });
    expect(r.text).toBe("live tokens");
    expect(r.source).toBe("stream");
  });

  it("partial_done: picks longer when final extends stream and enables emoji when final wins", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "abc",
      finalContent: "abc def",
      malvTurnOutcome: "partial_done"
    });
    expect(r.text).toBe("abc def");
    expect(r.source).toBe("merged_longer");
    expect(r.applyEmojiLayer).toBe(true);
  });

  it("partial_done: prefers server final on substantive mismatch", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "stream version",
      finalContent: "totally different",
      malvTurnOutcome: "partial_done"
    });
    expect(r.text).toBe("totally different");
    expect(r.source).toBe("final");
    expect(r.applyEmojiLayer).toBe(true);
  });

  it("failed_before_output: prefers final when stream and final both present", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "partial garbage",
      finalContent: "safe final",
      malvTurnOutcome: "failed_before_output"
    });
    expect(r.text).toBe("safe final");
    expect(r.source).toBe("final");
    expect(r.applyEmojiLayer).toBe(true);
  });

  it("failed_before_output: uses final when stream empty", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "",
      finalContent: "only server",
      malvTurnOutcome: "failed_before_output"
    });
    expect(r).toMatchObject({ text: "only server", source: "final", applyEmojiLayer: true });
  });

  it("failed_before_output: keeps stream when final empty but deltas arrived", () => {
    const r = reconcileAssistantDoneText({
      interrupted: false,
      streamed: "tokens only",
      finalContent: "",
      malvTurnOutcome: "failed_before_output"
    });
    expect(r).toMatchObject({ text: "tokens only", source: "stream", applyEmojiLayer: false });
  });
});
