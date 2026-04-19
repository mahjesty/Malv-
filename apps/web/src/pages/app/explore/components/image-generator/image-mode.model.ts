import type { GuidedFlowField, ImageModeCard, ImageModeCategory, ImageModeLaunchBehavior } from "./constants";

export type ImageModeGuidedField = {
  key: string;
  label: string;
  type: "text" | "select" | "textarea";
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

export type ImageMode = {
  id: string;
  title: string;
  category: ImageModeCategory;
  requiresUpload: boolean;
  previewImage: string;
  promptTemplate: string;
  guidedConfig?: { fields: ImageModeGuidedField[] };
  launchBehavior: ImageModeLaunchBehavior;
};

function guidedFieldsFromCard(fields: readonly GuidedFlowField[]): ImageModeGuidedField[] {
  return fields.map((f) => ({
    key: f.id,
    label: f.label,
    type: "text" as const,
    required: true,
    placeholder: f.placeholder
  }));
}

/** Normalized mode config for launcher + thread routing (derived from gallery cards). */
export function imageModeFromCard(card: ImageModeCard): ImageMode {
  return {
    id: card.id,
    title: card.title,
    category: card.category,
    requiresUpload: card.requiresUpload,
    previewImage: card.previewImage,
    promptTemplate: card.promptTemplate,
    guidedConfig: card.guidedFields?.length ? { fields: guidedFieldsFromCard(card.guidedFields) } : undefined,
    launchBehavior: card.launchBehavior
  };
}

export function pickLaunchForCard(card: ImageModeCard): ImageModeLaunchBehavior {
  return card.launchBehavior;
}
