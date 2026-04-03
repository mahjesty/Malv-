import { BookOpen, Brain, FileText, ImagePlus, LayoutGrid, Paperclip, Search, Sparkles } from "lucide-react";
import type {
  MalvPlusActionDefinition,
  MalvPlusCategoryId,
  MalvPlusVisibilityContext
} from "./types";

/** Section labels for menu grouping; order is controlled by CATEGORY_ORDER. */
export const MALV_PLUS_CATEGORY_LABELS: Record<MalvPlusCategoryId, string> = {
  attach: "Attach",
  create: "Create",
  research: "Research",
  tools: "Tools",
  operator: "Operator"
};

/** Visual order of category blocks in the menu. */
export const MALV_PLUS_CATEGORY_ORDER: MalvPlusCategoryId[] = [
  "attach",
  "create",
  "research",
  "tools",
  "operator"
];

/**
 * Single source of truth for MALV+ actions.
 * — Set `visibleInMenu: true` when an action is ready to surface.
 * — Staged items stay in the catalog with `visibleInMenu: false` so shipping
 *   them later is a one-line flip without restructuring the menu.
 */
export const MALV_PLUS_ACTIONS: MalvPlusActionDefinition[] = [
  // ——— Attach ———
  {
    id: "attach-file",
    title: "Attach file",
    subtitle: "Documents, code, archives",
    category: "attach",
    icon: Paperclip,
    visibleInMenu: true,
    enabled: true,
    dispatch: { type: "open-file-picker" }
  },
  {
    id: "add-image",
    title: "Add image",
    subtitle: "Screenshots & references",
    category: "attach",
    icon: ImagePlus,
    visibleInMenu: true,
    enabled: true,
    dispatch: { type: "open-image-picker" }
  },
  {
    id: "source-attachment",
    title: "Attach sources",
    subtitle: "Links & citations",
    category: "attach",
    icon: FileText,
    visibleInMenu: false,
    enabled: false,
    comingSoon: true,
    dispatch: { type: "open-file-picker" }
  },

  // ——— Create ———
  {
    id: "workspace-canvas",
    title: "Workspace",
    subtitle: "Files & canvas surface",
    category: "create",
    icon: LayoutGrid,
    visibleInMenu: true,
    enabled: true,
    dispatch: { type: "navigate", path: "/app/files" }
  },

  // ——— Research ———
  {
    id: "deep-research",
    title: "Research",
    subtitle: "Structured deep-dive prompt",
    category: "research",
    icon: Search,
    visibleInMenu: true,
    enabled: true,
    dispatch: {
      type: "insert-text",
      text: "Research focus:\n— "
    }
  },

  // ——— Tools (deferred) ———
  {
    id: "quiz-study",
    title: "Study & quizzes",
    subtitle: "Cards, drills, checks",
    category: "tools",
    icon: BookOpen,
    visibleInMenu: false,
    enabled: false,
    comingSoon: true,
    dispatch: { type: "insert-text", text: "" }
  },
  {
    id: "memory-tools",
    title: "Memory",
    subtitle: "Saved context & recall",
    category: "tools",
    icon: Brain,
    visibleInMenu: false,
    enabled: false,
    comingSoon: true,
    dispatch: { type: "navigate", path: "/app/memory" }
  },

  // ——— Operator (deferred) ———
  {
    id: "agent-operator",
    title: "Operator",
    subtitle: "Agent workflows",
    category: "operator",
    icon: Sparkles,
    visibleInMenu: false,
    enabled: false,
    comingSoon: true,
    dispatch: { type: "insert-text", text: "" }
  }
];

function isActionSelectable(def: MalvPlusActionDefinition, ctx: MalvPlusVisibilityContext): boolean {
  if (ctx.inlineEditingActive) return false;
  if (!def.visibleInMenu) return false;
  if (def.visible && !def.visible(ctx)) return false;
  return true;
}

/** Actions that should render as rows in the MALV+ menu (ordered as in MALV_PLUS_ACTIONS). */
export function getMalvPlusMenuActions(ctx: MalvPlusVisibilityContext): MalvPlusActionDefinition[] {
  return MALV_PLUS_ACTIONS.filter((a) => isActionSelectable(a, ctx));
}

/** Group menu actions by category for section headers. */
export function groupMalvPlusActionsByCategory(
  actions: MalvPlusActionDefinition[]
): Partial<Record<MalvPlusCategoryId, MalvPlusActionDefinition[]>> {
  const out: Partial<Record<MalvPlusCategoryId, MalvPlusActionDefinition[]>> = {};
  for (const a of actions) {
    if (!out[a.category]) out[a.category] = [];
    out[a.category]!.push(a);
  }
  return out;
}
