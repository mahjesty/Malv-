/** Inferred visual attributes (all optional — MALV fills what it can). */
export type ImageInferredAttributes = {
  style?: string;
  mood?: string;
  lighting?: string;
  composition?: string;
  detail?: string;
};

/** Output of {@link ImageIntentService}. */
export type ImageInterpretation = {
  refinedPrompt: string;
  /** Original user text before expansion (same as request prompt when non-empty). */
  userPrompt?: string;
  inferred: ImageInferredAttributes;
  confidence: number;
};
