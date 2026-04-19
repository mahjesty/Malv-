export const IMAGE_PROMPT_EXPANSION_MODES = [
  "cinematic",
  "artistic",
  "realistic",
  "abstract",
  "editorial",
  "anime",
  "product",
  "luxury",
  "futuristic"
] as const;

export type ImagePromptExpansionMode = (typeof IMAGE_PROMPT_EXPANSION_MODES)[number];

export function isImagePromptExpansionMode(v: string): v is ImagePromptExpansionMode {
  return (IMAGE_PROMPT_EXPANSION_MODES as readonly string[]).includes(v);
}

/** When a source image is present and the brief is already this long, keep client text verbatim (templates). */
export const IMAGE_BRIEF_VERBATIM_MIN_CHARS = 120;
