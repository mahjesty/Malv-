/**
 * Re-export canonical Explore handoff contract from the shared package (web + API).
 * Legacy alias {@link ExploreHandoffActionType} preserves existing import paths in the web app.
 */
import type { ExploreActionHandoffActionType as ExploreActionHandoffActionTypeImport } from "@malv/explore-action-handoff";

export {
  EXPLORE_HANDOFF_SCHEMA_VERSION,
  EXPLORE_HANDOFF_SCHEMA_VERSION_LEGACY,
  ExploreActionIntent,
  normalizeExploreHandoffPayload,
  parseExploreHandoffJson,
  serializeExploreHandoffForMalvTransport
} from "@malv/explore-action-handoff";

export type {
  ExploreActionHandoffActionType,
  ExploreActionHandoffContext,
  ExploreHandoffContext,
  ExploreHandoffImprovementIntent,
  ExploreHandoffPreviewConfidence,
  ExploreHandoffPreviewMode,
  ExploreHandoffPresentationViewport,
  ExploreHandoffSourceSubsurface
} from "@malv/explore-action-handoff";

export type ExploreHandoffActionType = ExploreActionHandoffActionTypeImport;
