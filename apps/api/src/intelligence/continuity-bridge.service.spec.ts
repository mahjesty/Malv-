import { ContinuityBridgeService } from "./continuity-bridge.service";

describe("ContinuityBridgeService", () => {
  const svc = new ContinuityBridgeService();

  it("transfers context across surfaces", () => {
    svc.setContext("s1", { activeIntent: "execute", lastSurface: "chat" });
    const out = svc.transferContext("chat", "call", "s1");
    expect(out?.lastSurface).toBe("call");
    expect(out?.lastAction).toContain("chat->call");
  });

  it("merges context without dropping previous fields", () => {
    svc.setContext("s2", { activeIntent: "debug", entities: ["file.ts"], lastSurface: "chat" });
    svc.setContext("s2", { lastSurface: "execution" });
    const cur = svc.getContext("s2");
    expect(cur?.activeIntent).toBe("debug");
    expect(cur?.entities).toEqual(["file.ts"]);
    expect(cur?.lastSurface).toBe("execution");
  });

  it("normalizes intent and entities deterministically", () => {
    svc.setContext("s3", { activeIntent: "RUN", entities: [" Desktop ", "desktop"], lastSurface: "chat" });
    const cur = svc.getContext("s3");
    expect(cur?.activeIntent).toBe("command");
    expect(cur?.entities).toEqual(["desktop"]);
  });
});
