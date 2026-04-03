import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MalvIntelligencePhase, MalvModelAssistMode } from "./malv-model-assist.types";

/**
 * Phases eligible under `assist_low_cost` once model backends are wired.
 * Expand deliberately — defaults keep behavior heuristic-only until live.
 */
const LOW_COST_PHASES: ReadonlySet<MalvIntelligencePhase> = new Set([
  "bug_detection_reasoning",
  "fix_planning"
]);

/**
 * `MALV_MODEL_ASSIST_MODE`: `off` | `heuristic_only` (default) | `assist_low_cost` | `assist_full`
 * `MALV_MODEL_ASSIST_LIVE`: must be `1`/`true`/`yes` before any provider may call a remote model.
 */
export function parseMalvModelAssistMode(raw: string | undefined): MalvModelAssistMode {
  const v = (raw ?? "").toLowerCase().trim();
  if (v === "off") return "off";
  if (v === "assist_low_cost" || v === "assist_low" || v === "low_cost") return "assist_low_cost";
  if (v === "assist_full" || v === "full") return "assist_full";
  return "heuristic_only";
}

@Injectable()
export class MalvModelAssistGateService {
  constructor(private readonly cfg: ConfigService) {}

  getMode(): MalvModelAssistMode {
    return parseMalvModelAssistMode(this.cfg.get<string>("MALV_MODEL_ASSIST_MODE"));
  }

  /** Hard kill-switch for any model I/O; keeps heuristics and artifact recording. */
  modelAssistLive(): boolean {
    const v = (this.cfg.get<string>("MALV_MODEL_ASSIST_LIVE") ?? "").toLowerCase().trim();
    return v === "1" || v === "true" || v === "yes";
  }

  shouldAttemptModelAssist(phase: MalvIntelligencePhase): boolean {
    if (!this.modelAssistLive()) return false;
    const mode = this.getMode();
    if (mode === "off" || mode === "heuristic_only") return false;
    if (mode === "assist_full") return true;
    return LOW_COST_PHASES.has(phase);
  }
}
