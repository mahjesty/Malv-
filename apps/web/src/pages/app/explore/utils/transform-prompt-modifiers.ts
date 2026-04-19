/**
 * Legacy variation phrases (not currently used). {@link composeTransformPrompt} now builds from
 * `promptTemplate` + optional user text + a cohesion suffix only.
 */
export const GENERIC_TRANSFORM_MODIFIERS: readonly string[] = [
  "Surface and texture read with quiet believability.",
  "Contrast resolves gently so the focal hierarchy feels natural.",
  "Color pools cohesively from edge to edge.",
  "Depth reads cinematically without overpowering the subject."
];

export const TRANSFORM_MODE_MODIFIERS: Readonly<Record<string, readonly string[]>> = {
  "caricature-transform": [
    "Gesture stretches a touch further while kindness stays in the read.",
    "Linework carries glossy editorial polish.",
    "Warm, approachable color simplifies the background breath.",
    "Silhouette reads crisp; exaggeration stays playful and controlled."
  ],
  "flower-petal-transform": [
    "The transition blooms softly—organic, still evolving.",
    "Petal structure stacks more sculpturally, layer on layer.",
    "The composition breathes light and airy with subtle depth.",
    "An editorial quiet runs through the finish—cinematic softness at the edges."
  ],
  "gold-statue-transform": [
    "Micro-contrast in the metal reads premium; planes turn deliberately.",
    "Rim light carves heroic volume; specular sparkle stays restrained.",
    "The mood leans museum-display gravitas with smooth patina drift.",
    "Reflections behave as polished gold would—coherent and physical."
  ],
  "crayon-illustration": [
    "Waxy grain and paper tooth show through with charm.",
    "Shapes simplify into confident, childlike color blocks.",
    "Outlines stay soft and playful without losing structure.",
    "The spread feels like a warm storybook page."
  ],
  "paparazzi-style-transform": [
    "Flash falloff and skin specular sell tabloid immediacy.",
    "A hint of motion blur breathes at the frame edge.",
    "Night palette holds high contrast with believable noise texture.",
    "The energy feels press-pit close—slightly chaotic, alive."
  ],
  "cloud-sculpture-transform": [
    "Identity threads through posture and silhouette more than surface detail.",
    "Layered volume reads airy and symbolic.",
    "Bright sky gradients wash behind; sun grazes the form gently.",
    "The mood drifts dreamlike and atmospheric rather than literal."
  ],
  "anime-transform": [
    "Cel reads stay clean; gradients accent sparingly.",
    "Eyes and hair silhouette carry expression with clarity.",
    "Color separates cinematically; highlights bloom softly.",
    "Linework stays economical beneath polished shading."
  ],
  "remove-background": [
    "Hair strands and soft edges feather with patience.",
    "Edge color stays neutral; halos and fringe fall away.",
    "Interior detail stays documentary-sharp.",
    "The cutout reads product-true where crispness matters."
  ],
  "watercolor-portrait-transform": [
    "Pigment blooms and backruns feel chosen, not muddy.",
    "Washes glow; paper tooth whispers through.",
    "Lost-and-found edges soften the portrait perimeter.",
    "Skin transitions stay airy with quiet granulation."
  ],
  "oil-painting-transform": [
    "Impasto catches light; glaze deepens the shadow wells.",
    "Warm-cool balance in flesh feels classical.",
    "Brushstroke direction follows the architecture of the face.",
    "Gallery spotlight lands dignified and timeless."
  ],
  "neon-metropolis-transform": [
    "Magenta and cyan separate against wet reflective streets.",
    "Shallow depth and haze open space between figure and city.",
    "Neon spill tints skin and wardrobe believably.",
    "Futurist scale hints at the margins without crowding the portrait."
  ],
  "aurora-night-transform": [
    "Aurora ribbons billow soft and volumetric above the figure.",
    "Starfield micro-contrast pricks cool shadow.",
    "Ethereal rim light lifts silhouette from sky.",
    "Arctic air stays clear with a breath of fog."
  ],
  "alpine-peak-transform": [
    "Scale feels epic; alpine air perspective reads crisp.",
    "Cool rock shadow balances sunlit snow accents.",
    "The figure settles naturally into the mountain story.",
    "Sky drama shares the frame without swallowing likeness."
  ],
  "golden-hour-transform": [
    "Warm backlight and gentle lens bloom lean romantic.",
    "Long soft shadows stretch; midtones honey out.",
    "Skin stays natural inside the golden wash.",
    "Environmental bokeh hints at shallow depth."
  ],
  "deep-ocean-transform": [
    "Caustic ribbons move slowly, sculptural in blue volume.",
    "Deep water holds subtle particulate sparkle.",
    "Facial readability survives the mysterious contrast.",
    "Bubble detail stays editorial and spare."
  ],
  "enchanted-forest-transform": [
    "Dappled green light drifts with pollen in soft shafts.",
    "Moss, fern, and bark frame the figure without crowding.",
    "Fairytale hush lands short of cartoon exaggeration.",
    "Palette roots in living forest green."
  ],
  "marble-sculpture-transform": [
    "Carrara veining threads subtly across smooth stone planes.",
    "Pedestal and soft gallery key feel exhibition-quiet.",
    "Classical proportion reads clearly in monochrome stone.",
    "Chisel transitions refine at brow, nose, and jaw."
  ],
  "vintage-film-transform": [
    "Analog grain and halation sell photochemical memory.",
    "Contrast rolls off; color drifts period-true.",
    "Subtle gate weave stays felt, not distracting.",
    "Composition and subject stay faithful; mood turns timeless."
  ],
  "subsurface-3d-render-transform": [
    "Subsurface warmth gathers in ears and translucency zones.",
    "Specular breaks cleanly under area-key and rim trio.",
    "Micro-skin detail stays disciplined beneath ACES-like tone.",
    "The lookdev reads premium—no plastic sheen."
  ],
  "holographic-iridescent-transform": [
    "Thin-film color shifts flow with premium sci-fi fluency.",
    "Dark void space lets interference read sharp.",
    "Scanline texture and bloom stay controlled.",
    "Facial structure survives the iridescent veil."
  ],
  "chiaroscuro-master-transform": [
    "Umber depths pool; a single warm key describes face and hands.",
    "Glaze and impasto catch where candle logic demands.",
    "Painterly flesh holds likeness under low light.",
    "Varnish sheen whispers museum quiet—not HDR flat."
  ],
  "anamorphic-cinema-transform": [
    "Horizontal flare grammar and oval bokeh read unmistakably anamorphic.",
    "Teal-orange restraint and fine grain settle over the frame.",
    "Letterbox hush holds; no typography intrudes.",
    "Halation kisses speculars with discipline."
  ],
  "tilt-shift-miniature-transform": [
    "The focal plane slices razor-thin; toy-town scale reads clearly.",
    "Saturation and micro-clarity pool inside the wedge.",
    "Radial falloff guides the eye without confusing identity.",
    "Diorama atmosphere breathes with a gentle vignette."
  ],
  "infrared-false-color-transform": [
    "Foliage shift feels surreal yet internally consistent.",
    "Aerial-mapping clarity meets controlled micro-contrast.",
    "Cool sky gradients push against crimson botanical response.",
    "The figure stays identifiable inside false-color logic."
  ],
  "studio-product-keyshot-transform": [
    "Seamless sweep meets crisp contact shadow grounding.",
    "Reflections measure true; materials read color-accurate.",
    "Three-point softbox wrap feels ad-ready and premium.",
    "Hero-SKU framing breathes in disciplined negative space."
  ],
  "double-exposure-transform": [
    "Forest and horizon merge with feathered, magazine-grade patience.",
    "Balanced midtones let identity echo through the blend.",
    "Misty atmosphere separates the exposures quietly.",
    "Silhouette logic stays elegant and editorial."
  ]
};
