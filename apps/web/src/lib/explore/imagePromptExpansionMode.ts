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

export const PROMPT_EXPANSION_MODE_LABELS: Record<ImagePromptExpansionMode, string> = {
  cinematic: "Cinematic",
  artistic: "Artistic",
  realistic: "Realistic",
  abstract: "Abstract",
  editorial: "Editorial",
  anime: "Anime",
  product: "Product",
  luxury: "Luxury",
  futuristic: "Futuristic"
};
