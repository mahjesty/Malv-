import type { MalvIntelligenceArtifactV1 } from "./malv-model-assist.types";
import { MALV_INTELLIGENCE_ARTIFACT_VERSION } from "./malv-model-assist.types";

export function isValidMalvIntelligenceArtifactV1(x: unknown): x is MalvIntelligenceArtifactV1 {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.v !== MALV_INTELLIGENCE_ARTIFACT_VERSION) return false;
  if (typeof o.phase !== "string") return false;
  if (typeof o.assistMode !== "string") return false;
  if (o.selectedProducer !== "heuristic" && o.selectedProducer !== "model" && o.selectedProducer !== "merged") return false;
  if (!o.producersAttempted || typeof o.producersAttempted !== "object") return false;
  const p = o.producersAttempted as Record<string, unknown>;
  if (typeof p.heuristic !== "boolean" || typeof p.model !== "boolean") return false;
  if (typeof o.capturedAt !== "string") return false;
  if (!o.metrics || typeof o.metrics !== "object") return false;
  return true;
}

export function isValidMalvModelReadinessBundle(x: unknown): x is {
  assistMode: string;
  modelAssistLive: boolean;
  artifacts: Record<string, unknown>;
} {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.assistMode !== "string") return false;
  if (typeof o.modelAssistLive !== "boolean") return false;
  if (!o.artifacts || typeof o.artifacts !== "object") return false;
  return true;
}
