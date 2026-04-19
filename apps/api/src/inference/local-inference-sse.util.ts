/**
 * OpenAI-compatible chat completions streaming: SSE lines (`data: {...}` or `data: [DONE]`).
 * llama.cpp / llama-server follows this shape.
 */

export type OpenAiSseStreamResult = {
  content: string;
  model?: string;
  usage?: unknown;
};

/**
 * Reads a fetch Response body as SSE and accumulates assistant `delta.content` strings.
 * Invokes `onDelta` for each non-empty token piece only (terminal signaling is owned by the caller).
 */
export async function readOpenAiCompatibleChatCompletionSse(args: {
  body: ReadableStream<Uint8Array>;
  signal?: AbortSignal;
  onDelta?: (ev: { text: string; done: boolean }) => void;
}): Promise<OpenAiSseStreamResult> {
  const reader = args.body.getReader();
  const decoder = new TextDecoder();
  let lineBuf = "";
  let full = "";
  let model: string | undefined;
  let usage: unknown;

  const processLine = (lineRaw: string) => {
    const line = lineRaw.replace(/\r$/, "").trim();
    if (!line || line.startsWith(":")) return;
    let payload = line;
    if (payload.toLowerCase().startsWith("data:")) {
      payload = payload.slice(5).trim();
    }
    if (payload === "[DONE]") {
      return "done" as const;
    }
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    if (!json || typeof json !== "object") return;
    const o = json as Record<string, unknown>;
    if (typeof o.model === "string") model = o.model;
    if ("usage" in o) usage = o.usage;
    const choices = o.choices;
    if (!Array.isArray(choices) || choices.length === 0) return;
    const c0 = choices[0];
    if (!c0 || typeof c0 !== "object") return;
    const c = c0 as Record<string, unknown>;
    const delta = c.delta;
    if (delta && typeof delta === "object") {
      const d = delta as Record<string, unknown>;
      const piece = d.content;
      if (typeof piece === "string" && piece.length > 0) {
        full += piece;
        args.onDelta?.({ text: piece, done: false });
      }
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
      if (value && value.length) {
        lineBuf += decoder.decode(value, { stream: true });
        const parts = lineBuf.split("\n");
        lineBuf = parts.pop() ?? "";
        for (const p of parts) {
          const r = processLine(p);
          if (r === "done") {
            lineBuf = "";
            await reader.cancel().catch(() => undefined);
            return { content: full, model, usage };
          }
        }
      }
    }
    if (lineBuf.trim()) {
      const r = processLine(lineBuf);
      if (r === "done") {
        return { content: full, model, usage };
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }

  return { content: full, model, usage };
}
