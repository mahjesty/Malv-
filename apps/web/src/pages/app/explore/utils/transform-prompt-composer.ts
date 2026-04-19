import type { ImageModeCard } from "../components/image-generator/constants";

export type TransformImageMetadata = {
  fileName?: string;
  width?: number;
  height?: number;
};

/** @deprecated reserved for future orientation / exif-aware composition; ignored for now. */
export type ComposeTransformPromptOptions = {
  imageMetadata?: TransformImageMetadata;
  optionalUserContext?: string;
};

const COHESION_SUFFIX = "Keep the image cohesive, intentional, and visually resolved.";

export type ComposeTransformPromptInput = {
  mode: Pick<ImageModeCard, "id" | "category" | "promptTemplate">;
  /** Reserved for future use (e.g. exif hints); does not change output today. */
  sourceImage?: TransformImageMetadata;
  userText?: string | null;
};

/**
 * Builds the API generation string from the mode’s internal `promptTemplate` (never `title`).
 * Transform modes append a consistency suffix; optional user text is folded in when present.
 */
export function composeTransformPrompt(input: ComposeTransformPromptInput): string {
  const template = input.mode.promptTemplate.trim();
  if (!template) return "";

  const userTrim = (input.userText ?? "").trim();

  if (input.mode.category !== "transform") {
    return userTrim ? `${template}\n\n${userTrim}`.trim() : template;
  }

  const parts: string[] = [template];
  if (userTrim) parts.push(userTrim);
  parts.push(COHESION_SUFFIX);
  return parts.join("\n\n");
}
