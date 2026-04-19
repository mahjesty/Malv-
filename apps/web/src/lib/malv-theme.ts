/**
 * MALV design foundation — semantic tokens aligned with `src/styles/malv.css`.
 * Prefer Tailwind utilities (`malv-f-gold`, `malv-f-live`) in components; use this
 * for programmatic styling, documentation, and shared constants.
 */

export const malvFoundationCssVars = {
  goldRgb: "--malv-f-gold-rgb",
  liveRgb: "--malv-f-live-rgb",
  surfaceRgb: "--malv-f-surface-rgb",
  surfaceHiRgb: "--malv-f-surface-hi-rgb",
  ringLiveRgb: "--malv-f-ring-live-rgb"
} as const;

export type MalvFoundationCssVar =
  (typeof malvFoundationCssVars)[keyof typeof malvFoundationCssVars];

/** Inline style helpers — `rgb(var(--x) / a)` */
export function malvRgbVar(varName: MalvFoundationCssVar, alpha = 1): string {
  return `rgb(var(${varName}) / ${alpha})`;
}

export const malvFoundation = {
  intent: {
    /** Authority, selection, premium CTA — use sparingly */
    premium: "gold" as const,
    /** Hover, focus, live / intelligent energy */
    interaction: "live" as const
  },
  motion: {
    /** Fast, calm easing — no bounce */
    easeOut: [0.22, 1, 0.36, 1] as const,
    duration: {
      xs: 0.14,
      sm: 0.18,
      md: 0.22
    }
  },
  radius: {
    /** Premium, not toy-like */
    control: "0.75rem",
    card: "1rem",
    panel: "1.25rem"
  }
} as const;
