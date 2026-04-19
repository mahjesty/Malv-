import type { MalvBridgeKind } from "./malv-bridge-capability.types";

export type MalvExternalActionKind =
  | "open_url"
  | "open_app"
  | "show_notification"
  | "create_local_reminder"
  | "deep_link_to_call_context"
  | "deep_link_to_task_context";

export type MalvExternalActionEnvelopeV1 = {
  schemaVersion: 1;
  kind: MalvExternalActionKind;
  /** Preferred executor bridge; server may override if unavailable. */
  preferredBridge?: MalvBridgeKind | null;
  /** Opaque action parameters (validated per kind). */
  params: Record<string, unknown>;
};

export type MalvExternalDispatchTerminalReason =
  | "capability_unavailable"
  | "approval_missing"
  | "delivery_unavailable"
  | "executor_rejected"
  | "executor_failed_after_accept"
  | "unsupported_action"
  | "kill_switch"
  | "high_risk_blocked"
  | "executor_ack_timeout";
