import { MalvNotificationDeliveryService } from "./malv-notification-delivery.service";

describe("MalvNotificationDeliveryService", () => {
  it("persists and uses websocket tier when sockets are connected", async () => {
    const killSwitch = { getState: jest.fn().mockResolvedValue({ systemOn: true }) };
    const realtime = { liveAuthenticatedSocketCountForUser: jest.fn().mockReturnValue(2), emitToUser: jest.fn() };
    const saved: any[] = [];
    const notifications = {
      create: jest.fn((e: any) => e),
      save: jest.fn(async (e: any) => {
        saved.push(e);
        return e;
      }),
      find: jest.fn(),
      update: jest.fn()
    };
    const pushRegistry = { tokensForUser: jest.fn().mockReturnValue([]) };
    const pushProvider = { sendNotification: jest.fn() };
    const svc = new MalvNotificationDeliveryService(
      killSwitch as any,
      realtime as any,
      pushRegistry as any,
      pushProvider as any,
      notifications as any
    );
    const r = await svc.deliver({
      userId: "u1",
      kind: "test",
      title: "Hello",
      body: "Body"
    });
    expect(r.tier).toBe("websocket_live");
    expect(r.websocketDelivered).toBe(true);
    expect(r.audit.successfulChannels).toContain("websocket_live");
    expect(realtime.emitToUser).toHaveBeenCalled();
    expect(notifications.save).toHaveBeenCalled();
  });

  it("falls back to persisted inbox when no websocket", async () => {
    const killSwitch = { getState: jest.fn().mockResolvedValue({ systemOn: true }) };
    const realtime = { liveAuthenticatedSocketCountForUser: jest.fn().mockReturnValue(0), emitToUser: jest.fn() };
    const notifications = {
      create: jest.fn((e: any) => e),
      save: jest.fn(async (e: any) => e),
      find: jest.fn(),
      update: jest.fn()
    };
    const pushRegistry = { tokensForUser: jest.fn().mockReturnValue([]) };
    const pushProvider = { sendNotification: jest.fn() };
    const svc = new MalvNotificationDeliveryService(
      killSwitch as any,
      realtime as any,
      pushRegistry as any,
      pushProvider as any,
      notifications as any
    );
    const r = await svc.deliver({ userId: "u1", kind: "test", title: "Hello" });
    expect(r.tier).toBe("persisted_inbox_only");
    expect(r.websocketDelivered).toBe(false);
    expect(r.audit.successfulChannels).toContain("persisted_inbox");
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it("blocks delivery when kill switch is off", async () => {
    const killSwitch = { getState: jest.fn().mockResolvedValue({ systemOn: false }) };
    const realtime = { liveAuthenticatedSocketCountForUser: jest.fn(), emitToUser: jest.fn() };
    const notifications = {
      create: jest.fn((e: any) => e),
      save: jest.fn(async (e: any) => e),
      find: jest.fn(),
      update: jest.fn()
    };
    const pushRegistry = { tokensForUser: jest.fn().mockReturnValue([]) };
    const pushProvider = { sendNotification: jest.fn() };
    const svc = new MalvNotificationDeliveryService(
      killSwitch as any,
      realtime as any,
      pushRegistry as any,
      pushProvider as any,
      notifications as any
    );
    const r = await svc.deliver({ userId: "u1", kind: "test", title: "Hello" });
    expect(r.tier).toBe("no_live_route");
    expect(r.audit.attemptedChannels).toHaveLength(0);
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it("records push attempts truthfully when tokens exist", async () => {
    const killSwitch = { getState: jest.fn().mockResolvedValue({ systemOn: true }) };
    const realtime = { liveAuthenticatedSocketCountForUser: jest.fn().mockReturnValue(0), emitToUser: jest.fn() };
    const notifications = {
      create: jest.fn((e: any) => e),
      save: jest.fn(async (e: any) => e),
      find: jest.fn(),
      update: jest.fn()
    };
    const pushRegistry = {
      tokensForUser: jest.fn().mockReturnValue([{ userId: "u1", deviceId: "d1", platform: "android", token: "tok", registeredAt: "x" }])
    };
    const pushProvider = { sendNotification: jest.fn().mockResolvedValue({ ok: false, detail: "fcm_not_enabled" }) };
    const svc = new MalvNotificationDeliveryService(
      killSwitch as any,
      realtime as any,
      pushRegistry as any,
      pushProvider as any,
      notifications as any
    );
    const r = await svc.deliver({ userId: "u1", kind: "test", title: "Hello" });
    expect(r.nativePushAttempted).toBe(true);
    expect(r.audit.failedChannels).toContain("push_android");
  });
});
