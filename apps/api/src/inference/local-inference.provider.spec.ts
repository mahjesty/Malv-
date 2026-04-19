import { ConfigService } from "@nestjs/config";
import { MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL } from "./local-inference.constants";
import { LocalInferenceProvider } from "./local-inference.provider";
import type { OpenAiCompatibleChatMessage } from "./local-inference-chat-messages.util";

function makeCfg(map: Record<string, string | undefined>) {
  return {
    get: (k: string) => map[k]
  } as unknown as ConfigService;
}

function sseStreamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const raw = chunks.join("");
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(raw));
        controller.close();
      }
    })
  } as unknown as Response;
}

describe("LocalInferenceProvider", () => {
  const origFetch = global.fetch;

  afterEach(() => {
    global.fetch = origFetch;
  });

  it("isEnabled respects MALV_LOCAL_INFERENCE_ENABLED", () => {
    const off = new LocalInferenceProvider(makeCfg({ MALV_LOCAL_INFERENCE_ENABLED: "false" }));
    expect(off.isEnabled()).toBe(false);
    const on = new LocalInferenceProvider(makeCfg({ MALV_LOCAL_INFERENCE_ENABLED: "true" }));
    expect(on.isEnabled()).toBe(true);
  });

  it("isEnabled prefers MALV_LOCAL_CPU_INFERENCE_ENABLED over legacy", () => {
    const p = new LocalInferenceProvider(
      makeCfg({
        MALV_LOCAL_CPU_INFERENCE_ENABLED: "false",
        MALV_LOCAL_INFERENCE_ENABLED: "true"
      })
    );
    expect(p.isEnabled()).toBe(false);
  });

  it("shouldAttemptLocal is false when disabled", () => {
    const p = new LocalInferenceProvider(makeCfg({ MALV_LOCAL_INFERENCE_ENABLED: "0" }));
    expect(p.shouldAttemptLocal()).toBe(false);
  });

  it("defaults MALV_LOCAL_INFERENCE_BASE_URL to llama-server port 8081 when unset", async () => {
    global.fetch = jest.fn(async () =>
      sseStreamResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', "data: [DONE]\n\n"])
    );

    const p = new LocalInferenceProvider(
      makeCfg({
        MALV_LOCAL_INFERENCE_ENABLED: "true",
        MALV_LOCAL_INFERENCE_TIMEOUT_MS: "5000"
      })
    );
    const r = await p.executeChatCompletions({ messages: [{ role: "user", content: "x" }], correlationId: "c-default" });
    expect(r.mode).toBe("stream_complete");
    if (r.mode === "stream_complete") expect(r.accumulatedText).toBe("ok");
    expect(MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL).toBe("http://127.0.0.1:8081");
    expect(global.fetch).toHaveBeenCalledWith(
      `${MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL}/v1/chat/completions`,
      expect.any(Object)
    );
  });

  it("MALV_LOCAL_INFERENCE_BASE_URL env overrides default", async () => {
    global.fetch = jest.fn(async () =>
      sseStreamResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', "data: [DONE]\n\n"])
    );

    const p = new LocalInferenceProvider(
      makeCfg({
        MALV_LOCAL_INFERENCE_ENABLED: "true",
        MALV_LOCAL_INFERENCE_BASE_URL: "http://127.0.0.1:9999",
        MALV_LOCAL_INFERENCE_TIMEOUT_MS: "5000"
      })
    );
    await p.executeChatCompletions({ messages: [{ role: "user", content: "x" }], correlationId: "c-override" });
    expect(global.fetch).toHaveBeenCalledWith("http://127.0.0.1:9999/v1/chat/completions", expect.any(Object));
  });

  it("recordFailure temporarily blocks shouldAttemptLocal", () => {
    jest.useFakeTimers();
    const p = new LocalInferenceProvider(
      makeCfg({
        MALV_LOCAL_INFERENCE_ENABLED: "true",
        MALV_LOCAL_INFERENCE_BASE_URL: "http://127.0.0.1:8080",
        MALV_LOCAL_INFERENCE_TIMEOUT_MS: "60000"
      })
    );
    expect(p.shouldAttemptLocal()).toBe(true);
    p.recordFailure("test");
    expect(p.shouldAttemptLocal()).toBe(false);
    jest.advanceTimersByTime(9_000);
    expect(p.shouldAttemptLocal()).toBe(true);
    jest.useRealTimers();
  });

  it("executeChatCompletions parses streamed deltas and metadata", async () => {
    const deltas: string[] = [];
    global.fetch = jest.fn(async () =>
      sseStreamResponse([
        'data: {"model":"qwen-test","choices":[{"delta":{"content":"  hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" from local  "}}]}\n\n',
        "data: [DONE]\n\n"
      ])
    );

    const p = new LocalInferenceProvider(
      makeCfg({
        MALV_LOCAL_INFERENCE_ENABLED: "true",
        MALV_LOCAL_INFERENCE_BASE_URL: "http://127.0.0.1:8080",
        MALV_LOCAL_INFERENCE_MODEL: "qwen-test",
        MALV_LOCAL_INFERENCE_TIMEOUT_MS: "5000"
      })
    );

    const messages: OpenAiCompatibleChatMessage[] = [{ role: "user", content: "ping" }];
    const res = await p.executeChatCompletions({
      messages,
      correlationId: "cid-1",
      onStreamDelta: (ev) => {
        if (ev.text) deltas.push(ev.text);
      }
    });
    expect(res.mode).toBe("stream_complete");
    if (res.mode === "stream_complete") {
      expect(res.accumulatedText).toBe("  hello from local  ");
      expect(res.model).toBe("qwen-test");
    }
    expect(deltas.join("")).toBe("  hello from local  ");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json" })
      })
    );
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.model).toBe("qwen-test");
    expect(body.messages).toEqual(messages);
    expect(body.stream).toBe(true);
  });

  it("omits model in JSON body when MALV_LOCAL_INFERENCE_MODEL is empty", async () => {
    global.fetch = jest.fn(async () =>
      sseStreamResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', "data: [DONE]\n\n"])
    );

    const p = new LocalInferenceProvider(
      makeCfg({
        MALV_LOCAL_INFERENCE_ENABLED: "true",
        MALV_LOCAL_INFERENCE_BASE_URL: "http://127.0.0.1:8080",
        MALV_LOCAL_INFERENCE_TIMEOUT_MS: "5000"
      })
    );
    await p.executeChatCompletions({
      messages: [{ role: "user", content: "x" }],
      correlationId: "c2"
    });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.model).toBeUndefined();
    expect(body.stream).toBe(true);
  });

  it("falls back to non-streaming JSON when stream body is empty (before first token)", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: null
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          model: "m",
          usage: { prompt_tokens: 1, completion_tokens: 2 },
          timings: { predicted_ms: 10 },
          choices: [{ message: { content: "fallback ok" } }]
        })
      } as unknown as Response);

    const p = new LocalInferenceProvider(
      makeCfg({
        MALV_LOCAL_INFERENCE_ENABLED: "true",
        MALV_LOCAL_INFERENCE_BASE_URL: "http://127.0.0.1:8080",
        MALV_LOCAL_INFERENCE_TIMEOUT_MS: "5000"
      })
    );
    const res = await p.executeChatCompletions({ messages: [{ role: "user", content: "x" }], correlationId: "c-fb" });
    expect(res.mode).toBe("non_stream_complete");
    if (res.mode === "non_stream_complete") expect(res.text).toBe("fallback ok");
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const fbBody = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(fbBody.stream).toBe(false);
  });

  it("failed_before_output when non-stream fallback JSON is invalid", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: null
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [] })
      } as unknown as Response);

    const p = new LocalInferenceProvider(
      makeCfg({
        MALV_LOCAL_INFERENCE_ENABLED: "true",
        MALV_LOCAL_INFERENCE_BASE_URL: "http://127.0.0.1:8080",
        MALV_LOCAL_INFERENCE_TIMEOUT_MS: "5000"
      })
    );
    const res = await p.executeChatCompletions({ messages: [{ role: "user", content: "x" }], correlationId: "c" });
    expect(res.mode).toBe("failed_before_output");
    if (res.mode === "failed_before_output") expect(res.errorMessage).toMatch(/missing choices/);
  });

  it("probeHealth returns ok when /v1/models succeeds", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/v1/models")) {
        return { ok: true, status: 200 } as Response;
      }
      return { ok: false, status: 404 } as Response;
    }) as typeof fetch;

    const p = new LocalInferenceProvider(
      makeCfg({
        MALV_LOCAL_INFERENCE_ENABLED: "true",
        MALV_LOCAL_INFERENCE_BASE_URL: "http://127.0.0.1:8080",
        MALV_LOCAL_INFERENCE_TIMEOUT_MS: "5000"
      })
    );
    const h = await p.probeHealth();
    expect(h.ok).toBe(true);
    expect(h.checkedPath).toBe("/v1/models");
    expect(h.baseUrl).toBe("http://127.0.0.1:8080");
  });

  it("probeHealth tries /health when /v1/models fails", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/v1/models")) {
        return { ok: false, status: 404 } as Response;
      }
      if (url.endsWith("/health")) {
        return { ok: true, status: 200 } as Response;
      }
      return { ok: false, status: 404 } as Response;
    }) as typeof fetch;

    const p = new LocalInferenceProvider(
      makeCfg({
        MALV_LOCAL_INFERENCE_ENABLED: "true",
        MALV_LOCAL_INFERENCE_BASE_URL: "http://127.0.0.1:8080",
        MALV_LOCAL_INFERENCE_TIMEOUT_MS: "5000"
      })
    );
    const h = await p.probeHealth();
    expect(h.ok).toBe(true);
    expect(h.checkedPath).toBe("/health");
  });
});
