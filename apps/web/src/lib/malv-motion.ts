import type { Transition } from "motion/react";

import { malvFoundation } from "./malv-theme";

const { easeOut, duration } = malvFoundation.motion;

/** Default transition for MALV micro-interactions */
export const malvTransition: Transition = {
  duration: duration.sm,
  ease: easeOut
};

export const malvTransitionFast: Transition = {
  duration: duration.xs,
  ease: easeOut
};

/** Subtle hover lift (pixels) — pair with `useReducedMotion()` in components */
export const malvHoverLiftY = -1;

/** Slightly stronger lift for cards */
export const malvCardHoverLiftY = -2;

/** Gentle press — no exaggerated squash */
export const malvTapScale = 0.985;

/** Opacity fade for entrances */
export const malvRevealHidden = { opacity: 0, y: 6 };
export const malvRevealVisible = { opacity: 1, y: 0 };

export const malvRevealTransition: Transition = {
  duration: duration.md,
  ease: easeOut
};
