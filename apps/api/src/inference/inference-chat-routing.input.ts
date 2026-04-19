import type { ModeType } from "../beast/mode-router";
import type { MalvTaskCapabilityDemand } from "./malv-inference-tier-capability.types";

export type ChatRoutingInput = {
  surface: "chat";
  userMessage: string;
  modeType: ModeType;
  classifiedWorkerMode: "light" | "beast";
  superFix: boolean;
  useServerPhased: boolean;
  executionStrategyMode?: string;
  internalPhaseCount?: number;
  contextChars: number;
  vaultScoped: boolean;
  inputMode?: string | null;
  /**
   * When the agent task router runs before inference, merged plan+turn demand is supplied so
   * CPU/GPU selection matches staged agents without hardcoded model names.
   */
  mergedTurnCapabilityDemand?: MalvTaskCapabilityDemand | null;
  /**
   * Universal topic-agnostic capability router — merged after plan demand so live / finance / source / visual
   * turns do not silently downgrade to CPU-only shapes.
   */
  mergedUniversalCapabilityDemand?: MalvTaskCapabilityDemand | null;
};
