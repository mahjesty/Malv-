import { afterEach, describe, expect, it, vi } from "vitest";
import { MalvChatClient } from "./malvChatClient";

const apiFetch = vi.fn();

vi.mock("../api/http", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args)
}));

describe("MalvChatClient HTTP path (honest non-streaming)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("emits a single assistant_delta with the full reply (no fixed-size chunk simulation)", async () => {
    const longReply = `${"x".repeat(120)} ${"y".repeat(120)}`;
    apiFetch.mockResolvedValue({
      reply: longReply,
      conversationId: "conv-1"
    });

    const events: Array<{ type: string; delta?: string }> = [];
    const client = new MalvChatClient({
      useMock: false,
      accessToken: "token",
      getSocket: () => null
    });
    client.subscribeToReply((e) => {
      events.push({ type: e.type, ...(e.type === "assistant_delta" ? { delta: e.delta } : {}) });
    });

    await client.sendMessage({
      text: "hi",
      assistantMessageId: "asst-1",
      conversationId: null,
      beastLevel: "Smart",
      workspaceId: null,
      vaultSessionId: null,
      inputMode: "text"
    });

    const deltas = events.filter((x) => x.type === "assistant_delta");
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.delta).toBe(longReply);
    expect(events.some((x) => x.type === "assistant_done")).toBe(true);
  });
});
