import { MALV_IDENTITY_POLICY } from "./malv-identity-policy";
import { finalizeWorkerReplyForDelivery } from "./beast.orchestrator.service";

describe("finalizeWorkerReplyForDelivery", () => {
  it("shapes streaming-derived identity leak replies and marks shaping policy", () => {
    const finalized = finalizeWorkerReplyForDelivery({
      workerRes: {
        reply: "I, Qwen, was trained under Alibaba Cloud. I can fix your TypeScript build.",
        meta: { malvWorkerStreamedReply: true }
      },
      priorAssistantTexts: []
    });

    expect(finalized.workerRes.reply).not.toMatch(/\bQwen\b/i);
    expect(finalized.workerRes.reply).not.toMatch(/Alibaba/i);
    expect(finalized.workerRes.reply).toContain("TypeScript build");
    expect((finalized.workerRes.meta as Record<string, unknown>).malvShapingPolicy).toBe("local_stream_shaped");
    expect((finalized.workerRes.meta as Record<string, unknown>).malvFinalIdentityEnforcementMode).toEqual(
      expect.any(String)
    );
    expect((finalized.workerRes.meta as Record<string, unknown>).malvTurnOutcome).toBe("complete");
    expect(finalized.malvHadModelIdentityLeak).toBe(true);
  });

  it("strips false MALV-origin claims before final persistence text", () => {
    const finalized = finalizeWorkerReplyForDelivery({
      workerRes: {
        reply: "I'm Qwen. Start with `npm run build`.",
        meta: { malvWorkerStreamedReply: true }
      },
      priorAssistantTexts: []
    });

    expect(finalized.workerRes.reply).not.toMatch(/\bQwen\b/i);
    expect(finalized.workerRes.reply).toContain("npm run build");
    expect(finalized.malvHadModelIdentityLeak).toBe(true);
  });

  it("replies that imply origin with created-by phrasing are fully replaced at finalization", () => {
    const finalized = finalizeWorkerReplyForDelivery({
      workerRes: {
        reply: "MALV was created by Alibaba Cloud. Start with `npm run build`.",
        meta: { malvWorkerStreamedReply: true }
      },
      priorAssistantTexts: []
    });

    expect(finalized.workerRes.reply).toBe(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse);
    expect((finalized.workerRes.meta as Record<string, unknown>).malvFinalIdentityEnforcementMode).toBe("replace");
    expect(finalized.malvHadModelIdentityLeak).toBe(true);
  });

  it("replaces creator-disclaimer fallback through the same finalizer used for worker replies", () => {
    const finalized = finalizeWorkerReplyForDelivery({
      workerRes: {
        reply: "I don't have specific information about my creator. Here's how to fix the build.",
        meta: {}
      },
      priorAssistantTexts: []
    });

    expect(finalized.workerRes.reply).toBe(MALV_IDENTITY_POLICY.strictNoOriginDetailsResponse);
    expect(finalized.malvHadModelIdentityLeak).toBe(true);
  });

  it("keeps non-stream shaping deterministic and no leak flag for normal text", () => {
    const finalized = finalizeWorkerReplyForDelivery({
      workerRes: {
        reply: "Run `npm test` and verify snapshots.",
        meta: {}
      },
      priorAssistantTexts: ["Previous reply."]
    });

    expect(finalized.workerRes.reply).toContain("npm test");
    expect((finalized.workerRes.meta as Record<string, unknown>).malvShapingPolicy).toBe("local_non_stream_shaped");
    expect((finalized.workerRes.meta as Record<string, unknown>).malvFinalIdentityEnforcementMode).toBe("none");
    expect(finalized.malvHadModelIdentityLeak).toBe(false);
  });

  it("marks length-truncated replies as partial_done and continuable", () => {
    const finalized = finalizeWorkerReplyForDelivery({
      workerRes: {
        reply: "## Backend\nImplemented controllers and ...",
        meta: { malvTurnOutcome: "complete", finishReason: "length" }
      },
      priorAssistantTexts: []
    });
    const meta = finalized.workerRes.meta as Record<string, unknown>;
    expect(meta.malvTurnOutcome).toBe("partial_done");
    expect(meta.malvContinuationPlan).toMatchObject({
      canContinue: true,
      continueReason: "length",
      continuationMode: "auto"
    });
  });

  it("treats worker malvLastFinishReason=length as partial_done continuable", () => {
    const finalized = finalizeWorkerReplyForDelivery({
      workerRes: {
        reply: "## Backend\nImplemented controllers and ...",
        meta: { malvTurnOutcome: "complete", malvLastFinishReason: "length" }
      },
      priorAssistantTexts: []
    });
    const meta = finalized.workerRes.meta as Record<string, unknown>;
    expect(meta.malvTurnOutcome).toBe("partial_done");
    expect(meta.malvContinuationPlan).toMatchObject({
      canContinue: true,
      continueReason: "length",
      continuationMode: "auto"
    });
  });
});
