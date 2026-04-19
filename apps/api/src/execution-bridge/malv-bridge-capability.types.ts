import type { MalvActionSupport, MalvDevicePlatform } from "./malv-device-platform.types";
export type MalvBridgeKind = "mobile_agent" | "desktop_agent" | "browser_agent" | "home_assistant_bridge";

export type MalvBridgeEndpointState = {
  bridgeKind: MalvBridgeKind;
  platform: MalvDevicePlatform | null;
  deviceId?: string | null;
  state: "live" | "stale" | "offline";
  lastSeenAt: string | null;
  reason: string | null;
  pushCapability?: { supported: boolean; tokenRegistered: boolean };
  backgroundExecution?: boolean;
  supportedActions?: MalvActionSupport[];
  caveats?: string[];
};

export type MalvBridgeCapabilityReport = {
  resolvedAt: string;
  staleThresholdMs: number;
  endpoints: MalvBridgeEndpointState[];
  /** Only bridges that are genuinely live right now. */
  liveBridgeKinds: MalvBridgeKind[];
  /** Non-fatal caveats (e.g. dev-only simulators); inspection/UI may surface these. */
  executionCaveats?: Partial<Record<MalvBridgeKind, string>>;
  actionMatrixVersion?: "v1";
};
