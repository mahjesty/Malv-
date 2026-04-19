/**
 * Stage 2 specialized agent schemas — build, design, web, test, and Studio intelligence.
 * Kept in a dedicated module to keep Stage 1 catalog focused.
 */

import type { MalvAgentKind, MalvAgentResultEnvelope } from "./malv-agent.contracts";
import type { MalvSpecializedAgentSchema } from "./malv-specialized-agent.schema";
import { MALV_SPECIALIZED_AGENT_SCHEMA_VERSION } from "./malv-specialized-agent.schema";

export const MALV_STAGE2_BUILD_TECH_KINDS = [
  "coding",
  "debug",
  "system_design",
  "designer",
  "frontend_experience",
  "animation",
  "studio",
  "website_builder",
  "website_security",
  "testing",
  "qa"
] as const satisfies readonly MalvAgentKind[];

export type MalvStage2BuildTechKind = (typeof MALV_STAGE2_BUILD_TECH_KINDS)[number];

export const MALV_SPECIALIZED_AGENT_SCHEMA_STAGE2_BY_KIND: Record<MalvStage2BuildTechKind, MalvSpecializedAgentSchema> = {
  coding: {
    name: "Coding Agent",
    mission:
      "Decompose implementation intent into bounded plans, patch posture, likely file touch surfaces, and explicit CCI/sandbox risk notes without executing changes.",
    ownedTaskClasses: ["code_implementation", "execution_preparation"],
    visibility: "internal",
    allowedTools: [
      "malv.cci_workspace_hints",
      "malv.sandbox_policy_gate",
      "malv.code_change_intel_gate",
      "malv.beast_worker_context"
    ],
    preferredTier: "hybrid",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "enhanced",
    minimumReasoningDepth: "deep",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "balanced",
    enhancedCapabilityPath: { preferredTier: "gpu", minimumCapabilityClass: "enhanced" },
    concurrentInferSlots: 2,
    handoffTargets: ["quality_verification", "execution_prep", "sandbox_action", "studio_builder"],
    outputContractKey: "malv.coding.v1",
    safetyRules: [
      "Advisory artifacts only; no direct patch application",
      "Respect vault scope and PII minimization in fileTouchSet labels",
      "High execution risk must stay policy_gated through sandbox_action"
    ],
    telemetryFieldIds: ["coding.scope_band", "coding.patch_kind", "coding.file_touch_count"],
    successCriteriaIds: ["coding.plan_present", "coding.patch_intent", "coding.risk_notes"]
  },
  debug: {
    name: "Debug Agent",
    mission:
      "Structure hypotheses, candidate root causes, ordered investigation paths, and reproduction shape to feed CCI and Beast worker diagnostics without claiming root cause certainty.",
    ownedTaskClasses: ["diagnostics", "verification"],
    visibility: "internal",
    allowedTools: ["malv.cci_workspace_hints", "malv.code_change_intel_gate", "malv.beast_worker_context", "malv.sandbox_policy_gate"],
    preferredTier: "hybrid",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "enhanced",
    minimumReasoningDepth: "deep",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "balanced",
    handoffTargets: ["coding", "quality_verification", "testing", "sandbox_action"],
    outputContractKey: "malv.debug.v1",
    safetyRules: [
      "Never assert fixed root cause without verified evidence refs",
      "Avoid exfiltrating secrets from stack traces; classify only"
    ],
    telemetryFieldIds: ["debug.hypothesis_count", "debug.repro_shape", "debug.priority_depth"],
    successCriteriaIds: ["debug.hypotheses", "debug.candidates", "debug.repro_shape"]
  },
  system_design: {
    name: "System Design Agent",
    mission:
      "Produce architecture briefs, component boundaries, tradeoff matrices, and integration impact summaries for downstream planning and execution prep.",
    ownedTaskClasses: ["systems_architecture", "planning"],
    visibility: "internal",
    allowedTools: ["malv.workspace_task_hints", "malv.beast_worker_context", "malv.sandbox_policy_gate"],
    preferredTier: "gpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "enhanced",
    minimumReasoningDepth: "deep",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "balanced",
    handoffTargets: ["planning", "execution_prep", "quality_verification", "coding"],
    outputContractKey: "malv.system_design.v1",
    safetyRules: ["Design outputs are advisory; execution remains gated", "Call out data residency and trust boundaries explicitly"],
    telemetryFieldIds: ["arch.component_count", "arch.tradeoff_axes", "arch.integration_touchpoints"],
    successCriteriaIds: ["arch.brief", "arch.boundaries", "arch.tradeoffs"]
  },
  designer: {
    name: "Designer Agent",
    mission: "Translate product intent into design direction, UI principles, interaction tone, and visual constraints for build and frontend agents.",
    ownedTaskClasses: ["visual_design", "ux_engineering"],
    visibility: "internal",
    allowedTools: ["malv.beast_worker_context", "malv.workspace_task_hints"],
    preferredTier: "gpu",
    fallbackTier: "hybrid",
    minimumRequiredCapabilityClass: "enhanced",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "balanced",
    handoffTargets: ["frontend_experience", "animation", "website_builder", "response_composer"],
    outputContractKey: "malv.designer.v1",
    safetyRules: ["No impersonation of user brand assets without confirmation", "Accessibility constraints must be stated, not assumed met"],
    telemetryFieldIds: ["design.principle_count", "design.tone_band", "design.constraint_count"],
    successCriteriaIds: ["design.brief", "design.principles", "design.constraints"]
  },
  frontend_experience: {
    name: "Frontend Experience Agent",
    mission: "Assess UX flows, responsiveness risks, interaction friction, and polish opportunities across web and app surfaces.",
    ownedTaskClasses: ["ux_engineering", "verification"],
    visibility: "internal",
    allowedTools: ["malv.beast_worker_context", "malv.preview_inspect_surface", "malv.build_unit_pipeline"],
    preferredTier: "hybrid",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "interactive",
    handoffTargets: ["animation", "coding", "quality_verification", "website_builder"],
    outputContractKey: "malv.frontend_experience.v1",
    safetyRules: ["Stay within preview/sandbox visibility; no live user tracking claims"],
    telemetryFieldIds: ["ux.flow_count", "ux.friction_map_size", "ux.polish_ops"],
    successCriteriaIds: ["ux.flow_assessment", "ux.responsive_risk", "ux.friction_map"]
  },
  animation: {
    name: "Animation Agent",
    mission: "Plan motion, transition choreography, animation risks, and performance guardrails for UI work.",
    ownedTaskClasses: ["motion_design", "ux_engineering"],
    visibility: "internal",
    allowedTools: ["malv.preview_inspect_surface", "malv.beast_worker_context"],
    preferredTier: "gpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "balanced",
    handoffTargets: ["frontend_experience", "coding", "quality_verification"],
    outputContractKey: "malv.animation.v1",
    safetyRules: ["Prefer reduced-motion paths when risk flags exist", "No layout-thrashing patterns recommended without measure step"],
    telemetryFieldIds: ["motion.plan_steps", "motion.transition_count", "motion.guardrail_count"],
    successCriteriaIds: ["motion.plan", "motion.choreography", "motion.guardrails"]
  },
  studio: {
    name: "Studio Agent",
    mission:
      "Bind Studio work to build-unit / preview targets, outline inspect-diff strategy, build change sequencing, and preview impact for studio_builder and sandbox gates.",
    ownedTaskClasses: ["studio_orchestration", "execution_preparation"],
    visibility: "internal",
    allowedTools: [
      "malv.build_unit_pipeline",
      "malv.preview_inspect_surface",
      "malv.sandbox_policy_gate",
      "malv.cci_workspace_hints"
    ],
    preferredTier: "hybrid",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "enhanced",
    minimumReasoningDepth: "deep",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "balanced",
    concurrentInferSlots: 2,
    handoffTargets: ["studio_builder", "coding", "debug", "sandbox_action", "quality_verification"],
    outputContractKey: "malv.studio.v1",
    safetyRules: ["Studio artifacts never bypass approval for sandbox_action", "Treat build units as opaque ids unless workspace allows"],
    telemetryFieldIds: ["studio.target_profile", "studio.change_plan_depth", "studio.preview_impact"],
    successCriteriaIds: ["studio.profile", "studio.change_plan", "studio.preview_impact"]
  },
  website_builder: {
    name: "Website Builder Agent",
    mission: "Outline site structure, page systems, conversion flows, and build sequencing for multi-page web experiences.",
    ownedTaskClasses: ["web_composition", "planning"],
    visibility: "internal",
    allowedTools: ["malv.workspace_task_hints", "malv.build_unit_pipeline", "malv.beast_worker_context"],
    preferredTier: "gpu",
    fallbackTier: "hybrid",
    minimumRequiredCapabilityClass: "enhanced",
    minimumReasoningDepth: "deep",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "balanced",
    handoffTargets: ["designer", "frontend_experience", "website_security", "testing", "coding"],
    outputContractKey: "malv.website_builder.v1",
    safetyRules: ["Forms and auth flows must defer to website_security review", "No live DNS or hosting mutation from this agent"],
    telemetryFieldIds: ["web.page_count", "web.funnel_depth", "web.build_phases"],
    successCriteriaIds: ["web.structure", "web.pages", "web.build_sequence"]
  },
  website_security: {
    name: "Website Security Agent",
    mission: "Summarize web threat posture, auth exposure, input surfaces, and hardening checklist for advisory gating.",
    ownedTaskClasses: ["web_security", "policy_review"],
    visibility: "internal",
    allowedTools: ["malv.sandbox_policy_gate", "malv.vault_scope_flags", "malv.beast_worker_context"],
    preferredTier: "cpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "interactive",
    handoffTargets: ["policy_safety_review", "testing", "qa", "coding"],
    outputContractKey: "malv.website_security.v1",
    safetyRules: ["Do not emit exploit steps; remediation classes only", "Vault sessions tighten auth exposure defaults"],
    telemetryFieldIds: ["sec.risk_band", "sec.input_surfaces", "sec.hardening_items"],
    successCriteriaIds: ["sec.risk_profile", "sec.auth_exposure", "sec.hardening"]
  },
  testing: {
    name: "Test Agent",
    mission: "Define test strategy, coverage intent, critical test matrix, and validation sequencing aligned with sandbox and workspace boundaries.",
    ownedTaskClasses: ["test_engineering", "verification"],
    visibility: "internal",
    allowedTools: ["malv.workspace_task_hints", "malv.sandbox_policy_gate", "malv.code_change_intel_gate"],
    preferredTier: "hybrid",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "balanced",
    handoffTargets: ["qa", "quality_verification", "sandbox_action", "coding"],
    outputContractKey: "malv.testing.v1",
    safetyRules: ["Tests are plans; execution stays in approved runners", "No destructive prod test patterns"],
    telemetryFieldIds: ["test.strategy_depth", "test.matrix_rows", "test.validation_steps"],
    successCriteriaIds: ["test.strategy", "test.coverage_intent", "test.matrix"]
  },
  qa: {
    name: "QA Agent",
    mission: "Enumerate QA scenarios, failure surfaces, regression hotspots, and release readiness summaries.",
    ownedTaskClasses: ["quality_assurance", "verification"],
    visibility: "internal",
    allowedTools: ["malv.workspace_task_hints", "malv.none_advisory_only"],
    preferredTier: "cpu",
    fallbackTier: "cpu",
    minimumRequiredCapabilityClass: "standard",
    minimumReasoningDepth: "standard",
    requiresMultimodalInference: false,
    requiresStructuredInferenceOutput: true,
    minimumInferenceResponsiveness: "interactive",
    handoffTargets: ["quality_verification", "testing", "response_composer", "policy_safety_review"],
    outputContractKey: "malv.qa.v1",
    safetyRules: ["Readiness is advisory; never override policy_safety_review", "Vault flows require explicit regression coverage callouts"],
    telemetryFieldIds: ["qa.scenario_count", "qa.failure_surfaces", "qa.readiness_band"],
    successCriteriaIds: ["qa.scenarios", "qa.failure_map", "qa.readiness"]
  }
};

export type MalvStage2SuccessCriterionResult = { id: string; passed: boolean; detail: string };

function payloadRecord(env: MalvAgentResultEnvelope): Record<string, unknown> {
  return env.payload && typeof env.payload === "object" ? (env.payload as Record<string, unknown>) : {};
}

/** Deterministic success checks per Stage-2 build/design agent (no LLM). */
export function evaluateStage2SuccessCriteria(
  kind: MalvStage2BuildTechKind,
  env: MalvAgentResultEnvelope
): MalvStage2SuccessCriterionResult[] {
  const p = payloadRecord(env);
  const results: MalvStage2SuccessCriterionResult[] = [];
  const add = (id: string, passed: boolean, detail: string) => results.push({ id, passed, detail });

  switch (kind) {
    case "coding": {
      add("coding.plan_present", typeof p["codeImplementationPlan"] === "object", "codeImplementationPlan");
      add("coding.patch_intent", typeof p["patchIntent"] === "object", "patchIntent");
      add(
        "coding.risk_notes",
        Array.isArray(p["implementationRiskNotes"]) && (p["implementationRiskNotes"] as unknown[]).length > 0,
        "implementationRiskNotes non-empty"
      );
      add(
        "coding.file_touch",
        Array.isArray(p["fileTouchSet"]) && (p["fileTouchSet"] as unknown[]).length > 0,
        "fileTouchSet non-empty"
      );
      break;
    }
    case "debug": {
      add("debug.hypotheses", Array.isArray(p["debugHypothesisSet"]) && (p["debugHypothesisSet"] as unknown[]).length > 0, "debugHypothesisSet");
      add(
        "debug.candidates",
        Array.isArray(p["rootCauseCandidates"]) && (p["rootCauseCandidates"] as unknown[]).length > 0,
        "rootCauseCandidates"
      );
      add(
        "debug.repro_shape",
        typeof p["reproductionShape"] === "object" && p["reproductionShape"] != null,
        "reproductionShape"
      );
      add(
        "debug.priority_path",
        Array.isArray(p["debugPriorityPath"]) && (p["debugPriorityPath"] as unknown[]).length > 0,
        "debugPriorityPath"
      );
      break;
    }
    case "system_design": {
      add("arch.brief", typeof p["systemDesignBrief"] === "object", "systemDesignBrief");
      add(
        "arch.boundaries",
        Array.isArray(p["componentBoundaryMap"]) && (p["componentBoundaryMap"] as unknown[]).length > 0,
        "componentBoundaryMap"
      );
      add(
        "arch.tradeoffs",
        Array.isArray(p["tradeoffMatrix"]) && (p["tradeoffMatrix"] as unknown[]).length > 0,
        "tradeoffMatrix"
      );
      add(
        "arch.integration",
        Array.isArray(p["integrationImpactSummary"]) && (p["integrationImpactSummary"] as unknown[]).length > 0,
        "integrationImpactSummary"
      );
      break;
    }
    case "designer": {
      add("design.brief", typeof p["designDirectionBrief"] === "object", "designDirectionBrief");
      add("design.principles", Array.isArray(p["uiPrinciples"]) && (p["uiPrinciples"] as unknown[]).length > 0, "uiPrinciples");
      add(
        "design.tone_present",
        typeof p["interactionTone"] === "string" && String(p["interactionTone"]).length > 0,
        "interactionTone"
      );
      add(
        "design.constraints",
        Array.isArray(p["visualConstraintSet"]) && (p["visualConstraintSet"] as unknown[]).length > 0,
        "visualConstraintSet"
      );
      break;
    }
    case "frontend_experience": {
      add(
        "ux.flow_assessment",
        Array.isArray(p["uxFlowAssessment"]) && (p["uxFlowAssessment"] as unknown[]).length > 0,
        "uxFlowAssessment"
      );
      add(
        "ux.responsive_risk",
        Array.isArray(p["responsivenessRiskSummary"]) && (p["responsivenessRiskSummary"] as unknown[]).length > 0,
        "responsivenessRiskSummary"
      );
      add(
        "ux.friction_map",
        Array.isArray(p["interactionFrictionMap"]) && (p["interactionFrictionMap"] as unknown[]).length > 0,
        "interactionFrictionMap"
      );
      add(
        "ux.polish",
        Array.isArray(p["polishOpportunitySet"]) && (p["polishOpportunitySet"] as unknown[]).length > 0,
        "polishOpportunitySet"
      );
      break;
    }
    case "animation": {
      add("motion.plan", Array.isArray(p["motionPlan"]) && (p["motionPlan"] as unknown[]).length > 0, "motionPlan");
      add(
        "motion.choreography",
        Array.isArray(p["transitionChoreography"]) && (p["transitionChoreography"] as unknown[]).length > 0,
        "transitionChoreography"
      );
      add(
        "motion.risks",
        Array.isArray(p["animationRiskSummary"]) && (p["animationRiskSummary"] as unknown[]).length > 0,
        "animationRiskSummary"
      );
      add(
        "motion.guardrails",
        Array.isArray(p["performanceGuardrails"]) && (p["performanceGuardrails"] as unknown[]).length > 0,
        "performanceGuardrails"
      );
      break;
    }
    case "studio": {
      add("studio.profile", typeof p["studioTargetProfile"] === "object", "studioTargetProfile");
      add(
        "studio.change_plan",
        Array.isArray(p["buildChangePlan"]) && (p["buildChangePlan"] as unknown[]).length > 0,
        "buildChangePlan"
      );
      add(
        "studio.inspect_diff",
        Array.isArray(p["inspectDiffStrategy"]) && (p["inspectDiffStrategy"] as unknown[]).length > 0,
        "inspectDiffStrategy"
      );
      add(
        "studio.preview_impact",
        Array.isArray(p["previewImpactSummary"]) && (p["previewImpactSummary"] as unknown[]).length > 0,
        "previewImpactSummary"
      );
      break;
    }
    case "website_builder": {
      add(
        "web.structure",
        Array.isArray(p["siteStructurePlan"]) && (p["siteStructurePlan"] as unknown[]).length > 0,
        "siteStructurePlan"
      );
      add(
        "web.pages",
        Array.isArray(p["pageSystemOutline"]) && (p["pageSystemOutline"] as unknown[]).length > 0,
        "pageSystemOutline"
      );
      add(
        "web.conversion",
        Array.isArray(p["conversionFlowMap"]) && (p["conversionFlowMap"] as unknown[]).length > 0,
        "conversionFlowMap"
      );
      add("web.build_sequence", Array.isArray(p["buildSequence"]) && (p["buildSequence"] as unknown[]).length > 0, "buildSequence");
      break;
    }
    case "website_security": {
      add(
        "sec.risk_profile",
        Array.isArray(p["webSecurityRiskProfile"]) && (p["webSecurityRiskProfile"] as unknown[]).length > 0,
        "webSecurityRiskProfile"
      );
      add(
        "sec.auth_exposure",
        Array.isArray(p["authExposureSummary"]) && (p["authExposureSummary"] as unknown[]).length > 0,
        "authExposureSummary"
      );
      add(
        "sec.input_surfaces",
        Array.isArray(p["inputSurfaceRiskMap"]) && (p["inputSurfaceRiskMap"] as unknown[]).length > 0,
        "inputSurfaceRiskMap"
      );
      add(
        "sec.hardening",
        Array.isArray(p["hardeningChecklist"]) && (p["hardeningChecklist"] as unknown[]).length > 0,
        "hardeningChecklist"
      );
      break;
    }
    case "testing": {
      add("test.strategy", Array.isArray(p["testStrategy"]) && (p["testStrategy"] as unknown[]).length > 0, "testStrategy");
      add(
        "test.coverage_intent",
        typeof p["coverageIntent"] === "string" && String(p["coverageIntent"]).length > 0,
        "coverageIntent"
      );
      add(
        "test.matrix",
        Array.isArray(p["criticalTestMatrix"]) && (p["criticalTestMatrix"] as unknown[]).length > 0,
        "criticalTestMatrix"
      );
      add(
        "test.validation_sequence",
        Array.isArray(p["validationSequence"]) && (p["validationSequence"] as unknown[]).length > 0,
        "validationSequence"
      );
      break;
    }
    case "qa": {
      add("qa.scenarios", Array.isArray(p["qaScenarioSet"]) && (p["qaScenarioSet"] as unknown[]).length > 0, "qaScenarioSet");
      add(
        "qa.failure_map",
        Array.isArray(p["failureSurfaceMap"]) && (p["failureSurfaceMap"] as unknown[]).length > 0,
        "failureSurfaceMap"
      );
      add(
        "qa.hotspots",
        Array.isArray(p["regressionHotspots"]) && (p["regressionHotspots"] as unknown[]).length > 0,
        "regressionHotspots"
      );
      add("qa.readiness", typeof p["releaseReadinessSummary"] === "object", "releaseReadinessSummary");
      break;
    }
  }

  return results;
}

export function stage2SchemaComplianceReport(kinds: MalvStage2BuildTechKind[]): {
  version: typeof MALV_SPECIALIZED_AGENT_SCHEMA_VERSION;
  kinds: MalvStage2BuildTechKind[];
  eachHasSchema: boolean;
} {
  return {
    version: MALV_SPECIALIZED_AGENT_SCHEMA_VERSION,
    kinds,
    eachHasSchema: kinds.every((k) => MALV_SPECIALIZED_AGENT_SCHEMA_STAGE2_BY_KIND[k] != null)
  };
}
