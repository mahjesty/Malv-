import { Injectable } from "@nestjs/common";
import type {
  BugDetectionResult,
  FixConfidence,
  FixPlanningResult,
  FixRisk,
  PerformanceIntelResult
} from "./malv-intelligence.types";

const PIPELINE_POLICY =
  "All automated fixes must go through the change intelligence pipeline (audit → plan → implement → verify → review). Direct repo mutation outside this flow is disallowed.";

@Injectable()
export class FixPlanningService {
  /**
   * Turn detected issues into actionable fix proposals with risk and confidence (heuristic).
   */
  plan(args: { bugs: BugDetectionResult; perf: PerformanceIntelResult }): FixPlanningResult {
    const items: FixPlanningResult["items"] = [];

    for (const b of args.bugs.issues) {
      const { risk, confidence, fix } = this.classifyBug(b.category, b.severity, b.message);
      items.push({
        issueId: b.id,
        source: "bug",
        impactSummary: `${b.file}: ${b.message}`,
        proposedFix: fix,
        risk,
        confidence
      });
    }

    for (const p of args.perf.issues) {
      items.push({
        issueId: p.id,
        source: "performance",
        impactSummary: `${p.file}: ${p.message}`,
        proposedFix: p.suggestion,
        risk: p.severity === "high" ? "medium" : "low",
        confidence: p.severity === "medium" ? "medium" : "low"
      });
    }

    const summary =
      items.length === 0
        ? "Fix planning: no issues to triage."
        : `Fix planning: ${items.length} proposal(s); execute only via change pipeline with review.`;

    return {
      items: items.slice(0, 40),
      pipelinePolicy: PIPELINE_POLICY,
      summary
    };
  }

  private classifyBug(
    category: string,
    severity: string,
    message: string
  ): { risk: FixRisk; confidence: FixConfidence; fix: string } {
    if (category === "unsafe_pattern" || severity === "high") {
      return {
        risk: "high",
        confidence: "medium",
        fix: `Replace unsafe construct with typed, validated alternative; add tests; ${message}`
      };
    }
    if (category === "type_inconsistency") {
      return {
        risk: "low",
        confidence: "high",
        fix: "Introduce precise types or generics; remove `any` / replace `@ts-ignore` with safe narrowing."
      };
    }
    if (category === "risky_async") {
      return {
        risk: "medium",
        confidence: "medium",
        fix: "Refactor async control flow: use for-await, Promise.all, or explicit queue; add error boundaries."
      };
    }
    if (category === "duplicated_logic") {
      return {
        risk: "low",
        confidence: "medium",
        fix: "Extract shared helper or small module; add unit test for extracted behavior."
      };
    }
    return {
      risk: "low",
      confidence: "low",
      fix: "Review locally; add logging/tests before merge."
    };
  }
}
