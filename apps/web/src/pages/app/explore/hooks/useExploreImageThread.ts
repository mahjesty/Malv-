import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { pushExploreContinue } from "../../../../lib/explore/exploreContinueStorage";
import { exploreCapabilityPath, type ExploreCapabilityDefinition } from "../../../../lib/explore/exploreCapabilityRegistry";
import type { ExploreImageHistorySnapshot, ExploreImagePipelineLaunch } from "../../../../lib/explore/exploreImageSessionLaunch";
import type { ImagePromptExpansionMode } from "../../../../lib/explore/imagePromptExpansionMode";
import type { ThreadMessage } from "../components/image-generator/types";
import { shrinkExploreImageDataUrlIfNeeded } from "../utils/explore-source-image-prep.util";
import { useImageGeneration } from "./useImageGeneration";

export const EXPLORE_IMAGE_HISTORY_STORAGE_KEY = "malv.explore.image-history.v1";

type AssistantMessage = Extract<ThreadMessage, { role: "assistant" }>;

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useExploreImageThread(def: ExploreCapabilityDefinition) {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  /** Supersedes in-flight runs when a new pipeline starts (prevents stale completion + duplicate rows). */
  const pipelineGenerationRef = useRef(0);

  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [imageHistory, setImageHistory] = useState<ExploreImageHistorySnapshot[]>([]);
  const [pendingSourceDataUrl, setPendingSourceDataUrl] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [promptExpansionMode, setPromptExpansionMode] = useState<ImagePromptExpansionMode | null>(null);

  const {
    isGenerating,
    error: generationError,
    uploadFlowMessage,
    setUploadFlowMessage,
    generateImage,
    clearError,
    clearUploadFlowMessage
  } = useImageGeneration(token);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(EXPLORE_IMAGE_HISTORY_STORAGE_KEY, JSON.stringify(imageHistory.slice(0, 40)));
  }, [imageHistory]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "generating") return;
    const id = window.requestAnimationFrame(() => {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [messages]);

  const runPipeline = useCallback(
    async (
      req: ExploreImagePipelineLaunch,
      options?: { replaceIncompleteUserTurn?: boolean }
    ) => {
      const raw = req.apiPrompt.trim();
      if (!raw) return;

      const generation = ++pipelineGenerationRef.current;

      rememberContinue();
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      clearError();
      clearUploadFlowMessage();
      setThreadError(null);

      let sourceDataUrlForThread = req.sourceImageDataUrl;
      if (sourceDataUrlForThread && !req.sourceImageFileId) {
        try {
          sourceDataUrlForThread = await shrinkExploreImageDataUrlIfNeeded(sourceDataUrlForThread);
        } catch {
          setThreadError("Could not resize that image. Try a smaller file.");
          return;
        }
      }

      const previewUrl = (req.threadSourceImageUrl ?? "").trim() || undefined;
      const userImageUrl = sourceDataUrlForThread ?? previewUrl;

      /** Prefer staged bytes for API; include data URL when we have one so prompt + pixels ship in one request. */
      const bindingDataUrl =
        sourceDataUrlForThread ??
        (previewUrl && previewUrl.startsWith("data:") ? previewUrl : undefined);

      const intentLabel = (req.threadIntentLabel ?? "").trim() || undefined;
      const intentHint = (req.threadIntentHint ?? "").trim() || undefined;
      const caption = (req.threadUserCaption ?? req.userFacingPrompt ?? "").trim();
      const hasSourceVisual = Boolean(userImageUrl) || Boolean(req.sourceImageFileId);
      const userDisplayPrompt =
        intentLabel ?? (hasSourceVisual ? caption : caption || raw);

      const userId = makeId("user");
      const generatingId = makeId("gen");
      const now = Date.now();

      setMessages((prev) => {
        if (generation !== pipelineGenerationRef.current) return prev;
        let next = prev.filter((msg) => msg.role !== "generating");
        if (options?.replaceIncompleteUserTurn && next.length > 0) {
          const last = next[next.length - 1];
          if (last.role === "user") next = next.slice(0, -1);
        }
        return [
          ...next,
          {
            id: userId,
            role: "user",
            prompt: userDisplayPrompt,
            ...(userImageUrl ? { sourceImageUrl: userImageUrl } : {}),
            ...(intentLabel ? { intentLabel, ...(intentHint ? { intentHint } : {}) } : {}),
            createdAt: now
          },
          {
            id: generatingId,
            role: "generating",
            statusLabel: req.generatingCaption?.trim() || undefined,
            createdAt: now + 1
          }
        ];
      });

      if (import.meta.env.DEV) {
        // Temporary: verify internal template + composed prompt reach the API (remove once stable).
        // eslint-disable-next-line no-console -- dev-only explore-image handoff audit
        console.debug("[explore-image] generate request", {
          modeId: req.modeId,
          modeTitle: req.exploreImageDebugMeta?.modeTitle,
          internalTemplate200: req.exploreImageDebugMeta?.internalTemplate200,
          composedPrompt200: raw.slice(0, 200),
          hasSourceImage: Boolean(bindingDataUrl || req.sourceImageFileId)
        });
      }

      const expansion =
        req.promptExpansionMode !== undefined && req.promptExpansionMode !== null
          ? req.promptExpansionMode
          : promptExpansionMode;

      const res = await generateImage(raw, token ? abortRef.current.signal : undefined, {
        sourceImageDataUrl: bindingDataUrl,
        sourceImageFileId: req.sourceImageFileId,
        modeId: req.modeId,
        ...(expansion ? { promptExpansionMode: expansion } : {})
      });

      if (generation !== pipelineGenerationRef.current) return;

      if (!res) {
        setMessages((prev) =>
          prev.filter((msg) => {
            if (msg.id === generatingId) return false;
            if (!token && msg.id === userId) return false;
            return true;
          })
        );
        return;
      }

      const interpretation = (res.directionSummary ?? "").trim();

      const assistantMessage: AssistantMessage = {
        id: makeId("assistant"),
        role: "assistant",
        prompt: raw,
        imageUrl: res.imageUrl ?? null,
        text: interpretation,
        response: res,
        sourceImageDataUrl: sourceDataUrlForThread,
        sourceImageFileId: req.sourceImageFileId,
        createdAt: Date.now()
      };

      setMessages((prev) => prev.filter((msg) => msg.id !== generatingId).concat(assistantMessage));

      if (req.clearPendingSourceAfter !== false) {
        setPendingSourceDataUrl(null);
      }

      const generatedUrl = assistantMessage.imageUrl;
      if (generatedUrl) {
        setImageHistory((prev) => [
          {
            id: assistantMessage.id,
            imageUrl: generatedUrl,
            prompt: assistantMessage.prompt,
            text: assistantMessage.text,
            createdAt: assistantMessage.createdAt
          },
          ...prev.filter((item) => item.imageUrl !== generatedUrl)
        ]);
      }
    },
    [token, generateImage, rememberContinue, clearError, clearUploadFlowMessage, promptExpansionMode]
  );

  const submitComposer = useCallback(() => {
    void runPipeline({
      apiPrompt: prompt,
      userFacingPrompt: prompt.trim(),
      sourceImageDataUrl: pendingSourceDataUrl ?? undefined,
      clearPendingSourceAfter: true,
      promptExpansionMode
    });
  }, [prompt, pendingSourceDataUrl, promptExpansionMode, runPipeline]);

  const seedFromHistoryItem = useCallback((item: ExploreImageHistorySnapshot) => {
    setPrompt(item.prompt);
    setMessages(() => {
      const assistantMessage: AssistantMessage = {
        id: `history-${item.id}-${Date.now()}`,
        role: "assistant",
        prompt: item.prompt,
        imageUrl: item.imageUrl,
        text: item.text,
        response: {
          status: "done",
          interpretation: { refinedPrompt: item.prompt, inferred: {}, confidence: 1 },
          imageUrl: item.imageUrl,
          directionSummary: item.text
        },
        createdAt: Date.now()
      };
      return [
        { id: makeId("user"), role: "user", prompt: item.prompt, createdAt: Date.now() - 1 },
        assistantMessage
      ];
    });
    requestAnimationFrame(() => promptRef.current?.focus());
  }, []);

  const error = generationError ?? threadError;

  const abortPendingPipeline = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    prompt,
    setPrompt,
    promptRef,
    messages,
    setMessages,
    imageHistory,
    pendingSourceDataUrl,
    setPendingSourceDataUrl,
    isGenerating,
    error,
    uploadFlowMessage,
    setUploadFlowMessage,
    clearError,
    clearUploadFlowMessage,
    runPipeline,
    submitComposer,
    seedFromHistoryItem,
    threadEndRef,
    abortPendingPipeline,
    promptExpansionMode,
    setPromptExpansionMode
  };
}
