/**
 * Production contracts for home / IoT automation — implementations are swappable (MQTT, Home Assistant, Matter, vendor SDKs).
 * This is real architecture; adapters may return `not_configured` until credentials are wired.
 */
export type SmartHomeBridgeCapability =
  | "scene"
  | "light"
  | "climate"
  | "lock"
  | "sensor_read"
  | "notify";

/** Bridge lifecycle for UIs and ops (reachable requires a live adapter ping — not yet all providers). */
export type SmartHomeIntegrationStage = "disabled" | "misconfigured" | "configured" | "connected";

export type SmartHomeBridgeHealth = {
  /** Contract version for API consumers. */
  schemaVersion: 1;
  provider: string;
  configured: boolean;
  reachable: boolean;
  capabilities: SmartHomeBridgeCapability[];
  integrationStage: SmartHomeIntegrationStage;
  /** ISO 8601 — when this health snapshot was built (server clock). */
  checkedAt: string;
  detail?: Record<string, unknown>;
  error?: string;
};
