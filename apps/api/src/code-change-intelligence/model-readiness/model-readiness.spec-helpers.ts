import type { ConfigService } from "@nestjs/config";
import { MalvModelAssistGateService } from "./malv-model-assist.gate.service";
import { MalvIntelligenceArtifactService } from "./malv-intelligence-artifact.service";
import {
  NoopMalvPlanningProvider,
  NoopMalvReasoningProvider,
  NoopMalvVisionCritiqueProvider
} from "./noop-malv-intelligence-providers.service";

export function modelReadinessTestDeps(env: Record<string, string | undefined> = {}) {
  const cfg = { get: (k: string) => env[k] } as unknown as ConfigService;
  const gate = new MalvModelAssistGateService(cfg);
  const artifacts = new MalvIntelligenceArtifactService(gate);
  return {
    gate,
    artifacts,
    reasoningProvider: new NoopMalvReasoningProvider(),
    planningProvider: new NoopMalvPlanningProvider(),
    visionProvider: new NoopMalvVisionCritiqueProvider()
  };
}
