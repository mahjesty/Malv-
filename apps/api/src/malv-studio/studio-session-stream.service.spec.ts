import { StudioSessionStreamService } from "./studio-session-stream.service";

describe("StudioSessionStreamService", () => {
  it("stores and returns session correlation", () => {
    const realtime: any = { emitToStudioSession: jest.fn() };
    const svc = new StudioSessionStreamService(realtime, { subscribe: jest.fn(() => () => undefined) } as any);
    svc.correlate({ sessionId: "s1", sandboxRunId: "run1", aiJobId: "job1", versionId: "v2" });
    const out = svc.getCorrelation("s1");
    expect(out).toEqual({
      sessionId: "s1",
      sandboxRunId: "run1",
      aiJobId: "job1",
      versionId: "v2"
    });
  });

  it("emits normalized runtime event to studio room", () => {
    const realtime: any = { emitToStudioSession: jest.fn() };
    const svc = new StudioSessionStreamService(realtime, { subscribe: jest.fn(() => () => undefined) } as any);
    svc.emitPreviewRefining("s1");
    expect(realtime.emitToStudioSession).toHaveBeenCalledWith(
      "s1",
      "studio:runtime_event",
      expect.objectContaining({
        sessionId: "s1",
        type: "preview_state"
      })
    );
  });

  it("replay buffer keeps deterministic bounded ordering", () => {
    const realtime: any = { emitToStudioSession: jest.fn() };
    const svc = new StudioSessionStreamService(realtime, { subscribe: jest.fn(() => () => undefined) } as any);
    for (let i = 0; i < 140; i++) {
      svc.emitConsoleInfo("s1", "test", `line-${i}`);
    }
    const replay = svc.replayForSession("s1");
    expect(replay.length).toBeLessThanOrEqual(120);
    expect(replay[0]!.at <= replay[replay.length - 1]!.at).toBe(true);
  });

  it("maps runtime-truth raw events via correlation", () => {
    const realtime: any = { emitToStudioSession: jest.fn() };
    let handler: ((e: any) => void) | null = null;
    const bus: any = {
      subscribe: jest.fn((h: (e: any) => void) => {
        handler = h;
        return () => undefined;
      })
    };
    const svc = new StudioSessionStreamService(realtime, bus);
    svc.correlate({ sessionId: "s1", sandboxRunId: "run-1", aiJobId: "job-1" });
    svc.onModuleInit();
    const h = handler as ((e: any) => void) | null;
    if (h) h({ source: "sandbox", sandboxRunId: "run-1", status: "executing", message: "running" });
    expect(realtime.emitToStudioSession).toHaveBeenCalledWith(
      "s1",
      "studio:runtime_event",
      expect.objectContaining({ sessionId: "s1" })
    );
  });
});

