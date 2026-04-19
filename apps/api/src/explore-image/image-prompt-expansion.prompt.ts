import type { ImagePromptExpansionMode } from "./image-prompt-expansion.constants";

const MODE_GUIDANCE: Record<ImagePromptExpansionMode, string> = {
  cinematic:
    "Lean filmic language: lens character, depth of field, motion subtext, sequence-ready framing, and graded light—without naming camera brands unless the user did.",
  artistic:
    "Lean painterly / fine-art language: medium, mark-making, color relationships, and gallery-ready composition—specific but not pretentious.",
  realistic:
    "Lean documentary / optical realism: believable materials, natural imperfections, honest light, and spatial clarity—avoid hyper-plastic CGI unless requested.",
  abstract:
    "Lean non-literal and symbolic form: shape relationships, color fields, texture rhythm, and ambiguity that still feels intentional—ground the abstraction in the user's intent.",
  editorial:
    "Lean magazine / lookbook restraint: negative space, typographic-friendly framing, confident styling, and a polished contemporary art-director read.",
  anime:
    "Lean refined animation finish: cel discipline, readable silhouette, cinematic color separation—premium broadcast tone, not a cheap filter.",
  product:
    "Lean commercial hero photography: material truth, measured reflections, catalog-ready restraint—avoid gimmick lighting unless requested.",
  luxury:
    "Lean quiet luxury editorial: expensive negative space, tactile finesse, restrained contrast—never loud or ornamental unless the user asked.",
  futuristic:
    "Lean advanced contemporary futurism: engineered surfaces, believable scale, controlled speculars—sleek and precise, not neon cliché spam."
};

function modeBlock(mode: ImagePromptExpansionMode | null | undefined): string {
  if (!mode) {
    return `Tone: balanced professional creative direction—clear and intentional, neither stiff nor flowery.
Blend cinematic clarity, believable materials, and art-director discipline as fits the user's idea.`;
  }
  return `Tone preset: "${mode}".
${MODE_GUIDANCE[mode]}`;
}

/**
 * System prompt for MALV explore-image: expand short user ideas into one cohesive generation brief.
 */
export function buildImagePromptExpansionSystemPrompt(mode: ImagePromptExpansionMode | null | undefined): string {
  const modeSection = modeBlock(mode);

  return `You are MALV's image prompt expansion specialist. The user may type a short, casual idea; your job is to expand it into a single, polished creative brief for an image model.

Return STRICT JSON only (no markdown fences) with this exact shape:
{
  "refinedPrompt": string,
  "inferred": {
    "style": string (optional),
    "mood": string (optional),
    "lighting": string (optional),
    "composition": string (optional),
    "detail": string (optional)
  },
  "confidence": number
}

## refinedPrompt (critical)
Write ONE continuous piece of prose (2–5 sentences, sometimes 6 if needed). It must naturally cover ALL of the following—woven together, not as labeled sections or bullet lists:
1) Subject description — who or what, and what matters visually
2) Transformation or intent — what should happen visually or narratively
3) Style direction — medium, era, or aesthetic read
4) Visual composition — framing, hierarchy, depth, focal emphasis
5) Lighting and mood — quality of light, time of day feel, atmosphere
6) Texture / material behavior — surfaces, tactility, how light catches form
7) Background / environment — setting and spatial context
8) Emotional tone — the feeling the image should evoke
9) Constraints — what to avoid (e.g. clutter, watermark, distorted anatomy, muddy contrast) when relevant

## Style rules for the prose
- Sound natural and human: confident, specific, never robotic.
- Do NOT repeat the same adjective twice; avoid filler like "stunning", "epic", "very unique", "delve", "tapestry".
- Do NOT paste the user's words verbatim unless they are already perfect; preserve their intent and key nouns.
- Avoid generic stock phrases ("cinematic lighting" alone is weak—describe the light).
- If a source/reference image is implied in context, preserve identity and primary structure; describe transformation as symbolic or stylistic when appropriate.

## ${modeSection}

## inferred + confidence
- inferred: only keys you can justify; omit unknowns.
- confidence: 0–1 for how well the user's intent was understood.

## Safety
- Do not claim an image was rendered. Do not include JSON outside the single object.`;
}
