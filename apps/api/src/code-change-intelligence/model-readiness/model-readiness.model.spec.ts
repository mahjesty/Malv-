import type { ConfigService } from "@nestjs/config";
import { MalvModelAssistGateService, parseMalvModelAssistMode } from "./malv-model-assist.gate.service";
import { MalvIntelligenceArtifactService } from "./malv-intelligence-artifact.service";
import {
  isValidMalvIntelligenceArtifactV1,
  isValidMalvModelReadinessBundle
} from "./malv-intelligence-artifact.validation";
import {
  NoopMalvPlanningProvider,
  NoopMalvReasoningProvider,
  NoopMalvVisionCritiqueProvider
} from "./noop-malv-intelligence-providers.service";

function cfg(env: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => env[k] } as unknown as ConfigService;
}

describe("Malv model integration readiness", () => {
  it("parses assist modes with heuristic_only default", () => {
    expect(parseMalvModelAssistMode(undefined)).toBe("heuristic_only");
    expect(parseMalvModelAssistMode("OFF")).toBe("off");
    expect(parseMalvModelAssistMode("assist_low_cost")).toBe("assist_low_cost");
    expect(parseMalvModelAssistMode("full")).toBe("assist_full");
  });

  it("fallback: model assist never attempts without MALV_MODEL_ASSIST_LIVE", () => {
    const gate = new MalvModelAssistGateService(
      cfg({ MALV_MODEL_ASSIST_MODE: "assist_full", MALV_MODEL_ASSIST_LIVE: undefined })
    );
    expect(gate.modelAssistLive()).toBe(false);
    expect(gate.shouldAttemptModelAssist("codebase_audit")).toBe(false);
    expect(gate.shouldAttemptModelAssist("patch_review_synthesis")).toBe(false);
  });

  it("model-unavailable path: assist_full + live still allows workflow with noop providers", async () => {
    const gate = new MalvModelAssistGateService(
      cfg({ MALV_MODEL_ASSIST_MODE: "assist_full", MALV_MODEL_ASSIST_LIVE: "true" })
    );
    expect(gate.shouldAttemptModelAssist("codebase_audit")).toBe(true);
    const reasoning = new NoopMalvReasoningProvider();
    expect(await reasoning.augmentCodebaseAudit({ requestedGoal: "x" }, {} as any)).toBeNull();
    const planning = new NoopMalvPlanningProvider();
    expect(await planning.augmentChangePlan({ requestedGoal: "x", audit: {} as any }, {} as any)).toBeNull();
    const vision = new NoopMalvVisionCritiqueProvider();
    expect(await vision.augmentRenderedUiCritique({ artifactCount: 0, stateCoverageSummary: null, touchedSourcePaths: [] }, {} as any)).toBeNull();
  });

  it("assist_low_cost only opens gated phases when live", () => {
    const gateOff = new MalvModelAssistGateService(
      cfg({ MALV_MODEL_ASSIST_MODE: "assist_low_cost", MALV_MODEL_ASSIST_LIVE: "true" })
    );
    expect(gateOff.shouldAttemptModelAssist("bug_detection_reasoning")).toBe(true);
    expect(gateOff.shouldAttemptModelAssist("fix_planning")).toBe(true);
    expect(gateOff.shouldAttemptModelAssist("codebase_audit")).toBe(false);
    expect(gateOff.shouldAttemptModelAssist("patch_review_synthesis")).toBe(false);
  });

  it("validates intelligence artifact envelopes", () => {
    const gate = new MalvModelAssistGateService(cfg({}));
    const svc = new MalvIntelligenceArtifactService(gate);
    const bundle = svc.buildAuditPipelineReadiness({
      audit: {
        summary: "s",
        impactedFiles: ["a.ts"],
        scopeClassification: {
          minimalLocalized: true,
          crossModule: false,
          contractChanging: false,
          dataModelChanging: false,
          securitySensitive: false,
          uxSensitive: false,
          performanceSensitive: false,
          rationale: []
        }
      } as any,
      bugDetection: { scannedFiles: 1, issues: [], summary: "b" },
      performanceIntel: { scannedFiles: 1, issues: [], summary: "p" },
      fixPlan: { items: [], pipelinePolicy: "x", summary: "f" }
    });
    expect(isValidMalvModelReadinessBundle(bundle)).toBe(true);
    for (const a of Object.values(bundle.artifacts)) {
      if (a) expect(isValidMalvIntelligenceArtifactV1(a)).toBe(true);
    }
  });

  it("rejects malformed artifact objects", () => {
    expect(isValidMalvIntelligenceArtifactV1(null)).toBe(false);
    expect(isValidMalvIntelligenceArtifactV1({ v: 2 })).toBe(false);
  });
});
