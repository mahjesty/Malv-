import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import type { RenderedCaptureArtifact } from "./rendered-ui-review.service";
import type { ReviewedStateRecord } from "./ui-state-capture-plan";

export type UiVisualCritiqueIssue = {
  code: string;
  severity: "low" | "medium" | "high";
  note: string;
};

export type UsabilityIssue = UiVisualCritiqueIssue;

export type UiVisualCritiqueResult = {
  /** True only when vision returned a parseable score + summary grounded in screenshots. */
  renderedReviewAvailable: boolean;
  skipReason?: string;
  visualQualityScore: number | null;
  visualCritiqueSummary: string | null;
  issues: UiVisualCritiqueIssue[];
  suggestions: string[];
  /** Model-assessed risks across UI states; may be null if omitted or unavailable. */
  stateAwareDesignRisks: string | null;
  /** Product / usability layer; null when model omitted or not applicable. */
  uxQualityScore: number | null;
  userExperienceSummary: string | null;
  frictionAnalysis: string | null;
  usabilityIssues: UsabilityIssue[];
  frictionPoints: string[];
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

@Injectable()
export class UiVisualCritiqueService {
  private readonly logger = new Logger(UiVisualCritiqueService.name);

  constructor(
    private readonly cfg: ConfigService,
    private readonly beastWorker: BeastWorkerClient
  ) {}

  private visionEnabled(): boolean {
    const v = (this.cfg.get<string>("MALV_UI_VISION_CRITIQUE") ?? "1").toLowerCase().trim();
    return v !== "0" && v !== "false" && v !== "no";
  }

  private inferTimeoutMs(): number {
    const n = Number(this.cfg.get<string>("MALV_UI_VISION_INFER_TIMEOUT_MS") ?? 90_000);
    if (!Number.isFinite(n)) return 90_000;
    return Math.max(15_000, Math.min(180_000, Math.floor(n)));
  }

  /**
   * Multimodal critique of captured screenshots. Does not invent pixels — if the worker response
   * is not valid JSON with required fields, returns renderedReviewAvailable=false.
   */
  async critiqueScreenshots(
    artifacts: RenderedCaptureArtifact[],
    ctx: {
      touchedSourcePaths?: string[];
      stateCoverageSummary?: string;
      reviewedStates?: ReviewedStateRecord[];
      uxScenarioSimulationSummary?: string;
    }
  ): Promise<UiVisualCritiqueResult> {
    const empty = (skipReason: string): UiVisualCritiqueResult => ({
      renderedReviewAvailable: false,
      skipReason,
      visualQualityScore: null,
      visualCritiqueSummary: null,
      issues: [],
      suggestions: [],
      stateAwareDesignRisks: null,
      uxQualityScore: null,
      userExperienceSummary: null,
      frictionAnalysis: null,
      usabilityIssues: [],
      frictionPoints: []
    });

    if (!this.visionEnabled()) {
      return empty("MALV_UI_VISION_CRITIQUE_disabled");
    }
    if (!artifacts.length) {
      return empty("no_screenshot_artifacts");
    }

    const coverage = ctx.stateCoverageSummary ?? "(not provided)";
    const scenarioBlock = ctx.uxScenarioSimulationSummary ?? "(not provided)";
    const stateAttemptLines =
      (ctx.reviewedStates ?? [])
        .slice(0, 24)
        .map((r) => `${r.uiState}@${r.viewport}/${r.colorScheme}:${r.captured ? "captured" : `skipped(${r.skipReason ?? "?"})`}`)
        .join("\n") || "(none)";

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: [
          "You are MALV product + UX reviewer (not only visual design). Analyze ONLY what is visible in the attached screenshots.",
          "Each image label includes: route path, viewport (desktop or mobile), uiState (default, loading, empty, error, interaction_hover, interaction_focus), colorScheme.",
          "Capture coverage summary (honest; may say only default states were proven):",
          coverage,
          "UX scenario simulation (how captures map to journeys — do not invent flows beyond this):",
          scenarioBlock,
          "State attempt log:",
          stateAttemptLines,
          "",
          "Touched source paths (context only):",
          (ctx.touchedSourcePaths ?? []).slice(0, 12).join(", ") || "(none)",
          "",
          "Multi-state UI review — only for states present in screenshots:",
          "- default (settled)",
          "- loading (if captured)",
          "- empty (if captured)",
          "- error (if captured)",
          "- interaction_hover / interaction_focus (if captured)",
          "- mobile vs desktop when both appear",
          "",
          "Visual / design (as before): state consistency, hierarchy, spacing, CTA prominence, density, theme/contrast.",
          "",
          "Product experience (skip honestly if not visible — say 'Not assessable from screenshots.' in prose fields):",
          "- Does this feature or screen feel complete for the job it appears to serve?",
          "- Is onboarding / first-use guidance clear (only if first-time or empty states are evidenced)?",
          "- Are interactions intuitive (labels, affordances, next step obvious)?",
          "- usabilityIssues: UX problems (confusing copy, missing feedback, dead ends, unclear primary action) — not just pixels.",
          "- frictionPoints: short strings for hesitation, extra steps, or cognitive load visible in UI.",
          "",
          "Return a single JSON object ONLY (no markdown fences) with keys:",
          "{",
          '  "visualQualityScore": <integer 0-100>,',
          '  "visualCritiqueSummary": <string, 2-8 sentences, cite which states you saw>,',
          '  "stateAwareDesignRisks": <string, 1-4 sentences: gaps between states, unproven areas, or say "None obvious from captured states.">,',
          '  "issues": [ { "code": "snake_case", "severity": "low"|"medium"|"high", "note": "..." } ],',
          '  "suggestions": [ "..." ],',
          '  "uxQualityScore": <integer 0-100, usability + flow + clarity from visible evidence only>,',
          '  "userExperienceSummary": <string, 2-10 sentences: product-level read; include completeness / onboarding / intuitiveness only when assessable>,',
          '  "frictionAnalysis": <string, 2-8 sentences on friction from visible UI; or "Not assessable from screenshots.">,',
          '  "usabilityIssues": [ { "code": "snake_case", "severity": "low"|"medium"|"high", "note": "..." } ],',
          '  "frictionPoints": [ "..." ]',
          "}",
          "Do not claim you saw a state that is not represented in screenshots.",
          "Do not invent loading/empty/error/hover/focus behavior that is not shown.",
          "If only default/settled states were captured, say that explicitly in stateAwareDesignRisks and keep UX assessments conservative."
        ].join("\n")
      }
    ];

    for (const a of artifacts.slice(0, 8)) {
      userContent.push({
        type: "text",
        text: `Screenshot route=${a.routePath} viewport=${a.viewport} uiState=${a.uiState} colorScheme=${a.colorScheme ?? "light"}`
      });
      userContent.push({
        type: "image_url",
        image_url: { url: a.imageDataUrl }
      });
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.inferTimeoutMs());
    let reply = "";
    try {
      const worker = await this.beastWorker.infer({
        mode: "beast",
        prompt: "malv_ui_visual_critique_state_aware",
        context: {
          malvPromptAlreadyExpanded: true,
          malvOperatorMode: "analyze",
          malvInferenceBackend: "openai_compatible",
          messages: [
            {
              role: "system",
              content:
                "You output strict JSON only for UI and UX critique. Never fabricate UI elements, states, or user flows not visible in provided screenshots. Use 'Not assessable from screenshots.' when product-level questions cannot be answered from pixels."
            },
            { role: "user", content: userContent }
          ],
          inputMode: "image",
          videoVision: true
        },
        signal: ac.signal
      });
      reply = worker.reply ?? "";
    } catch (e) {
      this.logger.warn(`UI vision critique infer failed: ${e instanceof Error ? e.message : String(e)}`);
      return empty("vision_infer_failed");
    } finally {
      clearTimeout(timer);
    }

    const parsed = this.parseCritiqueJson(reply);
    if (!parsed) {
      return empty("vision_response_unparseable");
    }

    return {
      renderedReviewAvailable: true,
      visualQualityScore: parsed.visualQualityScore,
      visualCritiqueSummary: parsed.visualCritiqueSummary,
      issues: parsed.issues,
      suggestions: parsed.suggestions,
      stateAwareDesignRisks: parsed.stateAwareDesignRisks,
      uxQualityScore: parsed.uxQualityScore,
      userExperienceSummary: parsed.userExperienceSummary,
      frictionAnalysis: parsed.frictionAnalysis,
      usabilityIssues: parsed.usabilityIssues,
      frictionPoints: parsed.frictionPoints
    };
  }

  private parseCritiqueJson(raw: string): {
    visualQualityScore: number;
    visualCritiqueSummary: string;
    stateAwareDesignRisks: string | null;
    issues: UiVisualCritiqueIssue[];
    suggestions: string[];
    uxQualityScore: number | null;
    userExperienceSummary: string | null;
    frictionAnalysis: string | null;
    usabilityIssues: UsabilityIssue[];
    frictionPoints: string[];
  } | null {
    const text = raw.trim();
    if (!text) return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] ?? text).trim();
    try {
      const o = JSON.parse(candidate) as Record<string, unknown>;
      const scoreRaw = o.visualQualityScore;
      if (typeof scoreRaw !== "number" || !Number.isFinite(scoreRaw)) return null;
      const visualQualityScore = Math.round(clamp(scoreRaw, 0, 100));
      const visualCritiqueSummary =
        typeof o.visualCritiqueSummary === "string" ? o.visualCritiqueSummary.trim().slice(0, 4000) : "";
      if (!visualCritiqueSummary) return null;

      let stateAwareDesignRisks: string | null = null;
      if (typeof o.stateAwareDesignRisks === "string" && o.stateAwareDesignRisks.trim()) {
        stateAwareDesignRisks = o.stateAwareDesignRisks.trim().slice(0, 2000);
      }

      const issues: UiVisualCritiqueIssue[] = [];
      if (Array.isArray(o.issues)) {
        for (const it of o.issues.slice(0, 24)) {
          if (!it || typeof it !== "object") continue;
          const rec = it as Record<string, unknown>;
          const code = typeof rec.code === "string" ? rec.code.replace(/[^a-z0-9_]/gi, "_").slice(0, 64) : "issue";
          const note = typeof rec.note === "string" ? rec.note.trim().slice(0, 1200) : "";
          if (!note) continue;
          const sev = rec.severity === "high" || rec.severity === "medium" || rec.severity === "low" ? rec.severity : "low";
          issues.push({ code: code || "issue", severity: sev, note });
        }
      }

      const suggestions: string[] = [];
      if (Array.isArray(o.suggestions)) {
        for (const s of o.suggestions.slice(0, 20)) {
          if (typeof s === "string" && s.trim()) suggestions.push(s.trim().slice(0, 800));
        }
      }

      let uxQualityScore: number | null = null;
      const uxRaw = o.uxQualityScore;
      if (typeof uxRaw === "number" && Number.isFinite(uxRaw)) {
        uxQualityScore = Math.round(clamp(uxRaw, 0, 100));
      }

      let userExperienceSummary: string | null = null;
      if (typeof o.userExperienceSummary === "string" && o.userExperienceSummary.trim()) {
        userExperienceSummary = o.userExperienceSummary.trim().slice(0, 4500);
      }

      let frictionAnalysis: string | null = null;
      if (typeof o.frictionAnalysis === "string" && o.frictionAnalysis.trim()) {
        frictionAnalysis = o.frictionAnalysis.trim().slice(0, 3500);
      }

      const usabilityIssues: UsabilityIssue[] = [];
      if (Array.isArray(o.usabilityIssues)) {
        for (const it of o.usabilityIssues.slice(0, 24)) {
          if (!it || typeof it !== "object") continue;
          const rec = it as Record<string, unknown>;
          const code = typeof rec.code === "string" ? rec.code.replace(/[^a-z0-9_]/gi, "_").slice(0, 64) : "usability";
          const note = typeof rec.note === "string" ? rec.note.trim().slice(0, 1200) : "";
          if (!note) continue;
          const sev = rec.severity === "high" || rec.severity === "medium" || rec.severity === "low" ? rec.severity : "low";
          usabilityIssues.push({ code: code || "usability", severity: sev, note });
        }
      }

      const frictionPoints: string[] = [];
      if (Array.isArray(o.frictionPoints)) {
        for (const s of o.frictionPoints.slice(0, 24)) {
          if (typeof s === "string" && s.trim()) frictionPoints.push(s.trim().slice(0, 500));
        }
      }

      return {
        visualQualityScore,
        visualCritiqueSummary,
        stateAwareDesignRisks,
        issues,
        suggestions,
        uxQualityScore,
        userExperienceSummary,
        frictionAnalysis,
        usabilityIssues,
        frictionPoints
      };
    } catch {
      return null;
    }
  }
}
