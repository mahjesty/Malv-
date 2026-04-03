import type { ChangeAuditResult } from "./change-intelligence.types";
import { createChangePlanningService } from "./change-planning-wiring";

function baseAudit(overrides: Partial<ChangeAuditResult> = {}): ChangeAuditResult {
  const emptyGraph = {
    cacheKey: "",
    generatedAt: 0,
    scanRoots: [] as string[],
    fileCount: 0,
    edgeCount: 0,
    symbolEdgeSample: [],
    fileEdgeSample: [],
    moduleEdgeSample: []
  };
  const ia = {
    summary: "",
    mayBreakIfChanged: [],
    dependentModules: ["apps/api"],
    regressionTesting: ["run api tests"]
  };
  return {
    summary: "s",
    impactedAreas: {
      frontend: false,
      backend: true,
      dtoSchema: false,
      authPermissions: false,
      realtimeEvents: false,
      tests: true,
      dbMigrations: false,
      configEnv: false
    },
    relatedFiles: ["apps/api/src/app.module.ts"],
    impactedFiles: [
      "apps/api/src/feature/seed.service.ts",
      "apps/api/src/feature/feature.module.ts",
      "apps/api/src/lib/shared.util.ts"
    ],
    upstreamDependencies: [],
    downstreamEffects: ["apps/api/src/app/consumer.service.ts"],
    dependencyGraph: emptyGraph,
    impactAnalysis: ia,
    impactIntelligence: {
      ...ia,
      directlyTouchedFiles: [],
      dependentFiles: [],
      contractsAtRisk: [],
      testsRecommended: ia.regressionTesting,
      userFacingFlowsLikely: [],
      authRealtimeSecurityIntersections: [],
      migrationsConfigEnvSurfaces: []
    },
    repoPatterns: {
      duplicateLogicHints: [],
      similarPatterns: [],
      saferExtensionPoints: ["apps/api/src/feature/feature.module.ts"]
    },
    extensionIntelligence: {
      idealPlugInPoints: [],
      similarPatterns: [],
      duplicationWarnings: [],
      saferExtensionPoints: ["apps/api/src/feature/feature.module.ts"],
      riskyPatchPoints: [],
      layerHints: { primary: "service", alternates: [], rationale: "" }
    },
    scopeClassification: {
      minimalLocalized: false,
      crossModule: false,
      contractChanging: false,
      dataModelChanging: false,
      securitySensitive: false,
      uxSensitive: false,
      performanceSensitive: false,
      rationale: []
    },
    architectureNotes: "",
    riskNotes: "",
    securityNotes: "",
    ...overrides
  };
}

describe("ChangePlanningService", () => {
  const planning = createChangePlanningService();

  it("selects files from audit impact data and extension points instead of static defaults", () => {
    const audit = baseAudit();
    const plan = planning.createPlan({
      requestedGoal: "adjust seed service",
      audit
    });
    expect(plan.filesToModify).toContain("apps/api/src/feature/feature.module.ts");
    expect(plan.filesToModify).toContain("apps/api/src/feature/seed.service.ts");
    expect(plan.filesToModify).not.toEqual(
      expect.arrayContaining([
        "apps/api/src/code-change-intelligence/code-change-intelligence.service.ts",
        "apps/api/src/code-change-intelligence/code-change-intelligence.controller.ts"
      ])
    );
  });

  it("falls back to code-change-intelligence defaults only when impact cone is too small", () => {
    const audit = baseAudit({
      impactedFiles: ["apps/api/src/app.module.ts"],
      repoPatterns: { duplicateLogicHints: [], similarPatterns: [], saferExtensionPoints: [] },
      extensionIntelligence: {
        idealPlugInPoints: [],
        similarPatterns: [],
        duplicationWarnings: [],
        saferExtensionPoints: [],
        riskyPatchPoints: [],
        layerHints: { primary: "service", alternates: [], rationale: "" }
      }
    });
    const plan = planning.createPlan({ requestedGoal: "tiny change", audit });
    expect(plan.filesToModify).toContain("apps/api/src/code-change-intelligence/code-change-intelligence.service.ts");
  });

  it("includes visual strategy fields when frontend is in scope", () => {
    const audit = baseAudit({
      impactedAreas: {
        frontend: true,
        backend: true,
        dtoSchema: false,
        authPermissions: false,
        realtimeEvents: false,
        tests: true,
        dbMigrations: false,
        configEnv: false
      },
      impactedFiles: ["apps/web/src/app/page.tsx", "apps/api/src/app.module.ts"]
    });
    const plan = planning.createPlan({ requestedGoal: "polish the dashboard UI", audit });
    expect(plan.visualStrategy).not.toBeNull();
    expect(plan.visualStrategy?.visualDirection.length).toBeGreaterThan(10);
    expect(plan.visualStrategy?.animationPlan.length).toBeGreaterThan(5);
    expect(plan.visualStrategy?.layoutStrategy?.length).toBeGreaterThan(20);
    expect(plan.visualStrategy?.interactionStrategy?.length).toBeGreaterThan(10);
    expect(plan.visualStrategy?.animationStrategy?.length).toBeGreaterThan(20);
    expect(plan.visualStrategy?.responsivePlan.length).toBeGreaterThan(5);
    expect(plan.frontendDesignAudit).not.toBeNull();
    expect(plan.designBrain?.composition.layoutStructure.length).toBeGreaterThan(10);
    expect(plan.designBrain?.motion.entrance.length).toBeGreaterThan(5);
  });
});
