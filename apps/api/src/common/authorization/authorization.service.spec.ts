import { AuthorizationService } from "./authorization.service";

describe("AuthorizationService", () => {
  it("enforces room isolation for non-members", async () => {
    const svc = new AuthorizationService(
      {
        findOne: jest.fn().mockResolvedValue(null)
      } as any,
      {} as any,
      {} as any,
      {} as any
    );
    await expect(svc.assertRoomMemberOrThrow({ userId: "u1", roomId: "r1" })).rejects.toThrow("Room not found.");
  });

  it("allows file access via collaboration room membership", async () => {
    const roomMemberRepo: any = {
      findOne: jest.fn().mockResolvedValue({ room: { id: "r1", deletedAt: null } })
    };
    const filesRepo: any = {
      findOne: jest.fn().mockResolvedValue({
        id: "f1",
        user: { id: "u-owner" },
        collaborationRoom: { id: "r1" }
      })
    };
    const svc = new AuthorizationService(roomMemberRepo, {} as any, {} as any, filesRepo);
    const out = await svc.assertFileReadableOrThrow({ userId: "u-member", fileId: "f1" });
    expect(out.id).toBe("f1");
  });

  it("blocks call ownership mismatch", async () => {
    const svc = new AuthorizationService(
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      {} as any
    );
    await expect(svc.assertCallOwnerOrThrow({ userId: "u1", callSessionId: "c1" })).rejects.toThrow(
      "Call session not found or not owned by user."
    );
  });
});
