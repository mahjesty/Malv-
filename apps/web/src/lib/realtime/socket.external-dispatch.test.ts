import { beforeEach, describe, expect, it, vi } from "vitest";

const socketHandlers = new Map<string, (payload: any) => unknown>();
const socketMock = {
  on: vi.fn((event: string, handler: (payload: any) => unknown) => {
    socketHandlers.set(event, handler);
    return socketMock;
  }),
  io: { engine: { transport: { name: "websocket" } } }
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => socketMock)
}));

vi.mock("../api/http", () => ({
  getApiBaseUrl: () => "http://localhost:4000"
}));

vi.mock("../auth/session", () => ({
  getStoredSession: () => ({ accessToken: "test-token" })
}));

describe("browser external dispatch executor", () => {
  beforeEach(() => {
    socketHandlers.clear();
    socketMock.on.mockClear();
    vi.restoreAllMocks();
    const storage = new Map<string, string>();
    const windowMock = {
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => {
          storage.set(k, String(v));
        }
      },
      open: vi.fn(),
      location: { assign: vi.fn() }
    };
    vi.stubGlobal("window", windowMock);
    windowMock.localStorage.setItem("malv.browser.executor.deviceId.v1", "browser-dev-1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true })
      }))
    );
  });

  it("acknowledges unsupported_kind as rejected", async () => {
    const { createMalvSocket } = await import("./socket");
    createMalvSocket();
    const handler = socketHandlers.get("malv:external_action_dispatch");
    expect(handler).toBeTruthy();
    await handler?.({
      schemaVersion: 1,
      protocolVersion: 1,
      dispatchId: "d-1",
      actionType: "unsupported_kind",
      actionPayload: {},
      targetDeviceId: "browser-dev-1"
    });
    const calls = (globalThis.fetch as any).mock.calls as Array<[string, { body?: string }]>;
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]?.[1]?.body ?? "{}")).toMatchObject({
      status: "rejected",
      reason: "unsupported_action_type",
      deviceId: "browser-dev-1"
    });
  });

  it("accepts and completes open_url for matching target device", async () => {
    const { createMalvSocket } = await import("./socket");
    createMalvSocket();
    const handler = socketHandlers.get("malv:external_action_dispatch");
    expect(handler).toBeTruthy();
    await handler?.({
      schemaVersion: 1,
      protocolVersion: 1,
      dispatchId: "d-2",
      actionType: "open_url",
      actionPayload: { url: "https://example.com" },
      targetDeviceId: "browser-dev-1"
    });
    expect((globalThis.window as any).open).toHaveBeenCalledWith("https://example.com/", "_blank", "noopener,noreferrer");
    const calls = (globalThis.fetch as any).mock.calls as Array<[string, { body?: string }]>;
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0]?.[1]?.body ?? "{}")).toMatchObject({ status: "accepted", deviceId: "browser-dev-1" });
    expect(JSON.parse(calls[1]?.[1]?.body ?? "{}")).toMatchObject({
      status: "completed",
      result: { bridge: "browser_agent" },
      deviceId: "browser-dev-1"
    });
  });
});
