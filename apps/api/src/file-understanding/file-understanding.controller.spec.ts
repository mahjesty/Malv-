import { FileUnderstandingController } from "./file-understanding.controller";

describe("FileUnderstandingController diagnostics hardening", () => {
  it("blocks non-admin storage health access", async () => {
    const c = new FileUnderstandingController(
      { getLocalStorageHealth: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any
    );
    const out = await c.storageHealth({ user: { userId: "u1", role: "user" } } as any);
    expect(out).toEqual({ ok: false, error: "Forbidden" });
  });
});
