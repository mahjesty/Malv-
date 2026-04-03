import { AdminSecurityController } from "./admin-security.controller";

describe("AdminSecurityController", () => {
  const empty = {} as any;

  it("posture is restricted to admin role", () => {
    const ctrl = new AdminSecurityController(empty, empty, empty, empty, empty, empty, empty);
    const res = ctrl.getPosture({ user: { role: "user" } } as any);
    expect(res).toEqual({ ok: false, error: "Admin only" });
  });

  it("posture returns snapshot for admin", () => {
    const posture = {
      getSnapshot: jest.fn().mockReturnValue({ sandbox: { providerMode: "docker" } })
    };
    const ctrl = new AdminSecurityController(posture as any, empty, empty, empty, empty, empty, empty);
    const res = ctrl.getPosture({ user: { role: "admin" } } as any);
    expect(res.ok).toBe(true);
    expect((res as any).posture.sandbox.providerMode).toBe("docker");
  });

  it("summary is restricted to admin role", async () => {
    const ctrl = new AdminSecurityController(empty, empty, empty, empty, empty, empty, empty);
    const res = await ctrl.getSummary({ user: { role: "user" } } as any);
    expect(res).toEqual({ ok: false, error: "Admin only" });
  });

  it("summary returns payload for admin", async () => {
    const summary = {
      getAdminSummary: jest.fn().mockResolvedValue({ windowHours: 24, countsBySeverity24h: { low: 1 } })
    };
    const ctrl = new AdminSecurityController(empty, empty, summary as any, empty, empty, empty, empty);
    const res = await ctrl.getSummary({ user: { role: "admin" } } as any);
    expect((res as any).ok).toBe(true);
    expect((res as any).summary.windowHours).toBe(24);
  });
});
