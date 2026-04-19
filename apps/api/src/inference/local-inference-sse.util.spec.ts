import { readOpenAiCompatibleChatCompletionSse } from "./local-inference-sse.util";

function sseBody(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const raw = lines.join("");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(raw));
      controller.close();
    }
  });
}

describe("readOpenAiCompatibleChatCompletionSse", () => {
  it("accumulates delta.content and ends with done", async () => {
    const deltas: Array<{ text: string; done: boolean }> = [];
    const body = sseBody([
      'data: {"choices":[{"delta":{"content":"he"}}],"model":"m1"}\n',
      "\n",
      'data: {"choices":[{"delta":{"content":"llo"}}]}\n',
      "\n",
      "data: [DONE]\n\n"
    ]);
    const r = await readOpenAiCompatibleChatCompletionSse({
      body,
      onDelta: (ev) => deltas.push({ text: ev.text, done: ev.done })
    });
    expect(r.content).toBe("hello");
    expect(r.model).toBe("m1");
    expect(deltas.every((d) => !d.done)).toBe(true);
    expect(deltas.map((d) => d.text).join("")).toBe("hello");
  });

  it("handles CRLF and data: prefix case-insensitively", async () => {
    const body = sseBody(['DATA: {"choices":[{"delta":{"content":"x"}}]}\r\n', "\r\n", "data: [DONE]\n"]);
    const r = await readOpenAiCompatibleChatCompletionSse({ body });
    expect(r.content).toBe("x");
  });
});
