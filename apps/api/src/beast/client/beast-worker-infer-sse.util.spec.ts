import { readBeastWorkerInferSseStream } from "./beast-worker-infer-sse.util";

function streamFromString(s: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(s));
      controller.close();
    }
  });
}

describe("readBeastWorkerInferSseStream", () => {
  it("invokes onDelta per assistant_delta and returns done payload", async () => {
    const deltas: string[] = [];
    const body = streamFromString(
      'data: {"type":"assistant_delta","text":"he"}\n\n' +
        'data: {"type":"assistant_delta","text":"llo"}\n\n' +
        'data: {"type":"done","backend":"openai_compatible","latencyMs":12,"cancelled":false,"finishReason":"stop"}\n\n'
    );
    const r = await readBeastWorkerInferSseStream({
      body,
      onDelta: (t) => deltas.push(t)
    });
    expect(deltas).toEqual(["he", "llo"]);
    expect(r.content).toBe("hello");
    expect(r.donePayload?.backend).toBe("openai_compatible");
  });

  it("throws on error frame", async () => {
    const body = streamFromString('data: {"type":"error","message":"policy_block"}\n\n');
    await expect(readBeastWorkerInferSseStream({ body })).rejects.toThrow(/policy_block/);
  });
});
