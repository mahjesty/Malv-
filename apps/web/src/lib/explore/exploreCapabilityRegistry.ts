import type { LucideIcon } from "lucide-react";
import {
  ArrowUpCircle,
  AudioLines,
  BookOpen,
  Brain,
  Briefcase,
  Brush,
  CalendarDays,
  Compass,
  FileStack,
  Film,
  ImagePlus,
  Layers,
  Lightbulb,
  ListTodo,
  MessageCircle,
  Mic,
  Moon,
  PenLine,
  Route,
  Sparkles,
  Target,
  Text,
  Wand2,
  Waves,
  Wind
} from "lucide-react";

export type ExploreCategoryId = "create" | "transform" | "fix" | "think" | "grow" | "organize" | "interact";

/** How the capability page executes its primary action (truthful to current MALV backends). */
export type ExploreRunKind =
  | "chat_roundtrip"
  | "open_studio_brief"
  | "open_voice"
  | "open_memory"
  | "queue_task";

export type ExploreCapabilityDefinition = {
  categoryId: ExploreCategoryId;
  /** URL segment under category, e.g. `story` → `/app/explore/create/story` */
  capabilityId: string;
  title: string;
  description: string;
  bestFor?: string;
  badge?: string;
  featured?: boolean;
  icon: LucideIcon;
  runKind: ExploreRunKind;
  /**
   * Framing for Operator when using `chat_roundtrip` or supplemental copy for other kinds.
   * Injected as a short system-style prefix to the user message (not shown as fake model output).
   */
  operatorBrief: string;
  /** Default placeholder for the main input */
  inputPlaceholder: string;
  /** Labels for follow-up row */
  followUp: {
    showChat: boolean;
    showStudio: boolean;
    showTasks: boolean;
    showVoice: boolean;
    showMemory: boolean;
  };
};

export type ExploreCategoryDefinition = {
  id: ExploreCategoryId;
  title: string;
  purpose: string;
  /** One short line on the Explore hub category rail (optional). */
  hubLine?: string;
  icon: LucideIcon;
};

export const EXPLORE_CATEGORIES: ExploreCategoryDefinition[] = [
  {
    id: "create",
    title: "Create",
    purpose: "Start new artifacts, media, and narratives with MALV as your co-pilot.",
    hubLine: "Ship new artifacts, media, and narratives.",
    icon: Sparkles
  },
  {
    id: "transform",
    title: "Transform",
    purpose: "Convert, remix, and upgrade content across text, audio, and visuals.",
    hubLine: "Remix format, tone, and medium.",
    icon: Layers
  },
  {
    id: "fix",
    title: "Fix & Improve",
    purpose: "Repair issues, tighten quality, and optimize what you already have.",
    hubLine: "Repair, refine, and optimize what exists.",
    icon: Wand2
  },
  {
    id: "think",
    title: "Think",
    purpose: "Explain, analyze, and plan with structured reasoning — not a wall of generic advice.",
    hubLine: "Explain, analyze, and decide with structure.",
    icon: Brain
  },
  {
    id: "grow",
    title: "Grow",
    purpose: "Shape positioning, career assets, and forward-looking strategy.",
    hubLine: "Positioning, career assets, and strategy.",
    icon: Route
  },
  {
    id: "organize",
    title: "Organize",
    purpose: "Turn chaos into plans, tasks, and durable structure.",
    hubLine: "Plans, tasks, and durable structure.",
    icon: ListTodo
  },
  {
    id: "interact",
    title: "Interact",
    purpose: "Talk, task by voice, and wire memory-focused workflows.",
    hubLine: "Voice, memory, and open dialogue.",
    icon: MessageCircle
  }
];

const f = (d: ExploreCapabilityDefinition) => d;

export const EXPLORE_CAPABILITIES: ExploreCapabilityDefinition[] = [
  f({
    categoryId: "create",
    capabilityId: "story",
    title: "Story generator",
    description: "Develop characters, scenes, and arcs through guided drafting — you steer tone and length.",
    bestFor: "Writers, marketers, game narratives",
    featured: true,
    icon: BookOpen,
    runKind: "chat_roundtrip",
    operatorBrief:
      "You are helping the user craft a story in Explore. Ask concise follow-ups only if essential, otherwise produce a strong draft section they can iterate.",
    inputPlaceholder: "Genre, protagonist, conflict, or the scene you want drafted…",
    followUp: { showChat: true, showStudio: true, showTasks: false, showVoice: true, showMemory: false }
  }),
  f({
    categoryId: "create",
    capabilityId: "idea",
    title: "Idea generator",
    description: "Explore directions, variants, and angles for a concept before you commit.",
    bestFor: "Founders, PMs, creatives",
    featured: true,
    icon: Lightbulb,
    runKind: "chat_roundtrip",
    operatorBrief:
      "Generate crisp, diverse idea directions. Label assumptions. End with 3 concrete next steps the user could take inside MALV.",
    inputPlaceholder: "What are you trying to invent or improve?",
    followUp: { showChat: true, showStudio: true, showTasks: true, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "create",
    capabilityId: "image",
    title: "Image generator",
    description: "Intent → plan → direction pipeline: MALV interprets your words, shows what it understood, then returns execution notes (image URL when a render backend is connected).",
    badge: "Prompt-first",
    icon: ImagePlus,
    runKind: "chat_roundtrip",
    operatorBrief:
      "You are assisting with image ideation. Produce prompt recipes (subject, lighting, lens, palette) and iteration tips. Do not claim an image was rendered unless the platform already returned one.",
    inputPlaceholder: "Subject, style, aspect ratio, mood…",
    followUp: { showChat: true, showStudio: true, showTasks: true, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "create",
    capabilityId: "content",
    title: "Content factory",
    description: "Batch-aligned outlines and multi-channel variations for campaigns or launches.",
    bestFor: "Growth and content teams",
    icon: PenLine,
    runKind: "chat_roundtrip",
    operatorBrief:
      "Produce structured content plans: pillars, hooks, channel-specific variants, and a realistic production order.",
    inputPlaceholder: "Product, audience, channels, deadlines…",
    followUp: { showChat: true, showStudio: true, showTasks: true, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "create",
    capabilityId: "reality",
    title: "Turn idea into reality",
    description: "Move from concept to a concrete brief — hand off to Studio when you are ready to shape something shippable (product, site, workflow, or system).",
    featured: true,
    icon: Target,
    runKind: "open_studio_brief",
    operatorBrief: "",
    inputPlaceholder: "What should exist in the world — app, site, workflow, or product?",
    followUp: { showChat: true, showStudio: true, showTasks: true, showVoice: false, showMemory: false }
  }),

  f({
    categoryId: "transform",
    capabilityId: "text-to-voice",
    title: "Text to voice",
    description: "Shape narration and spoken delivery. For playback, use Operator with voice reply or the live voice channel.",
    badge: "Voice-aware",
    icon: AudioLines,
    runKind: "chat_roundtrip",
    operatorBrief:
      "Help the user craft spoken narration: pacing, emphasis, and SSML-style hints. Explain that playback uses MALV voice surfaces.",
    inputPlaceholder: "Paste or describe the script to speak…",
    followUp: { showChat: true, showStudio: false, showTasks: false, showVoice: true, showMemory: false }
  }),
  f({
    categoryId: "transform",
    capabilityId: "voice-to-text",
    title: "Voice to text",
    description: "Start live capture in the voice channel, then refine transcripts in Operator.",
    icon: Mic,
    runKind: "open_voice",
    operatorBrief: "",
    inputPlaceholder: "Optional: note what you plan to record (meeting notes, dictation, interview)…",
    followUp: { showChat: true, showStudio: false, showTasks: false, showVoice: true, showMemory: false }
  }),
  f({
    categoryId: "transform",
    capabilityId: "image-editor",
    title: "Image editor",
    description: "Describe edits in plain language; get precise guidance. When you already have a Studio asset, open Studio to apply iterations with full context.",
    icon: Brush,
    runKind: "chat_roundtrip",
    operatorBrief:
      "Provide actionable image edit guidance (masks, crops, color, relight). If a build unit exists, suggest opening Studio for applied iterations.",
    inputPlaceholder: "Describe the image and the edits you want…",
    followUp: { showChat: true, showStudio: true, showTasks: false, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "transform",
    capabilityId: "video-cleaner",
    title: "Video cleaner / enhancer",
    description: "Plan cuts, captions, and enhancement passes. Execution routes through tasks and Operator for long runs.",
    icon: Film,
    runKind: "queue_task",
    operatorBrief: "",
    inputPlaceholder: "Source type, length, issues (noise, pacing, captions)…",
    followUp: { showChat: true, showStudio: false, showTasks: true, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "transform",
    capabilityId: "remix",
    title: "Remix anything",
    description: "Reframe an asset for a new audience, medium, or brand voice without losing intent.",
    icon: Wind,
    runKind: "chat_roundtrip",
    operatorBrief: "Remix the user's content with explicit tone + structure changes. Surface risks (licensing, fidelity) briefly.",
    inputPlaceholder: "Paste source material and describe the remix goal…",
    followUp: { showChat: true, showStudio: true, showTasks: false, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "transform",
    capabilityId: "upgrade",
    title: "One-click upgrade",
    description: "Queue a focused improvement pass as a workspace task, then monitor it in Tasks.",
    badge: "Task-backed",
    icon: ArrowUpCircle,
    runKind: "queue_task",
    operatorBrief: "",
    inputPlaceholder: "What should be upgraded — doc, deck, UX copy, onboarding, pricing page…",
    followUp: { showChat: true, showStudio: true, showTasks: true, showVoice: false, showMemory: false }
  }),

  f({
    categoryId: "fix",
    capabilityId: "fix-anything",
    title: "Fix anything",
    description: "Triage something that is wrong: product flows, copy, process, or technical behavior. Use Studio when the fix needs a live build or visual inspection.",
    featured: true,
    icon: Wand2,
    runKind: "chat_roundtrip",
    operatorBrief:
      "Systematically diagnose the issue. Provide repro steps, likely causes, and concrete fixes. Recommend Studio when inspection of a live preview or build is needed.",
    inputPlaceholder: "Symptoms, environment, what you already tried…",
    followUp: { showChat: true, showStudio: true, showTasks: true, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "fix",
    capabilityId: "improve",
    title: "Improve this",
    description: "Elevate clarity, persuasion, or craft of a passage, design note, or spec.",
    icon: Sparkles,
    runKind: "chat_roundtrip",
    operatorBrief: "Improve the user's text with tracked reasoning: goals, edits, and optional alternate versions.",
    inputPlaceholder: "Paste content and say what “better” means…",
    followUp: { showChat: true, showStudio: true, showTasks: false, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "fix",
    capabilityId: "optimize",
    title: "Optimize something",
    description: "Tighten performance narratives: latency, cost, conversion, or operator throughput.",
    icon: Target,
    runKind: "chat_roundtrip",
    operatorBrief:
      "Optimization advice with tradeoffs. Prefer measurable suggestions and a short experiment plan.",
    inputPlaceholder: "What metric or resource are you optimizing?",
    followUp: { showChat: true, showStudio: true, showTasks: true, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "fix",
    capabilityId: "clean",
    title: "Clean messy content",
    description: "Restructure noisy notes, transcripts, or drafts into something shippable.",
    icon: Text,
    runKind: "chat_roundtrip",
    operatorBrief: "Clean and structure the content. Preserve meaning. Call out ambiguities explicitly.",
    inputPlaceholder: "Paste messy content…",
    followUp: { showChat: true, showStudio: false, showTasks: true, showVoice: false, showMemory: false }
  }),

  f({
    categoryId: "think",
    capabilityId: "explain",
    title: "Explain this",
    description: "Break down a concept, stack, or document for the level you choose.",
    featured: true,
    icon: BookOpen,
    runKind: "chat_roundtrip",
    operatorBrief: "Explain clearly with layered depth. Invite the user to pick beginner vs expert framing.",
    inputPlaceholder: "What should be explained?",
    followUp: { showChat: true, showStudio: false, showTasks: false, showVoice: true, showMemory: false }
  }),
  f({
    categoryId: "think",
    capabilityId: "analyze",
    title: "Analyze something",
    description: "Inspect tradeoffs, risks, and signals — not generic cheerleading.",
    icon: Brain,
    runKind: "chat_roundtrip",
    operatorBrief: "Provide structured analysis: context, stakeholders, risks, opportunities, unknowns.",
    inputPlaceholder: "Subject, constraints, and what decision you are approaching…",
    followUp: { showChat: true, showStudio: false, showTasks: true, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "think",
    capabilityId: "brainstorm",
    title: "Brainstorm ideas",
    description: "High-velocity ideation with scoring hooks so ideas can become tasks.",
    icon: Lightbulb,
    runKind: "chat_roundtrip",
    operatorBrief: "Brainstorm with categories, wild cards, and a shortlist with rationale.",
    inputPlaceholder: "Problem space or opportunity…",
    followUp: { showChat: true, showStudio: true, showTasks: true, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "think",
    capabilityId: "strategy",
    title: "Plan strategy",
    description: "Shape a roadmap narrative with milestones — execution still lives in Tasks and Studio.",
    icon: Route,
    runKind: "chat_roundtrip",
    operatorBrief: "Produce a strategy outline: thesis, pillars, milestones, metrics, and dependencies.",
    inputPlaceholder: "Goal, horizon, and current assets…",
    followUp: { showChat: true, showStudio: true, showTasks: true, showVoice: false, showMemory: false }
  }),

  f({
    categoryId: "grow",
    capabilityId: "content-planner",
    title: "Content planner",
    description: "Calendar-aware themes with realistic production cadence.",
    icon: CalendarDays,
    runKind: "chat_roundtrip",
    operatorBrief: "Draft a content calendar with themes, hooks, and reuse opportunities.",
    inputPlaceholder: "Audience, offers, and channels…",
    followUp: { showChat: true, showStudio: false, showTasks: true, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "grow",
    capabilityId: "resume",
    title: "Resume optimizer",
    description: "Sharpen impact statements and ATS readability without inventing experience.",
    badge: "Truthful edits",
    icon: Briefcase,
    runKind: "chat_roundtrip",
    operatorBrief:
      "Improve resume bullets for clarity and impact. Never invent employers, dates, or credentials. Ask for missing facts if needed.",
    inputPlaceholder: "Paste a role section or full resume…",
    followUp: { showChat: true, showStudio: false, showTasks: false, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "grow",
    capabilityId: "brand",
    title: "Business / brand ideas",
    description: "Positioning hypotheses you can validate — not guaranteed market truth.",
    icon: Compass,
    runKind: "chat_roundtrip",
    operatorBrief: "Generate brand directions labeled as hypotheses with validation steps.",
    inputPlaceholder: "Market, offer, and who you serve…",
    followUp: { showChat: true, showStudio: true, showTasks: true, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "grow",
    capabilityId: "growth",
    title: "Growth strategy",
    description: "Acquisition and retention loops with honest feasibility notes.",
    icon: Waves,
    runKind: "chat_roundtrip",
    operatorBrief: "Outline growth loops with metrics, channels, and operational cost notes.",
    inputPlaceholder: "Product stage, ICP, and current traction…",
    followUp: { showChat: true, showStudio: false, showTasks: true, showVoice: false, showMemory: false }
  }),

  f({
    categoryId: "organize",
    capabilityId: "plan-day",
    title: "Plan my day",
    description: "Time-box priorities with energy-aware sequencing — tasks can be queued for execution.",
    icon: CalendarDays,
    runKind: "chat_roundtrip",
    operatorBrief: "Build a pragmatic day plan. Offer to convert blocks into workspace tasks if heavy lifts appear.",
    inputPlaceholder: "Meetings, deadlines, energy, must-dos…",
    followUp: { showChat: true, showStudio: false, showTasks: true, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "organize",
    capabilityId: "tasks",
    title: "Organize tasks",
    description: "Jump to the execution queue with optional starter tasks created here.",
    icon: ListTodo,
    runKind: "queue_task",
    operatorBrief: "",
    inputPlaceholder: "List what needs to happen (one per line is fine)…",
    followUp: { showChat: true, showStudio: false, showTasks: true, showVoice: false, showMemory: false }
  }),
  f({
    categoryId: "organize",
    capabilityId: "goals",
    title: "Goal planning",
    description: "Define outcomes, measures, and review cadence — lightweight OKR-style clarity.",
    icon: Target,
    runKind: "chat_roundtrip",
    operatorBrief: "Facilitate goal planning with measurable indicators and review rhythm.",
    inputPlaceholder: "Horizon, stakeholders, constraints…",
    followUp: { showChat: true, showStudio: false, showTasks: true, showVoice: false, showMemory: true }
  }),
  f({
    categoryId: "organize",
    capabilityId: "pack",
    title: "Pack it",
    description: "Turn notes into schemas, briefs, or checklists ready for sharing.",
    featured: true,
    icon: FileStack,
    runKind: "chat_roundtrip",
    operatorBrief: "Restructure notes into a tight brief with sections and action items.",
    inputPlaceholder: "Paste notes or bullet chaos…",
    followUp: { showChat: true, showStudio: true, showTasks: true, showVoice: false, showMemory: false }
  }),

  f({
    categoryId: "interact",
    capabilityId: "talk",
    title: "Talk to MALV",
    description: "Start here for open-ended dialogue with the same model as Operator Chat — staged inside Explore until you choose the full Chat thread UI.",
    featured: true,
    icon: MessageCircle,
    runKind: "chat_roundtrip",
    operatorBrief: "You are continuing a conversation started from Explore Talk. Be concise and proactive.",
    inputPlaceholder: "What’s on your mind?",
    followUp: { showChat: true, showStudio: true, showTasks: false, showVoice: true, showMemory: false }
  }),
  f({
    categoryId: "interact",
    capabilityId: "voice-task",
    title: "Voice tasking",
    description: "Speak live with MALV, then route outcomes into tasks or chat.",
    icon: Mic,
    runKind: "open_voice",
    operatorBrief: "",
    inputPlaceholder: "Optional context before you open the voice channel…",
    followUp: { showChat: true, showStudio: false, showTasks: true, showVoice: true, showMemory: false }
  }),
  f({
    categoryId: "interact",
    capabilityId: "remember",
    title: "Remember this",
    description: "Open Memory scopes to capture durable context with the right isolation boundaries.",
    icon: Brain,
    runKind: "open_memory",
    operatorBrief: "",
    inputPlaceholder: "Optional: what should be remembered (you’ll confirm in Memory)…",
    followUp: { showChat: true, showStudio: false, showTasks: false, showVoice: false, showMemory: true }
  }),
  f({
    categoryId: "interact",
    capabilityId: "assist",
    title: "Quiet focus",
    description: "Calmer, shorter answers and fewer digressions — explicit style only, not background automation.",
    badge: "Style",
    icon: Moon,
    runKind: "chat_roundtrip",
    operatorBrief:
      "Use a calm, minimal-interruption style. Short answers unless the user asks for depth. No background execution claims.",
    inputPlaceholder: "What do you want to focus on?",
    followUp: { showChat: true, showStudio: true, showTasks: false, showVoice: false, showMemory: false }
  })
];

const CAP_KEY = new Map<string, ExploreCapabilityDefinition>();

for (const c of EXPLORE_CAPABILITIES) {
  CAP_KEY.set(`${c.categoryId}/${c.capabilityId}`, c);
}

export function exploreCapabilityPath(c: ExploreCapabilityDefinition): string {
  return `/app/explore/${c.categoryId}/${c.capabilityId}`;
}

export function getExploreCapability(categoryId: string, capabilityId: string): ExploreCapabilityDefinition | null {
  if (!isExploreCategoryId(categoryId)) return null;
  return CAP_KEY.get(`${categoryId}/${capabilityId}`) ?? null;
}

export function isExploreCategoryId(x: string): x is ExploreCategoryId {
  return EXPLORE_CATEGORIES.some((c) => c.id === x);
}

export function listExploreCapabilitiesForCategory(categoryId: ExploreCategoryId): ExploreCapabilityDefinition[] {
  return EXPLORE_CAPABILITIES.filter((c) => c.categoryId === categoryId);
}

export function featuredExploreCapabilities(): ExploreCapabilityDefinition[] {
  return EXPLORE_CAPABILITIES.filter((c) => c.featured);
}

const capKey = (c: ExploreCapabilityDefinition) => `${c.categoryId}/${c.capabilityId}`;

/** Curated first-run strip on the Explore hub (replaces a duplicate “featured” grid). */
const TOP_HUB_ORDER: Array<[ExploreCategoryId, string]> = [
  ["create", "image"],
  ["transform", "text-to-voice"],
  ["fix", "fix-anything"],
  ["think", "explain"],
  ["organize", "plan-day"],
  ["interact", "talk"]
];

export function topExploreHubCapabilities(): ExploreCapabilityDefinition[] {
  const out: ExploreCapabilityDefinition[] = [];
  for (const [cat, capabilityId] of TOP_HUB_ORDER) {
    const c = getExploreCapability(cat, capabilityId);
    if (c) out.push(c);
  }
  return out;
}

export function topExploreHubCapabilityKeys(): Set<string> {
  return new Set(topExploreHubCapabilities().map(capKey));
}

/**
 * Hub category rails: first {@link HUB_CATEGORY_VISIBLE} cards on the hub; remainder behind “View all”.
 * Capabilities in {@link topExploreHubCapabilities} are ordered after others so the hub isn’t repetitive.
 */
export const HUB_CATEGORY_VISIBLE = 3 as const;

export function listHubCategoryCards(categoryId: ExploreCategoryId): {
  primary: ExploreCapabilityDefinition[];
  overflow: ExploreCapabilityDefinition[];
} {
  const topKeys = topExploreHubCapabilityKeys();
  const all = listExploreCapabilitiesForCategory(categoryId);
  const notInTop = all.filter((c) => !topKeys.has(capKey(c)));
  const inTop = all.filter((c) => topKeys.has(capKey(c)));
  const ordered = [...notInTop, ...inTop];
  return {
    primary: ordered.slice(0, HUB_CATEGORY_VISIBLE),
    overflow: ordered.slice(HUB_CATEGORY_VISIBLE)
  };
}
