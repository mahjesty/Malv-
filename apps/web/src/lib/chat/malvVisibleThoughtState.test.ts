import { describe, expect, it } from "vitest";
import { deriveVisibleThoughtPhase, shouldRenderVisibleThought } from "./malvVisibleThoughtState";
import type { MalvChatMessage } from "./types";

// ─── Fixtures ──────────────────────────────────────────────────────────────

function assistantMsg(overrides: Partial<MalvChatMessage> = {}): MalvChatMessage {
  return {
    id: "a1",
    conversationId: "c1",
    role: "assistant",
    content: "",
    createdAt: Date.now(),
    status: "preparing",
    ...overrides
  };
}

function userMsg(overrides: Partial<MalvChatMessage> = {}): MalvChatMessage {
  return {
    id: "u1",
    conversationId: "c1",
    role: "user",
    content: "hello",
    createdAt: Date.now(),
    status: "sent",
    ...overrides
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("deriveVisibleThoughtPhase — UI state model", () => {

  // ── Idle state ───────────────────────────────────────────────────────────

  it("returns idle when generation is not active", () => {
    expect(
      deriveVisibleThoughtPhase({
        generationActive: false,
        isThinking: false,
        thinkingSteps: [],
        messages: []
      })
    ).toBe("idle");
  });

  it("returns idle when generation is active but no thought and no content", () => {
    expect(
      deriveVisibleThoughtPhase({
        generationActive: true,
        isThinking: false,
        thinkingSteps: [],
        messages: [userMsg(), assistantMsg({ status: "preparing", content: "" })]
      })
    ).toBe("idle");
  });

  // ── Visible thought state ─────────────────────────────────────────────────

  it("returns visible_thought when server sent real thought lines and no content yet", () => {
    expect(
      deriveVisibleThoughtPhase({
        generationActive: true,
        isThinking: true,
        thinkingSteps: ["I'll organize this before I dive in."],
        messages: [userMsg(), assistantMsg({ status: "thinking", content: "" })]
      })
    ).toBe("visible_thought");
  });

  it("does NOT show visible_thought when thinkingSteps is empty (no server thought)", () => {
    expect(
      deriveVisibleThoughtPhase({
        generationActive: true,
        isThinking: true,
        thinkingSteps: [],
        messages: [userMsg(), assistantMsg({ status: "preparing", content: "" })]
      })
    ).toBe("idle");
  });

  // ── Responding state — thought disappears on first chunk ─────────────────

  it("transitions to responding once the assistant has any content", () => {
    expect(
      deriveVisibleThoughtPhase({
        generationActive: true,
        isThinking: true,
        thinkingSteps: ["I'm organizing the answer."],
        messages: [
          userMsg(),
          assistantMsg({
            status: "streaming",
            content: "Here is the answer...",
          })
        ]
      })
    ).toBe("responding");
  });

  it("transitions to responding even if isThinking is still true when content exists", () => {
    // This covers the case where the client hasn't yet cleared isThinking
    // but the stream has already started producing content.
    const phase = deriveVisibleThoughtPhase({
      generationActive: true,
      isThinking: true,
      thinkingSteps: ["Working through it."],
      messages: [
        userMsg(),
        assistantMsg({
          status: "streaming",
          content: "Starting answer...",
        })
      ]
    });
    expect(phase).toBe("responding");
  });

  it("transitions to responding when canonical stream buffer is active (no visible text yet)", () => {
    // malvStreamCanonicalActive=true means bytes are buffered even without painted content
    const phase = deriveVisibleThoughtPhase({
      generationActive: true,
      isThinking: true,
      thinkingSteps: ["I'm on it."],
      messages: [
        userMsg(),
        assistantMsg({
          status: "streaming",
          content: "",
          metadata: { malvStreamCanonicalActive: true }
        })
      ]
    });
    expect(phase).toBe("responding");
  });

  // ── Thought is ephemeral ──────────────────────────────────────────────────

  it("returns idle after generation ends", () => {
    expect(
      deriveVisibleThoughtPhase({
        generationActive: false,
        isThinking: false,
        thinkingSteps: [],
        messages: [
          userMsg(),
          assistantMsg({ status: "done", content: "The answer is..." })
        ]
      })
    ).toBe("idle");
  });

  it("does not return visible_thought when generation has ended even if steps are cached", () => {
    // Simulates a stuck state that must not render
    expect(
      deriveVisibleThoughtPhase({
        generationActive: false,
        isThinking: true,
        thinkingSteps: ["Some thought"],
        messages: [assistantMsg({ status: "done", content: "Done." })]
      })
    ).toBe("idle");
  });

  // ── shouldRenderVisibleThought ────────────────────────────────────────────

  it("shouldRenderVisibleThought returns true only in visible_thought phase", () => {
    expect(
      shouldRenderVisibleThought({
        generationActive: true,
        isThinking: true,
        thinkingSteps: ["Organized approach."],
        messages: [userMsg(), assistantMsg({ content: "", status: "thinking" })]
      })
    ).toBe(true);
  });

  it("shouldRenderVisibleThought returns false when responding", () => {
    expect(
      shouldRenderVisibleThought({
        generationActive: true,
        isThinking: true,
        thinkingSteps: ["Thought"],
        messages: [userMsg(), assistantMsg({ content: "First word", status: "streaming" })]
      })
    ).toBe(false);
  });

  it("shouldRenderVisibleThought returns false when idle", () => {
    expect(
      shouldRenderVisibleThought({
        generationActive: false,
        isThinking: false,
        thinkingSteps: [],
        messages: []
      })
    ).toBe(false);
  });

  // ── Determinism ──────────────────────────────────────────────────────────

  it("produces the same phase for identical inputs", () => {
    const args = {
      generationActive: true,
      isThinking: true,
      thinkingSteps: ["Working through it methodically."],
      messages: [userMsg(), assistantMsg({ content: "", status: "thinking" })]
    };
    const results = Array.from({ length: 5 }, () => deriveVisibleThoughtPhase(args));
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("visible_thought");
  });

  // ── Message ownership — visible thought belongs to the last assistant message ──

  it("returns visible_thought only when last assistant message has no content (correct ownership signal)", () => {
    const messages = [
      userMsg({ id: "u1" }),
      assistantMsg({ id: "a1", status: "done", content: "Prior response." }),
      userMsg({ id: "u2" }),
      assistantMsg({ id: "a2", status: "thinking", content: "" })
    ];
    const phase = deriveVisibleThoughtPhase({
      generationActive: true,
      isThinking: true,
      thinkingSteps: ["Thinking now."],
      messages
    });
    expect(phase).toBe("visible_thought");
  });

  it("returns responding when last assistant message has content, regardless of prior empty messages", () => {
    const messages = [
      userMsg({ id: "u1" }),
      assistantMsg({ id: "a1", status: "done", content: "Prior response." }),
      userMsg({ id: "u2" }),
      assistantMsg({ id: "a2", status: "streaming", content: "Starting the answer…" })
    ];
    const phase = deriveVisibleThoughtPhase({
      generationActive: true,
      isThinking: true,
      thinkingSteps: ["Still marked thinking."],
      messages
    });
    expect(phase).toBe("responding");
  });

  it("does not show visible_thought for any prior completed message — only the active turn", () => {
    const messages = [
      userMsg({ id: "u1" }),
      assistantMsg({ id: "a1", status: "done", content: "Completed response." })
    ];
    const phase = deriveVisibleThoughtPhase({
      generationActive: false,
      isThinking: false,
      thinkingSteps: [],
      messages
    });
    expect(phase).toBe("idle");
  });

  it("visible_thought phase requires generationActive — no phantom thought on completed turns", () => {
    const messages = [
      userMsg({ id: "u1" }),
      assistantMsg({ id: "a1", status: "done", content: "" })
    ];
    expect(
      deriveVisibleThoughtPhase({
        generationActive: false,
        isThinking: true,
        thinkingSteps: ["Lingering step"],
        messages
      })
    ).toBe("idle");
  });
});
