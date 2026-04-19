import type { MalvBridgeKind } from "./malv-bridge-capability.types";
import type { MalvExecutorProtocolMetadata } from "./malv-device-platform.types";
import type { MalvExternalActionEnvelopeV1, MalvExternalActionKind } from "./malv-external-action.types";
import { malvPlatformForBridge, malvSupportedActionsForPlatform } from "./malv-external-action-support.matrix";

/**
 * Stable agent-facing action names (v1 safe set). Maps 1:1 from MalvExternalActionKind where applicable.
 */
export type MalvAgentWireActionTypeV1 =
  | "show_notification"
  | "open_url"
  | "deep_link_task"
  | "deep_link_call"
  /** Present when the envelope kind is outside the v1 agent safe set; agents must reject. */
  | "unsupported_kind";

/** Backend → agent payload on `malv:external_action_dispatch` (protocolVersion 1 extends schemaVersion 1). */
export type MalvAgentDispatchPayloadV1 = {
  schemaVersion: 1;
  protocolVersion: 1;
  dispatchId: string;
  taskId: string;
  userId: string;
  correlationId: string;
  bridge: MalvBridgeKind;
  actionType: MalvAgentWireActionTypeV1;
  actionPayload: Record<string, unknown>;
  riskLevel: string;
  requiresApproval: boolean;
  createdAt: string;
  /** If set, only the matching agent device should execute; others must ignore. */
  targetDeviceId: string | null;
  envelope: MalvExternalActionEnvelopeV1;
  at: string;
  replay?: boolean;
  protocolMeta?: MalvExecutorProtocolMetadata;
};

export function malvAgentWireActionType(kind: MalvExternalActionKind): MalvAgentWireActionTypeV1 {
  switch (kind) {
    case "deep_link_to_task_context":
      return "deep_link_task";
    case "deep_link_to_call_context":
      return "deep_link_call";
    case "open_url":
      return "open_url";
    case "show_notification":
      return "show_notification";
    case "create_local_reminder":
    case "open_app":
      return "unsupported_kind";
  }
}

export function malvProtocolMetaForDispatch(args: {
  userId: string;
  deviceId: string | null;
  bridge: MalvBridgeKind;
}): MalvExecutorProtocolMetadata | undefined {
  const platform = malvPlatformForBridge(args.bridge);
  if (!platform) return undefined;
  const supportsPush = platform === "android" || platform === "ios";
  const supportedActions = malvSupportedActionsForPlatform(platform);
  return {
    schemaVersion: 1,
    protocolVersion: 1,
    identity: {
      userId: args.userId,
      deviceId: args.deviceId,
      bridge: args.bridge,
      platform
    },
    capabilities: {
      supportedActions,
      caveats: supportedActions.filter((a) => a.support === "supported_with_caveat").map((a) => a.caveat ?? "caveated"),
      push: { supported: supportsPush, tokenRegistered: false },
      backgroundExecution: platform === "android" || platform === "desktop",
      foregroundRequiredActions: supportedActions.filter((a) => a.foregroundOnly).map((a) => a.action)
    }
  };
}
