import { MalvExternalActionDispatchService } from "./malv-external-action-dispatch.service";
import type { WorkspaceTaskEntity } from "../db/entities/workspace-task.entity";
import type { MalvBridgeCapabilityReport } from "./malv-bridge-capability.types";

describe("MalvExternalActionDispatchService", () => {
  const cap = (live: Array<MalvBridgeCapabilityReport["liveBridgeKinds"][number]>): MalvBridgeCapabilityReport => ({
    resolvedAt: new Date().toISOString(),
    staleThresholdMs: 120_000,
    endpoints: [],
    liveBridgeKinds: live
  });

  it("blocks open_app as unsupported v1", async () => {
    const killSwitch = { getState: jest.fn().mockResolvedValue({ systemOn: true }) };
    const realtime = { emitExternalActionDispatch: jest.fn(), countExecutorDispatchTargets: jest.fn().mockReturnValue(1) };
    const dispatches = { findOne: jest.fn(), save: jest.fn() };
    const svc = new MalvExternalActionDispatchService(killSwitch as any, realtime as any, dispatches as any);
    const task = {
      id: "t1",
      metadata: {
        malvExternalActionV1: { schemaVersion: 1, kind: "open_app", params: { bundleId: "x" } }
      },
      riskLevel: "low",
      requiresApproval: false
    } as unknown as WorkspaceTaskEntity;
    const r = await svc.beginDispatch({
      userId: "u1",
      task,
      now: new Date(),
      cap: cap(["browser_agent"]),
      requestKey: "t1:adhoc"
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unsupported_action");
  });

  it("blocks create_local_reminder as unsupported v1", async () => {
    const killSwitch = { getState: jest.fn().mockResolvedValue({ systemOn: true }) };
    const realtime = { emitExternalActionDispatch: jest.fn(), countExecutorDispatchTargets: jest.fn().mockReturnValue(1) };
    const dispatches = { findOne: jest.fn(), save: jest.fn() };
    const svc = new MalvExternalActionDispatchService(killSwitch as any, realtime as any, dispatches as any);
    const task = {
      id: "t1",
      metadata: {
        malvExternalActionV1: { schemaVersion: 1, kind: "create_local_reminder", params: { title: "x" } }
      },
      riskLevel: "low",
      requiresApproval: false
    } as unknown as WorkspaceTaskEntity;
    const r = await svc.beginDispatch({
      userId: "u1",
      task,
      now: new Date(),
      cap: cap(["mobile_agent"]),
      requestKey: "t1:adhoc"
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unsupported_action");
  });

  it("blocks when no live bridge", async () => {
    const killSwitch = { getState: jest.fn().mockResolvedValue({ systemOn: true }) };
    const realtime = { emitExternalActionDispatch: jest.fn(), countExecutorDispatchTargets: jest.fn().mockReturnValue(1) };
    const dispatches = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const svc = new MalvExternalActionDispatchService(killSwitch as any, realtime as any, dispatches as any);
    const task = {
      id: "t1",
      metadata: {
        malvExternalActionV1: { schemaVersion: 1, kind: "open_url", params: { url: "https://example.com" } }
      },
      riskLevel: "low",
      requiresApproval: false
    } as unknown as WorkspaceTaskEntity;
    const r = await svc.beginDispatch({
      userId: "u1",
      task,
      now: new Date(),
      cap: cap([]),
      requestKey: "t1:adhoc"
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("capability_unavailable");
  });

  it("emits protocol v1 fields on dispatch", async () => {
    const killSwitch = { getState: jest.fn().mockResolvedValue({ systemOn: true }) };
    const realtime = { emitExternalActionDispatch: jest.fn(), countExecutorDispatchTargets: jest.fn().mockReturnValue(1) };
    const now = new Date("2026-04-13T12:00:00.000Z");
    const dispatches = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => ({ ...x, createdAt: now })),
      save: jest.fn(async (x) => x)
    };
    const svc = new MalvExternalActionDispatchService(killSwitch as any, realtime as any, dispatches as any);
    const task = {
      id: "t1",
      metadata: {
        malvExternalActionV1: { schemaVersion: 1, kind: "open_url", params: { url: "https://example.com" } },
        malvExternalTargetDeviceId: "dev-1"
      },
      riskLevel: "low",
      requiresApproval: true
    } as unknown as WorkspaceTaskEntity;
    const r = await svc.beginDispatch({
      userId: "u1",
      task,
      now,
      cap: cap(["desktop_agent"]),
      requestKey: "t1:adhoc"
    });
    expect(r.ok).toBe(true);
    expect(realtime.emitExternalActionDispatch).toHaveBeenCalledWith(
      "u1",
      "desktop_agent",
      "dev-1",
      "malv:external_action_dispatch",
      expect.objectContaining({
        schemaVersion: 1,
        protocolVersion: 1,
        taskId: "t1",
        userId: "u1",
        bridge: "desktop_agent",
        actionType: "open_url",
        actionPayload: { url: "https://example.com" },
        riskLevel: "low",
        requiresApproval: true,
        targetDeviceId: "dev-1"
      })
    );
  });

  it("allows show_notification when a live bridge exists", async () => {
    const killSwitch = { getState: jest.fn().mockResolvedValue({ systemOn: true }) };
    const realtime = { emitExternalActionDispatch: jest.fn(), countExecutorDispatchTargets: jest.fn().mockReturnValue(1) };
    const now = new Date();
    const dispatches = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => ({ ...x, createdAt: now })),
      save: jest.fn(async (x) => x)
    };
    const svc = new MalvExternalActionDispatchService(killSwitch as any, realtime as any, dispatches as any);
    const task = {
      id: "t1",
      metadata: {
        malvExternalActionV1: {
          schemaVersion: 1,
          kind: "show_notification",
          params: { title: "Hi", body: "There" }
        }
      },
      riskLevel: "low",
      requiresApproval: false
    } as unknown as WorkspaceTaskEntity;
    const r = await svc.beginDispatch({
      userId: "u1",
      task,
      now,
      cap: cap(["mobile_agent"]),
      requestKey: "t1:adhoc"
    });
    expect(r.ok).toBe(true);
    expect(realtime.emitExternalActionDispatch).toHaveBeenCalled();
  });

  it("blocks dispatch when target route has no live executor socket", async () => {
    const killSwitch = { getState: jest.fn().mockResolvedValue({ systemOn: true }) };
    const realtime = { emitExternalActionDispatch: jest.fn(), countExecutorDispatchTargets: jest.fn().mockReturnValue(0) };
    const now = new Date();
    const dispatches = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => ({ ...x, createdAt: now })),
      save: jest.fn(async (x) => x)
    };
    const svc = new MalvExternalActionDispatchService(killSwitch as any, realtime as any, dispatches as any);
    const task = {
      id: "t1",
      metadata: {
        malvExternalActionV1: { schemaVersion: 1, kind: "open_url", params: { url: "https://example.com" } },
        malvExternalTargetDeviceId: "dev-1"
      },
      riskLevel: "low",
      requiresApproval: false
    } as unknown as WorkspaceTaskEntity;
    const r = await svc.beginDispatch({ userId: "u1", task, now, cap: cap(["desktop_agent"]), requestKey: "t1:adhoc" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("executor_route_unavailable");
  });

  describe("applyClientAck", () => {
    it("two-phase: accepted then completed", async () => {
      const killSwitch = { getState: jest.fn() };
      const realtime = { emitExternalActionDispatch: jest.fn(), countExecutorDispatchTargets: jest.fn().mockReturnValue(1) };
      const row = {
        id: "d1",
        taskId: "t1",
        user: { id: "u1" },
        status: "awaiting_client_ack",
        resultJson: null
      };
      const dispatches = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ ...row })
          .mockResolvedValueOnce({ ...row, status: "accepted" })
          .mockResolvedValueOnce({ ...row, status: "accepted" })
          .mockResolvedValueOnce({ ...row, status: "completed" }),
        update: jest.fn().mockResolvedValue(undefined)
      };
      const svc = new MalvExternalActionDispatchService(killSwitch as any, realtime as any, dispatches as any);
      const a1 = await svc.applyClientAck({
        userId: "u1",
        dispatchId: "d1",
        status: "accepted"
      });
      expect(a1.ok).toBe(true);
      if (a1.ok) expect(a1.duplicate).toBe(false);

      const a2 = await svc.applyClientAck({
        userId: "u1",
        dispatchId: "d1",
        status: "completed",
        result: { x: 1 },
        executedAt: "2026-04-13T12:00:00.000Z"
      });
      expect(a2.ok).toBe(true);
      if (a2.ok) expect(a2.duplicate).toBe(false);
    });

    it("legacy single-hop completed from awaiting_client_ack", async () => {
      const killSwitch = { getState: jest.fn() };
      const realtime = { emitExternalActionDispatch: jest.fn(), countExecutorDispatchTargets: jest.fn().mockReturnValue(1) };
      const row = {
        id: "d1",
        taskId: "t1",
        user: { id: "u1" },
        status: "awaiting_client_ack",
        resultJson: null
      };
      const dispatches = {
        findOne: jest.fn().mockResolvedValueOnce({ ...row }).mockResolvedValueOnce({ ...row, status: "completed" }),
        update: jest.fn().mockResolvedValue(undefined)
      };
      const svc = new MalvExternalActionDispatchService(killSwitch as any, realtime as any, dispatches as any);
      const a1 = await svc.applyClientAck({ userId: "u1", dispatchId: "d1", status: "completed" });
      expect(a1.ok).toBe(true);
    });

    it("duplicate terminal ack is idempotent", async () => {
      const killSwitch = { getState: jest.fn() };
      const realtime = { emitExternalActionDispatch: jest.fn(), countExecutorDispatchTargets: jest.fn().mockReturnValue(1) };
      const row = {
        id: "d1",
        taskId: "t1",
        user: { id: "u1" },
        status: "completed",
        resultJson: {}
      };
      const dispatches = {
        findOne: jest.fn().mockResolvedValue({ ...row }),
        update: jest.fn()
      };
      const svc = new MalvExternalActionDispatchService(killSwitch as any, realtime as any, dispatches as any);
      const a1 = await svc.applyClientAck({ userId: "u1", dispatchId: "d1", status: "completed" });
      expect(a1.ok).toBe(true);
      if (a1.ok) expect(a1.duplicate).toBe(true);
      expect(dispatches.update).not.toHaveBeenCalled();
    });

    it("returns not_found when dispatch is missing", async () => {
      const killSwitch = { getState: jest.fn() };
      const realtime = { emitExternalActionDispatch: jest.fn(), countExecutorDispatchTargets: jest.fn().mockReturnValue(1) };
      const dispatches = {
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn()
      };
      const svc = new MalvExternalActionDispatchService(killSwitch as any, realtime as any, dispatches as any);
      const a1 = await svc.applyClientAck({ userId: "u1", dispatchId: "nope", status: "completed" });
      expect(a1.ok).toBe(false);
      if (!a1.ok) expect(a1.code).toBe("not_found");
    });

    it("rejects ack from non-targeted device", async () => {
      const killSwitch = { getState: jest.fn() };
      const realtime = { emitExternalActionDispatch: jest.fn(), countExecutorDispatchTargets: jest.fn().mockReturnValue(1) };
      const dispatches = {
        findOne: jest.fn().mockResolvedValue({
          id: "d1",
          taskId: "t1",
          user: { id: "u1" },
          status: "awaiting_client_ack",
          actionPayloadJson: { targetDeviceId: "dev-1" },
          resultJson: null
        }),
        update: jest.fn()
      };
      const svc = new MalvExternalActionDispatchService(killSwitch as any, realtime as any, dispatches as any);
      const a1 = await svc.applyClientAck({ userId: "u1", dispatchId: "d1", status: "accepted", deviceId: "dev-2" });
      expect(a1.ok).toBe(false);
      if (!a1.ok) expect(a1.code).toBe("wrong_executor_device");
      expect(dispatches.update).not.toHaveBeenCalled();
    });
  });

  describe("markTimedOut", () => {
    it("fails open dispatches for audit", async () => {
      const killSwitch = { getState: jest.fn() };
      const realtime = { emitExternalActionDispatch: jest.fn(), countExecutorDispatchTargets: jest.fn().mockReturnValue(1) };
      const dispatches = {
        findOne: jest.fn().mockResolvedValue({
          id: "d1",
          status: "accepted",
          resultJson: { a: 1 }
        }),
        update: jest.fn().mockResolvedValue(undefined)
      };
      const svc = new MalvExternalActionDispatchService(killSwitch as any, realtime as any, dispatches as any);
      await svc.markTimedOut("d1", "2026-04-13T12:00:00.000Z");
      expect(dispatches.update).toHaveBeenCalledWith(
        { id: "d1" },
        expect.objectContaining({
          status: "failed"
        })
      );
    });
  });
});
