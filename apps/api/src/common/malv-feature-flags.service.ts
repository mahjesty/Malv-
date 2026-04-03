import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

function isTruthy(raw: string | undefined): boolean {
  if (raw == null || raw === "") return false;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

/**
 * Central flags for production vs optional developer verification harnesses.
 * Simulators and seed endpoints MUST NOT be the product surface; they only run when explicitly enabled.
 */
@Injectable()
export class MalvFeatureFlagsService {
  constructor(private readonly cfg: ConfigService) {}

  /**
   * Master switch for dev-only harness routes (device seed, multimodal fixture rows, etc.).
   * Not a product feature — only for local/staging verification. Prefer MALV_DEV_HARNESS_ENABLED;
   * MALV_DEVICE_SIMULATOR_ENABLED is accepted as a legacy alias.
   */
  devHarnessEnabled(): boolean {
    if (isTruthy(this.cfg.get<string>("MALV_DEV_HARNESS_ENABLED"))) return true;
    if (isTruthy(this.cfg.get<string>("MALV_DEVICE_SIMULATOR_ENABLED"))) return true;
    return false;
  }

  /** Smart-home / automation bridge (real connectors behind this flag). */
  smartHomeBridgeEnabled(): boolean {
    return isTruthy(this.cfg.get<string>("MALV_SMART_HOME_ENABLED"));
  }

  /** Camera assist control surface for 1:1 video calls. */
  cameraAssistEnabled(): boolean {
    const raw = this.cfg.get<string>("MALV_CAMERA_ASSIST_ENABLED");
    if (raw == null || raw === "") return true;
    return isTruthy(raw);
  }

  /** Provider id: none | mqtt | homeassistant | matter (future). */
  smartHomeProvider(): string {
    return (this.cfg.get<string>("MALV_SMART_HOME_PROVIDER") ?? "none").trim().toLowerCase() || "none";
  }
}
