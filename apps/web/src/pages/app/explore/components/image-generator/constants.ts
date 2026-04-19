export const PROMPT_PLACEHOLDER = "Describe your vision…";

export type ImageModeCategory = "transform" | "prompt" | "guided";

export type ImageModeLaunchBehavior = "upload_then_generate" | "prompt_generate" | "guided_generate";

export type GuidedFlowField = {
  id: string;
  label: string;
  placeholder: string;
};

/**
 * Explore image mode: `title` + `shortHint` are user-facing only.
 * `promptTemplate` is the internal generation directive — never substitute `title` for API prompts.
 */
export type ImageModeCard = {
  id: string;
  title: string;
  category: ImageModeCategory;
  requiresUpload: boolean;
  previewImage: string;
  /** Full internal transform / generation recipe (hidden from the user thread). */
  promptTemplate: string;
  launchBehavior: ImageModeLaunchBehavior;
  /** Subtle hint under the intent chip (optional). */
  shortHint?: string;
  /** @deprecated use shortHint */
  subtitle?: string;
  teaser?: string;
  /** @deprecated Rendering uses `malv-mode-card-visual.util` — kept for data/schema compatibility. */
  gradientClass: string;
  /** @deprecated See `gradientClass`. */
  glowClass: string;
  autoGenerate?: boolean;
  guidedFields?: readonly GuidedFlowField[];
};

export function launchBehaviorActionLabel(b: ImageModeLaunchBehavior): string {
  if (b === "upload_then_generate") return "Upload photo";
  if (b === "guided_generate") return "Guided setup";
  return "Generate";
}

/** Merge guided answers into the base template for in-thread generation. */
export function buildGuidedPrompt(card: ImageModeCard, answers: Record<string, string>): string {
  const base = card.promptTemplate.trim();
  const extras = (card.guidedFields ?? [])
    .map((f) => {
      const v = (answers[f.id] ?? "").trim();
      return v ? `${f.label}: ${v}` : "";
    })
    .filter(Boolean);
  if (!extras.length) return base;
  return `${base} ${extras.join(". ")}.`.trim();
}

/**
 * IMAGE TRANSFORMATIONS — upload-first, tall hero cards.
 * Preview URLs: high-quality photography / illustration references (not generic UI placeholders).
 */
export const IMAGE_TRANSFORM_CARDS: ReadonlyArray<ImageModeCard> = [
  {
    id: "caricature-transform",
    title: "Caricature",
    previewImage:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The subject settles into a polished caricature read—gesture and proportion stretch with playful clarity, yet the person remains unmistakable. The surface reads as clean illustration with warm, controlled exaggeration rather than harsh distortion; the mood stays kind, graphic, and alive.",
    gradientClass: "from-emerald-950/80 via-zinc-900/45 to-black/50",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_42px_rgba(52,211,153,0.2)]"
  },
  {
    id: "flower-petal-transform",
    title: "Flower petals",
    previewImage:
      "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The uploaded image dissolves into a layered floral composition: the subject’s form is translated through soft petal planes, translucent layers, and botanical rhythm rather than literal skin or fabric. Identity must stay legible via silhouette, gaze, posture, and the geometry of the face emerging through petals. Petal texture should feel refined and tactile—velvet edges, gentle translucency, and natural light drifting across depth. Mood balances editorial grace with dreamlike calm; avoid candy-sweet cliché or muddy overlap that erases the subject.",
    gradientClass: "from-fuchsia-950/75 via-emerald-900/35 to-black/48",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_42px_rgba(52,211,153,0.18)]"
  },
  {
    id: "gold-statue-transform",
    title: "Gold",
    previewImage:
      "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "Their form reads as cast precious metal—planes catch sculpted light, and depth accumulates in the gold itself rather than in shadow tricks. Identity holds through underlying structure while the surface behaves like polished bullion under deliberate rim light; the presence feels monumental, warm, and gallery-quiet.",
    gradientClass: "from-amber-950/82 via-yellow-900/40 to-emerald-950/30",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_42px_rgba(250,204,21,0.15)]"
  },
  {
    id: "crayon-illustration",
    title: "Crayon",
    previewImage:
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The uploaded scene shifts into a hand-drawn crayon interpretation where waxy texture, softened edges, and simplified color masses replace photographic polish. The main subject remains recognizable through silhouette and placement, while outlines become gentle and expressive rather than precise. Color should feel warm, playful, and slightly storybook-like, with charming imperfections and tactile crayon grain throughout. The result should feel cohesive, intentional, and emotionally inviting rather than childish or chaotic.",
    gradientClass: "from-violet-950/78 via-emerald-900/32 to-black/50",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_42px_rgba(52,211,153,0.2)]"
  },
  {
    id: "paparazzi-style-transform",
    title: "Paparazzi",
    shortHint: "Candid celebrity moment",
    previewImage:
      "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The uploaded subject is reimagined as a candid paparazzi-style capture, with flash-lit contrast, nightlife energy, and the tension of an unplanned celebrity moment. The subject must remain recognizable, but the frame should feel editorial, slightly intrusive, and alive with real-world camera presence. Lighting should feel harsh and immediate, with realistic flash falloff, urban night mood, and documentary-style spontaneity.",
    gradientClass: "from-zinc-950/88 via-neutral-900/50 to-emerald-950/25",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.6),0_0_40px_rgba(52,211,153,0.14)]"
  },
  {
    id: "cloud-sculpture-transform",
    title: "Cloud sculptural",
    previewImage:
      "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The uploaded subject becomes atmospheric sculpture built from layered cloud volume—symbolic rather than literal—with identity threading through silhouette, stance, and the curve of attention. Sun should wash the form with soft, diffused light; open sky and gentle gradient behind reinforce elevation and breath. Compositional character is airy, monumental, and dreamlike while staying MALV-clean: no heavy fantasy kitsch, no clutter; the figure remains the emotional anchor inside the vapor and light.",
    gradientClass: "from-sky-950/85 via-cyan-900/38 to-emerald-950/28",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_42px_rgba(45,212,191,0.22)]"
  },
  {
    id: "anime-transform",
    title: "Anime transformation",
    previewImage:
      "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The uploaded portrait crosses into refined anime language: clean cel-like shapes, disciplined linework, and cinematic color separation while preserving recognizable likeness, proportions, and posture. Eyes and hair carry expression; shading reads deliberate rather than muddy. The finish should feel premium broadcast animation, not a rough sketch or generic filter—cohesive lighting, controlled highlights, and a mood that honors both the source identity and the stylization.",
    gradientClass: "from-indigo-950/80 via-violet-900/38 to-emerald-950/30",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_42px_rgba(52,211,153,0.2)]"
  },
  {
    id: "remove-background",
    title: "Remove background",
    previewImage:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The primary figure lifts away from its surroundings with faithful edge definition—hair and soft boundaries feather naturally, halos and fringe stay subdued. Interior detail reads sharp and true, ready for a quiet studio void or transparent finish; the treatment stays documentary and neutral, not painterly or stylized.",
    gradientClass: "from-emerald-950/78 via-slate-900/45 to-black/52",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_42px_rgba(16,185,129,0.22)]"
  },
  {
    id: "watercolor-portrait-transform",
    title: "Watercolor wash",
    previewImage:
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "Pigment and water take over—the portrait lives in flowing washes, visible paper grain, and soft lost edges while the sitter remains recognizable through bone and pose. Light seems to soak through the surface rather than strike it; the mood stays airy, luminous, and gently editorial.",
    gradientClass: "from-sky-950/72 via-cyan-900/38 to-violet-950/35",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_42px_rgba(56,189,248,0.2)]"
  },
  {
    id: "oil-painting-transform",
    title: "Oil painting",
    previewImage:
      "https://images.unsplash.com/photo-1578301978018-3005759f48f7?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "Brush and oil reframe the face—impasto catches gallery light, glazing deepens the shadows, and stroke direction follows the architecture beneath. The sitter remains knowable through classical handling; the tone feels timeless, dignified, and museum-calm.",
    gradientClass: "from-amber-950/80 via-orange-900/42 to-stone-950/40",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_40px_rgba(251,191,36,0.16)]"
  },
  {
    id: "neon-metropolis-transform",
    title: "Neon metropolis",
    previewImage:
      "https://images.unsplash.com/photo-1563089145-599997674d42?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "Neon and rain rewrite the backdrop—magenta and cyan rim the figure, wet pavement throws reflections, and haze deepens the distance. Identity stays anchored in the portrait read while the city thrums at the edges; the frame feels late-night, cinematic, and electric.",
    gradientClass: "from-fuchsia-950/85 via-violet-900/45 to-cyan-950/35",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.58),0_0_44px_rgba(217,70,239,0.22)]"
  },
  {
    id: "aurora-night-transform",
    title: "Aurora night",
    previewImage:
      "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "Night opens over the arctic—aurora ribbons swirl with soft volume, stars pinprick cool air, and a faint rim traces the subject against sky. Likeness endures through the cold light; mood reads vast, still, and quietly otherworldly.",
    gradientClass: "from-violet-950/88 via-teal-900/40 to-slate-950/45",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_42px_rgba(45,212,191,0.24)]"
  },
  {
    id: "alpine-peak-transform",
    title: "Alpine peaks",
    previewImage:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The uploaded subject is reinterpreted through an alpine highland atmosphere, where crisp mountain air, expansive elevation, and cool natural clarity reshape the image’s emotional tone. Preserve the subject’s core identity and composition, but infuse the scene with clean light, distant mountain presence, restrained cold-blue tonal structure, and the quiet grandeur of elevated terrain. The result should feel cinematic, open, and naturally majestic rather than fantasy-heavy.",
    gradientClass: "from-slate-950/86 via-sky-900/38 to-zinc-950/42",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_40px_rgba(148,163,184,0.2)]"
  },
  {
    id: "golden-hour-transform",
    title: "Golden hour",
    previewImage:
      "https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "Late sun floods the frame—long warm shadows, honeyed skin, and gentle flare halo the moment. Expression and identity remain clear inside the glow; the emotional temperature reads romantic, open-air, and unhurried.",
    gradientClass: "from-orange-950/82 via-amber-900/44 to-rose-950/32",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.52),0_0_38px_rgba(251,146,60,0.18)]"
  },
  {
    id: "deep-ocean-transform",
    title: "Deep ocean",
    previewImage:
      "https://images.unsplash.com/photo-1551244072-5d12893278ab?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The uploaded image is submerged in deep-ocean atmosphere: volumetric blue, slow caustic shimmer, and gentle particulate drift suggest abyssal depth without visual noise. The subject must stay recognizable through the aqueous veil—skin, fabric, and edges read through refraction and soft absorption, not murky obliteration. Lighting feels filtered from above; mood is mysterious, editorial, and cold-composed, with pressure and scale implied rather than cartoon bubbles or neon kitsch.",
    gradientClass: "from-blue-950/90 via-cyan-900/48 to-indigo-950/38",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.58),0_0_44px_rgba(34,211,238,0.22)]"
  },
  {
    id: "enchanted-forest-transform",
    title: "Enchanted forest",
    previewImage:
      "https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The uploaded scene is reshaped by an enchanted forest canopy: dappled emerald light, drifting pollen and soft volumetric shafts, moss and fern at the edges, and depth that feels alive but grounded. The subject remains the focal truth—identity, expression, and posture intact—while the environment whispers fairytale hush without candy-neon fantasy. Palette stays in living greens, bark brown, and misted shadow; atmosphere is quiet, magical, and cinematically natural.",
    gradientClass: "from-emerald-950/88 via-green-900/42 to-lime-950/28",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_42px_rgba(74,222,128,0.2)]"
  },
  {
    id: "marble-sculpture-transform",
    title: "Marble sculpture",
    previewImage:
      "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The uploaded subject is translated into classical marble sculpture: Carrara veining threading through calm planes, chisel-quiet edges, and gallery key light that reveals volume without harsh specular plastic. Facial architecture and gesture must remain legible in monochrome stone—this is translation, not replacement. Pedestal or plinth may appear subtly; mood is eternal, museum-still, and sculpturally resolved with restrained shadow pools and dignified atmosphere.",
    gradientClass: "from-stone-950/84 via-neutral-900/46 to-slate-950/40",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_38px_rgba(212,212,216,0.18)]"
  },
  {
    id: "vintage-film-transform",
    title: "Vintage film",
    previewImage:
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The uploaded image acquires vintage photochemical character: organic grain structure, gentle halation in highlights, rolled-off contrast, micro-fading, and a color drift toward era-specific warmth or cool cast without destroying skintone truth. Composition and subject identity stay faithful; the effect reads like a well-kept archival print from a darkroom drawer—tactile, nostalgic, and cinematically honest rather than a heavy Instagram filter.",
    gradientClass: "from-zinc-950/92 via-neutral-900/52 to-black/55",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.6),0_0_36px_rgba(255,255,255,0.08)]"
  },
  {
    id: "subsurface-3d-render-transform",
    title: "CGI / subsurface",
    previewImage:
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The portrait re-materializes as high-end 3D—subsurface warmth in skin, believable specular, area light and rim describing form with discipline. Identity and pose remain the spine of the render; tonality feels ACES-clean without plastic gloss, edges read deliberate.",
    gradientClass: "from-indigo-950/82 via-violet-900/40 to-cyan-950/32",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.56),0_0_40px_rgba(99,102,241,0.18)]"
  },
  {
    id: "holographic-iridescent-transform",
    title: "Holographic",
    previewImage:
      "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "Iridescence and thin-film color wash across the figure—chromatic shifts, controlled bloom, a void behind so interference reads sharp. The face remains coherent beneath the sci-fi finish; the look feels premium future, luminous, and precise rather than kitsch.",
    gradientClass: "from-fuchsia-950/85 via-cyan-900/42 to-violet-950/38",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.58),0_0_44px_rgba(168,85,247,0.2)]"
  },
  {
    id: "chiaroscuro-master-transform",
    title: "Chiaroscuro master",
    previewImage:
      "https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "Light falls like a single candle in a Dutch interior—deep umber recesses, warm key on face and hands, glaze and impasto catching where paint builds. Likeness endures in painterly flesh; varnish adds a quiet museum sheen, shadows drinking most of the room.",
    gradientClass: "from-amber-950/88 via-stone-900/48 to-black/55",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.62),0_0_36px_rgba(245,158,11,0.12)]"
  },
  {
    id: "anamorphic-cinema-transform",
    title: "Anamorphic cinema",
    previewImage:
      "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The still breathes anamorphic cinema—horizontal flares, oval bokeh, teal-orange restraint, fine grain, letterbox hush. Identity stays intact inside the glass; no typography intrudes on the frame, only light grammar and negative space.",
    gradientClass: "from-slate-950/90 via-blue-950/44 to-orange-950/28",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.58),0_0_38px_rgba(56,189,248,0.14)]"
  },
  {
    id: "tilt-shift-miniature-transform",
    title: "Tilt-shift",
    previewImage:
      "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "Focus shrinks to a thin slice—saturation and clarity pool in the wedge, the rest eases into toy-scale softness. The subject remains readable inside the diorama trick; the eye travels along that razor plane while scale play feels playful, not confusing.",
    gradientClass: "from-emerald-950/78 via-sky-900/36 to-amber-950/26",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.52),0_0_36px_rgba(34,197,94,0.16)]"
  },
  {
    id: "infrared-false-color-transform",
    title: "Infrared false color",
    previewImage:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The spectrum slips into false color—vegetation shifts crimson and magenta, sky cools, micro-contrast sharpens toward aerial clarity. The figure remains identifiable inside the surreal botany; the world feels surveyed yet strange, diagram-beautiful.",
    gradientClass: "from-rose-950/86 via-fuchsia-900/42 to-cyan-950/34",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_42px_rgba(244,63,94,0.18)]"
  },
  {
    id: "studio-product-keyshot-transform",
    title: "Product studio",
    previewImage:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "The subject becomes a hero product frame—seamless sweep, soft three-point wrap, crisp contact shadow, reflections measured and material-true. Form reads honest at high resolution; negative space breathes like a Keyshot still built for a launch deck.",
    gradientClass: "from-zinc-950/88 via-neutral-900/50 to-slate-950/42",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.55),0_0_34px_rgba(255,255,255,0.1)]"
  },
  {
    id: "double-exposure-transform",
    title: "Double exposure",
    previewImage:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=800&fit=crop&q=80",
    category: "transform",
    launchBehavior: "upload_then_generate",
    requiresUpload: true,
    promptTemplate:
      "Two images breathe as one—silhouette or portrait veils through forest mist and distant ridgeline, edges feathered with editorial patience. Identity echoes through the blend; midtones stay balanced so nothing turns muddy, and the composite feels magazine-intentional.",
    gradientClass: "from-teal-950/80 via-slate-900/46 to-emerald-950/36",
    glowClass: "hover:shadow-[0_26px_56px_rgba(0,0,0,0.54),0_0_38px_rgba(45,212,191,0.16)]"
  }
];

/** PROMPT IDEAS — text-to-image, no upload. */
export const PROMPT_IDEA_CARDS: ReadonlyArray<ImageModeCard> = [
  {
    id: "neon-cyberpunk-city",
    title: "Neon cyberpunk city",
    previewImage:
      "https://images.unsplash.com/photo-1563089145-599997674d42?w=700&h=520&fit=crop&q=80",
    category: "prompt",
    launchBehavior: "prompt_generate",
    requiresUpload: false,
    promptTemplate:
      "Neon cyberpunk city at night, dense holographic signage, reflective wet streets, cinematic wide shot, volumetric fog, ultra detailed",
    gradientClass: "from-fuchsia-950/70 via-emerald-950/35 to-black/55",
    glowClass: "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_36px_rgba(52,211,153,0.16)]",
    autoGenerate: true
  },
  {
    id: "cinematic-desert",
    title: "Cinematic desert",
    previewImage:
      "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=700&h=520&fit=crop&q=80",
    category: "prompt",
    launchBehavior: "prompt_generate",
    requiresUpload: false,
    promptTemplate:
      "Wide cinematic desert landscape at golden hour, distant traveler silhouette, dramatic shadows, filmic color grade, IMAX clarity",
    gradientClass: "from-orange-950/75 via-amber-900/38 to-emerald-950/25",
    glowClass: "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_34px_rgba(251,191,36,0.14)]",
    autoGenerate: true
  },
  {
    id: "underwater-ruins",
    title: "Underwater ruins",
    previewImage:
      "https://images.unsplash.com/photo-1551244072-5d12893278ab?w=700&h=520&fit=crop&q=80",
    category: "prompt",
    launchBehavior: "prompt_generate",
    requiresUpload: false,
    promptTemplate:
      "Ancient ruins submerged underwater, god rays through blue water, schools of fish, mysterious atmosphere, photorealistic detail",
    gradientClass: "from-cyan-950/78 via-blue-950/40 to-emerald-950/28",
    glowClass: "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_36px_rgba(45,212,191,0.18)]",
    autoGenerate: true
  },
  {
    id: "futuristic-skyline",
    title: "Futuristic skyline",
    previewImage:
      "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=700&h=520&fit=crop&q=80",
    category: "prompt",
    launchBehavior: "prompt_generate",
    requiresUpload: false,
    promptTemplate:
      "Futuristic megacity skyline at dusk, glass towers, aerial traffic lanes, soft atmospheric haze, architectural photography, crisp detail",
    gradientClass: "from-slate-950/82 via-indigo-950/38 to-emerald-950/26",
    glowClass: "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_34px_rgba(52,211,153,0.15)]",
    autoGenerate: true
  },
  {
    id: "golden-hour-portrait",
    title: "Golden hour portrait",
    previewImage:
      "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=700&h=520&fit=crop&q=80",
    category: "prompt",
    launchBehavior: "prompt_generate",
    requiresUpload: false,
    promptTemplate:
      "Portrait in golden hour light, warm rim light, shallow depth of field, natural skin texture, editorial photography",
    gradientClass: "from-amber-950/72 via-orange-900/35 to-emerald-950/22",
    glowClass: "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_32px_rgba(251,191,36,0.12)]",
    autoGenerate: true
  },
  {
    id: "editorial-fashion-frame",
    title: "Editorial fashion frame",
    previewImage:
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=700&h=520&fit=crop&q=80",
    category: "prompt",
    launchBehavior: "prompt_generate",
    requiresUpload: false,
    promptTemplate:
      "Editorial fashion photograph, bold styling, clean studio backdrop, high-end magazine lighting, sharp fabric detail",
    gradientClass: "from-neutral-950/80 via-stone-900/38 to-emerald-950/24",
    glowClass: "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_34px_rgba(52,211,153,0.14)]",
    autoGenerate: true
  }
];

/** GUIDED FLOWS — short setup, then in-thread generation. */
export const GUIDED_FLOW_CARDS: ReadonlyArray<ImageModeCard> = [
  {
    id: "guided-product-photo",
    title: "Product photo",
    previewImage:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=700&h=520&fit=crop&q=80",
    category: "guided",
    launchBehavior: "guided_generate",
    requiresUpload: false,
    promptTemplate:
      "Create a premium product hero photo on a clean gradient backdrop with soft studio lighting, crisp reflections, and ad-ready framing.",
    gradientClass: "from-stone-950/78 via-slate-900/40 to-emerald-950/28",
    glowClass: "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_36px_rgba(52,211,153,0.18)]",
    autoGenerate: true,
    guidedFields: [
      { id: "subject", label: "Product", placeholder: "e.g. wireless headphones, ceramic mug" },
      { id: "mood", label: "Mood", placeholder: "e.g. minimal luxe, playful, clinical" }
    ]
  },
  {
    id: "guided-character-poster",
    title: "Character poster",
    previewImage:
      "https://images.unsplash.com/photo-1635805737704-378cbf479147?w=700&h=520&fit=crop&q=80",
    category: "guided",
    launchBehavior: "guided_generate",
    requiresUpload: false,
    promptTemplate:
      "Design a cinematic character poster with strong silhouette, dramatic lighting, title-safe negative space, and film-grade color.",
    gradientClass: "from-red-950/65 via-zinc-900/42 to-emerald-950/26",
    glowClass: "hover:shadow-[0_20px_48px_rgba(0,0,0,0.52),0_0_34px_rgba(52,211,153,0.14)]",
    autoGenerate: true,
    guidedFields: [
      { id: "hero", label: "Hero", placeholder: "e.g. masked rider, young inventor" },
      { id: "tone", label: "Tone", placeholder: "e.g. gritty sci-fi, hopeful adventure" }
    ]
  },
  {
    id: "guided-album-cover",
    title: "Album cover",
    previewImage:
      "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=700&h=520&fit=crop&q=80",
    category: "guided",
    launchBehavior: "guided_generate",
    requiresUpload: false,
    promptTemplate:
      "Create a square album cover image with bold focal art, balanced typography-safe margins, and a cohesive color story.",
    gradientClass: "from-violet-950/72 via-fuchsia-900/32 to-emerald-950/24",
    glowClass: "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_34px_rgba(52,211,153,0.16)]",
    autoGenerate: true,
    guidedFields: [
      { id: "genre", label: "Genre", placeholder: "e.g. synthwave, acoustic folk" },
      { id: "palette", label: "Palette", placeholder: "e.g. teal and magenta, monochrome" }
    ]
  },
  {
    id: "guided-social-campaign",
    title: "Social campaign visual",
    previewImage:
      "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=700&h=520&fit=crop&q=80",
    category: "guided",
    launchBehavior: "guided_generate",
    requiresUpload: false,
    promptTemplate:
      "Create a scroll-stopping social campaign visual with clear focal subject, high contrast, and clean space for headline overlay.",
    gradientClass: "from-blue-950/75 via-indigo-900/35 to-emerald-950/26",
    glowClass: "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_36px_rgba(52,211,153,0.15)]",
    autoGenerate: true,
    guidedFields: [
      { id: "theme", label: "Theme", placeholder: "e.g. product launch, seasonal sale" },
      { id: "energy", label: "Energy", placeholder: "e.g. bold, calm, playful" }
    ]
  },
  {
    id: "guided-moodboard-scene",
    title: "Moodboard scene",
    previewImage:
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=700&h=520&fit=crop&q=80",
    category: "guided",
    launchBehavior: "guided_generate",
    requiresUpload: false,
    promptTemplate:
      "Generate a cohesive moodboard scene collage-feel still life: materials, light, and palette harmonized for creative direction.",
    gradientClass: "from-teal-950/70 via-cyan-900/32 to-emerald-950/30",
    glowClass: "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_34px_rgba(45,212,191,0.18)]",
    autoGenerate: true,
    guidedFields: [
      { id: "direction", label: "Direction", placeholder: "e.g. coastal calm, brutalist interior" },
      { id: "materials", label: "Materials", placeholder: "e.g. linen, oak, brushed steel" }
    ]
  },
  {
    id: "guided-brand-concept",
    title: "Brand concept frame",
    previewImage:
      "https://images.unsplash.com/photo-1558655146-d09347e92766?w=700&h=520&fit=crop&q=80",
    category: "guided",
    launchBehavior: "guided_generate",
    requiresUpload: false,
    promptTemplate:
      "Create a single brand concept frame: abstract mark-inspired shapes, restrained palette, premium negative space, presentation-ready.",
    gradientClass: "from-neutral-950/80 via-zinc-900/38 to-emerald-950/26",
    glowClass: "hover:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_36px_rgba(52,211,153,0.16)]",
    autoGenerate: true,
    guidedFields: [
      { id: "values", label: "Values", placeholder: "e.g. precise, warm, innovative" },
      { id: "palette", label: "Palette", placeholder: "e.g. charcoal and sage, cream base" }
    ]
  }
];

/** @deprecated Use category exports; kept for any external imports. */
export const MODE_GALLERY_CARDS: ReadonlyArray<ImageModeCard> = [
  ...IMAGE_TRANSFORM_CARDS,
  ...PROMPT_IDEA_CARDS,
  ...GUIDED_FLOW_CARDS
];
