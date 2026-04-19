import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MalvChatClient } from "./malvChatClient";

const apiFetch = vi.fn();

vi.mock("../api/http", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args)
}));

function createMockSocket() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    connected: true,
    id: "sock-mock",
    on(ev: string, fn: (...args: unknown[]) => void) {
      let set = listeners.get(ev);
      if (!set) {
        set = new Set();
        listeners.set(ev, set);
      }
      set.add(fn);
    },
    off(ev: string, fn: (...args: unknown[]) => void) {
      listeners.get(ev)?.delete(fn);
    },
    emit(ev: string, _data?: unknown, ack?: (x: unknown) => void) {
      if (ev === "chat:send" && ack) {
        queueMicrotask(() => ack({ ok: true, conversationId: "conv-ws", replyWillStream: true }));
      }
    },
    simulateOrchestration(payload: Record<string, unknown>) {
      for (const fn of listeners.get("malv:orchestration") ?? []) {
        fn(payload);
      }
    }
  };
}

describe("MalvChatClient rich completion metadata (WS + HTTP)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis as unknown as Window & typeof globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("forwards allowlisted assistantMeta from malv:orchestration assistant_done", async () => {
    const socket = createMockSocket();
    const events: Array<{ type: string; assistantMeta?: Record<string, unknown> }> = [];
    const client = new MalvChatClient({
      useMock: false,
      accessToken: "token",
      getSocket: () => socket as any
    });
    client.subscribeToReply((e) => {
      if (e.type === "assistant_done") {
        events.push({ type: e.type, assistantMeta: e.assistantMeta });
      }
    });

    await client.sendMessage({
      text: "hi",
      assistantMessageId: "asst-ws",
      conversationId: null,
      beastLevel: "Smart",
      workspaceId: null,
      vaultSessionId: null,
      inputMode: "text"
    });

    socket.simulateOrchestration({
      type: "assistant_done",
      conversationId: "conv-ws",
      messageId: "asst-ws",
      finalContent: "done",
      terminal: "completed",
      malvTurnOutcome: "complete",
      assistantMeta: {
        malvStructuredRichSurface: true,
        malvRichResponse: {
          sources: [{ title: "Src", url: "https://example.com/doc" }],
          showSourcesInChrome: true
        }
      }
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.assistantMeta).toMatchObject({
      malvStructuredRichSurface: true,
      malvRichResponse: {
        sources: [{ title: "Src", url: "https://example.com/doc" }]
      }
    });
  });

  it("assistant_done without assistantMeta omits the field (older servers)", async () => {
    const socket = createMockSocket();
    const events: Array<Record<string, unknown>> = [];
    const client = new MalvChatClient({
      useMock: false,
      accessToken: "token",
      getSocket: () => socket as any
    });
    client.subscribeToReply((e) => {
      if (e.type === "assistant_done") events.push({ ...e });
    });

    await client.sendMessage({
      text: "hi",
      assistantMessageId: "asst-old",
      conversationId: null,
      beastLevel: "Smart",
      workspaceId: null,
      vaultSessionId: null,
      inputMode: "text"
    });

    socket.simulateOrchestration({
      type: "assistant_done",
      conversationId: "conv-ws",
      messageId: "asst-old",
      finalContent: "legacy",
      terminal: "completed",
      malvTurnOutcome: "complete"
    });

    expect(events).toHaveLength(1);
    expect(events[0]!).not.toHaveProperty("assistantMeta");
  });

  it("maps assistantMeta from HTTP JSON into assistant_done", async () => {
    apiFetch.mockResolvedValue({
      reply: "http body",
      conversationId: "conv-http",
      assistantMeta: {
        malvStructuredRichSurface: true,
        malvRichResponse: {
          sources: [{ title: "API", url: "https://api.test/x" }],
          showSourcesInChrome: true
        }
      }
    });

    const events: Array<{ type: string; assistantMeta?: Record<string, unknown> }> = [];
    const client = new MalvChatClient({
      useMock: false,
      accessToken: "token",
      getSocket: () => ({ connected: false } as any)
    });
    client.subscribeToReply((e) => {
      if (e.type === "assistant_done") {
        events.push({ type: e.type, assistantMeta: e.assistantMeta });
      }
    });

    await client.sendMessage({
      text: "hi",
      assistantMessageId: "asst-http",
      conversationId: null,
      beastLevel: "Smart",
      workspaceId: null,
      vaultSessionId: null,
      inputMode: "text"
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.assistantMeta?.malvStructuredRichSurface).toBe(true);
    expect(
      (events[0]!.assistantMeta?.malvRichResponse as { sources?: unknown[] } | undefined)?.sources?.length
    ).toBe(1);
  });
});
