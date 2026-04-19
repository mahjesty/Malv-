import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { OpenAiCompatibleChatMessage } from "./local-inference-chat-messages.util";
import { MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL } from "./local-inference.constants";
import { resolveMalvLocalInferenceBaseUrl } from "./malv-inference-base-urls.util";
import { readOpenAiCompatibleChatCompletionSse } from "./local-inference-sse.util";
import type { MalvLocalInferenceExecutionResult } from "./malv-local-inference-execution-result";
import { malvEnvFirst, MALV_LOCAL_CPU_INFERENCE_ENV } from "./malv-inference-env.util";

function truthy(raw: string | undefined, defaultVal: boolean): boolean {
  if (raw == null || raw === "") return defaultVal;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function mergeUserAbortWithDeadline(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const c = new AbortController();
  const tid = setTimeout(() => {
    try {
      c.abort(new Error(`MALV local CPU inference timeout after ${timeoutMs}ms`));
    } catch {
      c.abort();
    }
  }, timeoutMs);
  const dispose = () => clearTimeout(tid);
  if (!parent) {
    return { signal: c.signal, dispose };
  }
  if (parent.aborted) {
    dispose();
    try {
      c.abort(parent.reason);
    } catch {
      c.abort();
    }
    return { signal: c.signal, dispose: () => undefined };
  }
  const onAbort = () => {
    dispose();
    try {
      c.abort(parent.reason);
    } catch {
      c.abort();
    }
  };
  parent.addEventListener("abort", onAbort, { once: true });
  return {
    signal: c.signal,
    dispose: () => {
      dispose();
      parent.removeEventListener("abort", onAbort);
    }
  };
}

export type LocalInferenceHealthResult = {
  ok: boolean;
  reachable: boolean;
  detail: string;
  checkedPath?: string;
  /** Resolved base URL (no trailing slash) — for admin/debug only. */
  baseUrl?: string;
};

/** Token delta only — terminal `done` is emitted by Chat/Realtime after finalization. */
export type LocalInferenceStreamDelta = { text: string; done: false };

/**
 * OpenAI-compatible wire client for a locally hosted llama.cpp / llama-server on the API host (CPU tier).
 * Config: `MALV_LOCAL_CPU_INFERENCE_*` (preferred) or legacy `MALV_LOCAL_INFERENCE_*`.
 * Chat turns additionally require local-CPU disable-chat-path env off (see orchestrator).
 * Base URL default: {@link MALV_LOCAL_LLAMA_SERVER_DEFAULT_BASE_URL}.
 */
@Injectable()
export class LocalInferenceProvider {
  private readonly logger = new Logger(LocalInferenceProvider.name);
  private unhealthyUntilMs = 0;
  private lastProbeOkAtMs = 0;

  constructor(private readonly cfg: ConfigService) {}

  isEnabled(): boolean {
    return truthy(malvEnvFirst((k) => this.cfg.get<string>(k), MALV_LOCAL_CPU_INFERENCE_ENV.ENABLED), false);
  }

  /** When true, skip GET probes and use POST /v1/chat/completions as the only liveness check (for minimal servers). */
  skipHealthProbe(): boolean {
    return truthy(malvEnvFirst((k) => this.cfg.get<string>(k), MALV_LOCAL_CPU_INFERENCE_ENV.SKIP_HEALTH_PROBE), false);
  }

  private baseUrl(): string {
    return resolveMalvLocalInferenceBaseUrl((k) => this.cfg.get<string>(k));
  }

  /** For structured logs only — same resolution as outbound requests. */
  getResolvedBaseUrlForLogs(): string {
    return this.baseUrl();
  }

  private failureCooldownMs(): number {
    const n = Number(malvEnvFirst((k) => this.cfg.get<string>(k), MALV_LOCAL_CPU_INFERENCE_ENV.FAILURE_COOLDOWN_MS));
    if (!Number.isFinite(n) || n < 0) return 8000;
    return Math.min(Math.floor(n), 120_000);
  }

  private timeoutMs(): number {
    const n = Number(malvEnvFirst((k) => this.cfg.get<string>(k), MALV_LOCAL_CPU_INFERENCE_ENV.TIMEOUT_MS));
    if (!Number.isFinite(n) || n < 1000) return 120_000;
    return Math.floor(n);
  }

  private modelName(): string {
    return (malvEnvFirst((k) => this.cfg.get<string>(k), MALV_LOCAL_CPU_INFERENCE_ENV.MODEL) ?? "").trim();
  }

  /**
   * After failures, skip local attempts briefly so chat stays responsive while falling back to the worker.
   */
  shouldAttemptLocal(): boolean {
    if (!this.isEnabled()) return false;
    if (Date.now() < this.unhealthyUntilMs) return false;
    return true;
  }

  recordFailure(reason: string): void {
    const ms = this.failureCooldownMs();
    this.unhealthyUntilMs = Date.now() + ms;
    this.lastProbeOkAtMs = 0;
    const base = this.baseUrl();
    this.logger.warn(`[MALV LOCAL INFERENCE] marking tier unavailable for ${ms}ms baseUrl=${base}: ${reason}`);
  }

  recordSuccess(): void {
    this.unhealthyUntilMs = 0;
  }

  private probeOkCacheMs(): number {
    const raw = malvEnvFirst((k) => this.cfg.get<string>(k), MALV_LOCAL_CPU_INFERENCE_ENV.PROBE_OK_CACHE_MS);
    if (raw == null || raw.trim() === "") return 20_000;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(Math.floor(n), 120_000);
  }

  /**
   * Lightweight reachability check for admin/debug surfaces; uses a short deadline independent of chat timeout.
   */
  async probeHealth(signal?: AbortSignal): Promise<LocalInferenceHealthResult> {
    const base = this.baseUrl();
    const cacheMs = this.probeOkCacheMs();
    const now = Date.now();
    if (cacheMs > 0 && this.lastProbeOkAtMs > 0 && now - this.lastProbeOkAtMs < cacheMs) {
      return {
        ok: true,
        reachable: true,
        detail: `cached_probe_ok ttlMs=${cacheMs}`,
        baseUrl: base
      };
    }
    const paths = ["/v1/models", "/health"];
    const probeMs = Math.min(5000, this.timeoutMs());
    for (const p of paths) {
      const { signal: sig, dispose } = mergeUserAbortWithDeadline(signal, probeMs);
      try {
        const url = `${base}${p}`;
        const res = await fetch(url, { method: "GET", signal: sig });
        dispose();
        if (res.ok) {
          this.lastProbeOkAtMs = Date.now();
          return {
            ok: true,
            reachable: true,
            detail: `GET ${p} HTTP ${res.status}`,
            checkedPath: p,
            baseUrl: base
          };
        }
        // Non-OK (e.g. 404) — try next path.
      } catch (e) {
        dispose();
        const msg = e instanceof Error ? e.message : String(e);
        if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
          return { ok: false, reachable: false, detail: `aborted: ${msg}`, checkedPath: p, baseUrl: base };
        }
        this.logger.debug(`[MALV LOCAL INFERENCE] health probe miss baseUrl=${base} path=${p} err=${msg}`);
        // try next path
      }
    }
    this.logger.warn(`[MALV LOCAL INFERENCE] health probe failed for all paths baseUrl=${base}`);
    return { ok: false, reachable: false, detail: "no health path responded", baseUrl: base };
  }

  /**
   * Single deterministic local completion attempt.
   * - Streaming is primary when the POST uses `stream: true`.
   * - Non-streaming fallback is allowed only before the first token is emitted to the client.
   * - After any token, failures yield `stream_partial` (no second model call).
   */
  async executeChatCompletions(args: {
    messages: OpenAiCompatibleChatMessage[];
    correlationId: string;
    signal?: AbortSignal;
    onStreamDelta?: (ev: LocalInferenceStreamDelta) => void;
  }): Promise<MalvLocalInferenceExecutionResult> {
    const { correlationId } = args;
    let emittedAnyText = false;
    let firstTokenLogged = false;
    /** Mirrors bytes forwarded to the client (authoritative for stream alignment). */
    let streamAccum = "";

    const forward = (text: string) => {
      if (!text.length) return;
      streamAccum += text;
      emittedAnyText = true;
      if (!firstTokenLogged) {
        firstTokenLogged = true;
        this.logger.log(`[MALV LOCAL TURN] first_token correlationId=${correlationId}`);
      }
      args.onStreamDelta?.({ text, done: false });
    };

    const streamStartedLog = () =>
      this.logger.log(`[MALV LOCAL TURN] stream_started correlationId=${correlationId}`);

    const tryStreamingPost = async (): Promise<
      | { ok: true; sse: Awaited<ReturnType<typeof readOpenAiCompatibleChatCompletionSse>> }
      | { ok: false; reason: "abort" }
      | { ok: false; reason: "before_token"; detail: string }
      | { ok: false; reason: "after_token"; detail: string }
    > => {
      const base = this.baseUrl();
      const url = `${base}/v1/chat/completions`;
      const model = this.modelName();
      const body: Record<string, unknown> = {
        messages: args.messages,
        stream: true
      };
      if (model) body.model = model;

      const timeoutMs = this.timeoutMs();
      const { signal: combined, dispose } = mergeUserAbortWithDeadline(args.signal, timeoutMs);

      this.logger.log(
        `[MALV LOCAL INFERENCE] POST ${url} correlationId=${correlationId} messages=${args.messages.length} timeoutMs=${timeoutMs} modelConfigured=${model || "(server default)"} streaming=true (SSE)`
      );

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Accept: "text/event-stream",
            "X-MALV-Correlation-Id": correlationId
          },
          body: JSON.stringify(body),
          signal: combined
        });
      } catch (e) {
        dispose();
        const msg = e instanceof Error ? e.message : String(e);
        if (e instanceof Error && (e.name === "AbortError" || msg.includes("abort"))) {
          this.logger.warn(`[MALV LOCAL TURN] stream_failed_abort correlationId=${correlationId}`);
          return { ok: false, reason: "abort" };
        }
        this.logger.error(
          `[MALV LOCAL INFERENCE] fetch failed baseUrl=${base} POST ${url} correlationId=${correlationId} err=${msg}`
        );
        const detail = msg ? `local inference unreachable at ${base} (${msg})` : `local inference unreachable at ${base}`;
        return { ok: false, reason: emittedAnyText ? "after_token" : "before_token", detail };
      }

      if (!res.ok) {
        dispose();
        const txt = await res.text().catch(() => "");
        this.logger.error(
          `[MALV LOCAL INFERENCE] HTTP ${res.status} correlationId=${correlationId} bodyHead=${txt.slice(0, 160)}`
        );
        const detail = txt || `local inference HTTP ${res.status}`;
        return { ok: false, reason: emittedAnyText ? "after_token" : "before_token", detail };
      }

      if (!res.body) {
        dispose();
        this.logger.warn(`[MALV LOCAL TURN] stream_no_body correlationId=${correlationId}`);
        return { ok: false, reason: emittedAnyText ? "after_token" : "before_token", detail: "stream response has no body" };
      }

      try {
        streamStartedLog();
        const sse = await readOpenAiCompatibleChatCompletionSse({
          body: res.body,
          signal: combined,
          onDelta: (ev) => {
            if (ev.text.length > 0) forward(ev.text);
          }
        });
        dispose();
        this.logger.log(`[MALV LOCAL TURN] stream_completed correlationId=${correlationId} len=${sse.content.length}`);
        return { ok: true, sse };
      } catch (e) {
        dispose();
        if (e instanceof Error && (e.name === "AbortError" || args.signal?.aborted)) {
          this.logger.warn(`[MALV LOCAL TURN] stream_failed_abort correlationId=${correlationId}`);
          return { ok: false, reason: "abort" };
        }
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[MALV LOCAL TURN] stream_read_error correlationId=${correlationId} err=${msg}`);
        return {
          ok: false,
          reason: emittedAnyText ? "after_token" : "before_token",
          detail: msg || "sse_read_failed"
        };
      }
    };

    const streamPost = await tryStreamingPost();
    if (streamPost.ok === false && streamPost.reason === "abort") {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }

    if (streamPost.ok === true) {
      const raw = streamPost.sse.content;
      const aligned = emittedAnyText ? streamAccum : raw;
      if (aligned.trim().length > 0) {
        this.recordSuccess();
        this.logger.log(
          `[MALV_INFERENCE_ROUTE] transport=local_openai_compatible streaming=true correlationId=${correlationId} mode=stream_complete`
        );
        return {
          mode: "stream_complete",
          accumulatedText: aligned,
          emittedAnyText: true,
          model: streamPost.sse.model,
          usage: streamPost.sse.usage,
          correlationId
        };
      }
      if (emittedAnyText) {
        this.recordSuccess();
        this.logger.warn(
          `[MALV LOCAL TURN] stream_empty_aggregate_but_tokens_emitted correlationId=${correlationId} — partial_done`
        );
        return {
          mode: "stream_partial",
          accumulatedText: streamAccum,
          emittedAnyText: true,
          errorMessage: "stream ended with empty aggregate after tokens were emitted",
          model: streamPost.sse.model,
          usage: streamPost.sse.usage,
          correlationId
        };
      }
      this.logger.warn(`[MALV LOCAL TURN] stream_empty_before_output correlationId=${correlationId}`);
    } else if (streamPost.ok === false && streamPost.reason === "after_token") {
      this.logger.error(
        `[MALV LOCAL TURN] stream_failed_after_output correlationId=${correlationId} err=${streamPost.detail}`
      );
      return {
        mode: "stream_partial",
        accumulatedText: streamAccum,
        emittedAnyText: true,
        errorMessage: streamPost.detail,
        correlationId
      };
    }

    this.logger.log(`[MALV LOCAL TURN] fallback_to_non_streaming correlationId=${correlationId}`);
    const ns = await this.tryNonStreamingJson(args);
    if (ns.ok) {
      this.recordSuccess();
      this.logger.log(
        `[MALV_INFERENCE_ROUTE] transport=local_openai_compatible streaming=false correlationId=${correlationId} mode=non_stream_complete`
      );
      return {
        mode: "non_stream_complete",
        text: ns.text,
        emittedAnyText: false,
        model: ns.model,
        usage: ns.usage,
        timings: ns.timings,
        correlationId
      };
    }

    this.logger.warn(`[MALV LOCAL TURN] failed_before_output correlationId=${correlationId} err=${ns.errorMessage}`);
    return {
      mode: "failed_before_output",
      emittedAnyText: false,
      errorMessage: ns.errorMessage,
      correlationId
    };
  }

  private async tryNonStreamingJson(args: {
    messages: OpenAiCompatibleChatMessage[];
    correlationId: string;
    signal?: AbortSignal;
  }): Promise<
    | { ok: true; text: string; model?: string; usage?: unknown; timings?: unknown }
    | { ok: false; errorMessage: string }
  > {
    const base = this.baseUrl();
    const url = `${base}/v1/chat/completions`;
    const model = this.modelName();
    const body: Record<string, unknown> = {
      messages: args.messages,
      stream: false
    };
    if (model) body.model = model;

    const timeoutMs = this.timeoutMs();
    const { signal: combined, dispose } = mergeUserAbortWithDeadline(args.signal, timeoutMs);

    this.logger.log(
      `[MALV LOCAL INFERENCE] POST ${url} correlationId=${args.correlationId} messages=${args.messages.length} timeoutMs=${timeoutMs} modelConfigured=${model || "(server default)"} streaming=false (JSON)`
    );

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "X-MALV-Correlation-Id": args.correlationId },
        body: JSON.stringify(body),
        signal: combined
      });
    } catch (e) {
      dispose();
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof Error && (e.name === "AbortError" || msg.includes("abort"))) {
        return { ok: false, errorMessage: "aborted" };
      }
      this.logger.error(
        `[MALV LOCAL INFERENCE] fetch failed baseUrl=${base} POST ${url} correlationId=${args.correlationId} err=${msg}`
      );
      return {
        ok: false,
        errorMessage: msg ? `local inference unreachable at ${base} (${msg})` : `local inference unreachable at ${base}`
      };
    }
    dispose();

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      this.logger.error(
        `[MALV LOCAL INFERENCE] HTTP ${res.status} correlationId=${args.correlationId} bodyHead=${txt.slice(0, 160)}`
      );
      return { ok: false, errorMessage: txt || `local inference HTTP ${res.status}` };
    }

    let raw: unknown;
    try {
      raw = await res.json();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[MALV LOCAL INFERENCE] JSON parse failed correlationId=${args.correlationId} err=${msg}`);
      return { ok: false, errorMessage: `local inference returned non-JSON: ${msg}` };
    }

    try {
      const parsed = this.parseChatCompletionJson(raw);
      if (!parsed.content.trim()) {
        this.logger.warn(`[MALV LOCAL INFERENCE] empty assistant content correlationId=${args.correlationId}`);
        return { ok: false, errorMessage: "local inference returned empty assistant content" };
      }
      return {
        ok: true,
        text: parsed.content.trim(),
        model: parsed.model,
        usage: parsed.usage,
        timings: parsed.timings
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, errorMessage: msg };
    }
  }

  private parseChatCompletionJson(raw: unknown): {
    content: string;
    model?: string;
    usage?: unknown;
    timings?: unknown;
  } {
    if (!raw || typeof raw !== "object") {
      throw new Error("local inference body is not an object");
    }
    const o = raw as Record<string, unknown>;
    const choices = o.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error("local inference missing choices[0]");
    }
    const c0 = choices[0];
    if (!c0 || typeof c0 !== "object") {
      throw new Error("local inference choices[0] invalid");
    }
    const message = (c0 as Record<string, unknown>).message;
    if (!message || typeof message !== "object") {
      throw new Error("local inference missing choices[0].message");
    }
    const content = (message as Record<string, unknown>).content;
    if (typeof content !== "string") {
      throw new Error("local inference choices[0].message.content is not a string");
    }
    return {
      content,
      model: typeof o.model === "string" ? o.model : undefined,
      usage: o.usage,
      timings: o.timings
    };
  }
}
