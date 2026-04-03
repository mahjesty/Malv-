import { ForbiddenException } from "@nestjs/common";
import { WorkspaceAccessService } from "./workspace-access.service";

describe("WorkspaceAccessService", () => {
  it("allows global admin without workspace membership", async () => {
    const audits = { save: jest.fn() };
    const svc = new WorkspaceAccessService({} as any, {} as any, audits as any);
    await expect(
      svc.assertWorkspacePermissionOrThrow({
        userId: "u1",
        globalRole: "admin",
        workspaceId: "ws-1",
        requiredPermissions: ["workspace.sandbox.execute"]
      })
    ).resolves.toBeUndefined();
    expect(audits.save).not.toHaveBeenCalled();
  });

  it("denies missing workspace permissions and audits", async () => {
    const userRoles = {
      find: jest.fn().mockResolvedValue([
        {
          workspaceRole: {
            permissions: [{ granted: true, permission: { permissionKey: "workspace.member.read" } }]
          }
        }
      ])
    };
    const audits = { save: jest.fn(), create: jest.fn((x: any) => x) };
    const svc = new WorkspaceAccessService(userRoles as any, {} as any, audits as any);
    await expect(
      svc.assertWorkspacePermissionOrThrow({
        userId: "u1",
        globalRole: "user",
        workspaceId: "ws-1",
        requiredPermissions: ["workspace.sandbox.execute"]
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audits.save).toHaveBeenCalled();
  });
});
