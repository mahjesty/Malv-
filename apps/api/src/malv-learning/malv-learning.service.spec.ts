import { ConfigService } from "@nestjs/config";
import type { Repository } from "typeorm";
import { MalvLearningService } from "./malv-learning.service";
import { createEmptyMalvUserLearningProfilePayload } from "../db/entities/malv-user-learning-profile.entity";
import type { MalvLearningSignalEntity } from "../db/entities/malv-learning-signal.entity";
import type { MalvUserLearningProfileEntity } from "../db/entities/malv-user-learning-profile.entity";
import type { MalvControlledConfigEntity } from "../db/entities/malv-controlled-config.entity";

function makeService(ps: {
  findUserProfile: jest.Mock;
  learningEnabled?: boolean;
}): MalvLearningService {
  const cfg = {
    get: jest.fn((k: string) => {
      if (k === "MALV_LEARNING_ENABLED") return ps.learningEnabled === false ? "false" : undefined;
      return undefined;
    })
  } as unknown as ConfigService;

  const signals = { insert: jest.fn() } as unknown as Repository<MalvLearningSignalEntity>;
  const profiles = {
    findOne: ps.findUserProfile,
    save: jest.fn(),
    create: jest.fn((x: unknown) => x)
  } as unknown as Repository<MalvUserLearningProfileEntity>;
  const controlled = { findOne: jest.fn(), save: jest.fn() } as unknown as Repository<MalvControlledConfigEntity>;

  return new MalvLearningService(cfg, signals, profiles, controlled);
}

describe("MalvLearningService (Phase 5 hydration)", () => {
  it("awaitLearningHydrationForTurn loads DB profile within budget and dedupes hydrate", async () => {
    const disk = createEmptyMalvUserLearningProfilePayload();
    disk.turns = 40;
    disk.tierUpgrade12 = 3;
    const findUserProfile = jest.fn().mockResolvedValue({ payloadJson: disk });
    const svc = makeService({ findUserProfile });

    await svc.awaitLearningHydrationForTurn("user-1", 300);
    expect(findUserProfile).toHaveBeenCalledTimes(1);
    expect(findUserProfile).toHaveBeenCalledWith({ where: { userId: "user-1" } });

    await svc.awaitLearningHydrationForTurn("user-1", 300);
    expect(findUserProfile).toHaveBeenCalledTimes(1);
  });

  it("awaitLearningHydrationForTurn is a no-op when learning is disabled", async () => {
    const findUserProfile = jest.fn();
    const svc = makeService({ findUserProfile, learningEnabled: false });
    await svc.awaitLearningHydrationForTurn("user-1", 300);
    expect(findUserProfile).not.toHaveBeenCalled();
  });

  it("awaitLearningHydrationForTurn returns immediately when budget is zero", async () => {
    const findUserProfile = jest.fn();
    const svc = makeService({ findUserProfile });
    await svc.awaitLearningHydrationForTurn("user-1", 0);
    expect(findUserProfile).not.toHaveBeenCalled();
  });

  it("awaitLearningHydrationForTurn respects bounded timeout when DB hydration hangs", async () => {
    const findUserProfile = jest.fn().mockImplementation(
      () =>
        new Promise(() => {
          // intentionally never resolves
        })
    );
    const svc = makeService({ findUserProfile });
    const started = Date.now();
    await svc.awaitLearningHydrationForTurn("user-1", 10);
    expect(Date.now() - started).toBeLessThan(200);
    expect(findUserProfile).toHaveBeenCalledTimes(1);
  });

  it("scheduleTurnCapture swallows deferred failures (does not crash hot path)", async () => {
    const svc = makeService({ findUserProfile: jest.fn() });
    const warn = jest.spyOn((svc as any).log, "warn").mockImplementation(() => undefined);
    jest.spyOn(svc as any, "applyTurnCapture").mockImplementation(() => {
      throw new Error("boom");
    });
    svc.scheduleTurnCapture({
      userId: "u1",
      runId: "r1",
      reflexLane: false,
      cognitiveTier: 1,
      primaryIntent: "improvement_refactor",
      message: "hello",
      ambiguity: false,
      memorySnippetCount: 0,
      modelUsed: null,
      tierCorrection: null,
      responseConfidence: 0.8,
      refinementTriggered: false,
      driftKind: null,
      replySource: "beast_worker",
      priorUserMessages: [],
      lastAssistantContent: null
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[MALV_LEARNING] capture failed"));
  });
});
