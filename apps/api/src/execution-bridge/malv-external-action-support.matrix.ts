import type { MalvBridgeKind } from "./malv-bridge-capability.types";
import type { MalvActionSupport, MalvActionSupportClass, MalvCanonicalActionMatrix, MalvDevicePlatform } from "./malv-device-platform.types";
import type { MalvExternalActionKind } from "./malv-external-action.types";

/**
 * v1 safe external actions and which executor bridges may run them.
 * home_assistant_bridge is excluded from this matrix (separate connector).
 */
const MATRIX: Record<MalvExternalActionKind, ReadonlySet<MalvBridgeKind>> = {
  show_notification: new Set(["browser_agent", "desktop_agent", "mobile_agent"]),
  open_url: new Set(["browser_agent", "desktop_agent", "mobile_agent"]),
  deep_link_to_task_context: new Set(["browser_agent", "desktop_agent", "mobile_agent"]),
  deep_link_to_call_context: new Set(["browser_agent", "desktop_agent", "mobile_agent"]),
  /** Blocked at API — not executable on any bridge in v1. */
  create_local_reminder: new Set(),
  /** Blocked at API — not executable on any bridge in v1. */
  open_app: new Set()
};

const UNSUPPORTED = (action: MalvExternalActionKind): MalvActionSupport => ({
  action,
  support: "unsupported"
});

const SUPPORTED = (action: MalvExternalActionKind): MalvActionSupport => ({
  action,
  support: "supported"
});

const CAVEATED = (action: MalvExternalActionKind, caveat: string, foregroundOnly = false): MalvActionSupport => ({
  action,
  support: "supported_with_caveat",
  caveat,
  ...(foregroundOnly ? { foregroundOnly: true } : {})
});

const ACTIONS: MalvExternalActionKind[] = [
  "show_notification",
  "open_url",
  "deep_link_to_task_context",
  "deep_link_to_call_context",
  "create_local_reminder",
  "open_app"
];

const CANONICAL_PLATFORM_MATRIX: MalvCanonicalActionMatrix = {
  android: {
    show_notification: SUPPORTED("show_notification"),
    open_url: SUPPORTED("open_url"),
    deep_link_to_task_context: SUPPORTED("deep_link_to_task_context"),
    deep_link_to_call_context: SUPPORTED("deep_link_to_call_context"),
    create_local_reminder: CAVEATED(
      "create_local_reminder",
      "Available only when local reminder permissions and native reminder module are implemented."
    ),
    open_app: UNSUPPORTED("open_app")
  },
  ios: {
    show_notification: SUPPORTED("show_notification"),
    open_url: CAVEATED("open_url", "May require foreground context on iOS policy paths.", true),
    deep_link_to_task_context: CAVEATED("deep_link_to_task_context", "Foreground navigation only on iOS.", true),
    deep_link_to_call_context: CAVEATED("deep_link_to_call_context", "Foreground navigation only on iOS.", true),
    create_local_reminder: UNSUPPORTED("create_local_reminder"),
    open_app: UNSUPPORTED("open_app")
  },
  desktop: {
    show_notification: SUPPORTED("show_notification"),
    open_url: SUPPORTED("open_url"),
    deep_link_to_task_context: SUPPORTED("deep_link_to_task_context"),
    deep_link_to_call_context: SUPPORTED("deep_link_to_call_context"),
    create_local_reminder: UNSUPPORTED("create_local_reminder"),
    open_app: UNSUPPORTED("open_app")
  },
  browser: {
    show_notification: CAVEATED("show_notification", "Browser permission required and tab/session scoped.", true),
    open_url: SUPPORTED("open_url"),
    deep_link_to_task_context: SUPPORTED("deep_link_to_task_context"),
    deep_link_to_call_context: SUPPORTED("deep_link_to_call_context"),
    create_local_reminder: UNSUPPORTED("create_local_reminder"),
    open_app: UNSUPPORTED("open_app")
  }
};

/** Preference order when choosing among live bridges (first match wins after preferredBridge). */
const BRIDGE_ORDER: Record<MalvExternalActionKind, MalvBridgeKind[]> = {
  open_url: ["browser_agent", "desktop_agent", "mobile_agent"],
  show_notification: ["desktop_agent", "mobile_agent", "browser_agent"],
  deep_link_to_task_context: ["mobile_agent", "desktop_agent", "browser_agent"],
  deep_link_to_call_context: ["mobile_agent", "desktop_agent", "browser_agent"],
  create_local_reminder: [],
  open_app: []
};

export function malvExternalActionSupportedBridges(kind: MalvExternalActionKind): ReadonlySet<MalvBridgeKind> {
  return MATRIX[kind] ?? new Set();
}

export function malvActionAllowedOnBridge(kind: MalvExternalActionKind, bridge: MalvBridgeKind): boolean {
  return malvExternalActionSupportedBridges(kind).has(bridge);
}

export function malvBridgePreferenceOrderForAction(kind: MalvExternalActionKind): MalvBridgeKind[] {
  return BRIDGE_ORDER[kind] ?? ["browser_agent", "desktop_agent", "mobile_agent"];
}

export function malvPickBridgeForAction(
  kind: MalvExternalActionKind,
  live: ReadonlySet<MalvBridgeKind>,
  preferred: MalvBridgeKind | null | undefined
): MalvBridgeKind | null {
  if (preferred && live.has(preferred) && malvActionAllowedOnBridge(kind, preferred)) {
    return preferred;
  }
  for (const b of malvBridgePreferenceOrderForAction(kind)) {
    if (live.has(b) && malvActionAllowedOnBridge(kind, b)) return b;
  }
  return null;
}

export function malvCanonicalActionMatrix(): MalvCanonicalActionMatrix {
  return CANONICAL_PLATFORM_MATRIX;
}

export function malvPlatformForBridge(bridge: MalvBridgeKind): MalvDevicePlatform | null {
  if (bridge === "desktop_agent") return "desktop";
  if (bridge === "browser_agent") return "browser";
  if (bridge === "mobile_agent") return "android";
  return null;
}

export function malvActionSupportForPlatform(action: MalvExternalActionKind, platform: MalvDevicePlatform): MalvActionSupport {
  return CANONICAL_PLATFORM_MATRIX[platform][action];
}

export function malvActionSupportForBridge(action: MalvExternalActionKind, bridge: MalvBridgeKind): MalvActionSupportClass {
  const platform = malvPlatformForBridge(bridge);
  if (!platform) return "unsupported";
  return CANONICAL_PLATFORM_MATRIX[platform][action].support;
}

export function malvSupportedActionsForPlatform(platform: MalvDevicePlatform): MalvActionSupport[] {
  return ACTIONS.map((action) => CANONICAL_PLATFORM_MATRIX[platform][action]);
}
