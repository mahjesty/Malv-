import { buildMalvTransportDecisionSnapshot } from "./malv-transport-parity.util";

describe("buildMalvTransportDecisionSnapshot", () => {
  it("captures normalized core decision fields for parity proof", () => {
    const snapshot = buildMalvTransportDecisionSnapshot({
      malvReplySource: "beast_worker_phased",
      malvTurnOutcome: "complete",
      malvTerminal: "completed",
      malvExecutionStrategy: { mode: "phased" },
      malvServerPhasedOrchestration: true,
      malvServerPhasedTrace: [{ phaseId: "audit" }, { phaseId: "plan" }],
      malvConfidenceClarification: false,
      policyDenied: false,
      malvInferenceTrace: {
        malvChatInferenceTransport: "beast_worker_phased",
        malvLearningSignalsCaptured: true,
        malvIntentKind: "build",
        malvRouting: {
          malvSelectedTier: "tier_2",
          malvPreferredTier: "tier_2"
        },
        malvResponseRetry: { triggered: true },
        malvTierCorrection: {
          fromTier: "tier_1",
          toTier: "tier_2"
        }
      }
    });

    expect(snapshot).toMatchObject({
      replySource: "beast_worker_phased",
      turnOutcome: "complete",
      terminal: "completed",
      selectedTier: "tier_2",
      preferredTier: "tier_2",
      executionMode: "phased",
      phasedEnabled: true,
      phasedTraceEntries: 2,
      confidenceClarification: false,
      requiresClarification: false,
      responseRetryTriggered: true,
      policyDenied: false,
      tierCorrectionApplied: true,
      intentKind: "build",
      learningSignalsCaptured: true,
      transport: "beast_worker_phased"
    });
  });
});
