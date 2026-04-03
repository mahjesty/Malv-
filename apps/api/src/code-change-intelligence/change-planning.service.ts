import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  ChangeAuditResult,
  ChangePlanResult,
  ChangePlanStrategy,
  VerificationPlan,
  VisualStrategyPlan
} from "./change-intelligence.types";
import type { ChangeTrustLevel } from "../db/entities/change-request.entity";
import { CodeGraphService } from "./code-graph.service";
import { FrontendDesignAuditService } from "./frontend-design-audit.service";
import { MALV_PRODUCT_DESIGN_PROFILE } from "./product-design-profile";
import { DesignSystemIntelligenceService } from "./design-system-intelligence.service";
import { DesignTasteEngine } from "./design-taste-engine";
import { VisualCompositionService } from "./visual-composition.service";
import { MotionDesignService } from "./motion-design.service";
import { isFrontendRepoPath } from "./frontend-repo-paths";

@Injectable()
export class ChangePlanningService {
  constructor(
    private readonly codeGraph: CodeGraphService,
    private readonly frontendDesign: FrontendDesignAuditService,
    private readonly designSystem: DesignSystemIntelligenceService,
    private readonly tasteEngine: DesignTasteEngine,
    private readonly visualComposition: VisualCompositionService,
    private readonly motionDesign: MotionDesignService
  ) {}

  createPlan(args: { requestedGoal: string; audit: ChangeAuditResult }): ChangePlanResult {
    const snap = this.codeGraph.getOrBuildGraph();
    const repoRoot = snap.repoRoot;
    const frontendTouch =
      args.audit.impactedAreas.frontend || this.touchesFrontendFiles(args.audit.impactedFiles);

    const designProfile = frontendTouch ? this.designSystem.scan(repoRoot) : null;
    const designAudit = frontendTouch ? this.frontendDesign.audit(repoRoot) : null;
    const taste = frontendTouch && designProfile ? this.tasteEngine.evaluate(designProfile) : null;
    const composition =
      frontendTouch && designProfile && taste
        ? this.visualComposition.compose({
            requestedGoal: args.requestedGoal,
            audit: args.audit,
            profile: designProfile,
            taste
          })
        : null;
    const motion =
      frontendTouch && designProfile && composition
        ? this.motionDesign.plan({ profile: designProfile, composition })
        : null;

    const designBrain =
      frontendTouch && designProfile && taste && composition && motion
        ? { designSystemProfile: designProfile, taste, composition, motion }
        : null;

    if (frontendTouch && (!designBrain || !composition || !motion)) {
      throw new BadRequestException(
        "Frontend change requires design stages: design system scan, taste, visual composition, and motion plan cannot be skipped."
      );
    }

    const scopeComplexity = this.deriveScopeComplexity(args.audit);
    const trustLevel = this.classifyTrustLevel(args.audit, scopeComplexity);
    const strategy = this.pickStrategy(args.audit, scopeComplexity);
    const approvalRequired = this.computeApprovalRequired(trustLevel, args.audit, scopeComplexity);

    const filesToModify = this.pickFilesToModify(args.requestedGoal, args.audit);
    const verificationPreview = this.buildVerificationPreview(args.audit);
    const visualStrategy =
      frontendTouch && designAudit && designBrain
        ? this.buildVisualStrategy(designAudit, designBrain)
        : null;

    const contractChanges = args.audit.impactIntelligence.contractsAtRisk.slice(0, 15);
    const touchedLayers = this.inferTouchedLayers(args.audit);
    const extensionPointsExplicit = args.audit.extensionIntelligence.idealPlugInPoints.slice(0, 12);

    return {
      planSummary: this.buildPlanSummary(args.audit, filesToModify, strategy, scopeComplexity, frontendTouch),
      implementationStrategy: `Execute using strategy "${strategy}" with scope-derived risk controls.`,
      strategy,
      strategyRationale: args.audit.scopeClassification.rationale.join(" "),
      touchedLayers,
      extensionPointsExplicit,
      contractChanges,
      performanceConsiderations: args.audit.scopeClassification.performanceSensitive
        ? "Large scope or realtime/perf signals — validate latency, bundle impact, and N+1 queries in touched paths."
        : "No strong performance signal from scope classification — still run targeted tests on touched modules.",
      securityConsiderations: args.audit.scopeClassification.securitySensitive
        ? "Auth/config/guard surfaces — verify permissions, tokens, and sandbox policy compatibility."
        : "Standard security review on touched scope.",
      designConsiderations: frontendTouch
        ? `Align with ${MALV_PRODUCT_DESIGN_PROFILE.name}: clarity, hierarchy, restrained motion, mobile-first.`
        : null,
      riskSummary: this.buildRiskSummary(args.audit, scopeComplexity),
      confidenceRationale: `Scope=${scopeComplexity}; strategy=${strategy}; trust=${trustLevel}; based on audit.scopeClassification and graph cone (${args.audit.impactedFiles.length} files).`,
      verificationPreview,
      visualStrategy,
      designBrain,
      frontendDesignAudit: designAudit,
      filesToModify,
      filesToCreate: [],
      migrationsRequired: args.audit.impactedAreas.dbMigrations || args.audit.scopeClassification.dataModelChanging,
      testPlan: this.buildTestPlan(args.audit, verificationPreview),
      rollbackNotes:
        "Roll back by request ID using persisted execution and patch metadata; no production apply without explicit approval checkpoint.",
      approvalRequired,
      trustLevel,
      scopeComplexity
    };
  }

  private touchesFrontendFiles(files: string[]): boolean {
    return files.some((f) => isFrontendRepoPath(f.replace(/\\/g, "/")));
  }

  private deriveScopeComplexity(audit: ChangeAuditResult): "low" | "medium" | "high" | "critical" {
    const s = audit.scopeClassification;
    if (s.securitySensitive && s.dataModelChanging) return "critical";
    if (s.crossModule && (s.contractChanging || s.dataModelChanging)) return "high";
    if (s.crossModule || audit.impactedFiles.length > 35) return "high";
    if (s.contractChanging || s.dataModelChanging) return "medium";
    return s.minimalLocalized ? "low" : "medium";
  }

  private computeApprovalRequired(
    trust: ChangeTrustLevel,
    audit: ChangeAuditResult,
    scope: "low" | "medium" | "high" | "critical"
  ): boolean {
    if (trust === "sensitive" || trust === "critical") return true;
    if (scope === "critical") return true;
    if (audit.scopeClassification.contractChanging && audit.scopeClassification.crossModule) return true;
    return false;
  }

  private classifyTrustLevel(
    audit: ChangeAuditResult,
    scope: "low" | "medium" | "high" | "critical"
  ): ChangeTrustLevel {
    if (audit.impactedAreas.configEnv) return "critical";
    if (audit.impactedAreas.authPermissions) return "sensitive";
    if (scope === "critical" || audit.scopeClassification.securitySensitive) return "sensitive";
    if (audit.impactedAreas.dbMigrations || audit.impactedAreas.realtimeEvents) return "controlled";
    if (scope === "high") return "controlled";
    return "safe";
  }

  private pickStrategy(audit: ChangeAuditResult, scope: "low" | "medium" | "high" | "critical"): ChangePlanStrategy {
    if (audit.scopeClassification.securitySensitive && scope !== "low") return "approval_first_risky";
    if (audit.scopeClassification.crossModule && audit.scopeClassification.contractChanging) return "phased_split";
    if (audit.extensionIntelligence.duplicationWarnings.length >= 3) return "refactor_and_extend";
    if (audit.scopeClassification.minimalLocalized && scope === "low") return "localized_patch";
    if (audit.scopeClassification.crossModule && !audit.scopeClassification.dataModelChanging) return "extend_existing_pattern";
    if (audit.scopeClassification.dataModelChanging && audit.scopeClassification.crossModule) return "new_module";
    return "extend_existing_pattern";
  }

  private buildVerificationPreview(audit: ChangeAuditResult): VerificationPlan {
    return {
      whatToVerify: [
        "Typecheck/lint on touched modules",
        "Contract alignment for DTO/controller if in scope",
        "Regression on downstream importers listed in impact intelligence"
      ],
      likelyBreakage: audit.impactIntelligence.mayBreakIfChanged.slice(0, 12),
      mostRelevantTests: audit.impactIntelligence.testsRecommended.slice(0, 8),
      cannotProveAutomatically: [
        "Full production traffic behavior",
        "All third-party integration edge cases",
        audit.impactedAreas.frontend ? "Pixel-perfect cross-browser UI without dedicated visual tests" : "N/A for non-frontend"
      ].filter((x) => x !== "N/A for non-frontend" || audit.impactedAreas.frontend)
    };
  }

  private buildVisualStrategy(
    design: import("./frontend-design-audit.service").FrontendDesignAuditResult,
    brain: import("./change-intelligence.types").DesignBrainPlan
  ): VisualStrategyPlan {
    const layoutStrategy = [
      brain.composition.layoutStructure,
      `Section flow: ${brain.composition.sectionFlow.join(" → ")}`,
      `Emphasis: ${brain.composition.emphasis.primaryCta}`
    ].join(" ");

    const interactionStrategy = [
      brain.taste.principlesApplied[0] ?? "",
      "Primary CTA: isolated, high contrast; secondary actions de-emphasized; keyboard focus-visible on all controls.",
      design.motionConventions.join(" ")
    ]
      .filter(Boolean)
      .join(" ");

    const animationStrategy = [
      brain.motion.entrance,
      brain.motion.hoverFocus,
      brain.motion.loading,
      brain.motion.reducedMotion,
      brain.motion.performanceNotes
    ].join(" ");

    return {
      visualDirection: `${MALV_PRODUCT_DESIGN_PROFILE.principles[0]} Stack: ${design.librariesDetected.join(", ") || "Tailwind-first"}. ${brain.designSystemProfile.spacingScale.rhythmSummary}`,
      layoutIntent: layoutStrategy,
      layoutStrategy,
      hierarchyPlan: [...brain.composition.hierarchy, design.typographySignals.join(" ")].filter(Boolean).join(" | "),
      componentStrategy: brain.composition.componentTree,
      interactionNotes: interactionStrategy,
      interactionStrategy,
      animationPlan: `${MALV_PRODUCT_DESIGN_PROFILE.motionDefaults.entrance} ${MALV_PRODUCT_DESIGN_PROFILE.motionDefaults.reducedMotion}`,
      animationStrategy,
      responsivePlan: design.responsivenessPatterns.length
        ? design.responsivenessPatterns.join("; ")
        : "Breakpoint-driven spacing; verify thumb reach on primary actions.",
      themeModeConsiderations: design.darkLightSignals.join(" ") || "Validate light/dark surfaces if app supports both.",
      accessibilityNotes: MALV_PRODUCT_DESIGN_PROFILE.accessibility.join(" "),
      animationPerformanceNotes: brain.motion.performanceNotes
    };
  }

  private buildRiskSummary(audit: ChangeAuditResult, scope: "low" | "medium" | "high" | "critical"): string {
    return `Scope complexity ${scope}. Cross-module=${audit.scopeClassification.crossModule}; contracts=${audit.scopeClassification.contractChanging}; data=${audit.scopeClassification.dataModelChanging}; security=${audit.scopeClassification.securitySensitive}.`;
  }

  private inferTouchedLayers(audit: ChangeAuditResult): string[] {
    const layers = new Set<string>();
    const areas = audit.impactedAreas;
    if (areas.frontend) layers.add("web_ui");
    if (areas.backend) layers.add("api_services");
    if (areas.dtoSchema) layers.add("dto_contracts");
    if (areas.dbMigrations) layers.add("persistence_migrations");
    if (areas.authPermissions) layers.add("auth_permissions");
    if (areas.realtimeEvents) layers.add("realtime");
    if (areas.configEnv) layers.add("config_env");
    return Array.from(layers);
  }

  private buildPlanSummary(
    audit: ChangeAuditResult,
    filesToModify: string[],
    strategy: ChangePlanStrategy,
    scope: "low" | "medium" | "high" | "critical",
    frontend: boolean
  ): string {
    const ext = audit.repoPatterns.saferExtensionPoints.slice(0, 2).join(", ");
    const fixHint =
      audit.fixPlan?.items?.length && audit.fixPlan.pipelinePolicy
        ? ` Intelligence: ${audit.fixPlan.items.length} fix proposal(s) — no direct mutation; ${audit.fixPlan.pipelinePolicy.slice(0, 120)}…`
        : "";
    return (
      `Peak plan [${strategy}] scope=${scope} cone=${audit.impactedFiles.length} files. ` +
      (ext ? `Extension preference: ${ext}. ` : "") +
      (frontend ? "Frontend: design audit + visual strategy required before implementation. " : "") +
      fixHint +
      ` Targets: ${filesToModify.slice(0, 6).join(", ")}.`
    );
  }

  private buildTestPlan(audit: ChangeAuditResult, v: VerificationPlan): string {
    return [...audit.impactIntelligence.regressionTesting, ...v.mostRelevantTests, ...v.whatToVerify].join(" | ");
  }

  private pickFilesToModify(requestedGoal: string, audit: ChangeAuditResult): string[] {
    const goal = requestedGoal.toLowerCase();
    const extensionFirst = [...audit.repoPatterns.saferExtensionPoints];

    const scored = audit.impactedFiles.map((p) => ({
      p,
      score: this.scorePathForPlan(p, goal, audit, extensionFirst)
    }));
    scored.sort((a, b) => b.score - a.score);

    const ordered = [
      ...extensionFirst.filter((e) => audit.impactedFiles.includes(e)),
      ...scored.map((s) => s.p)
    ];
    const unique = Array.from(new Set(ordered));

    const capped = unique.slice(0, 18);
    if (capped.length >= 2) return capped;

    return [
      "apps/api/src/code-change-intelligence/code-change-intelligence.service.ts",
      "apps/api/src/code-change-intelligence/code-change-intelligence.controller.ts"
    ];
  }

  private scorePathForPlan(
    p: string,
    goalLower: string,
    audit: ChangeAuditResult,
    extensionFirst: string[]
  ): number {
    let s = 0;
    const pl = p.toLowerCase();
    if (extensionFirst.includes(p)) s += 20;
    if (pl.endsWith("module.ts")) s += 8;
    if (pl.includes("service.ts")) s += 6;
    if (pl.includes("controller.ts")) s += 5;
    if (pl.includes("gateway.ts")) s += 4;
    if (pl.includes("page.tsx")) s += 5;
    if (pl.includes("/components/")) s += 3;
    if (goalLower.split(/\W+/).some((w) => w.length > 3 && pl.includes(w))) s += 5;
    if (audit.relatedFiles.includes(p)) s += 4;
    if (audit.downstreamEffects.includes(p)) s += 2;
    if (audit.extensionIntelligence.riskyPatchPoints.some((r) => pl.includes(r.replace(/\\/g, "/")))) s -= 3;
    return s;
  }
}
