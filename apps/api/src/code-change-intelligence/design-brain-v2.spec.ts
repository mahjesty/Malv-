import { CodebaseAuditService } from "./codebase-audit.service";
import { CodeGraphService } from "./code-graph.service";
import { createChangePlanningService } from "./change-planning-wiring";
import { DesignCritiqueService } from "./frontend-design-critique.service";
import { DesignSystemIntelligenceService } from "./design-system-intelligence.service";
import { ChangeVerificationService } from "./change-verification.service";

describe("Design Brain V2", () => {
  it("frontend tasks include design system scan, composition blueprint, and motion plan before implementation", () => {
    const planning = createChangePlanningService();
    const audit = new CodebaseAuditService(new CodeGraphService()).audit({
      requestedGoal: "improve the settings page UI and layout",
      hints: []
    });
    expect(audit.impactedAreas.frontend).toBe(true);
    const plan = planning.createPlan({ requestedGoal: "settings UI", audit });
    expect(plan.designBrain).not.toBeNull();
    expect(plan.designBrain?.designSystemProfile.spacingScale.rhythmSummary.length).toBeGreaterThan(5);
    expect(plan.designBrain?.composition.emphasis.primaryCta.length).toBeGreaterThan(5);
    expect(plan.designBrain?.motion.loading.length).toBeGreaterThan(5);
    expect(plan.visualStrategy?.layoutStrategy).toBeTruthy();
    expect(plan.visualStrategy?.interactionStrategy).toBeTruthy();
    expect(plan.visualStrategy?.animationStrategy).toBeTruthy();
  });

  it("design critique flags generic UI and yields designQualityScore 0–100", () => {
    const critique = new DesignCritiqueService();
    const out = critique.critiqueFromCwd([]);
    expect(out.designQualityScore).toBeGreaterThanOrEqual(0);
    expect(out.designQualityScore).toBeLessThanOrEqual(100);
    expect(out.designCritiqueSummary.length).toBeGreaterThan(5);
  });

  it("verification records layout blueprint and motion plan checks when design brain present", () => {
    const planning = createChangePlanningService();
    const audit = new CodebaseAuditService(new CodeGraphService()).audit({
      requestedGoal: "dashboard UI refresh",
      hints: []
    });
    const plan = planning.createPlan({ requestedGoal: "dash", audit });
    const v = new ChangeVerificationService().verify({
      filesChanged: ["apps/web/src/a.tsx"],
      plan,
      audit
    });
    const types = v.checksPerformed.map((c) => c.type);
    expect(types).toContain("layout_blueprint_before_implementation");
    expect(types).toContain("motion_plan_before_implementation");
    expect(types).toContain("design_audit");
  });

  it("design system intelligence builds a profile from repo scan", () => {
    const dsi = new DesignSystemIntelligenceService();
    const profile = dsi.scan(process.cwd());
    expect(profile.profileVersion).toContain("malv_design_system");
    expect(profile.spacingScale).toBeDefined();
    expect(profile.typographyScale).toBeDefined();
  });
});
