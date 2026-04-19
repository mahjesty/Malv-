import { WorkspaceExternalDispatchAckService } from "./workspace-external-dispatch-ack.service";
import type { WorkspaceTaskEntity } from "../db/entities/workspace-task.entity";

describe("WorkspaceExternalDispatchAckService", () => {
  const taskRow = (over: Partial<WorkspaceTaskEntity> = {}): WorkspaceTaskEntity =>
    ({
      id: "t1",
      title: "Test",
      roomId: null,
      conversationId: null,
      user: { id: "u1" },
      metadata: { malvExternalAwaitingAck: true },
      ...over
    }) as any;

  it("extends lease on accepted", async () => {
    const dispatch = {
      applyClientAck: jest.fn().mockResolvedValue({
        ok: true,
        duplicate: false,
        row: { id: "d1", taskId: "t1" }
      })
    };
    const tasks = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(taskRow())
        .mockResolvedValueOnce(taskRow({ executionLastOutcome: "external_action_accepted" as any })),
      update: jest.fn().mockResolvedValue(undefined)
    };
    const activity = { record: jest.fn() };
    const cfg = { get: jest.fn().mockReturnValue("120000") };
    const realtime = { emitToUser: jest.fn() };

    const svc = new WorkspaceExternalDispatchAckService(
      dispatch as any,
      tasks as any,
      activity as any,
      cfg as any,
      realtime as any
    );

    const out = await svc.acknowledge({
      userId: "u1",
      dispatchId: "d1",
      status: "accepted",
      deviceId: "dev-1"
    });
    expect(out.ok).toBe(true);
    expect(tasks.update).toHaveBeenCalledWith(
      { id: "t1" },
      expect.objectContaining({
        executionState: "waiting_input",
        executionFailureCode: "awaiting_executor_completion"
      })
    );
    expect(dispatch.applyClientAck).toHaveBeenCalledWith(
      expect.objectContaining({ status: "accepted", deviceId: "dev-1" })
    );
  });

  it("skips task mutation on duplicate terminal ack", async () => {
    const dispatch = {
      applyClientAck: jest.fn().mockResolvedValue({
        ok: true,
        duplicate: true,
        row: { id: "d1", taskId: "t1" }
      })
    };
    const tasks = {
      findOne: jest.fn(),
      update: jest.fn()
    };
    const activity = { record: jest.fn() };
    const cfg = { get: jest.fn() };
    const realtime = { emitToUser: jest.fn() };

    const svc = new WorkspaceExternalDispatchAckService(
      dispatch as any,
      tasks as any,
      activity as any,
      cfg as any,
      realtime as any
    );

    const out = await svc.acknowledge({ userId: "u1", dispatchId: "d1", status: "completed" });
    expect(out.ok).toBe(true);
    expect(tasks.update).not.toHaveBeenCalled();
    expect(activity.record).not.toHaveBeenCalled();
  });

  it("maps not_found from dispatch layer", async () => {
    const dispatch = {
      applyClientAck: jest.fn().mockResolvedValue({ ok: false, code: "not_found" })
    };
    const tasks = { findOne: jest.fn(), update: jest.fn() };
    const activity = { record: jest.fn() };
    const cfg = { get: jest.fn() };
    const realtime = { emitToUser: jest.fn() };

    const svc = new WorkspaceExternalDispatchAckService(
      dispatch as any,
      tasks as any,
      activity as any,
      cfg as any,
      realtime as any
    );

    const out = await svc.acknowledge({ userId: "u1", dispatchId: "missing", status: "completed" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("not_found");
  });

  it("surfaces wrong_executor_device from dispatch layer", async () => {
    const dispatch = {
      applyClientAck: jest.fn().mockResolvedValue({ ok: false, code: "wrong_executor_device" })
    };
    const tasks = { findOne: jest.fn(), update: jest.fn() };
    const activity = { record: jest.fn() };
    const cfg = { get: jest.fn() };
    const realtime = { emitToUser: jest.fn() };

    const svc = new WorkspaceExternalDispatchAckService(
      dispatch as any,
      tasks as any,
      activity as any,
      cfg as any,
      realtime as any
    );

    const out = await svc.acknowledge({ userId: "u1", dispatchId: "d1", status: "accepted", deviceId: "wrong" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("wrong_executor_device");
  });
});
