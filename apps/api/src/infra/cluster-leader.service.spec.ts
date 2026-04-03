import { ClusterLeaderService } from "./cluster-leader.service";

describe("ClusterLeaderService", () => {
  it("runs fn when GET_LOCK returns 1 and releases on same query runner", async () => {
    const calls: string[] = [];
    const qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ acquired: 1 }])
        .mockResolvedValueOnce([{ released: 1 }]),
      release: jest.fn().mockResolvedValue(undefined)
    };
    const ds = { createQueryRunner: jest.fn(() => qr) } as any;
    const cfg = { get: jest.fn(() => "test_lock") } as any;
    const svc = new ClusterLeaderService(ds, cfg);
    const out = await svc.runIfLeader(async () => {
      calls.push("work");
      return 42;
    });
    expect(out).toBe(42);
    expect(calls).toEqual(["work"]);
    expect(qr.query).toHaveBeenCalledWith("SELECT GET_LOCK(?, ?) AS acquired", ["test_lock", 1]);
    expect(qr.query).toHaveBeenCalledWith("SELECT RELEASE_LOCK(?) AS released", ["test_lock"]);
    expect(qr.release).toHaveBeenCalled();
  });

  it("skips work when lock not acquired", async () => {
    const qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValueOnce([{ acquired: 0 }]),
      release: jest.fn().mockResolvedValue(undefined)
    };
    const ds = { createQueryRunner: jest.fn(() => qr) } as any;
    const cfg = { get: jest.fn(() => "x") } as any;
    const svc = new ClusterLeaderService(ds, cfg);
    const out = await svc.runIfLeader(async () => "nope");
    expect(out).toBeUndefined();
    expect(qr.query).toHaveBeenCalledTimes(1);
  });
});
