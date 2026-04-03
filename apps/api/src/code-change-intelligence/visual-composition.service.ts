import { Injectable } from "@nestjs/common";
import type { ChangeAuditResult } from "./change-intelligence.types";
import type { DesignSystemProfile } from "./design-system-profile.types";
import type { DesignTasteEvaluation } from "./design-taste-engine";
import type { VisualCompositionBlueprint } from "./visual-composition.types";

@Injectable()
export class VisualCompositionService {
  /**
   * Decide layout structure, hierarchy, flow, and emphasis before coding.
   */
  compose(args: {
    requestedGoal: string;
    audit: ChangeAuditResult;
    profile: DesignSystemProfile;
    taste: DesignTasteEvaluation;
  }): VisualCompositionBlueprint {
    const goal = args.requestedGoal.toLowerCase();
    const mobileFirst =
      "Mobile: single column, full-width sections, thumb-friendly primary CTA sticky or high in viewport.";

    const layoutStructure = [
      mobileFirst,
      args.profile.layoutStructures.flexHeavy
        ? "Desktop: split hero / supporting rail or two-column md+ where data density warrants it — avoid only centered columns."
        : "Desktop: CSS grid for dashboards; keep one focal column for narrative.",
      "Break symmetry: alternate alignment (left / full-bleed / offset grid) to avoid template feel."
    ].join(" ");

    const hierarchy = [
      "H1 or display title → supporting line → primary CTA row → secondary actions",
      "Section titles at text-lg/xl minimum; body at text-sm/base; captions muted",
      args.profile.typographyScale.hierarchySummary
    ];

    const sectionFlow = [
      "Above fold: value + primary action (no buried CTA)",
      "Mid: proof / detail / secondary tasks",
      "Footer zone: low-emphasis links and meta"
    ];
    if (args.audit.scopeClassification.uxSensitive) {
      sectionFlow.unshift("UX-sensitive scope: minimize steps to primary outcome; avoid competing CTAs.");
    }
    if (/\b(dashboard|table|analytics)\b/.test(goal)) {
      sectionFlow.unshift("Top bar: context + primary action; content: filter row → dense table/cards");
    }

    const componentTree = [
      "Page shell (layout) → sections (spacing) → content blocks → primitives (button, input)",
      args.profile.componentPatterns.labels.join("; ") || "Compose from existing primitives before adding new ones."
    ].join(" ");

    const emphasis: VisualCompositionBlueprint["emphasis"] = {
      areas: {
        primary_narrative: 5,
        primary_cta: 5,
        supporting_copy: 3,
        secondary_actions: 2,
        chrome: 1
      },
      primaryCta: "Single high-contrast button or link; isolate with whitespace — not stacked with five equal cards.",
      notes: `Taste guardrails: ${args.taste.antiPatterns[0]?.slice(0, 80) ?? "avoid generic patterns"}`
    };

    return {
      layoutStructure,
      hierarchy,
      sectionFlow,
      componentTree,
      emphasis
    };
  }
}
