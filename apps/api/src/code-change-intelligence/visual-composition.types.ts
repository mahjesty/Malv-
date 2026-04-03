/**
 * Planned structure before implementation (Design Brain V2).
 */
export type VisualEmphasisMap = {
  /** area id → priority 1–5 */
  areas: Record<string, number>;
  primaryCta: string;
  notes: string;
};

export type VisualCompositionBlueprint = {
  layoutStructure: string;
  hierarchy: string[];
  sectionFlow: string[];
  componentTree: string;
  emphasis: VisualEmphasisMap;
};
