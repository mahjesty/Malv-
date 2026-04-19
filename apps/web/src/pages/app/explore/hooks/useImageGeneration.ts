import { useCallback, useState } from "react";
import { postExploreImageGenerate, type ExploreImageGenerateResponse } from "../../../../lib/api/dataPlane";
import {
  EXPLORE_IMAGE_PAYLOAD_TOO_LARGE_HINT,
  isExploreImagePayloadTooLargeMessage,
  parseNestErrorMessage
} from "../../../../lib/api/http-core";

export type ExploreImageGenerateOptions = {
  sourceImageDataUrl?: string;
  sourceImageFileId?: string;
  modeId?: string;
  promptExpansionMode?: string;
};

type UseImageGenerationReturn = {
  isGenerating: boolean;
  error: string | null;
  uploadFlowMessage: string | null;
  setUploadFlowMessage: (message: string | null) => void;
  generateImage: (
    prompt: string,
    signal?: AbortSignal,
    opts?: ExploreImageGenerateOptions
  ) => Promise<ExploreImageGenerateResponse | null>;
  clearError: () => void;
  clearUploadFlowMessage: () => void;
};

export function useImageGeneration(token: string | undefined): UseImageGenerationReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFlowMessage, setUploadFlowMessage] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);
  const clearUploadFlowMessage = useCallback(() => setUploadFlowMessage(null), []);

  const generateImage = useCallback(
    async (
      prompt: string,
      signal?: AbortSignal,
      opts?: ExploreImageGenerateOptions
    ): Promise<ExploreImageGenerateResponse | null> => {
      if (!token) {
        setError("Sign in to run the image pipeline.");
        return null;
      }
      const raw = prompt.trim();
      if (!raw) {
        setError("Describe what you want, then MALV will generate.");
        return null;
      }
      setIsGenerating(true);
      setError(null);
      setUploadFlowMessage(null);
      try {
        return await postExploreImageGenerate(
          token,
          {
            prompt: raw,
            ...(opts?.sourceImageFileId ? { sourceImageFileId: opts.sourceImageFileId } : {}),
            ...(opts?.sourceImageDataUrl ? { sourceImageDataUrl: opts.sourceImageDataUrl } : {}),
            ...(opts?.modeId ? { modeId: opts.modeId } : {}),
            ...(opts?.promptExpansionMode ? { promptExpansionMode: opts.promptExpansionMode } : {})
          },
          signal
        );
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return null;
        const msg = e instanceof Error ? parseNestErrorMessage(e) : "Pipeline failed.";
        if (isExploreImagePayloadTooLargeMessage(msg)) {
          setUploadFlowMessage(EXPLORE_IMAGE_PAYLOAD_TOO_LARGE_HINT);
          setError(null);
        } else {
          setError(msg);
        }
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [token]
  );

  return {
    isGenerating,
    error,
    uploadFlowMessage,
    setUploadFlowMessage,
    generateImage,
    clearError,
    clearUploadFlowMessage
  };
}
