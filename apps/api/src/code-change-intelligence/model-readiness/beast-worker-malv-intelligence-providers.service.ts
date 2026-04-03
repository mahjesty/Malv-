import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { BeastWorkerClient } from "../../beast/client/beast-worker.client";
import type {
  CodebaseAuditContractInput,
  CodebaseAuditContractOutput,
  BugDetectionContractInput,
  BugDetectionContractOutput,
  FixPlanningContractInput,
  FixPlanningContractOutput,
  DesignCritiqueContractInput,
  DesignCritiqueContractOutput,
  PatchReviewSynthesisContractInput,
  PatchReviewSynthesisContractOutput,
  ChangePlanningContractInput,
  ChangePlanningContractOutput,
  DesignStrategyContractInput,
  DesignStrategyContractOutput,
  RenderedUiCritiqueContractInput,
  RenderedUiCritiqueContractOutput
} from "./malv-intelligence-contracts";
import type { MalvPlanningProvider, MalvReasoningProvider, MalvVisionCritiqueProvider } from "./malv-intelligence-providers";
import {
  inferTimeoutFromConfig,
  inferWorkerText,
  parseJsonObject
} from "./beast-worker-malv-intelligence-infer.util";
import type { BugCategory, BugIssue, BugSeverity, FixPlanItem } from "../malv-intelligence.types";
import { UiVisualCritiqueService } from "../ui-visual-critique.service";
import type { ReviewedStateRecord } from "../ui-state-capture-plan";

const SYSTEM_JSON_ONLY =
  "You are MALV engineering intelligence. Reply with a single JSON object only (no markdown fences). " +
  "Ground suggestions in the heuristic payload; do not invent repo file contents or telemetry. " +
  "If uncertain, return empty optional fields rather than fabricating.";

@Injectable()
export class BeastWorkerMalvReasoningProvider implements MalvReasoningProvider {
  readonly providerId = "beast_worker_reasoning";
  private readonly logger = new Logger(BeastWorkerMalvReasoningProvider.name);

  constructor(
    private readonly cfg: ConfigService,
    private readonly beastWorker: BeastWorkerClient
  ) {}

  private timeoutMs(): number {
    return inferTimeoutFromConfig(
      (k) => this.cfg.get<string>(k),
      "MALV_CCI_REASONING_INFER_TIMEOUT_MS",
      55_000
    );
  }

  private async inferJson(promptKey: string, userPayload: string, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
    const reply = await inferWorkerText({
      beastWorker: this.beastWorker,
      correlationId: randomUUID(),
      systemPrompt: SYSTEM_JSON_ONLY,
      userText: userPayload,
      inferTimeoutMs: this.timeoutMs(),
      promptKey,
      signal
    });
    if (!reply) return null;
    return parseJsonObject(reply);
  }

  async augmentCodebaseAudit(
    input: CodebaseAuditContractInput,
    heuristic: CodebaseAuditContractOutput
  ): Promise<CodebaseAuditContractOutput | null> {
    const payload = [
      "Task: augment codebase audit with additive notes only.",
      `Goal: ${input.requestedGoal.slice(0, 2000)}`,
      "Heuristic summary (authoritative structure):",
      JSON.stringify(
        {
          summary: heuristic.summary.slice(0, 1500),
          architectureNotes: heuristic.architectureNotes.slice(0, 1200),
          riskNotes: heuristic.riskNotes.slice(0, 1200),
          securityNotes: heuristic.securityNotes.slice(0, 1200),
          scope: heuristic.scopeClassification
        },
        null,
        0
      ),
      "Return JSON: { summaryAddendum?: string, architectureNotesAddendum?: string, riskNotesAddendum?: string, securityNotesAddendum?: string }",
      "Each addendum is optional; append-style prose only (no replacement of full audit)."
    ].join("\n\n");

    const o = await this.inferJson("malv_cci_augment_codebase_audit", payload);
    if (!o) return null;
    const merge = (base: string, key: string): string => {
      const a = o[key];
      if (typeof a !== "string" || !a.trim()) return base;
      const add = a.trim().slice(0, 2500);
      return base.trim() ? `${base.trim()}\n\n[model augment]\n${add}` : add;
    };
    try {
      return {
        ...heuristic,
        summary: merge(heuristic.summary, "summaryAddendum"),
        architectureNotes: merge(heuristic.architectureNotes, "architectureNotesAddendum"),
        riskNotes: merge(heuristic.riskNotes, "riskNotesAddendum"),
        securityNotes: merge(heuristic.securityNotes, "securityNotesAddendum")
      };
    } catch (e) {
      this.logger.warn(`augmentCodebaseAudit merge failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  async augmentBugDetection(
    input: BugDetectionContractInput,
    heuristic: BugDetectionContractOutput
  ): Promise<BugDetectionContractOutput | null> {
    const payload = [
      "Task: suggest additional bug findings as structured issues (max 8).",
      `Repo root: ${input.repoRoot}`,
      `Scope files (sample): ${input.scopeFiles.slice(0, 32).join(", ")}`,
      "Heuristic result:",
      JSON.stringify(
        { scannedFiles: heuristic.scannedFiles, issueCount: heuristic.issues.length, summary: heuristic.summary.slice(0, 1200) },
        null,
        0
      ),
      'Return JSON: { additionalIssues?: Array<{ category: string, severity: "low"|"medium"|"high", file: string, message: string, evidence?: string }>, summaryAddendum?: string }',
      "Categories: type_inconsistency | unsafe_pattern | duplicated_logic | dead_code | risky_async",
      "Do not duplicate heuristic issue messages."
    ].join("\n\n");

    const o = await this.inferJson("malv_cci_augment_bug_detection", payload);
    if (!o) return null;
    const extraRaw = o.additionalIssues;
    if (!Array.isArray(extraRaw) || extraRaw.length === 0) {
      if (typeof o.summaryAddendum === "string" && o.summaryAddendum.trim()) {
        return { ...heuristic, summary: `${heuristic.summary}\n\n[model augment]\n${o.summaryAddendum.trim().slice(0, 2000)}` };
      }
      return null;
    }
    const allowedCat = new Set<string>([
      "type_inconsistency",
      "unsafe_pattern",
      "duplicated_logic",
      "dead_code",
      "risky_async"
    ]);
    const next: BugIssue[] = [...heuristic.issues];
    let i = next.length;
    for (const it of extraRaw.slice(0, 8)) {
      if (!it || typeof it !== "object") continue;
      const rec = it as Record<string, unknown>;
      const cat = typeof rec.category === "string" && allowedCat.has(rec.category) ? (rec.category as BugCategory) : "unsafe_pattern";
      const sev =
        rec.severity === "high" || rec.severity === "medium" || rec.severity === "low" ? (rec.severity as BugSeverity) : "low";
      const file = typeof rec.file === "string" ? rec.file.replace(/\\/g, "/").slice(0, 500) : "unknown";
      const message = typeof rec.message === "string" ? rec.message.trim().slice(0, 1200) : "";
      if (!message) continue;
      const evidence = typeof rec.evidence === "string" ? rec.evidence.trim().slice(0, 800) : undefined;
      next.push({
        id: `model_${i++}`,
        category: cat,
        severity: sev,
        file,
        message,
        evidence
      });
    }
    let summary = heuristic.summary;
    if (typeof o.summaryAddendum === "string" && o.summaryAddendum.trim()) {
      summary = `${summary}\n\n[model augment]\n${o.summaryAddendum.trim().slice(0, 2000)}`;
    }
    return { ...heuristic, issues: next, summary, scannedFiles: heuristic.scannedFiles };
  }

  async augmentFixPlanning(
    input: FixPlanningContractInput,
    heuristic: FixPlanningContractOutput
  ): Promise<FixPlanningContractOutput | null> {
    const payload = [
      "Task: propose additive fix plan items (max 6) referencing bug/perf issue ids from heuristics.",
      "Bugs:",
      JSON.stringify(input.bugs.issues.slice(0, 24).map((x) => ({ id: x.id, file: x.file, message: x.message.slice(0, 200) }))),
      "Perf issues:",
      JSON.stringify(input.perf.issues.slice(0, 16).map((x) => ({ id: x.id, file: x.file, message: x.message.slice(0, 200) }))),
      "Heuristic plan items:",
      JSON.stringify(heuristic.items.slice(0, 16).map((x) => ({ issueId: x.issueId, proposedFix: x.proposedFix.slice(0, 200) }))),
      'Return JSON: { additionalItems?: Array<{ issueId: string, source: "bug"|"performance", impactSummary: string, proposedFix: string, risk: "low"|"medium"|"high", confidence: "low"|"medium"|"high" }>, summaryAddendum?: string }'
    ].join("\n\n");

    const o = await this.inferJson("malv_cci_augment_fix_planning", payload);
    if (!o) return null;
    const raw = o.additionalItems;
    if (!Array.isArray(raw) || raw.length === 0) {
      if (typeof o.summaryAddendum === "string" && o.summaryAddendum.trim()) {
        return { ...heuristic, summary: `${heuristic.summary}\n\n[model augment]\n${o.summaryAddendum.trim().slice(0, 2000)}` };
      }
      return null;
    }
    const items: FixPlanItem[] = [...heuristic.items];
    for (const it of raw.slice(0, 6)) {
      if (!it || typeof it !== "object") continue;
      const rec = it as Record<string, unknown>;
      const issueId = typeof rec.issueId === "string" ? rec.issueId.slice(0, 120) : "";
      const source = rec.source === "performance" ? "performance" : "bug";
      const impactSummary = typeof rec.impactSummary === "string" ? rec.impactSummary.trim().slice(0, 800) : "";
      const proposedFix = typeof rec.proposedFix === "string" ? rec.proposedFix.trim().slice(0, 2000) : "";
      if (!issueId || !proposedFix) continue;
      const risk = rec.risk === "high" || rec.risk === "medium" || rec.risk === "low" ? rec.risk : "medium";
      const confidence =
        rec.confidence === "high" || rec.confidence === "medium" || rec.confidence === "low" ? rec.confidence : "medium";
      items.push({ issueId, source, impactSummary: impactSummary || "Model-suggested follow-up", proposedFix, risk, confidence });
    }
    let summary = heuristic.summary;
    if (typeof o.summaryAddendum === "string" && o.summaryAddendum.trim()) {
      summary = `${summary}\n\n[model augment]\n${o.summaryAddendum.trim().slice(0, 2000)}`;
    }
    return { ...heuristic, items, summary };
  }

  async augmentDesignCritique(
    input: DesignCritiqueContractInput,
    heuristic: DesignCritiqueContractOutput
  ): Promise<DesignCritiqueContractOutput | null> {
    const payload = [
      "Task: augment TSX/code-pattern UI critique with additional issues and suggestions (max 10 issues).",
      `Touched paths: ${input.touchedRelPaths.slice(0, 24).join(", ")}`,
      "Heuristic critique:",
      JSON.stringify(
        {
          designQualityScore: heuristic.designQualityScore,
          designCritiqueSummary: heuristic.designCritiqueSummary.slice(0, 1500),
          improvementSuggestions: heuristic.improvementSuggestions.slice(0, 12)
        },
        null,
        0
      ),
      'Return JSON: { additionalIssues?: Array<{ code: string, severity: "low"|"medium"|"high", note: string }>, additionalSuggestions?: string[], summaryAddendum?: string }'
    ].join("\n\n");

    const o = await this.inferJson("malv_cci_augment_design_critique", payload);
    if (!o) return null;
    const issues = [...heuristic.issues];
    if (Array.isArray(o.additionalIssues)) {
      for (const it of o.additionalIssues.slice(0, 10)) {
        if (!it || typeof it !== "object") continue;
        const rec = it as Record<string, unknown>;
        const code = typeof rec.code === "string" ? rec.code.replace(/[^a-z0-9_]/gi, "_").slice(0, 64) : "model_note";
        const note = typeof rec.note === "string" ? rec.note.trim().slice(0, 1200) : "";
        if (!note) continue;
        const sev = rec.severity === "high" || rec.severity === "medium" || rec.severity === "low" ? rec.severity : "low";
        issues.push({ code: code || "model_note", severity: sev, note });
      }
    }
    const improvementSuggestions = [...heuristic.improvementSuggestions];
    if (Array.isArray(o.additionalSuggestions)) {
      for (const s of o.additionalSuggestions.slice(0, 12)) {
        if (typeof s === "string" && s.trim()) improvementSuggestions.push(`[model] ${s.trim().slice(0, 600)}`);
      }
    }
    let designCritiqueSummary = heuristic.designCritiqueSummary;
    if (typeof o.summaryAddendum === "string" && o.summaryAddendum.trim()) {
      designCritiqueSummary = `${designCritiqueSummary}\n\n[model augment]\n${o.summaryAddendum.trim().slice(0, 2000)}`;
    }
    if (
      issues.length === heuristic.issues.length &&
      improvementSuggestions.length === heuristic.improvementSuggestions.length &&
      designCritiqueSummary === heuristic.designCritiqueSummary
    ) {
      return null;
    }
    return { ...heuristic, issues, improvementSuggestions, designCritiqueSummary };
  }

  async augmentPatchReviewSynthesis(
    input: PatchReviewSynthesisContractInput,
    heuristic: PatchReviewSynthesisContractOutput
  ): Promise<PatchReviewSynthesisContractOutput | null> {
    const payload = [
      "Task: tighten patch review narrative — additive residual risk notes only.",
      `Files: ${input.filesChanged.slice(0, 24).join(", ")}`,
      `Patch summary: ${input.patchSummary.slice(0, 2000)}`,
      "Heuristic review summary:",
      heuristic.reviewSummary.slice(0, 2000),
      "Residual risks:",
      JSON.stringify(
        {
          residualRisks: heuristic.residualRisks.slice(0, 1500),
          residualEngineeringRisks: heuristic.residualEngineeringRisks.slice(0, 1200),
          residualDesignRisks: heuristic.residualDesignRisks.slice(0, 1200)
        },
        null,
        0
      ),
      "Return JSON: { residualRisksAddendum?: string, reviewSummaryAddendum?: string }"
    ].join("\n\n");

    const o = await this.inferJson("malv_cci_augment_patch_review_synthesis", payload);
    if (!o) return null;
    const rAdd = typeof o.residualRisksAddendum === "string" ? o.residualRisksAddendum.trim().slice(0, 2000) : "";
    const sAdd = typeof o.reviewSummaryAddendum === "string" ? o.reviewSummaryAddendum.trim().slice(0, 1500) : "";
    if (!rAdd && !sAdd) return null;
    return {
      ...heuristic,
      residualRisks: rAdd ? `${heuristic.residualRisks}\n\n[model augment]\n${rAdd}` : heuristic.residualRisks,
      reviewSummary: sAdd ? `${heuristic.reviewSummary}\n\n[model augment]\n${sAdd}` : heuristic.reviewSummary
    };
  }
}

@Injectable()
export class BeastWorkerMalvPlanningProvider implements MalvPlanningProvider {
  readonly providerId = "beast_worker_planning";

  constructor(
    private readonly cfg: ConfigService,
    private readonly beastWorker: BeastWorkerClient
  ) {}

  private timeoutMs(): number {
    return inferTimeoutFromConfig(
      (k) => this.cfg.get<string>(k),
      "MALV_CCI_PLANNING_INFER_TIMEOUT_MS",
      60_000
    );
  }

  private async inferJson(promptKey: string, userPayload: string): Promise<Record<string, unknown> | null> {
    const reply = await inferWorkerText({
      beastWorker: this.beastWorker,
      correlationId: randomUUID(),
      systemPrompt: SYSTEM_JSON_ONLY,
      userText: userPayload,
      inferTimeoutMs: this.timeoutMs(),
      promptKey
    });
    if (!reply) return null;
    return parseJsonObject(reply);
  }

  async augmentChangePlan(
    input: ChangePlanningContractInput,
    heuristic: ChangePlanningContractOutput
  ): Promise<ChangePlanningContractOutput | null> {
    const payload = [
      "Task: augment implementation plan text fields only (additive). Do not remove heuristic file lists.",
      `Goal: ${input.requestedGoal.slice(0, 2000)}`,
      "Audit summary (truncated):",
      input.audit.summary.slice(0, 2000),
      "Heuristic plan:",
      JSON.stringify(
        {
          planSummary: heuristic.planSummary.slice(0, 1500),
          implementationStrategy: heuristic.implementationStrategy.slice(0, 1200),
          strategyRationale: heuristic.strategyRationale.slice(0, 1200),
          riskSummary: heuristic.riskSummary.slice(0, 1200),
          testPlan: heuristic.testPlan.slice(0, 800)
        },
        null,
        0
      ),
      "Return JSON: { planSummaryAddendum?: string, implementationStrategyAddendum?: string, strategyRationaleAddendum?: string, riskSummaryAddendum?: string, testPlanAddendum?: string }"
    ].join("\n\n");

    const o = await this.inferJson("malv_cci_augment_change_plan", payload);
    if (!o) return null;
    const add = (base: string, k: string) => {
      const v = o[k];
      if (typeof v !== "string" || !v.trim()) return base;
      return `${base.trim()}\n\n[model augment]\n${v.trim().slice(0, 3000)}`;
    };
    const next = {
      ...heuristic,
      planSummary: add(heuristic.planSummary, "planSummaryAddendum"),
      implementationStrategy: add(heuristic.implementationStrategy, "implementationStrategyAddendum"),
      strategyRationale: add(heuristic.strategyRationale, "strategyRationaleAddendum"),
      riskSummary: add(heuristic.riskSummary, "riskSummaryAddendum"),
      testPlan: add(heuristic.testPlan, "testPlanAddendum")
    };
    if (JSON.stringify(next) === JSON.stringify(heuristic)) return null;
    return next;
  }

  async augmentDesignStrategy(
    input: DesignStrategyContractInput,
    heuristic: DesignStrategyContractOutput
  ): Promise<DesignStrategyContractOutput | null> {
    const vs = heuristic.visualStrategy;
    const payload = [
      "Task: augment visual strategy prose fields only (additive).",
      `Goal: ${input.requestedGoal.slice(0, 2000)}`,
      "Heuristic visual strategy:",
      vs
        ? JSON.stringify({
            visualDirection: vs.visualDirection.slice(0, 800),
            layoutStrategy: vs.layoutStrategy.slice(0, 800),
            interactionStrategy: vs.interactionStrategy.slice(0, 600)
          })
        : "null",
      "Return JSON: { visualDirectionAddendum?: string, layoutStrategyAddendum?: string, interactionStrategyAddendum?: string, animationStrategyAddendum?: string }",
      "If heuristic visualStrategy is null, return empty object {}."
    ].join("\n\n");

    if (!vs) return null;
    const o = await this.inferJson("malv_cci_augment_design_strategy", payload);
    if (!o) return null;
    const mergeField = (base: string, k: string) => {
      const v = o[k];
      if (typeof v !== "string" || !v.trim()) return base;
      return `${base.trim()}\n\n[model augment]\n${v.trim().slice(0, 2000)}`;
    };
    const nextVs = {
      ...vs,
      visualDirection: mergeField(vs.visualDirection, "visualDirectionAddendum"),
      layoutStrategy: mergeField(vs.layoutStrategy, "layoutStrategyAddendum"),
      interactionStrategy: mergeField(vs.interactionStrategy, "interactionStrategyAddendum"),
      animationStrategy: mergeField(vs.animationStrategy, "animationStrategyAddendum")
    };
    if (JSON.stringify(nextVs) === JSON.stringify(vs)) return null;
    return { visualStrategy: nextVs, designBrain: heuristic.designBrain };
  }
}

/**
 * Single entry point for rendered-UI multimodal critique used by {@link PatchReviewService}.
 * Delegates to {@link UiVisualCritiqueService}; returns null when captures are absent (heuristic-only path).
 */
@Injectable()
export class DelegatingRenderedUiVisionCritiqueProvider implements MalvVisionCritiqueProvider {
  readonly providerId = "ui_visual_critique_delegating";

  constructor(private readonly uiVisualCritique: UiVisualCritiqueService) {}

  async augmentRenderedUiCritique(
    input: RenderedUiCritiqueContractInput,
    _heuristic: RenderedUiCritiqueContractOutput
  ): Promise<RenderedUiCritiqueContractOutput | null> {
    const caps = input.captureArtifacts ?? [];
    if (!caps.length) return null;
    const reviewedStates = input.reviewedStates ?? [];
    return this.uiVisualCritique.critiqueScreenshots(caps, {
      touchedSourcePaths: input.touchedSourcePaths,
      stateCoverageSummary: input.stateCoverageSummary ?? undefined,
      reviewedStates: reviewedStates as ReviewedStateRecord[],
      uxScenarioSimulationSummary: input.uxScenarioSimulationSummary ?? undefined
    });
  }
}
