import { describe, expect, it } from "vitest";
import {
  deriveMalvAssistantTypingBand,
  deriveMalvExecutionStatusLabel,
  deriveMalvPresenceUsesStreamingAmbient,
  lastAssistantMessage,
  MALV_STREAM_CANONICAL_ACTIVE_META_KEY
} from "./malvAssistantUiState";
import type { MalvChatMessage } from "./types";

const baseAssistant = (over: Partial<MalvChatMessage>): MalvChatMessage => ({
  id: "a1",
  conversationId: "c1",
  role: "assistant",
  content: "",
  createdAt: 1,
  status: "preparing",
  ...over
});

describe("deriveMalvAssistantTypingBand", () => {
  it("returns null when assistant has non-empty raw content (whitespace counts)", () => {
    expect(deriveMalvAssistantTypingBand(baseAssistant({ content: "hi", status: "streaming" }))).toBe(null);
    expect(deriveMalvAssistantTypingBand(baseAssistant({ content: "  \n", status: "streaming" }))).toBe(null);
  });

  it("returns null when canonical stream has started (metadata flag) even if visible paint is still empty", () => {
    expect(
      deriveMalvAssistantTypingBand(
        baseAssistant({
          status: "preparing",
          content: "",
          metadata: { [MALV_STREAM_CANONICAL_ACTIVE_META_KEY]: true }
        })
      )
    ).toBe(null);
  });

  it("maps preparing to preparing", () => {
    expect(deriveMalvAssistantTypingBand(baseAssistant({ status: "preparing" }))).toBe("preparing");
  });

  it("maps streaming without text to stream_pending", () => {
    expect(deriveMalvAssistantTypingBand(baseAssistant({ status: "streaming" }))).toBe("stream_pending");
  });
});

describe("deriveMalvPresenceUsesStreamingAmbient", () => {
  it("is false during preparing / thinking before any stream bytes", () => {
    expect(
      deriveMalvPresenceUsesStreamingAmbient({
        generationActive: true,
        messages: [baseAssistant({ status: "preparing" })]
      })
    ).toBe(false);
    expect(
      deriveMalvPresenceUsesStreamingAmbient({
        generationActive: true,
        messages: [baseAssistant({ status: "thinking" })]
      })
    ).toBe(false);
  });

  it("is true when streaming with raw visible text", () => {
    expect(
      deriveMalvPresenceUsesStreamingAmbient({
        generationActive: true,
        messages: [baseAssistant({ status: "streaming", content: "x" })]
      })
    ).toBe(true);
  });

  it("is true during preparing when canonical stream bytes have arrived", () => {
    expect(
      deriveMalvPresenceUsesStreamingAmbient({
        generationActive: true,
        messages: [
          baseAssistant({
            status: "preparing",
            content: "",
            metadata: { [MALV_STREAM_CANONICAL_ACTIVE_META_KEY]: true }
          })
        ]
      })
    ).toBe(true);
  });
});

describe("deriveMalvExecutionStatusLabel", () => {
  it("shows Live when raw streamed text exists or canonical buffer is active", () => {
    expect(
      deriveMalvExecutionStatusLabel({
        generationActive: true,
        messages: [baseAssistant({ status: "streaming", content: "y" })]
      })
    ).toBe("Live");
    expect(
      deriveMalvExecutionStatusLabel({
        generationActive: true,
        messages: [baseAssistant({ status: "streaming", content: "" })]
      })
    ).toBe("Writing");
    expect(
      deriveMalvExecutionStatusLabel({
        generationActive: true,
        messages: [
          baseAssistant({
            status: "streaming",
            content: "",
            metadata: { [MALV_STREAM_CANONICAL_ACTIVE_META_KEY]: true }
          })
        ]
      })
    ).toBe("Live");
    expect(
      deriveMalvExecutionStatusLabel({
        generationActive: true,
        messages: [
          baseAssistant({
            status: "preparing",
            content: "",
            metadata: { [MALV_STREAM_CANONICAL_ACTIVE_META_KEY]: true }
          })
        ]
      })
    ).toBe("Live");
  });
});

describe("lastAssistantMessage", () => {
  it("returns the last assistant in mixed transcript", () => {
    const u: MalvChatMessage = {
      id: "u",
      conversationId: "c",
      role: "user",
      content: "q",
      createdAt: 0,
      status: "sent"
    };
    const a1 = baseAssistant({ id: "a1", status: "done", content: "old" });
    const a2 = baseAssistant({ id: "a2", status: "preparing" });
    expect(lastAssistantMessage([u, a1, u, a2])).toBe(a2);
  });
});
