import { WorkspaceProductivityService } from "./workspace-productivity.service";

describe("WorkspaceProductivityService room authorization", () => {
  it("asserts room membership before room-scoped task create", async () => {
    const svc = new WorkspaceProductivityService(
      { findOne: jest.fn(), create: jest.fn((x) => x), save: jest.fn(async (x) => ({ id: "t1", ...x })) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { emitToUser: jest.fn(), emitToRoom: jest.fn() } as any,
      { record: jest.fn() } as any,
      { assertRoomMemberOrThrow: jest.fn().mockResolvedValue(undefined) } as any
    );
    await svc.createTask({ userId: "u1", title: "x", roomId: "room-1" });
    expect((svc as any).authz.assertRoomMemberOrThrow).toHaveBeenCalledWith({ userId: "u1", roomId: "room-1" });
  });
});
