import type { BeastInferenceResponse } from "../beast/client/beast-worker.client";
import { executeMalvTieredWorkerInfer } from "./malv-tiered-worker-infer.util";

function okReply(text: string, backend: string): BeastInferenceResponse {
  return {
    reply: text,
    meta: { inferenceBackend: backend }
  };
}

describe("executeMalvTieredWorkerInfer", () => {
  it("routes a small task to CPU first and stops on success", async () => {
    const infer = jest.fn().mockResolvedValueOnce(okReply("hi", "lightweight_local"));
    const out = await executeMalvTieredWorkerInfer({
      infer,
      workerMode: "light",
      neutralContext: { runId: "r1" },
      cpuSidecarPatch: { malvInferenceBackend: "lightweight_local" },
      steps: [
        { tier: "cpu", applyCpuSidecarPatch: true },
        { tier: "gpu", applyCpuSidecarPatch: false }
      ],
      prompt: "hello"
    });
    expect(infer).toHaveBeenCalledTimes(1);
    expect(out.selectedTier).toBe("cpu");
    expect(out.tierFallbackUsed).toBe(false);
    expect(out.tierFallbackReason).toBeNull();
    expect(out.response.reply).toBe("hi");
  });

  it("downgrades GPU → CPU when GPU returns empty", async () => {
    const infer = jest
      .fn()
      .mockResolvedValueOnce({ reply: "  ", meta: { malvEmptyReason: "gpu_timeout" } })
      .mockResolvedValueOnce(okReply("cpu ok", "lightweight_local"));
    const out = await executeMalvTieredWorkerInfer({
      infer,
      workerMode: "beast",
      neutralContext: {},
      cpuSidecarPatch: { malvInferenceBackend: "lightweight_local" },
      steps: [
        { tier: "gpu", applyCpuSidecarPatch: false },
        { tier: "cpu", applyCpuSidecarPatch: true }
      ],
      prompt: "x"
    });
    expect(infer).toHaveBeenCalledTimes(2);
    expect(out.selectedTier).toBe("cpu");
    expect(out.tierFallbackUsed).toBe(true);
    expect(out.tierFallbackReason).toBe("gpu_timeout");
  });

  it("escalates CPU → GPU when CPU throws", async () => {
    const infer = jest
      .fn()
      .mockRejectedValueOnce(new Error("cpu_down"))
      .mockResolvedValueOnce(okReply("gpu ok", "openai_compatible"));
    const out = await executeMalvTieredWorkerInfer({
      infer,
      workerMode: "light",
      neutralContext: {},
      cpuSidecarPatch: { malvInferenceBackend: "lightweight_local" },
      steps: [
        { tier: "cpu", applyCpuSidecarPatch: true },
        { tier: "gpu", applyCpuSidecarPatch: false }
      ],
      prompt: "x"
    });
    expect(infer).toHaveBeenCalledTimes(2);
    expect(out.selectedTier).toBe("gpu");
    expect(out.tierFallbackUsed).toBe(true);
    expect(out.tierFallbackReason).toBe("cpu_down");
  });

  it("returns empty after both tiers fail so the generic API fallback layer can run", async () => {
    const infer = jest
      .fn()
      .mockRejectedValueOnce(new Error("cpu_down"))
      .mockRejectedValueOnce(new Error("gpu_down"));
    const out = await executeMalvTieredWorkerInfer({
      infer,
      workerMode: "light",
      neutralContext: {},
      cpuSidecarPatch: { malvInferenceBackend: "lightweight_local" },
      steps: [
        { tier: "cpu", applyCpuSidecarPatch: true },
        { tier: "gpu", applyCpuSidecarPatch: false }
      ],
      prompt: "x"
    });
    expect(infer).toHaveBeenCalledTimes(2);
    expect(out.response.reply?.trim()).toBe("");
    expect(out.tierFallbackUsed).toBe(true);
    expect(out.tierFallbackReason).toBe("gpu_down");
  });

  it("uses inferStream + onStreamDelta when provided and stops on first non-empty stream", async () => {
    const infer = jest.fn();
    const deltas: string[] = [];
    const inferStream = jest.fn().mockImplementationOnce(
      async ({ onStreamDelta }: { onStreamDelta: (t: string) => void }) => {
        onStreamDelta("ab");
        return okReply("ab", "openai_compatible");
      }
    );
    const out = await executeMalvTieredWorkerInfer({
      infer,
      inferStream,
      onStreamDelta: (t) => deltas.push(t),
      workerMode: "light",
      neutralContext: { runId: "r1" },
      cpuSidecarPatch: {},
      steps: [{ tier: "gpu", applyCpuSidecarPatch: false }],
      prompt: "hello"
    });
    expect(infer).not.toHaveBeenCalled();
    expect(inferStream).toHaveBeenCalledTimes(1);
    expect(deltas.join("")).toBe("ab");
    expect(out.response.reply).toBe("ab");
  });

  it("when streaming, does not fall back to second tier after deltas were already forwarded", async () => {
    const inferStream = jest
      .fn()
      .mockImplementationOnce(async ({ onStreamDelta }: { onStreamDelta: (t: string) => void }) => {
        onStreamDelta("x");
        throw new Error("gpu_broke_mid_stream");
      });
    await expect(
      executeMalvTieredWorkerInfer({
        infer: jest.fn(),
        inferStream,
        onStreamDelta: () => {},
        workerMode: "beast",
        neutralContext: {},
        cpuSidecarPatch: {},
        steps: [
          { tier: "gpu", applyCpuSidecarPatch: false },
          { tier: "cpu", applyCpuSidecarPatch: true }
        ],
        prompt: "z"
      })
    ).rejects.toThrow(/gpu_broke_mid_stream/);
    expect(inferStream).toHaveBeenCalledTimes(1);
  });
});
