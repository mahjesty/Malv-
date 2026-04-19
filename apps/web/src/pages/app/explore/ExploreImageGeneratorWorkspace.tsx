import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../lib/auth/AuthContext";
import { uploadFileToStorage } from "../../../lib/api/dataPlane";
import { EXPLORE_IMAGE_PAYLOAD_TOO_LARGE_HINT, isExploreImagePayloadTooLargeMessage } from "../../../lib/api/http-core";
import { pushExploreContinue } from "../../../lib/explore/exploreContinueStorage";
import { exploreCapabilityPath, type ExploreCapabilityDefinition } from "../../../lib/explore/exploreCapabilityRegistry";
import {
  exploreNavigateToImageSession,
  type ExploreImageHistorySnapshot,
  type ExploreImageSessionLaunchState
} from "../../../lib/explore/exploreImageSessionLaunch";
import { ImageUploadModal } from "./components/image-generator/ImageUploadModal";
import { IMAGE_TRANSFORM_CARDS, PROMPT_PLACEHOLDER, type ImageModeCard } from "./components/image-generator/constants";
import { pickLaunchForCard } from "./components/image-generator/image-mode.model";
import {
  exploreSourcePrepareErrorMessage,
  prepareExploreSourceImage,
  shrinkExploreImageDataUrlIfNeeded
} from "./utils/explore-source-image-prep.util";
import { composeTransformPrompt } from "./utils/transform-prompt-composer";
import { ExploreImageVercelShell } from "./ExploreImageVercelShell";
import { EXPLORE_IMAGE_HISTORY_STORAGE_KEY } from "./hooks/useExploreImageThread";

type Props = { def: ExploreCapabilityDefinition };

type StagedExploreSource = {
  sourceDataUrl: string;
  sourceFileId: string;
  sourceWidth: number;
  sourceHeight: number;
  originalFileName: string;
};

function formatExploreUploadStagingError(e: unknown): { userMessage: string; devDetail: string } {
  const devDetail = e instanceof Error ? e.message : String(e);
  const code = typeof e === "object" && e && "code" in e ? String((e as { code?: string }).code) : "";
  if (code === "FILE_TOO_LARGE" || code === "UNSUPPORTED_IMAGE") {
    return { userMessage: exploreSourcePrepareErrorMessage(code), devDetail };
  }
  if (isExploreImagePayloadTooLargeMessage(devDetail)) {
    return { userMessage: EXPLORE_IMAGE_PAYLOAD_TOO_LARGE_HINT, devDetail };
  }
  if (import.meta.env.DEV) {
    return {
      userMessage:
        devDetail.trim() || "Upload could not be staged. Check your connection and try again.",
      devDetail
    };
  }
  return {
    userMessage: "Upload could not be staged. Check your connection and try again.",
    devDetail
  };
}

function makeLaunchNonce(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ln-${Date.now()}`;
}

/** Avoid router history state limits: drop inline previews while keeping fileId-backed pipeline runs. */
function trimLaunchState(state: ExploreImageSessionLaunchState): ExploreImageSessionLaunchState {
  try {
    if (JSON.stringify(state).length < 1_400_000) return state;
  } catch {
    return state;
  }
  if (state.kind !== "pipeline") return state;
  return {
    ...state,
    pipeline: {
      ...state.pipeline,
      sourceImageDataUrl: undefined,
      threadSourceImageUrl: undefined
    }
  };
}

export function ExploreImageGeneratorWorkspace({ def }: Props) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const [prompt, setPrompt] = useState("");
  const [imageHistory, setImageHistory] = useState<ExploreImageHistorySnapshot[]>([]);
  const [uploadCard, setUploadCard] = useState<ImageModeCard | null>(null);
  const [pendingSourceDataUrl, setPendingSourceDataUrl] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [uploadFlowMessage, setUploadFlowMessage] = useState<string | null>(null);
  const [uploadStagingDevDetail, setUploadStagingDevDetail] = useState<string | null>(null);
  const [launchBusy, setLaunchBusy] = useState(false);

  useEffect(() => {
    const q = (searchParams.get("q") ?? "").trim();
    if (q) setPrompt(q);
  }, [searchParams]);

  const rememberContinue = useCallback(() => {
    pushExploreContinue({
      href: exploreCapabilityPath(def),
      title: def.title,
      subtitle: "Image studio"
    });
  }, [def]);

  useEffect(() => {
    rememberContinue();
  }, [rememberContinue]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(EXPLORE_IMAGE_HISTORY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ExploreImageHistorySnapshot[];
      if (!Array.isArray(parsed)) return;
      setImageHistory(parsed);
    } catch {
      // ignore corrupt storage
    }
  }, []);

  const clearUploadFlowMessage = useCallback(() => setUploadFlowMessage(null), []);

  const submitComposer = useCallback(() => {
    const raw = prompt.trim();
    if (!raw) return;
    rememberContinue();
    setHandoffError(null);
    clearUploadFlowMessage();
    exploreNavigateToImageSession(
      navigate,
      trimLaunchState({
        launchNonce: makeLaunchNonce(),
        kind: "pipeline",
        pipeline: {
          apiPrompt: raw,
          userFacingPrompt: raw,
          sourceImageDataUrl: pendingSourceDataUrl ?? undefined,
          clearPendingSourceAfter: true
        }
      })
    );
    setPrompt("");
    setPendingSourceDataUrl(null);
  }, [clearUploadFlowMessage, navigate, pendingSourceDataUrl, prompt, rememberContinue]);

  const downloadResult = useCallback((imageUrl: string) => {
    const anchor = document.createElement("a");
    anchor.href = imageUrl;
    anchor.download = `malv-image-${Date.now()}.png`;
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, []);

  const runExploreImageLaunch = useCallback(
    async (card: ImageModeCard, staged: StagedExploreSource | undefined) => {
      const template = card.promptTemplate.trim();
      if (!template) {
        setHandoffError("This mode is not configured yet. Try another card.");
        return;
      }

      const hasUpload = staged != null;

      const shouldAutoGenerate = card.autoGenerate !== false;
      if (!shouldAutoGenerate) {
        if (hasUpload) {
          setPrompt("");
        } else {
          setPrompt(template);
        }
        requestAnimationFrame(() => promptRef.current?.focus());
        return;
      }

      rememberContinue();

      const composedPrompt = composeTransformPrompt({
        mode: card,
        sourceImage: hasUpload
          ? {
              fileName: staged.originalFileName,
              width: staged.sourceWidth,
              height: staged.sourceHeight
            }
          : undefined,
        userText: null
      });

      let modeSourcePreview = staged?.sourceDataUrl;
      if (modeSourcePreview) {
        try {
          modeSourcePreview = await shrinkExploreImageDataUrlIfNeeded(modeSourcePreview);
        } catch {
          modeSourcePreview = undefined;
        }
      }

      const intentHint = (card.shortHint ?? card.subtitle ?? card.teaser ?? "").trim() || undefined;

      const sourceFileId = staged?.sourceFileId;
      const sourceDataUrl = staged?.sourceDataUrl;

      const pipeline =
        hasUpload && card.category === "transform"
          ? {
              apiPrompt: composedPrompt,
              threadIntentLabel: card.title.trim(),
              ...(intentHint ? { threadIntentHint: intentHint } : {}),
              generatingCaption: `Generating · ${card.title}`,
              sourceImageDataUrl: undefined as string | undefined,
              threadSourceImageUrl: modeSourcePreview,
              sourceImageFileId: sourceFileId,
              modeId: card.id,
              clearPendingSourceAfter: true as const,
              ...(import.meta.env.DEV
                ? {
                    exploreImageDebugMeta: {
                      modeTitle: card.title.trim(),
                      internalTemplate200: card.promptTemplate.trim().slice(0, 200)
                    }
                  }
                : {})
            }
          : {
              apiPrompt: composedPrompt,
              userFacingPrompt: composedPrompt.trim(),
              sourceImageDataUrl: sourceFileId ? undefined : sourceDataUrl,
              threadSourceImageUrl: sourceFileId ? modeSourcePreview : undefined,
              sourceImageFileId: sourceFileId,
              modeId: card.id,
              clearPendingSourceAfter: true as const,
              ...(import.meta.env.DEV
                ? {
                    exploreImageDebugMeta: {
                      modeTitle: card.title.trim(),
                      internalTemplate200: card.promptTemplate.trim().slice(0, 200)
                    }
                  }
                : {})
            };

      const state: ExploreImageSessionLaunchState = {
        launchNonce: makeLaunchNonce(),
        kind: "pipeline",
        pipeline,
        autoStart: true
      };

      exploreNavigateToImageSession(navigate, trimLaunchState(state));
      setPrompt("");
    },
    [navigate, rememberContinue]
  );

  const handleSourceImageStaging = useCallback(
    async (file: File) => {
      const card = uploadCard;
      if (!card) return;
      if (!token) {
        setHandoffError("Sign in to run transforms on an upload.");
        return;
      }
      clearUploadFlowMessage();
      setUploadStagingDevDetail(null);
      setHandoffError(null);
      setLaunchBusy(true);
      try {
        const prep = await prepareExploreSourceImage(file);
        const reg = await uploadFileToStorage(token, { file: prep.uploadFile, fileKind: "image" });
        let sourceDataUrl = prep.previewDataUrl;
        try {
          sourceDataUrl = await shrinkExploreImageDataUrlIfNeeded(sourceDataUrl);
        } catch {
          setHandoffError("Could not resize that image. Try a smaller file.");
          return;
        }

        const staged: StagedExploreSource = {
          sourceDataUrl,
          sourceFileId: reg.fileId,
          sourceWidth: prep.sourceWidth,
          sourceHeight: prep.sourceHeight,
          originalFileName: file.name || "upload"
        };

        clearUploadFlowMessage();
        setUploadStagingDevDetail(null);
        setUploadCard(null);
        setPendingSourceDataUrl(null);
        await runExploreImageLaunch(card, staged);
      } catch (e) {
        const { userMessage, devDetail } = formatExploreUploadStagingError(e);
        setUploadFlowMessage(userMessage);
        setUploadStagingDevDetail(import.meta.env.DEV ? devDetail : null);
      } finally {
        setLaunchBusy(false);
      }
    },
    [uploadCard, token, clearUploadFlowMessage, runExploreImageLaunch]
  );

  const launchMode = useCallback(
    async (card: ImageModeCard) => {
      setPendingSourceDataUrl(null);
      setHandoffError(null);
      clearUploadFlowMessage();
      setUploadStagingDevDetail(null);
      const template = card.promptTemplate.trim();
      if (!template) {
        setHandoffError("This mode is not configured yet. Try another card.");
        return;
      }

      const shouldAutoGenerate = card.autoGenerate !== false;
      if (!shouldAutoGenerate) {
        setPrompt(template);
        requestAnimationFrame(() => promptRef.current?.focus());
        return;
      }

      await runExploreImageLaunch(card, undefined);
    },
    [clearUploadFlowMessage, runExploreImageLaunch]
  );

  const handlePickMode = (card: ImageModeCard) => {
    const behavior = pickLaunchForCard(card);
    if (behavior === "upload_then_generate") {
      clearUploadFlowMessage();
      setUploadCard(card);
      return;
    }
    void launchMode(card);
  };

  const handleHistorySelect = (item: ExploreImageHistorySnapshot) => {
    rememberContinue();
    exploreNavigateToImageSession(navigate, {
      launchNonce: makeLaunchNonce(),
      kind: "history",
      item
    });
  };

  const error = handoffError;

  return (
    <>
      <ExploreImageVercelShell
        prompt={prompt}
        setPrompt={setPrompt}
        placeholder={PROMPT_PLACEHOLDER}
        isGenerating={launchBusy}
        onSubmitPrompt={() => void submitComposer()}
        promptTextareaRef={promptRef}
        error={error}
        promptNotice={uploadFlowMessage}
        transformCards={IMAGE_TRANSFORM_CARDS}
        onPickMode={handlePickMode}
        historyItems={imageHistory}
        onHistoryDownload={(url) => downloadResult(url)}
        onHistorySelect={handleHistorySelect}
      />

      <ImageUploadModal
        open={Boolean(uploadCard)}
        card={uploadCard}
        busy={launchBusy}
        launchOnFileSelect
        notice={uploadFlowMessage}
        devErrorDetail={uploadStagingDevDetail}
        onClose={() => {
          setUploadCard(null);
          clearUploadFlowMessage();
          setUploadStagingDevDetail(null);
        }}
        onConfirm={(file) => void handleSourceImageStaging(file)}
      />
    </>
  );
}
