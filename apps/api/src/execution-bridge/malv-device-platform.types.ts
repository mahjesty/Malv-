import type { MalvBridgeKind } from "./malv-bridge-capability.types";
import type { MalvExternalActionKind } from "./malv-external-action.types";

export type MalvDevicePlatform = "android" | "ios" | "desktop" | "browser";

export type MalvExecutorState = "live" | "stale" | "offline";

export type MalvExecutionLiveness = {
  state: MalvExecutorState;
  lastHeartbeatAt: string | null;
};

export type MalvActionSupportClass = "supported" | "supported_with_caveat" | "unsupported";

export type MalvActionSupport = {
  action: MalvExternalActionKind;
  support: MalvActionSupportClass;
  caveat?: string;
  foregroundOnly?: boolean;
};

export type MalvCanonicalActionMatrix = Record<MalvDevicePlatform, Record<MalvExternalActionKind, MalvActionSupport>>;

export type MalvExecutorIdentity = {
  userId: string;
  deviceId: string | null;
  bridge: MalvBridgeKind;
  platform: MalvDevicePlatform;
};

export type MalvExecutorCapability = {
  bridge: MalvBridgeKind;
  platform: MalvDevicePlatform;
  deviceId: string | null;
  userId: string;
  state: MalvExecutorState;
  supportedActions: MalvActionSupport[];
  caveats: string[];
  push: {
    supported: boolean;
    tokenRegistered: boolean;
  };
  backgroundExecution: boolean;
  foregroundRequiredActions: MalvExternalActionKind[];
  lastHeartbeatAt: string | null;
};

export type MalvExecutionResultModel = {
  status: "accepted" | "completed" | "rejected" | "failed" | "timed_out";
  reason:
    | "capability_unavailable"
    | "approval_missing"
    | "delivery_unavailable"
    | "executor_rejected"
    | "executor_failed_after_accept"
    | "unsupported_action"
    | "kill_switch"
    | "high_risk_blocked"
    | "executor_ack_timeout"
    | "wrong_executor_device"
    | "execution_error";
  detail?: string;
  at: string;
};

export type MalvDeliveryChannel = "websocket_live" | "persisted_inbox" | "push_android" | "push_ios";

export type MalvNotificationDeliveryAudit = {
  attemptedChannels: MalvDeliveryChannel[];
  successfulChannels: MalvDeliveryChannel[];
  failedChannels: MalvDeliveryChannel[];
};

export type MalvExecutorProtocolMetadata = {
  schemaVersion: 1;
  protocolVersion: 1;
  identity: MalvExecutorIdentity;
  capabilities: Pick<
    MalvExecutorCapability,
    "supportedActions" | "caveats" | "push" | "backgroundExecution" | "foregroundRequiredActions"
  >;
};

