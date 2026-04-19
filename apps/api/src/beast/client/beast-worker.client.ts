import { randomUUID } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  assertBeastWorkerBaseDistinctFromLocalModelOrThrow,
  resolveBeastWorkerBaseUrls
} from "../../inference/malv-inference-base-urls.util";
import { formatBeastWorkerInferFailureMessage } from "./beast-worker-infer-error.util";
import { readBeastWorkerInferSseStream } from "./beast-worker-infer-sse.util";

export type BeastInferenceRequest = {
  mode: "light" | "cpu" | "gpu" | "beast";
  prompt: string;
  /** Optional worker output cap for this request. */
  maxTokens?: number;
  context?: Record<string, unknown>;
  /** Same as context.malvCorrelationId / runId when omitted; for log correlation API → worker. */
  correlationId?: string;
  /** Cooperative cancel from MALV chat stop */
  signal?: AbortSignal;
};

export type BeastInferenceResponse = {
  reply: string;
  // Future: structured fields like suggestions, audit references, tool plans.
  meta?: Record<string, unknown>;
};

/** Normalize JSON from POST /v1/infer (defensive: some proxies alter field names). */

function parseWorkerInferBody(raw: unknown): BeastInferenceResponse {
  if (!raw || typeof raw !== "object") {
    return { reply: "", meta: { malvParseError: "worker_body_not_json_object" } };
  }
  const o = raw as Record<string, unknown>;
  let reply = "";
  if (typeof o.reply === "string") reply = o.reply;
  else if (typeof o.text === "string") reply = o.text;
  const meta =
    o.meta !== undefined && o.meta !== null && typeof o.meta === "object"
      ? { ...(o.meta as Record<string, unknown>) }
      : {};
  return { reply, meta };
}

@Injectable()
export class BeastWorkerClient {
  private readonly logger = new Logger(BeastWorkerClient.name);
  private workerCursor = 0;

  constructor(private readonly cfg: ConfigService) {}

  private pickWorkerBase(correlationId?: string): string {
    const urls = resolveBeastWorkerBaseUrls((k) => this.cfg.get<string>(k));
    if (urls.length === 1) return urls[0]!;
    if (correlationId && correlationId.length > 0) {
      const n = correlationId.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      return urls[n % urls.length]!;
    }
    const selected = urls[this.workerCursor % urls.length]!;
    this.workerCursor += 1;
    return selected;
  }

  async infer(args: BeastInferenceRequest): Promise<BeastInferenceResponse> {
    const workerBaseNormalized = this.pickWorkerBase(args.correlationId);
    const baseUrl = workerBaseNormalized;
    const apiKey = this.cfg.get<string>("BEAST_WORKER_API_KEY") ?? "";
    try {
      assertBeastWorkerBaseDistinctFromLocalModelOrThrow(workerBaseNormalized, (k) =>
        this.cfg.get<string>(k)
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[MALV_INFERENCE_ROUTE] ${msg}`);
      throw e;
    }

    const url = `${workerBaseNormalized}/v1/infer`;
    const ctx: Record<string, unknown> = { ...(args.context ?? {}) };
    const correlationId =
      args.correlationId ??
      (typeof ctx["malvCorrelationId"] === "string" && ctx["malvCorrelationId"]
        ? String(ctx["malvCorrelationId"])
        : undefined) ??
      (typeof ctx["runId"] === "string" && ctx["runId"] ? String(ctx["runId"]) : undefined) ??
      randomUUID();
    if (!ctx["malvCorrelationId"]) {
      ctx["malvCorrelationId"] = correlationId;
    }

    this.logger.log(
      `[MALV E2E] worker infer request POST ${url} correlationId=${correlationId} mode=${args.mode} promptLen=${args.prompt.length} maxTokens=${args.maxTokens ?? "default"}`
    );
    this.logger.log(
      `[MALV BRAIN] dispatching to worker/orchestrator correlationId=${correlationId} mode=${args.mode} POST ${url} promptLen=${args.prompt.length}`
    );
    this.logger.log(`[MALV_INFERENCE_ROUTE] transport=beast_worker POST ${url}`);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-MALV-Correlation-Id": correlationId,
          ...(apiKey ? { "x-api-key": apiKey } : {})
        },
        body: JSON.stringify({ mode: args.mode, prompt: args.prompt, maxTokens: args.maxTokens, context: ctx }),
        signal: args.signal
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError" || (e instanceof Error && e.message.includes("abort"))) {
        this.logger.warn(`[MALV WORKER] infer aborted (client cancel)`);
        throw e;
      }
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[MALV E2E] worker infer failed (fetch) baseUrl=${baseUrl} POST ${url} err=${msg}`);
      this.logger.error(
        `[MALV BRAIN] worker unreachable (check BEAST_WORKER_BASE_URL matches beast-worker HTTP port): baseUrl=${baseUrl} err=${msg}`
      );
      throw new Error(msg || "Beast worker unreachable");
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const formatted = formatBeastWorkerInferFailureMessage(res.status, txt, url);
      this.logger.error(`[MALV E2E] worker infer failed HTTP ${res.status} POST ${url} bodyHead=${txt.slice(0, 120)}`);
      this.logger.error(`[MALV BRAIN] error in generation pipeline: HTTP ${res.status} ${formatted.slice(0, 400)}`);
      this.logger.error(`[MALV_INFERENCE_ROUTE] transport=beast_worker status=${res.status} url=${url}`);
      throw new Error(formatted);
    }

    this.logger.log(`[MALV E2E] worker infer success status=${res.status} correlationId=${correlationId}`);
    let parsedJson: unknown;
    try {
      parsedJson = await res.json();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `[MALV_INFER_TRACE] api_worker_infer_json_parse_failed correlationId=${correlationId} url=${url} err=${msg}`
      );
      throw new Error(`Beast worker returned non-JSON body: ${msg}`);
    }
    const body = parseWorkerInferBody(parsedJson);
    const len = (body.reply ?? "").length;
    const meta = body.meta ?? {};
    const trace = {
      correlationId,
      workerBaseUrl: workerBaseNormalized,
      replyChars: len,
      metaKeys: Object.keys(meta),
      malvEmptyReason: meta["malvEmptyReason"],
      malvLastBackend: meta["malvLastBackend"],
      malvFinalBackend: meta["inferenceBackend"] ?? meta["malvLastBackend"],
      finishReason: meta["finishReason"],
      malvWorkerFallback: meta["malvWorkerFallback"],
      inferenceAttempts: meta["inferenceAttempts"]
    };
    this.logger.log(`[MALV E2E] worker infer reply length: ${len}`);
    this.logger.log(`[MALV BRAIN] generator invoked (worker HTTP ok) replyLen=${len}`);
    this.logger.log(`[MALV_INFER_TRACE] api_worker_infer_done ${JSON.stringify(trace)}`);
    if (len === 0) {
      this.logger.warn(
        `[MALV BRAIN] no reply generated (worker returned empty reply field) trace=${JSON.stringify(trace)}`
      );
    } else {
      this.logger.log(`[MALV BRAIN] final text produced (worker) len=${len}`);
    }
    return body;
  }

  /**
   * Streams deltas from worker `POST /v1/infer/stream` (RunPod / vLLM path) while accumulating the final reply.
   * Used for websocket chat when local CPU inference is bypassed — avoids waiting for full JSON before any UI text.
   */
  async inferStream(
    args: BeastInferenceRequest & { onStreamDelta: (text: string) => void }
  ): Promise<BeastInferenceResponse> {
    const workerBaseNormalized = this.pickWorkerBase(args.correlationId);
    const baseUrl = workerBaseNormalized;
    const apiKey = this.cfg.get<string>("BEAST_WORKER_API_KEY") ?? "";
    try {
      assertBeastWorkerBaseDistinctFromLocalModelOrThrow(workerBaseNormalized, (k) =>
        this.cfg.get<string>(k)
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[MALV_INFERENCE_ROUTE] ${msg}`);
      throw e;
    }

    const url = `${workerBaseNormalized}/v1/infer/stream`;
    const ctx: Record<string, unknown> = { ...(args.context ?? {}) };
    const correlationId =
      args.correlationId ??
      (typeof ctx["malvCorrelationId"] === "string" && ctx["malvCorrelationId"]
        ? String(ctx["malvCorrelationId"])
        : undefined) ??
      (typeof ctx["runId"] === "string" && ctx["runId"] ? String(ctx["runId"]) : undefined) ??
      randomUUID();
    if (!ctx["malvCorrelationId"]) {
      ctx["malvCorrelationId"] = correlationId;
    }

    this.logger.log(
      `[MALV E2E] worker infer stream POST ${url} correlationId=${correlationId} mode=${args.mode} promptLen=${args.prompt.length} maxTokens=${args.maxTokens ?? "default"}`
    );
    this.logger.log(`[MALV_INFERENCE_ROUTE] transport=beast_worker_stream POST ${url}`);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
          "X-MALV-Correlation-Id": correlationId,
          ...(apiKey ? { "x-api-key": apiKey } : {})
        },
        body: JSON.stringify({ mode: args.mode, prompt: args.prompt, maxTokens: args.maxTokens, context: ctx }),
        signal: args.signal
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError" || (e instanceof Error && e.message.includes("abort"))) {
        this.logger.warn(`[MALV WORKER] infer stream aborted (client cancel)`);
        throw e;
      }
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[MALV E2E] worker infer stream failed (fetch) baseUrl=${baseUrl} err=${msg}`);
      throw new Error(msg || "Beast worker unreachable");
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const formatted = formatBeastWorkerInferFailureMessage(res.status, txt, url);
      this.logger.error(
        `[MALV E2E] worker infer stream failed HTTP ${res.status} POST ${url} bodyHead=${txt.slice(0, 120)}`
      );
      throw new Error(formatted);
    }

    const bodyStream = res.body;
    if (!bodyStream) {
      throw new Error("Beast worker stream response had no body");
    }

    let firstTokenLogged = false;
    const { content, donePayload } = await readBeastWorkerInferSseStream({
      body: bodyStream,
      signal: args.signal,
      onDelta: (text) => {
        if (!firstTokenLogged && text.length > 0) {
          firstTokenLogged = true;
          this.logger.log(`[MALV WORKER STREAM] first_token correlationId=${correlationId}`);
        }
        args.onStreamDelta(text);
      }
    });

    const trimmed = content.trim();
    const meta: Record<string, unknown> = {
      malvReplySource: "beast_worker",
      malvWorkerStreamedReply: true,
      malvInferHttp: { path: "/v1/infer/stream", replyChars: trimmed.length },
      malvCorrelationId: correlationId
    };
    if (donePayload) {
      const b = donePayload["backend"];
      if (typeof b === "string" && b.trim()) {
        meta["malvLastBackend"] = b.trim();
        meta["inferenceBackend"] = b.trim();
      }
      if ("latencyMs" in donePayload) meta["malvStreamLatencyMs"] = donePayload["latencyMs"];
      if ("finishReason" in donePayload) meta["malvLastFinishReason"] = donePayload["finishReason"];
      if (donePayload["cancelled"] === true) meta["malvStreamCancelled"] = true;
    }

    this.logger.log(
      `[MALV E2E] worker infer stream done correlationId=${correlationId} replyChars=${trimmed.length}`
    );
    return { reply: trimmed, meta };
  }

  async health(): Promise<{
    ok: boolean;
    reachable: boolean;
    inferenceConfigured: boolean;
    inferenceReady: boolean;
    detail?: string;
    primaryBackend?: string;
    primarySkipReason?: string | null;
    streamingSupported?: boolean;
    fallbackEnabled?: boolean;
    fallbackActive?: boolean;
    fallbackInChain?: boolean;
    fallbackPolicy?: string | null;
    fallbackOnlyMode?: boolean;
    failoverToFallbackLikely?: boolean;
    backendNotes?: Record<string, string>;
    chain?: string[];
    selectedModel?: string | null;
    effectiveBackend?: string | null;
    lastCheckAtMs?: number | null;
    inferenceTelemetry?: {
      lastSuccessAtMs?: number | null;
      lastSuccessAt?: string | null;
      lastFailureAtMs?: number | null;
      lastFailureAt?: string | null;
      lastLatencyMs?: number | null;
      lastBackend?: string | null;
      lastStream?: boolean | null;
      lastFailoverAttempted?: boolean | null;
      lastCorrelationId?: string | null;
      lastFailureClass?: string | null;
      lastErrorClass?: string | null;
      lastErrorSummary?: string | null;
    };
    /** beast-worker active inference config revision (from API effective config), when exposed by worker health. */
    runtimeConfigRevision?: string | null;
  }> {
    const baseUrl = this.pickWorkerBase(undefined);
    const apiKey = this.cfg.get<string>("BEAST_WORKER_API_KEY") ?? "";
    const url = `${baseUrl}/v1/health/inference`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          ...(apiKey ? { "x-api-key": apiKey } : {})
        }
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        const detail =
          res.status === 404
            ? formatBeastWorkerInferFailureMessage(res.status, errBody, url)
            : `HTTP ${res.status}`;
        this.logger.warn(`[MALV WORKER] health/inference not OK GET ${url} status=${res.status}`);
        return {
          ok: false,
          reachable: true,
          inferenceConfigured: false,
          inferenceReady: false,
          detail: detail.slice(0, 400)
        };
      }
      const body = (await res.json()) as {
        ok?: boolean;
        ts?: number;
        inferenceConfigured?: boolean;
        inferenceReady?: boolean;
        primaryBackend?: string;
        primarySkipReason?: string | null;
        streamingSupported?: boolean;
        fallbackEnabled?: boolean;
        fallbackActive?: boolean;
        fallbackInChain?: boolean;
        fallbackPolicy?: string | null;
        fallbackOnlyMode?: boolean;
        failoverToFallbackLikely?: boolean;
        backendNotes?: Record<string, string>;
        chain?: string[];
        selectedModel?: string | null;
        effectiveBackend?: string | null;
        inferenceTelemetry?: {
          lastSuccessAtMs?: number | null;
          lastSuccessAt?: string | null;
          lastFailureAtMs?: number | null;
          lastFailureAt?: string | null;
          lastLatencyMs?: number | null;
          lastBackend?: string | null;
          lastStream?: boolean | null;
          lastFailoverAttempted?: boolean | null;
          lastCorrelationId?: string | null;
          lastFailureClass?: string | null;
          lastErrorClass?: string | null;
          lastErrorSummary?: string | null;
        };
        configRevision?: string | null;
      };
      const configured = Boolean(body.inferenceConfigured);
      const ready = Boolean(body.inferenceReady);
      return {
        ok: Boolean(body.ok),
        reachable: true,
        inferenceConfigured: configured,
        inferenceReady: ready,
        detail: ready ? "inference_ready" : body.primarySkipReason ?? body.primaryBackend ?? "worker_live",
        primaryBackend: body.primaryBackend,
        primarySkipReason: body.primarySkipReason,
        streamingSupported: body.streamingSupported,
        fallbackEnabled: body.fallbackEnabled,
        fallbackActive: body.fallbackActive,
        fallbackInChain: body.fallbackInChain,
        fallbackPolicy: body.fallbackPolicy ?? undefined,
        fallbackOnlyMode: body.fallbackOnlyMode,
        failoverToFallbackLikely: body.failoverToFallbackLikely,
        backendNotes: body.backendNotes,
        chain: body.chain,
        selectedModel: body.selectedModel ?? undefined,
        effectiveBackend: body.effectiveBackend ?? undefined,
        lastCheckAtMs: typeof body.ts === "number" ? body.ts * 1000 : null,
        inferenceTelemetry: body.inferenceTelemetry,
        runtimeConfigRevision: typeof body.configRevision === "string" && body.configRevision.trim() ? body.configRevision.trim() : null
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[MALV WORKER] health check failed baseUrl=${baseUrl} GET ${url} err=${msg}`);
      return {
        ok: false,
        reachable: false,
        inferenceConfigured: false,
        inferenceReady: false,
        detail: `${msg} (BEAST_WORKER_BASE_URL=${baseUrl})`
      };
    }
  }
}

