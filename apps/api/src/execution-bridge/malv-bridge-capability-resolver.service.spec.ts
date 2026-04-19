import { MalvBridgeCapabilityResolverService } from "./malv-bridge-capability-resolver.service";
import type { MalvExecutorEnrollmentService } from "./malv-executor-enrollment.service";
import type { SmartHomeService } from "../smart-home/smart-home.service";

describe("MalvBridgeCapabilityResolverService", () => {
  const mk = (opts: { wsCount: number; mobile?: Date | null; desktop?: Date | null; haReachable?: boolean }) => {
    const cfg = {
      get: jest.fn((k: string) => {
        if (k === "MALV_EXECUTOR_HEARTBEAT_STALE_MS") return "120000";
        if (k === "MALV_MOBILE_AGENT_EXECUTION_MODE") return "simulation";
        return undefined;
      })
    };
    const realtime = {
      countExecutorDispatchTargets: jest.fn((_userId: string, bridge: string) => {
        if (bridge === "browser_agent") return opts.wsCount;
        if (bridge === "mobile_agent") return opts.mobile ? 1 : 0;
        if (bridge === "desktop_agent") return opts.desktop ? 1 : 0;
        return 0;
      })
    };
    const smartHome = {
      getBridgeHealth: jest.fn().mockReturnValue({
        reachable: Boolean(opts.haReachable),
        checkedAt: new Date().toISOString(),
        configured: true,
        provider: "homeassistant"
      })
    } as unknown as SmartHomeService;
    const enrollment = {
      lastHeartbeat: jest.fn(async (_uid: string, ch: string) => {
        if (ch === "mobile") return opts.mobile ?? null;
        if (ch === "desktop") return opts.desktop ?? null;
        return null;
      })
    } as unknown as MalvExecutorEnrollmentService;
    const pushRegistry = {
      tokenState: jest.fn((_uid: string, _platform: "android" | "ios") => ({ supported: true, tokenRegistered: false, count: 0 }))
    };
    return new MalvBridgeCapabilityResolverService(cfg as any, realtime as any, smartHome, enrollment, pushRegistry as any);
  };

  it("marks browser_agent live when websocket count > 0", async () => {
    const svc = mk({ wsCount: 1 });
    const r = await svc.resolveForUser("u1", new Date("2026-01-01T12:00:00Z"));
    const b = r.endpoints.find((e) => e.bridgeKind === "browser_agent");
    expect(b?.state).toBe("live");
    expect(b?.platform).toBe("browser");
    expect(r.liveBridgeKinds).toContain("browser_agent");
  });

  it("marks browser_agent offline with no sockets", async () => {
    const svc = mk({ wsCount: 0 });
    const r = await svc.resolveForUser("u1", new Date("2026-01-01T12:00:00Z"));
    const b = r.endpoints.find((e) => e.bridgeKind === "browser_agent");
    expect(b?.state).toBe("offline");
    expect(r.liveBridgeKinds).not.toContain("browser_agent");
  });

  it("marks mobile_agent stale when heartbeat is older than threshold", async () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const staleAt = new Date(now.getTime() - 200_000);
    const svc = mk({ wsCount: 0, mobile: staleAt });
    const r = await svc.resolveForUser("u1", now);
    const m = r.endpoints.find((e) => e.bridgeKind === "mobile_agent");
    expect(m?.state).toBe("stale");
  });

  it("marks mobile_agent live when heartbeat is fresh", async () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const fresh = new Date(now.getTime() - 10_000);
    const svc = mk({ wsCount: 0, mobile: fresh });
    const r = await svc.resolveForUser("u1", now);
    const m = r.endpoints.find((e) => e.bridgeKind === "mobile_agent");
    expect(m?.state).toBe("live");
    expect(r.liveBridgeKinds).toContain("mobile_agent");
    expect(r.executionCaveats?.mobile_agent).toContain("simulation");
  });

  it("adds ios scaffold endpoint with truthful offline status", async () => {
    const svc = mk({ wsCount: 0 });
    const r = await svc.resolveForUser("u1", new Date());
    const ios = r.endpoints.find((e) => e.platform === "ios");
    expect(ios?.state).toBe("offline");
    expect(ios?.reason).toContain("native_ios_executor_not_enrolled");
  });

  it("never claims home_assistant_bridge live when service reports unreachable", async () => {
    const svc = mk({ wsCount: 0, haReachable: false });
    const r = await svc.resolveForUser("u1", new Date());
    const h = r.endpoints.find((e) => e.bridgeKind === "home_assistant_bridge");
    expect(h?.state).toBe("offline");
    expect(r.liveBridgeKinds).not.toContain("home_assistant_bridge");
  });
});
