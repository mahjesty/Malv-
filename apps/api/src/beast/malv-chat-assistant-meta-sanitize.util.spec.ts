import {
  pickMalvRichAssistantMetaForCompletionHandoff,
  sanitizeMalvChatAssistantMetaForUser
} from "./malv-chat-assistant-meta-sanitize.util";

describe("sanitizeMalvChatAssistantMetaForUser", () => {
  it("removes internal diagnostics while keeping safe routing hints", () => {
    const raw = {
      malvReplySource: "api_operator_fallback_brain",
      malvAgentRouterSummary: { workShape: "x" },
      workerAttemptError: "fetch failed ECONNREFUSED",
      workerError: "should not appear",
      malvInferenceTrace: {
        malvChatInferenceTransport: "api_operator_fallback_brain",
        malvChatWsLiveStreamCallback: true,
        malvResponsePipelineTrace: { decision: { mode: "answer" } },
        malvAgentRouter: { workShape: "chat_response", resourceTier: "cpu" },
        malvFallbackExceptionSummary: "secret",
        malvLocalInferenceProbeBaseUrl: "http://127.0.0.1:8081",
        malvLocalInferenceProbeDetail: "detail",
        malvLocalInferenceFailureReason: "reason"
      },
      malvServerPhasedTrace: [
        {
          phaseId: "audit",
          phaseLabel: "Audit",
          index: 0,
          total: 2,
          status: "completed",
          replyChars: 12,
          producer: "fallback_brain",
          detail: "ECONNRESET at http://x"
        }
      ],
      malvResponsePipelineTrace: { final: { outcome: "complete" } }
    };

    const clean = sanitizeMalvChatAssistantMetaForUser(raw);
    expect(clean.malvAgentRouterSummary).toBeUndefined();
    expect(clean.workerAttemptError).toBeUndefined();
    expect(clean.workerError).toBeUndefined();
    expect((clean.malvInferenceTrace as Record<string, unknown>).malvAgentRouter).toBeUndefined();
    expect((clean.malvInferenceTrace as Record<string, unknown>).malvFallbackExceptionSummary).toBeUndefined();
    expect((clean.malvInferenceTrace as Record<string, unknown>).malvLocalInferenceProbeBaseUrl).toBeUndefined();
    expect((clean.malvInferenceTrace as Record<string, unknown>).malvResponsePipelineTrace).toBeUndefined();
    expect(clean.malvResponsePipelineTrace).toBeUndefined();
    expect((clean.malvInferenceTrace as Record<string, unknown>).malvChatWsLiveStreamCallback).toBe(true);
    expect((clean.malvServerPhasedTrace as Record<string, unknown>[])[0].detail).toBeUndefined();
    expect((clean.malvServerPhasedTrace as Record<string, unknown>[])[0].producer).toBe("fallback_brain");
  });

  it.each([
    { branch: "reflex", meta: { malvReplySource: "malv_light_social_short_circuit", malvTurnOutcome: "complete" } },
    {
      branch: "normal",
      meta: { malvReplySource: "beast_worker", malvTurnOutcome: "complete", malvExecutionStrategy: { mode: "single_step" } }
    },
    {
      branch: "deep",
      meta: {
        malvReplySource: "beast_worker_phased",
        malvTurnOutcome: "complete",
        malvServerPhasedOrchestration: true,
        malvExecutionStrategy: { mode: "phased" }
      }
    },
    {
      branch: "clarification",
      meta: {
        malvReplySource: "malv_confidence_clarification",
        malvConfidenceClarification: true,
        malvExecutionStrategy: { mode: "require_clarification" }
      }
    },
    {
      branch: "refinement",
      meta: { malvReplySource: "beast_worker", malvResponseRetry: { triggered: true, reason: "weak_shape" } }
    },
    {
      branch: "policy_block",
      meta: { malvReplySource: "policy_block", malvResponsePolicy: "reject_unsafe_execution" }
    },
    { branch: "interrupted", meta: { malvReplySource: "beast_worker", malvTerminal: "interrupted" } }
  ])("keeps explicit trace contract shape for $branch", ({ meta }) => {
    const clean = sanitizeMalvChatAssistantMetaForUser({
      ...meta,
      malvInferenceTrace: {
        malvChatInferenceTransport: "beast_worker",
        malvLearningSignalsCaptured: false
      }
    });
    expect(clean).toMatchObject({
      malvReplySource: expect.any(String),
      malvInferenceTrace: expect.objectContaining({
        malvChatInferenceTransport: expect.any(String)
      })
    });
    expect((clean.malvInferenceTrace as Record<string, unknown>).malvFallbackExceptionSummary).toBeUndefined();
    expect((clean.malvInferenceTrace as Record<string, unknown>).malvLocalInferenceProbeBaseUrl).toBeUndefined();
  });

  it("adds nullable contract defaults when trace is missing", () => {
    const clean = sanitizeMalvChatAssistantMetaForUser({
      malvReplySource: "beast_worker"
    });
    expect(clean.malvInferenceTrace).toEqual({
      malvChatInferenceTransport: null,
      malvLearningSignalsCaptured: null,
      malvIntentKind: null,
      malvDecisionRationale: null,
      malvChatWsLiveStreamCallback: null,
      malvServerPhasedOrchestrationEnabled: null
    });
  });
});

describe("pickMalvRichAssistantMetaForCompletionHandoff", () => {
  it("returns undefined when no rich handoff fields are present", () => {
    expect(pickMalvRichAssistantMetaForCompletionHandoff(undefined)).toBeUndefined();
    expect(pickMalvRichAssistantMetaForCompletionHandoff({ malvReplySource: "beast_worker" })).toBeUndefined();
  });

  it("copies only structured rich fields and omits internal top-level keys", () => {
    const picked = pickMalvRichAssistantMetaForCompletionHandoff({
      malvReplySource: "beast_worker",
      workerError: "internal",
      malvStructuredRichSurface: true,
      malvRichResponse: {
        sources: [{ title: "Example", url: "https://example.com/doc" }],
        showSourcesInChrome: true
      }
    });
    expect(picked).toEqual({
      malvStructuredRichSurface: true,
      malvRichResponse: {
        sources: [{ title: "Example", url: "https://example.com/doc" }],
        showSourcesInChrome: true
      }
    });
  });
});
