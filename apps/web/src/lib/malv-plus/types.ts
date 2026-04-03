import type { LucideIcon } from "lucide-react";

/** High-level buckets for MALV+; used for section headers and future filtering. */
export type MalvPlusCategoryId = "attach" | "create" | "research" | "tools" | "operator";

/** Stable ids for actions; extend as new capabilities ship. */
export type MalvPlusActionId =
  | "attach-file"
  | "add-image"
  | "workspace-canvas"
  | "deep-research"
  | "memory-tools"
  | "source-attachment"
  | "quiz-study"
  | "agent-operator";

export type MalvPlusBadge = "Beta" | "New";

/** Context for visibility predicates (device, composer state, etc.). */
export type MalvPlusVisibilityContext = {
  inlineEditingActive: boolean;
};

/**
 * What happens when the user activates an item. The composer (or host) maps
 * these to concrete behavior so the registry stays declarative.
 */
export type MalvPlusDispatch =
  | { type: "open-file-picker" }
  | { type: "open-image-picker" }
  | { type: "insert-text"; text: string }
  | { type: "navigate"; path: string };

export type MalvPlusActionDefinition = {
  id: MalvPlusActionId;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  category: MalvPlusCategoryId;
  /** If false, item is hidden from the menu (catalog-only / staged rollout). */
  visibleInMenu: boolean;
  /** If false, row renders disabled and does not dispatch. */
  enabled: boolean;
  /** Reserved for soft-launch items shown but not yet fully wired. */
  comingSoon?: boolean;
  dispatch: MalvPlusDispatch;
  /** Optional chip on the row. */
  badge?: MalvPlusBadge;
  /** Extra filter on top of visibleInMenu + enabled. */
  visible?: (ctx: MalvPlusVisibilityContext) => boolean;
};

export type MalvPlusResolvedAction = MalvPlusActionDefinition & {
  enabled: boolean;
};
