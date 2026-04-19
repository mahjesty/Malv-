import type { ImagePromptExpansionMode } from "./image-prompt-expansion.constants";
import { isImagePromptExpansionMode } from "./image-prompt-expansion.constants";

/** Alias for clarity in product docs — expansion presets are shared with API `promptExpansionMode`. */
export type ImageGenerationMode = ImagePromptExpansionMode;

/** Structured internal layers for deterministic prompt composition (hidden from UI labels). */
export type PromptTemplateConfig = {
  style: string;
  composition: string;
  quality: string;
  atmosphere: string;
};

export type PromptIntelligenceResolutionSource =
  | "api_prompt_expansion_mode"
  | "mode_id_exact"
  | "mode_id_heuristic"
  | "balanced_fallback";

export type PromptExpansionDebugMeta = {
  resolvedMode: ImagePromptExpansionMode | null;
  resolutionSource: PromptIntelligenceResolutionSource;
};

export type PromptExpansionResult = {
  /** User-visible brief (unchanged raw intent). */
  displayPrompt: string;
  /** Working brief passed into downstream expansion / generation. */
  expandedPrompt: string;
  /** Internal-only; omit from HTTP responses unless explicitly enabled. */
  debug: PromptExpansionDebugMeta;
};

const BALANCED_LAYERS: PromptTemplateConfig = {
  style:
    "Stay faithful to the described subject and intent without forcing a genre onto the idea.",
  composition: "Use a clear focal hierarchy, readable spatial structure, and purposeful negative space.",
  quality:
    "Keep edge behavior believable and detail scale honest—sharp where it matters, soft where light falls away.",
  atmosphere:
    "Motivate light and air from the scene itself; avoid generic stock adjectives and duplicated hype."
};

const MODE_TEMPLATES: Record<ImagePromptExpansionMode, PromptTemplateConfig> = {
  cinematic: {
    style:
      "Widescreen photographic language with graded color, lens-aware depth, and sequence-ready framing.",
    composition:
      "Premium framing with a decisive focal read; balance subject weight against negative space like a graded film still.",
    quality:
      "Fine grain structure, clean highlight roll-off, and tactile surfaces at a believable resolution.",
    atmosphere:
      "Motivated light that sculpts form with volumetric air and restrained atmosphere—film grammar, not filter clichés."
  },
  realistic: {
    style:
      "Optical documentary realism: believable materials, natural imperfections, and light that behaves truthfully.",
    composition:
      "Ground the subject in real space with a credible camera distance and environmental context.",
    quality:
      "High-frequency detail where it belongs; restrained sharpening; no plastic skin or wax highlights unless requested.",
    atmosphere:
      "Ambient light tied to time-of-day and place; subtle depth cues instead of flat studio default."
  },
  anime: {
    style:
      "Refined cel-animation language: clean shapes, disciplined linework, and cinematic color separation.",
    composition:
      "Graphic clarity and a readable silhouette with intentional negative space—broadcast-grade polish, not a rough filter.",
    quality:
      "Controlled highlights and tiered shading; cohesive finish without muddy gradients or noisy textures.",
    atmosphere:
      "Light models form through hue and value shifts; mood stays specific to the scene rather than generic sparkle."
  },
  product: {
    style:
      "Premium commercial product photography with material truth and launch-deck restraint.",
    composition:
      "Hero framing with measured negative space, believable contact shadows, and reflections kept material-accurate.",
    quality:
      "Edge integrity and surface fidelity; crisp speculars without overcooking or artificial HDR glow.",
    atmosphere:
      "Quiet studio or environmental context that supports the object—never competing with the hero read."
  },
  luxury: {
    style:
      "Editorial luxury minimalism: expensive restraint, quiet confidence, and museum-clean surfaces.",
    composition:
      "Asymmetric balance with generous negative space; margins feel intentional and presentation-ready.",
    quality:
      "Subtle tonal separation and tactile finesse—refined, never gaudy or over-gilded.",
    atmosphere:
      "Soft directional light with disciplined contrast; hush and precision over spectacle."
  },
  futuristic: {
    style:
      "Advanced contemporary futurism: sleek planes, engineered materials, and believable large-scale clarity.",
    composition:
      "Architectural perspective and layered depth; geometry and line lead the eye instead of clutter.",
    quality:
      "Clean specular control and high-clarity rendering without videogame plastic or neon soup.",
    atmosphere:
      "Cool-to-neutral palette with rare accent chroma; subtle haze for scale, kept controlled and premium."
  },
  artistic: {
    style:
      "Fine-art intention: medium-aware behavior, deliberate mark-making, and coherent color relationships.",
    composition: "Gallery-aware framing with spatial tension that supports the concept, not decoration.",
    quality:
      "Material honesty for paint, ink, or mixed media—avoid accidental digital smoothness unless intended.",
    atmosphere: "Mood carried through palette and edge quality; evocative without melodrama."
  },
  abstract: {
    style:
      "Non-literal form language: rhythm of shape, calibrated color fields, and texture cadence tied to user intent.",
    composition:
      "Balance through mass and line; focal pull without forcing a literal subject when abstraction is the goal.",
    quality: "Coherent surface logic; resist muddy overlap and accidental noise reads.",
    atmosphere:
      "Depth implied through layering and translucency rather than literal environment painting."
  },
  editorial: {
    style:
      "Magazine and lookbook discipline: confident styling and contemporary art direction.",
    composition:
      "Negative space as a designed element; a single, unmistakable hero read.",
    quality: "Print-ready clarity; fabric and skin rendered with tasteful, modern editorial finish.",
    atmosphere:
      "Controlled studio or location light—polished, human, and intentional."
  }
};

/**
 * Explore image `modeId` → expansion preset. User-facing card titles stay in the UI; this map is server-only.
 */
const MODE_ID_TO_EXPANSION: Record<string, ImagePromptExpansionMode> = {
  // Prompt ideas
  "neon-cyberpunk-city": "futuristic",
  "cinematic-desert": "cinematic",
  "underwater-ruins": "realistic",
  "futuristic-skyline": "futuristic",
  "golden-hour-portrait": "realistic",
  "editorial-fashion-frame": "editorial",
  // Guided
  "guided-product-photo": "product",
  "guided-character-poster": "cinematic",
  "guided-album-cover": "artistic",
  "guided-social-campaign": "editorial",
  "guided-moodboard-scene": "artistic",
  "guided-brand-concept": "luxury",
  // Transforms (representative set)
  "anime-transform": "anime",
  "anamorphic-cinema-transform": "cinematic",
  "vintage-film-transform": "cinematic",
  "neon-metropolis-transform": "cinematic",
  "studio-product-keyshot-transform": "product",
  "gold-statue-transform": "luxury",
  "marble-sculpture-transform": "luxury",
  "holographic-iridescent-transform": "futuristic",
  "subsurface-3d-render-transform": "futuristic",
  "paparazzi-style-transform": "editorial",
  "double-exposure-transform": "artistic",
  "crayon-illustration": "artistic",
  "watercolor-portrait-transform": "artistic",
  "oil-painting-transform": "artistic",
  "chiaroscuro-master-transform": "artistic",
  "infrared-false-color-transform": "abstract",
  "cloud-sculpture-transform": "artistic",
  "flower-petal-transform": "artistic",
  "alpine-peak-transform": "realistic",
  "deep-ocean-transform": "realistic",
  "enchanted-forest-transform": "cinematic",
  "aurora-night-transform": "cinematic",
  "golden-hour-transform": "realistic",
  "remove-background": "realistic",
  "tilt-shift-miniature-transform": "realistic",
  "caricature-transform": "artistic"
};

function composeLayeredPrompt(raw: string, layers: PromptTemplateConfig, hasSourceImage: boolean): string {
  const base = raw.trim();
  const body = [layers.style, layers.composition, layers.quality, layers.atmosphere].join(" ");
  const transformGuard = hasSourceImage
    ? " Preserve the source subject's identity, silhouette, and defining structure unless the brief explicitly directs otherwise."
    : "";
  return `${base} ${body}${transformGuard}`.replace(/\s+/g, " ").trim();
}

export function resolvePromptExpansionFromContext(args: {
  modeId?: string | null;
  promptExpansionMode?: ImagePromptExpansionMode | null;
}): { mode: ImagePromptExpansionMode | null; source: PromptIntelligenceResolutionSource } {
  const explicit = args.promptExpansionMode?.trim() ?? "";
  if (explicit && isImagePromptExpansionMode(explicit)) {
    return { mode: explicit, source: "api_prompt_expansion_mode" };
  }

  const id = args.modeId?.trim().toLowerCase() ?? "";
  if (!id) {
    return { mode: null, source: "balanced_fallback" };
  }

  const exact = MODE_ID_TO_EXPANSION[id];
  if (exact) {
    return { mode: exact, source: "mode_id_exact" };
  }

  if (id.includes("anime")) return { mode: "anime", source: "mode_id_heuristic" };
  if (id.includes("product") || id.includes("keyshot")) return { mode: "product", source: "mode_id_heuristic" };
  if (id.includes("cinematic") || id.includes("anamorphic") || id.includes("film")) {
    return { mode: "cinematic", source: "mode_id_heuristic" };
  }
  if (id.includes("futuristic") || id.includes("holographic") || id.includes("cyberpunk") || id.includes("megacity")) {
    return { mode: "futuristic", source: "mode_id_heuristic" };
  }
  if (id.includes("luxury") || id.includes("marble") || id.includes("gold-statue")) {
    return { mode: "luxury", source: "mode_id_heuristic" };
  }
  if (id.includes("editorial") || id.includes("fashion") || id.includes("paparazzi")) {
    return { mode: "editorial", source: "mode_id_heuristic" };
  }
  if (id.includes("abstract") || id.includes("infrared")) return { mode: "abstract", source: "mode_id_heuristic" };
  if (id.includes("watercolor") || id.includes("oil-painting") || id.includes("crayon") || id.includes("illustration")) {
    return { mode: "artistic", source: "mode_id_heuristic" };
  }

  return { mode: null, source: "balanced_fallback" };
}

/**
 * Deterministic prompt intelligence: layers user intent with hidden mode directives for downstream model expansion.
 */
export function expandImagePromptIntelligence(args: {
  rawUserPrompt: string;
  modeId?: string | null;
  promptExpansionMode?: ImagePromptExpansionMode | null;
  hasSourceImage: boolean;
}): PromptExpansionResult {
  const displayPrompt = args.rawUserPrompt.trim();
  const { mode, source } = resolvePromptExpansionFromContext({
    modeId: args.modeId,
    promptExpansionMode: args.promptExpansionMode
  });

  const layers = mode ? MODE_TEMPLATES[mode] : BALANCED_LAYERS;
  const expandedPrompt = composeLayeredPrompt(displayPrompt, layers, args.hasSourceImage);

  return {
    displayPrompt,
    expandedPrompt,
    debug: {
      resolvedMode: mode,
      resolutionSource: mode ? source : "balanced_fallback"
    }
  };
}
