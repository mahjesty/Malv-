/**
 * Structured output from scanning the repo for design tokens and patterns (Design Brain V2).
 */
export type DesignSystemProfile = {
  profileVersion: string;
  scannedFileCount: number;
  scanRoots: string[];
  spacingScale: {
    /** Most frequent numeric Tailwind spacing steps (gap/p/m). */
    dominantSteps: number[];
    rhythmSummary: string;
  };
  typographyScale: {
    /** Observed text-* steps */
    textSteps: string[];
    hierarchySummary: string;
  };
  colorTokens: {
    /** Sample of recurring semantic color classes */
    samples: string[];
    themingSummary: string;
  };
  radiusShadow: {
    roundedSamples: string[];
    shadowSamples: string[];
    blurGlassSignals: boolean;
    summary: string;
  };
  componentPatterns: {
    /** Heuristic labels e.g. "Button usage", "Card-like surfaces" */
    labels: string[];
  };
  layoutStructures: {
    flexHeavy: boolean;
    gridHeavy: boolean;
    summary: string;
  };
};
