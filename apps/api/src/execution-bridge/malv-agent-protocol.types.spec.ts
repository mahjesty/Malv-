import { malvAgentWireActionType, malvProtocolMetaForDispatch } from "./malv-agent-protocol.types";

describe("malvAgentWireActionType", () => {
  it("maps known kinds to wire v1 names", () => {
    expect(malvAgentWireActionType("open_url")).toBe("open_url");
    expect(malvAgentWireActionType("show_notification")).toBe("show_notification");
    expect(malvAgentWireActionType("deep_link_to_task_context")).toBe("deep_link_task");
    expect(malvAgentWireActionType("deep_link_to_call_context")).toBe("deep_link_call");
  });

  it("marks unsupported kinds for agent rejection", () => {
    expect(malvAgentWireActionType("create_local_reminder")).toBe("unsupported_kind");
    expect(malvAgentWireActionType("open_app")).toBe("unsupported_kind");
  });

  it("builds canonical protocol meta for supported bridges", () => {
    const meta = malvProtocolMetaForDispatch({ userId: "u1", bridge: "desktop_agent", deviceId: "dev-1" });
    expect(meta?.identity.platform).toBe("desktop");
    expect(meta?.identity.deviceId).toBe("dev-1");
    expect(meta?.capabilities.supportedActions.length).toBeGreaterThan(0);
  });
});
