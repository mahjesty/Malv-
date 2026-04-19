import { MalvExecutorEnrollmentService } from "./malv-executor-enrollment.service";

describe("MalvExecutorEnrollmentService", () => {
  it("does not throw when enrollment table is missing during heartbeat touch", async () => {
    const enrollments: any = {
      findOne: jest.fn().mockRejectedValue({ code: "ER_NO_SUCH_TABLE" }),
      update: jest.fn(),
      save: jest.fn(),
      create: jest.fn((x: unknown) => x)
    };
    const svc = new MalvExecutorEnrollmentService(enrollments);
    await expect(svc.touchHeartbeat("u1", "browser")).resolves.toBeUndefined();
  });

  it("returns null when enrollment table is missing on lastHeartbeat", async () => {
    const enrollments: any = {
      findOne: jest.fn().mockRejectedValue({ code: "ER_NO_SUCH_TABLE" })
    };
    const svc = new MalvExecutorEnrollmentService(enrollments);
    await expect(svc.lastHeartbeat("u1", "browser")).resolves.toBeNull();
  });
});
