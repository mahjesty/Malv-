/**
 * Reusable product taste + execution constraints for frontend work in MALV.
 * Planning and patch review reference this; it is not generic “AI slop” filler text.
 */
export const MALV_PRODUCT_DESIGN_PROFILE = {
  name: "malv_peak_design_v1",
  principles: [
    "Apple-like clarity: one primary action per view, generous whitespace, restrained chrome.",
    "Stripe-level polish: crisp hierarchy, confident typography, subtle depth—not flat template grids.",
    "Linear/Figma sophistication where dashboards need density: structured rhythm, not clutter.",
    "Mobile-first composition: thumb reach, stable tap targets, no hover-only affordances.",
    "Motion is intentional: short, eased transitions; avoid gratuitous parallax; respect reduced-motion.",
    "Glass/blur/parallax only as accent, never as default layout crutch."
  ],
  motionDefaults: {
    entrance: "opacity + translateY(4–8px), 180–240ms, ease-out; stagger lists lightly.",
    hoverFocus: "subtle scale or border/shadow shift; always paired with focus-visible for keyboard.",
    loading: "skeletons that mirror layout; avoid blocking spinners for <300ms perceived waits.",
    reducedMotion: "replace translation with opacity-only; shorten durations."
  },
  hierarchy: [
    "Establish clear H1/page title → section → card → action ladder before adding ornament.",
    "Contrast for primary CTA vs secondary; avoid same-weight gray buttons everywhere."
  ],
  accessibility: [
    "Visible focus, label controls, sufficient contrast in both light and dark surfaces.",
    "Do not rely on color alone for state; pair with icon or text."
  ]
} as const;

export type ProductDesignProfile = typeof MALV_PRODUCT_DESIGN_PROFILE;
