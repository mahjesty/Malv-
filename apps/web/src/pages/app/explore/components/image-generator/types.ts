import type { ExploreImageGenerateResponse } from "../../../../../lib/api/dataPlane";

export type ThreadMessage =
  | {
      id: string;
      role: "user";
      /** Visible caption; may be empty when the message is image-only. */
      prompt: string;
      sourceImageUrl?: string;
      /** Transform / mode label for chip UI (must match `prompt` when used). */
      intentLabel?: string;
      intentHint?: string;
      createdAt: number;
    }
  | {
      id: string;
      role: "assistant";
      prompt: string;
      imageUrl: string | null;
      text: string;
      response: ExploreImageGenerateResponse;
      /** Source image (e.g. data URL) used for this generation, for edit / regenerate / continue. */
      sourceImageDataUrl?: string;
      /** When set, regenerate can reuse staged bytes instead of a huge inline payload. */
      sourceImageFileId?: string;
      createdAt: number;
    }
  | {
      id: string;
      role: "generating";
      /** Short status line under the MALV label (no prompt / no reference image). */
      statusLabel?: string;
      createdAt: number;
    };
