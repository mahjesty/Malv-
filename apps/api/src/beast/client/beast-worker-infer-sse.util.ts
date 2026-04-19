/**
 * Parses beast-worker `POST /v1/infer/stream` SSE (`data: {json}` lines).
 * @see apps/beast-worker/app/inference/router.py infer_stream_sse
 */
export type BeastWorkerInferSseResult = {
  content: string;
  donePayload: Record<string, unknown> | null;
};

export async function readBeastWorkerInferSseStream(args: {
  body: ReadableStream<Uint8Array>;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
}): Promise<BeastWorkerInferSseResult> {
  const reader = args.body.getReader();
  const decoder = new TextDecoder();
  let lineBuf = "";
  let full = "";
  let donePayload: Record<string, unknown> | null = null;

  const processLine = (lineRaw: string) => {
    const line = lineRaw.replace(/\r$/, "").trim();
    if (!line || line.startsWith(":")) return;
    let payload = line;
    if (payload.toLowerCase().startsWith("data:")) {
      payload = payload.slice(5).trim();
    } else {
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    if (!json || typeof json !== "object") return;
    const o = json as Record<string, unknown>;
    const typ = o.type;
    if (typ === "assistant_delta") {
      const t = o.text;
      if (typeof t === "string" && t.length > 0) {
        full += t;
        args.onDelta?.(t);
      }
    } else if (typ === "error") {
      const msg = typeof o.message === "string" ? o.message : "worker_stream_error";
      throw new Error(msg);
    } else if (typ === "done") {
      donePayload = o;
    }
  };

  try {
    while (true) {
      if (args.signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) {
        lineBuf += decoder.decode(value, { stream: true });
        const parts = lineBuf.split("\n");
        lineBuf = parts.pop() ?? "";
        for (const p of parts) {
          processLine(p);
        }
      }
    }
    if (lineBuf.trim()) {
      processLine(lineBuf);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }

  return { content: full, donePayload };
}
