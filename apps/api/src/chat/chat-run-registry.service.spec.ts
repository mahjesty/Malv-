import { ChatRunRegistryService } from "./chat-run-registry.service";

describe("ChatRunRegistryService", () => {
  it("reports partial cancel when only distributed marker can be written", async () => {
    const distributed: any = {
      recordCancelRequested: jest.fn().mockResolvedValue(true),
      clearCancelRequested: jest.fn().mockResolvedValue(undefined),
      isCancelRequested: jest.fn().mockResolvedValue(false)
    };
    const svc = new ChatRunRegistryService(distributed);
    const out = await svc.requestCancel({ assistantMessageId: "a1", userId: "u1" });
    expect(out).toEqual({
      ok: false,
      localAbortApplied: false,
      distributedMarkerRecorded: true
    });
  });

  it("aborts local registered turn and returns truthful cancel status", async () => {
    const distributed: any = {
      recordCancelRequested: jest.fn().mockResolvedValue(true),
      clearCancelRequested: jest.fn().mockResolvedValue(undefined),
      isCancelRequested: jest.fn().mockResolvedValue(false)
    };
    const svc = new ChatRunRegistryService(distributed);
    const abortController = new AbortController();
    const abortSpy = jest.spyOn(abortController, "abort");
    svc.registerTurn({ assistantMessageId: "a1", userId: "u1", abortController });
    const out = await svc.requestCancel({ assistantMessageId: "a1", userId: "u1" });
    expect(abortSpy).toHaveBeenCalled();
    expect(out).toEqual({
      ok: true,
      localAbortApplied: true,
      distributedMarkerRecorded: true
    });
    expect(await svc.isCancelled("a1")).toBe(true);
  });
});
