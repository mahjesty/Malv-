import { BadRequestException } from "@nestjs/common";
import { FileUnderstandingService } from "./file-understanding.service";

describe("FileUnderstandingService legacy register hardening", () => {
  it("rejects storageUri registration by default when uploadHandle is missing", async () => {
    const service = new FileUnderstandingService(
      { ensureSystemOnOrThrow: jest.fn().mockResolvedValue(undefined) } as any,
      { get: jest.fn((_k: string) => undefined) } as any,
      { emitToUser: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { assertWorkspacePermissionOrThrow: jest.fn().mockResolvedValue(undefined) } as any,
      { assertRoomMemberOrThrow: jest.fn().mockResolvedValue(undefined) } as any,
      { incUploadRegisterPath: jest.fn(), incLegacyPathUsage: jest.fn() } as any
    );

    await expect(
      service.registerFile({
        userId: "u1",
        globalRole: "user",
        fileKind: "text",
        originalName: "x.txt",
        storageUri: "users/u1/uploads/something.txt"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
