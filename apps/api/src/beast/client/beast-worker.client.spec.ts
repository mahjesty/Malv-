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
      maxTokens: 1536,
      context: { runId: "550e8400-e29b-41d4-a716-446655440000" }
    });

    expect(global.fetch).toHaveBeenCalled();
    const hdrs = new Headers((captured?.headers ?? {}) as HeadersInit);
    expect(hdrs.get("X-MALV-Correlation-Id")).toBe("550e8400-e29b-41d4-a716-446655440000");
    const body = JSON.parse((captured?.body as string) ?? "{}");
    expect(body.context.malvCorrelationId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(body.maxTokens).toBe(1536);
  });

  it("throws before fetch when BEAST_WORKER_BASE_URL equals default local llama base (port clash)", async () => {
    global.fetch = jest.fn();
    const cfg = {
      get: (k: string) => (k === "BEAST_WORKER_BASE_URL" ? "http://127.0.0.1:8081" : undefined)
    } as unknown as ConfigService;
    const client = new BeastWorkerClient(cfg);
    await expect(client.infer({ mode: "light", prompt: "x" })).rejects.toThrow(/BEAST_WORKER_BASE_URL/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("maps OpenAI-style 404 on /v1/infer to an actionable error message", async () => {
    global.fetch = jest.fn(async () => {
      return new Response(
        JSON.stringify({
          error: { message: "File Not Found", type: "not_found_error", code: 404 }
        }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    });
    const cfg = {
      get: (k: string) =>
        k === "BEAST_WORKER_BASE_URL"
          ? "http://127.0.0.1:9090"
          : k === "MALV_LOCAL_INFERENCE_BASE_URL"
            ? "http://127.0.0.1:7777"
            : undefined
    } as unknown as ConfigService;
    const client = new BeastWorkerClient(cfg);
    await expect(client.infer({ mode: "light", prompt: "x" })).rejects.toThrow(/BEAST_WORKER_BASE_URL targets/);
  });

  it("defaults BEAST_WORKER_BASE_URL to 127.0.0.1:9090 when unset (FastAPI worker, not llama-server)", async () => {
    global.fetch = jest.fn(async (input: string | URL | Request) => {
      const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      expect(u).toContain("127.0.0.1:9090/v1/infer");
      return new Response(JSON.stringify({ reply: "pong", meta: {} }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as unknown as typeof fetch;

    const cfg = { get: (_k: string) => undefined } as unknown as ConfigService;
    const client = new BeastWorkerClient(cfg);
    await client.infer({ mode: "light", prompt: "ping" });
    expect(global.fetch).toHaveBeenCalled();
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

  it("inferStream reads SSE deltas from POST /v1/infer/stream", async () => {
    const enc = new TextEncoder();
    const sse =
      'data: {"type":"assistant_delta","text":"Hi "}\n\n' +
      'data: {"type":"done","backend":"openai_compatible","latencyMs":5,"cancelled":false,"finishReason":"length"}\n\n';
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(enc.encode(sse));
        controller.close();
      }
    });
    global.fetch = jest.fn(async (input: string | URL | Request) => {
      const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      expect(u).toContain("/v1/infer/stream");
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      });
    }) as unknown as typeof fetch;

    const cfg = {
      get: (k: string) =>
        k === "BEAST_WORKER_BASE_URL"
          ? "http://127.0.0.1:9090"
          : k === "MALV_LOCAL_INFERENCE_BASE_URL"
            ? "http://127.0.0.1:7777"
            : undefined
    } as unknown as ConfigService;
    const client = new BeastWorkerClient(cfg);
    const deltas: string[] = [];
    const out = await client.inferStream({
      mode: "light",
      prompt: "x",
      maxTokens: 900,
      context: {},
      onStreamDelta: (t) => deltas.push(t)
    });
    expect(deltas.join("")).toBe("Hi ");
    expect(out.reply).toBe("Hi");
    expect(out.meta?.malvWorkerStreamedReply).toBe(true);
    expect(out.meta?.inferenceBackend).toBe("openai_compatible");
    expect(out.meta?.malvLastFinishReason).toBe("length");
    const bodyPayload = JSON.parse(((global.fetch as jest.Mock).mock.calls[0]?.[1]?.body as string) ?? "{}");
    expect(bodyPayload.maxTokens).toBe(900);
  });
});
