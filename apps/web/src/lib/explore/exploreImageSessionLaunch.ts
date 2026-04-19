import type { NavigateFunction } from "react-router-dom";

import type { ImagePromptExpansionMode } from "./imagePromptExpansionMode";

/** Dedicated execution surface for Explore Image (thread + generation). */
export const EXPLORE_IMAGE_SESSION_PATH = "/app/explore/create/image/session" as const;

export type ExploreImageHistorySnapshot = {
  id: string;
  imageUrl: string;
  prompt: string;
  text: string;
  createdAt: number;
};

/** API + thread fields mirrored from the launcher pipeline (no React nodes). */
export type ExploreImagePipelineLaunch = {
  apiPrompt: string;
  userFacingPrompt?: string;
  threadUserCaption?: string;
  /** Short mode name for the user bubble (e.g. transform card title); not sent as API instructions. */
  threadIntentLabel?: string;
  /** Optional one-line hint under the intent chip (e.g. card subtitle). */
  threadIntentHint?: string;
  generatingCaption?: string;
  sourceImageDataUrl?: string;
  /** Preview URL for the user bubble when the API uses `sourceImageFileId` (avoids duplicating bytes in route state). */
  threadSourceImageUrl?: string;
  sourceImageFileId?: string;
  modeId?: string;
  /** Server-side tone for automatic prompt expansion. */
  promptExpansionMode?: ImagePromptExpansionMode | null;
  clearPendingSourceAfter?: boolean;
  /** DEV-only audit fields; never used as the API prompt. */
  exploreImageDebugMeta?: {
    modeTitle: string;
    internalTemplate200: string;
  };
};

export type ExploreImageModeLaunchSeed = {
  modeId?: string;
  modeTitle: string;
  category: "transform" | "prompt" | "guided";
  promptTemplate: string;
  transformIntent?: string;
  sourceImageUrl?: string;
};

export type ExploreImageSessionLaunchState =
  | {
      /** Dedupes React Strict Mode double effect runs (one real apply per launch). */
      launchNonce: string;
      kind: "pipeline";
      modeLaunch?: ExploreImageModeLaunchSeed;
      pipeline: ExploreImagePipelineLaunch;
      /** When false, only seeds UI (e.g. guided focus); launcher should not navigate in that case. */
      autoStart?: boolean;
    }
  | { launchNonce: string; kind: "history"; item: ExploreImageHistorySnapshot };

export function exploreNavigateToImageSession(
  navigate: NavigateFunction,
  state: ExploreImageSessionLaunchState
) {
  navigate(EXPLORE_IMAGE_SESSION_PATH, { state });
}
