import { ChatController } from "./chat.controller";

describe("ChatController diagnostics hardening", () => {
  it("blocks non-admin brain-health", async () => {
    const c = new ChatController(
      {} as any,
      {} as any,
      {} as any,
      { get: () => undefined } as any,
      { internalUsersOnlyMode: () => false, internalUserAllowlist: () => [], userInRollout: () => true } as any
    );
    const out = await c.brainHealth({ user: { userId: "u1", role: "user" } } as any);
    expect(out).toEqual({ ok: false, error: "Forbidden" });
  });
});
