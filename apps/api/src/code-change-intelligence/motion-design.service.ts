import { Injectable } from "@nestjs/common";
import type { DesignSystemProfile } from "./design-system-profile.types";
import type { VisualCompositionBlueprint } from "./visual-composition.types";
import type { MotionDesignPlan } from "./motion-design.types";
import { MALV_PRODUCT_DESIGN_PROFILE } from "./product-design-profile";

@Injectable()
export class MotionDesignService {
  /**
   * Subtle motion plan: entrance, hover, transitions, loading — performance-first.
   */
  plan(args: { profile: DesignSystemProfile; composition: VisualCompositionBlueprint }): MotionDesignPlan {
    const md = MALV_PRODUCT_DESIGN_PROFILE.motionDefaults;
    const hasFramer = args.profile.componentPatterns.labels.some((l) => /framer|motion/i.test(l));

    return {
      entrance: `${md.entrance} Stagger list items ≤3 at 40–60ms offset; avoid animating large layout properties.`,
      hoverFocus: md.hoverFocus,
      transitions: "Prefer transition-[transform,opacity] 150–220ms; avoid animating width/height/margin.",
      loading: md.loading,
      microInteractions: "Button press: subtle scale 0.98 or border shift; inputs: focus ring, not color-only.",
      reducedMotion: md.reducedMotion,
      performanceNotes: [
        "GPU-friendly: transform + opacity only on animated layers.",
        "Cap simultaneous animations; defer below-the-fold motion.",
        hasFramer ? "Framer present — use layout animations only for meaningful hierarchy changes." : "CSS-first motion keeps bundle lean.",
        "Degrade: @media (prefers-reduced-motion: reduce) → opacity-only, shorter durations."
      ].join(" ")
    };
  }
}
