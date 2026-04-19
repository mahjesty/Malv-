import { WorkspaceTaskExecutionEngineService } from "./workspace-task-execution-engine.service";

describe("WorkspaceTaskExecutionEngineService", () => {
  it("does not query tasks when kill-switch system is off", async () => {
    const cfg = { get: jest.fn() };
    const killSwitch = { getState: jest.fn().mockResolvedValue({ systemOn: false }) };
    const realtime = { emitToUser: jest.fn(), emitToRoom: jest.fn() };
    const activity = { record: jest.fn() };
    const beast = { health: jest.fn() };
    const bridgeResolver = { resolveForUser: jest.fn() };
    const notificationDelivery = { deliver: jest.fn() };
    const externalDispatch = { buildRequestKey: jest.fn(), parseEnvelope: jest.fn(), beginDispatch: jest.fn() };
    const malvOrchestrator = { runAdvisoryLifecycleWithDefaultInputs: jest.fn() };
    const tasks = { createQueryBuilder: jest.fn() };

    const svc = new WorkspaceTaskExecutionEngineService(
      cfg as any,
      killSwitch as any,
      realtime as any,
      activity as any,
      beast as any,
      bridgeResolver as any,
      notificationDelivery as any,
      externalDispatch as any,
      malvOrchestrator as any,
      tasks as any
    );

    const r = await svc.processDueTasksTick();
    expect(r.processed).toBe(0);
    expect(tasks.createQueryBuilder).not.toHaveBeenCalled();
    expect(beast.health).not.toHaveBeenCalled();
  });
});
