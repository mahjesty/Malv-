import { VoiceOperatorService } from "./voice-operator.service";

describe("VoiceOperatorService confidence downgrade", () => {
  it("downgrades low-confidence execute intent to explain", async () => {
    const killSwitch: any = { ensureSystemOnOrThrow: jest.fn() };
    const realtime: any = { emitToUser: jest.fn() };
    const beast: any = { planVoiceOperatorWorkflow: jest.fn() };
    const calls: any = {};
    const voicePlayback: any = { emitVoicePipelineTest: jest.fn().mockResolvedValue(undefined) };
    const sandbox: any = { createOperatorTaskSandboxRun: jest.fn() };
    const aiJobs: any = { create: jest.fn(), save: jest.fn() };
    const voiceEvents: any = { create: jest.fn((x: any) => x), save: jest.fn() };
    const operatorTargets: any = { create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => ({ id: "target-1", ...x })) };
    const reviewSessions: any = { create: jest.fn((x: any) => x), save: jest.fn() };
    const reviewFindings: any = { create: jest.fn((x: any) => x), save: jest.fn() };
    const beastWorker: any = { infer: jest.fn() };
    const inferenceRouting: any = { decideForCallVoiceContinuity: jest.fn() };
    const cfg: any = { get: jest.fn(() => "0") };
    const malvTaskRouter: any = { route: jest.fn() };

    const svc = new VoiceOperatorService(
      killSwitch,
      realtime,
      beast,
      calls,
      voicePlayback,
      sandbox,
      aiJobs,
      voiceEvents,
      operatorTargets,
      reviewSessions,
      reviewFindings,
      beastWorker,
      inferenceRouting,
      cfg,
      malvTaskRouter
    );
    const out = await svc.handleVoiceUtterance({
      userId: "u1",
      transcriptText: "execute this now",
      isFinal: true,
      contextHint: { page: null, selectedFile: null, workspacePath: null }
    });
    expect(out.ok).toBe(true);
    expect((out as any).intent).toBe("explain");
    expect(beast.planVoiceOperatorWorkflow).not.toHaveBeenCalled();
  });

  it("composer_chat final emits voice:final and skips operator dispatch", async () => {
    const killSwitch: any = { ensureSystemOnOrThrow: jest.fn() };
    const realtime: any = { emitToUser: jest.fn() };
    const beast: any = { planVoiceOperatorWorkflow: jest.fn() };
    const calls: any = {};
    const voicePlayback: any = { emitVoicePipelineTest: jest.fn().mockResolvedValue(undefined) };
    const sandbox: any = { createOperatorTaskSandboxRun: jest.fn() };
    const aiJobs: any = { create: jest.fn(), save: jest.fn() };
    const voiceEvents: any = { create: jest.fn((x: any) => x), save: jest.fn() };
    const operatorTargets: any = { create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => ({ id: "target-1", ...x })) };
    const reviewSessions: any = { create: jest.fn((x: any) => x), save: jest.fn() };
    const reviewFindings: any = { create: jest.fn((x: any) => x), save: jest.fn() };
    const beastWorker: any = { infer: jest.fn() };
    const inferenceRouting: any = { decideForCallVoiceContinuity: jest.fn() };
    const cfg: any = { get: jest.fn(() => "0") };
    const malvTaskRouter: any = { route: jest.fn() };

    const svc = new VoiceOperatorService(
      killSwitch,
      realtime,
      beast,
      calls,
      voicePlayback,
      sandbox,
      aiJobs,
      voiceEvents,
      operatorTargets,
      reviewSessions,
      reviewFindings,
      beastWorker,
      inferenceRouting,
      cfg,
      malvTaskRouter
    );
    const out = await svc.handleVoiceUtterance({
      userId: "u1",
      transcriptText: "hello chat",
      isFinal: true,
      sessionTarget: "composer_chat",
      sessionId: "s1",
      contextHint: { page: null, selectedFile: null, workspacePath: null }
    });
    expect(out).toEqual({ ok: true, composerChat: true });
    expect(killSwitch.ensureSystemOnOrThrow).not.toHaveBeenCalled();
    expect(beast.planVoiceOperatorWorkflow).not.toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      "u1",
      "voice:final",
      expect.objectContaining({ text: "hello chat", sessionId: "s1", sessionTarget: "composer_chat" })
    );
  });

  it("voice call utterance containing malv test voice emits canned pipeline reply", async () => {
    const killSwitch: any = { ensureSystemOnOrThrow: jest.fn() };
    const realtime: any = { emitToUser: jest.fn() };
    const beast: any = { planVoiceOperatorWorkflow: jest.fn() };
    const voicePlayback: any = { emitVoicePipelineTest: jest.fn().mockResolvedValue(undefined) };
    const calls: any = {
      assertUserOwnsCall: jest.fn().mockResolvedValue({
        kind: "voice",
        malvPaused: false,
        voiceFlowMode: "active",
        callTranscriptEnabled: false,
        id: "call-1"
      }),
      recordOperatorUserUtteranceIfEnabled: jest.fn().mockResolvedValue(undefined)
    };
    const sandbox: any = { createOperatorTaskSandboxRun: jest.fn() };
    const aiJobs: any = { create: jest.fn(), save: jest.fn() };
    const voiceEvents: any = { create: jest.fn((x: any) => x), save: jest.fn() };
    const operatorTargets: any = { create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => ({ id: "target-1", ...x })) };
    const reviewSessions: any = { create: jest.fn((x: any) => x), save: jest.fn() };
    const reviewFindings: any = { create: jest.fn((x: any) => x), save: jest.fn() };
    const beastWorker: any = { infer: jest.fn() };
    const inferenceRouting: any = { decideForCallVoiceContinuity: jest.fn() };
    const cfg: any = { get: jest.fn(() => "0") };
    const malvTaskRouter: any = { route: jest.fn() };

    const svc = new VoiceOperatorService(
      killSwitch,
      realtime,
      beast,
      calls,
      voicePlayback,
      sandbox,
      aiJobs,
      voiceEvents,
      operatorTargets,
      reviewSessions,
      reviewFindings,
      beastWorker,
      inferenceRouting,
      cfg,
      malvTaskRouter
    );
    const out = await svc.handleVoiceUtterance({
      userId: "u1",
      callSessionId: "call-1",
      transcriptText: "Hey MALV test voice please",
      isFinal: true,
      contextHint: { page: null, selectedFile: null, workspacePath: null }
    });
    expect(out).toEqual({ ok: true, voicePipelineTest: true });
    expect(voicePlayback.emitVoicePipelineTest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        callSessionId: "call-1",
        triggerTranscript: "Hey MALV test voice please"
      })
    );
    expect(beast.planVoiceOperatorWorkflow).not.toHaveBeenCalled();
    expect(killSwitch.ensureSystemOnOrThrow).not.toHaveBeenCalled();
  });
});
