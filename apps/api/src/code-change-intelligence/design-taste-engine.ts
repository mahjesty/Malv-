import { Injectable } from "@nestjs/common";
import type { DesignSystemProfile } from "./design-system-profile.types";
import { MALV_PRODUCT_DESIGN_PROFILE } from "./product-design-profile";

export type DesignTasteEvaluation = {
  /** Short bullet lines for planning prompts */
  principlesApplied: string[];
  antiPatterns: string[];
  tasteSummary: string;
};

/**
 * Product taste rules: Apple-like clarity, Stripe polish, Linear/Figma dashboards, restrained motion.
 */
@Injectable()
export class DesignTasteEngine {
  evaluate(profile: DesignSystemProfile): DesignTasteEvaluation {
    const principlesApplied = [
      ...MALV_PRODUCT_DESIGN_PROFILE.principles.slice(0, 4),
      "Strong hierarchy: no single visual plane — vary weight, size, and whitespace before adding chrome.",
      "Primary action must read first — isolate CTA with contrast and spacing, not more cards.",
      "Spacing must breathe — section padding > inline gap; avoid cramped flex-col stacks."
    ];

    const antiPatterns: string[] = [
      "Centered-card spam: repeated max-w + mx-auto + justify-center without section rhythm.",
      "Flat UI: uniform gray buttons, no heading ladder, no emphasis map.",
      "Clutter: dense grids without focal column; too many equal-weight panels.",
      "Gratuitous motion: parallax, long springs, or animation without reduced-motion fallback."
    ];

    if (profile.spacingScale.dominantSteps.length === 1 && profile.spacingScale.dominantSteps[0] === 4) {
      antiPatterns.push("Monotonous spacing (mostly gap-4) — vary ladder for premium rhythm.");
    }
    if (!profile.radiusShadow.blurGlassSignals) {
      principlesApplied.push("Depth via typography and spacing first; add blur/glass only as accent.");
    }

    const tasteSummary = [
      `Taste: ${MALV_PRODUCT_DESIGN_PROFILE.name}`,
      profile.layoutStructures.flexHeavy ? "Layout bias: flex stacks — use asymmetric bands or full-bleed to break generic centers." : "",
      profile.typographyScale.textSteps.length < 3 ? "Typography: widen scale steps for clearer hierarchy." : ""
    ]
      .filter(Boolean)
      .join(" ");

    return { principlesApplied, antiPatterns, tasteSummary };
  }
}
