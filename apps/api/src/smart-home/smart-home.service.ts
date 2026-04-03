import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MalvFeatureFlagsService } from "../common/malv-feature-flags.service";
import type { SmartHomeBridgeHealth } from "./smart-home-bridge.types";

/**
 * Smart-home bridge: production entry point. Today returns structured health + capability manifest.
 * Implementations (MQTT, Home Assistant REST, etc.) plug in here without changing API consumers.
 */
@Injectable()
export class SmartHomeService {
  constructor(
    private readonly cfg: ConfigService,
    private readonly flags: MalvFeatureFlagsService
  ) {}

  getBridgeHealth(): SmartHomeBridgeHealth {
    const checkedAt = new Date().toISOString();
    const enabled = this.flags.smartHomeBridgeEnabled();
    const provider = this.flags.smartHomeProvider();

    if (!enabled || provider === "none") {
      return {
        schemaVersion: 1,
        provider: "none",
        configured: false,
        reachable: false,
        capabilities: [],
        integrationStage: "disabled",
        checkedAt,
        detail: {
          message: "Set MALV_SMART_HOME_ENABLED=true and MALV_SMART_HOME_PROVIDER to connect a real bridge.",
          docsPath: "docs/ARCHITECTURE_DEVICE_SMART_HOME.md"
        }
      };
    }

    // Real connectors validate credentials and reachability in their own adapters (future PRs).
    const mqttUrl = (this.cfg.get<string>("MALV_SMART_HOME_MQTT_URL") ?? "").trim();
    const haUrl = (this.cfg.get<string>("MALV_SMART_HOME_HOMEASSISTANT_URL") ?? "").trim();

    if (provider === "mqtt") {
      const configured = Boolean(mqttUrl);
      return {
        schemaVersion: 1,
        provider: "mqtt",
        configured,
        reachable: false,
        capabilities: configured ? ["scene", "light", "sensor_read", "notify"] : [],
        integrationStage: configured ? "configured" : "misconfigured",
        checkedAt,
        detail: { brokerConfigured: configured },
        error: configured ? undefined : "MALV_SMART_HOME_MQTT_URL not set"
      };
    }

    if (provider === "homeassistant") {
      const configured = Boolean(haUrl);
      return {
        schemaVersion: 1,
        provider: "homeassistant",
        configured,
        reachable: false,
        capabilities: configured ? ["scene", "light", "climate", "lock", "sensor_read", "notify"] : [],
        integrationStage: configured ? "configured" : "misconfigured",
        checkedAt,
        detail: { baseUrlConfigured: configured },
        error: configured ? undefined : "MALV_SMART_HOME_HOMEASSISTANT_URL not set"
      };
    }

    return {
      schemaVersion: 1,
      provider,
      configured: false,
      reachable: false,
      capabilities: [],
      integrationStage: "misconfigured",
      checkedAt,
      error: `Unknown SMART_HOME provider: ${provider}`
    };
  }
}
