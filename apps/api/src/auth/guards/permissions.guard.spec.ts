import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";

describe("PermissionsGuard", () => {
  const mkCtx = (user: any): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user, method: "GET", route: { path: "/v1/admin/x" }, url: "/v1/admin/x" })
      })
    }) as any;

  it("allows when admin role", async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(["admin.runtime.read"]) } as unknown as Reflector;
    const audits: any = { save: jest.fn(), create: jest.fn((x: any) => x) };
    const guard = new PermissionsGuard(reflector, audits);
    await expect(guard.canActivate(mkCtx({ userId: "u1", role: "admin", permissions: [] }))).resolves.toBe(true);
  });

  it("denies and audits when permission missing", async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(["sandbox.patches.apply"]) } as unknown as Reflector;
    const audits: any = { save: jest.fn(), create: jest.fn((x: any) => x) };
    const guard = new PermissionsGuard(reflector, audits);
    await expect(guard.canActivate(mkCtx({ userId: "u1", role: "user", permissions: ["sandbox.patches.read"] }))).resolves.toBe(false);
    expect(audits.save).toHaveBeenCalled();
  });
});
