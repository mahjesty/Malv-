import { PhasedChatOrchestrationService, buildPhasedStepUserMessage } from "./phased-chat-orchestration.service";
import { ConfigService } from "@nestjs/config";
import type { BeastWorkerClient } from "./client/beast-worker.client";
import type { KillSwitchService } from "../kill-switch/kill-switch.service";

describe("PhasedChatOrchestrationService", () => {
  it("buildPhasedStepUserMessage includes phase label and index", () => {
    const m = buildPhasedStepUserMessage({
      originalUserMessage: "Build feature X",
      phase: "audit",
      phaseIndex: 0,
      phaseTotal: 3,
      priorPhaseBodies: []
    });
    expect(m).toContain("Build feature X");
    expect(m).toContain("Server phase 1/3");
    expect(m).toContain("Audit");
  });

  it("runs sequential worker phases and concatenates replies", async () => {
    let n = 0;
    const worker = {
      infer: jest.fn().mockImplementation(async () => ({
        reply: `body-${++n}`,
        meta: { step: n }
      }))
    } as unknown as BeastWorkerClient;
    const killSwitch = {
      ensureSystemOnOrThrow: jest.fn().mockResolvedValue(undefined)
    } as unknown as KillSwitchService;
    const cfg = {
      get: jest.fn().mockReturnValue("1")
    } as unknown as ConfigService;
    const svc = new PhasedChatOrchestrationService(cfg, worker, killSwitch);
    expect(svc.isEnabled()).toBe(true);

    const onPhaseComplete = jest.fn();
    const out = await svc.runWorkerPhases({
      originalUserMessage: "goal",
      phases: ["audit", "plan"],
      mode: "beast",
      baseAggregated: { runId: "r1" },
      maxTokens: 1200,
      synthesizeFallback: () => ({ reply: "fb", meta: {} }),
      buildPrompt: (u) => `PROMPT:${u.slice(0, 30)}`,
      onPhaseComplete
    });

    expect(worker.infer).toHaveBeenCalledTimes(2);
    expect((worker.infer as jest.Mock).mock.calls[0][0].maxTokens).toBe(1200);
    expect(out.combinedReply).toContain("body-1");
    expect(out.combinedReply).toContain("body-2");
    expect(out.trace).toHaveLength(2);
    expect(out.trace[0]?.status).toBe("completed");
    expect(out.trace[0]?.phaseId).toBe("audit");
    expect(killSwitch.ensureSystemOnOrThrow).toHaveBeenCalledTimes(2);
    expect(onPhaseComplete).toHaveBeenCalledTimes(2);
    expect(onPhaseComplete.mock.calls[0][0]).toMatchObject({
      phaseId: "audit",
      status: "completed",
      index: 0,
      total: 2
    });
  });

  it("is disabled when env not set", () => {
    const cfg = { get: jest.fn().mockReturnValue("0") } as unknown as ConfigService;
    const svc = new PhasedChatOrchestrationService(
      cfg,
      { infer: jest.fn() } as unknown as BeastWorkerClient,
      { ensureSystemOnOrThrow: jest.fn() } as unknown as KillSwitchService
    );
    expect(svc.isEnabled()).toBe(false);
  });
});
