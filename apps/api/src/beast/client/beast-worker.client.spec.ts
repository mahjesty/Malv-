import { ConfigService } from "@nestjs/config";
import { BeastWorkerClient } from "./beast-worker.client";

describe("BeastWorkerClient correlation", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends X-MALV-Correlation-Id and sets context.malvCorrelationId from runId", async () => {
    let captured: RequestInit | undefined;
    global.fetch = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify({ reply: "ok", meta: {} }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as unknown as typeof fetch;

    const cfg = {
      get: (k: string) => (k === "BEAST_WORKER_BASE_URL" ? "http://127.0.0.1:9090" : "")
    } as unknown as ConfigService;
    const client = new BeastWorkerClient(cfg);

    await client.infer({
      mode: "light",
      prompt: "hi",
      context: { runId: "550e8400-e29b-41d4-a716-446655440000" }
    });

    expect(global.fetch).toHaveBeenCalled();
    const hdrs = new Headers((captured?.headers ?? {}) as HeadersInit);
    expect(hdrs.get("X-MALV-Correlation-Id")).toBe("550e8400-e29b-41d4-a716-446655440000");
    const body = JSON.parse((captured?.body as string) ?? "{}");
    expect(body.context.malvCorrelationId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("accepts legacy worker body with text instead of reply", async () => {
    global.fetch = jest.fn(async () => {
      return new Response(JSON.stringify({ text: "legacy", meta: { x: 1 } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as unknown as typeof fetch;

    const cfg = {
      get: (k: string) => (k === "BEAST_WORKER_BASE_URL" ? "http://127.0.0.1:9090" : "")
    } as unknown as ConfigService;
    const client = new BeastWorkerClient(cfg);

    const out = await client.infer({ mode: "light", prompt: "hi" });
    expect(out.reply).toBe("legacy");
    expect(out.meta?.x).toBe(1);
  });
});
