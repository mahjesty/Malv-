import { Test } from "@nestjs/testing";
import {
  evaluateStage2SuccessCriteria,
  MALV_STAGE2_BUILD_TECH_KINDS,
  stage2SchemaComplianceReport
} from "../contracts/malv-stage2-specialized-agent.schema";
import {
  MalvAnimationAgentService,
  MalvCodingAgentService,
  MalvDebugAgentService,
  MalvDesignerAgentService,
  MalvFrontendExperienceAgentService,
  MalvQaAgentService,
  MalvStudioAgentService,
  MalvSystemDesignAgentService,
  MalvTestingAgentService,
  MalvWebsiteBuilderAgentService,
  MalvWebsiteSecurityAgentService,
  MALV_STAGE2_BUILD_AGENT_PROVIDERS
} from "./malv-stage2-build-agents.services";

const ctx = {
  traceId: "t2",
  vaultScoped: false,
  surface: "chat" as const,
  latencySensitive: false,
  privacySensitive: false
};

const baseInput = {
  userText: "We need to harden the login form and add jest tests for the api route.",
  workShape: "website_oriented" as const,
  surface: "chat" as const,
  complexityScore: 0.52,
  executionRisk: "medium" as const,
  vaultScoped: false,
  studioContext: false,
  classified: null
};

describe("MALV Stage 2 build agents", () => {
  it("schema compliance covers all stage2 kinds", () => {
    const r = stage2SchemaComplianceReport([...MALV_STAGE2_BUILD_TECH_KINDS]);
    expect(r.eachHasSchema).toBe(true);
    expect(r.kinds.length).toBe(11);
  });

  it("each stage2 agent emits payloads passing evaluateStage2SuccessCriteria", async () => {
    const m = await Test.createTestingModule({
      providers: [...MALV_STAGE2_BUILD_AGENT_PROVIDERS]
    }).compile();

    const agents: Array<{ kind: (typeof MALV_STAGE2_BUILD_TECH_KINDS)[number]; svc: unknown }> = [
      { kind: "coding", svc: m.get(MalvCodingAgentService) },
      { kind: "debug", svc: m.get(MalvDebugAgentService) },
      { kind: "system_design", svc: m.get(MalvSystemDesignAgentService) },
      { kind: "designer", svc: m.get(MalvDesignerAgentService) },
      { kind: "frontend_experience", svc: m.get(MalvFrontendExperienceAgentService) },
      { kind: "animation", svc: m.get(MalvAnimationAgentService) },
      { kind: "studio", svc: m.get(MalvStudioAgentService) },
      { kind: "website_builder", svc: m.get(MalvWebsiteBuilderAgentService) },
      { kind: "website_security", svc: m.get(MalvWebsiteSecurityAgentService) },
      { kind: "testing", svc: m.get(MalvTestingAgentService) },
      { kind: "qa", svc: m.get(MalvQaAgentService) }
    ];

    for (const { kind, svc } of agents) {
      const env = await (svc as { execute: typeof MalvCodingAgentService.prototype.execute }).execute(ctx, baseInput);
      const crit = evaluateStage2SuccessCriteria(kind, env);
      expect(crit.every((c) => c.passed)).toBe(true);
    }
  });
});
