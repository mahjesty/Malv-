import type { MalvAgentKind } from "./malv-agent.contracts";
import { MALV_AGENT_CAPABILITY_CATALOG } from "../registry/malv-agent-capability-catalog";
import {
  MALV_SPECIALIZED_AGENT_SCHEMA_STAGE2_BY_KIND,
  MALV_STAGE2_BUILD_TECH_KINDS,
  stage2SchemaComplianceReport
} from "./malv-stage2-specialized-agent.schema";
import {
  MALV_SPECIALIZED_AGENT_SCHEMA_BY_KIND,
  MALV_STAGE1_CORE_RUNTIME_KINDS,
  evaluateStage1SuccessCriteria,
  stage1SchemaComplianceReport
} from "./malv-specialized-agent.schema";
import { Test } from "@nestjs/testing";
import { MalvRouterAgentService } from "../agents/malv-core-agents.services";
import { MalvPrivacyAgentService, MalvSmartDecisionAgentService } from "../agents/malv-stage1-runtime-agents.services";
import { MALV_ALL_REGISTERED_AGENT_PROVIDERS } from "../malv-agent-system.providers";

describe("malv-specialized-agent.schema", () => {
  it("has catalog entries for every MalvAgentKind", () => {
    const kinds = Object.keys(MALV_AGENT_CAPABILITY_CATALOG) as MalvAgentKind[];
    for (const k of kinds) {
      expect(MALV_AGENT_CAPABILITY_CATALOG[k]?.length).toBeGreaterThan(0);
    }
  });

  it("stage1 compliance report covers all stage1 kinds", () => {
    const r = stage1SchemaComplianceReport([...MALV_STAGE1_CORE_RUNTIME_KINDS]);
    expect(r.eachHasSchema).toBe(true);
    expect(r.kinds.length).toBe(10);
  });

  it("each stage2 schema declares consistent tier metadata", () => {
    for (const k of MALV_STAGE2_BUILD_TECH_KINDS) {
      const s = MALV_SPECIALIZED_AGENT_SCHEMA_STAGE2_BY_KIND[k];
      expect(s.name.length).toBeGreaterThan(3);
      expect(s.mission.length).toBeGreaterThan(20);
      expect(s.ownedTaskClasses.length).toBeGreaterThan(0);
      expect(s.allowedTools.length).toBeGreaterThan(0);
      expect(s.telemetryFieldIds.length).toBeGreaterThan(0);
      expect(s.successCriteriaIds.length).toBeGreaterThan(0);
    }
    const r = stage2SchemaComplianceReport([...MALV_STAGE2_BUILD_TECH_KINDS]);
    expect(r.eachHasSchema).toBe(true);
  });

  it("each stage1 schema declares consistent tier metadata", () => {
    for (const k of MALV_STAGE1_CORE_RUNTIME_KINDS) {
      const s = MALV_SPECIALIZED_AGENT_SCHEMA_BY_KIND[k];
      expect(s.name.length).toBeGreaterThan(3);
      expect(s.mission.length).toBeGreaterThan(20);
      expect(s.ownedTaskClasses.length).toBeGreaterThan(0);
      expect(s.allowedTools.length).toBeGreaterThan(0);
      expect(s.telemetryFieldIds.length).toBeGreaterThan(0);
      expect(s.successCriteriaIds.length).toBeGreaterThan(0);
      expect(s.minimumRequiredCapabilityClass).toBeDefined();
      expect(s.minimumReasoningDepth).toBeDefined();
      expect(typeof s.requiresMultimodalInference).toBe("boolean");
      expect(typeof s.requiresStructuredInferenceOutput).toBe("boolean");
      expect(s.minimumInferenceResponsiveness).toBeDefined();
    }
  });

  it("evaluateStage1SuccessCriteria passes for executed agents with minimal inputs", async () => {
    const m = await Test.createTestingModule({
      providers: [...MALV_ALL_REGISTERED_AGENT_PROVIDERS]
    }).compile();

    const ctx = {
      traceId: "t",
      vaultScoped: false,
      surface: "chat" as const,
      latencySensitive: false,
      privacySensitive: false
    };

    const router = m.get(MalvRouterAgentService);
    const envRouter = await router.execute(ctx, { userText: "hello", classified: null, executionStrategy: null });
    const critR = evaluateStage1SuccessCriteria("router", envRouter);
    expect(critR.every((c) => c.passed)).toBe(true);

    const smart = m.get(MalvSmartDecisionAgentService);
    const envSmart = await smart.execute(ctx, {
      userText: "hello",
      workShape: "chat_response",
      complexityScore: 0.4,
      resourceTier: "cpu",
      executionRisk: "low",
      multiAgent: false,
      latencyMode: "normal",
      classified: null,
      executionStrategy: null
    });
    expect(evaluateStage1SuccessCriteria("smart_decision", envSmart).every((c) => c.passed)).toBe(true);

    const priv = m.get(MalvPrivacyAgentService);
    const envPriv = await priv.execute(ctx, { userText: "hello", vaultScoped: true, privacySensitive: true });
    expect(evaluateStage1SuccessCriteria("privacy", envPriv).every((c) => c.passed)).toBe(true);
  });
});
