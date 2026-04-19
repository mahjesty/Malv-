import { StudioSessionStreamService } from "./studio-session-stream.service";

describe("StudioSessionStreamService", () => {
  const distributed = {
    subscribe: jest.fn(async () => async () => undefined),
    publish: jest.fn(async () => undefined),
    appendStudioReplay: jest.fn(async () => undefined),
    readStudioReplay: jest.fn(async () => [])
  } as any;

  it("stores and returns session correlation", () => {
    const realtime: any = { emitToStudioSession: jest.fn() };
    const svc = new StudioSessionStreamService(realtime, { subscribe: jest.fn(() => () => undefined) } as any, distributed);
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
    const svc = new StudioSessionStreamService(realtime, { subscribe: jest.fn(() => () => undefined) } as any, distributed);
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

  it("replay buffer keeps deterministic bounded ordering", async () => {
    const realtime: any = { emitToStudioSession: jest.fn() };
    const svc = new StudioSessionStreamService(realtime, { subscribe: jest.fn(() => () => undefined) } as any, distributed);
    for (let i = 0; i < 140; i++) {
      svc.emitConsoleInfo("s1", "test", `line-${i}`);
    }
    const replay = await svc.replayForSession("s1");
    expect(replay.length).toBeLessThanOrEqual(120);
    expect(replay[0]!.at <= replay[replay.length - 1]!.at).toBe(true);
  });

  it("maps runtime-truth raw events via correlation", async () => {
    const realtime: any = { emitToStudioSession: jest.fn() };
    let handler: ((e: any) => void) | null = null;
    const bus: any = {
      subscribe: jest.fn((h: (e: any) => void) => {
        handler = h;
        return () => undefined;
      })
    };
    const svc = new StudioSessionStreamService(realtime, bus, distributed);
    svc.correlate({ sessionId: "s1", sandboxRunId: "run-1", aiJobId: "job-1" });
    await svc.onModuleInit();
    const h = handler as ((e: any) => void) | null;
    if (h) h({ source: "sandbox", sandboxRunId: "run-1", status: "executing", message: "running" });
    expect(realtime.emitToStudioSession).toHaveBeenCalledWith(
      "s1",
      "studio:runtime_event",
      expect.objectContaining({ sessionId: "s1" })
    );
  });

  it("deduplicates replay deterministically across local and distributed buffers", async () => {
    const realtime: any = { emitToStudioSession: jest.fn() };
    const distributedWithReplay = {
      ...distributed,
      readStudioReplay: jest.fn(async () => [
        { sessionId: "s1", type: "console_event", at: 1000, payload: { group: "g", message: "same", severity: "info" } },
        { sessionId: "s1", type: "console_event", at: 1000, payload: { severity: "info", message: "same", group: "g" } },
        { sessionId: "s1", type: "console_event", at: 1001, payload: { group: "g", message: "new", severity: "info" } }
      ])
    } as any;
    const svc = new StudioSessionStreamService(realtime, { subscribe: jest.fn(() => () => undefined) } as any, distributedWithReplay);
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1000);
    svc.emitConsoleInfo("s1", "g", "same");
    nowSpy.mockRestore();

    const replay = await svc.replayForSession("s1");
    expect(replay).toHaveLength(2);
    expect(replay.map((event) => event.payload.message)).toEqual(["same", "new"]);
  });
});

