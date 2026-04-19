import { useLayoutEffect, useRef } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  exploreCapabilityPath,
  getExploreCapability,
  type ExploreCapabilityDefinition
} from "../../../lib/explore/exploreCapabilityRegistry";
import type { ExploreImageSessionLaunchState } from "../../../lib/explore/exploreImageSessionLaunch";
import { useExploreImageThread } from "./hooks/useExploreImageThread";
import { ImagePreviewPanel } from "./components/image-generator/ImagePreviewPanel";
import { PROMPT_PLACEHOLDER } from "./components/image-generator/constants";
import { PromptExpansionModeBar } from "./components/image-generator/PromptExpansionModeBar";
import { ExploreImagePromptComposer } from "./ExploreImageVercelShell";

function isLaunchState(x: unknown): x is ExploreImageSessionLaunchState {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.launchNonce !== "string" || !o.launchNonce.trim()) return false;
  if (o.kind === "history") {
    const it = o.item;
    if (!it || typeof it !== "object") return false;
    const h = it as Record<string, unknown>;
    return (
      typeof h.id === "string" &&
      typeof h.imageUrl === "string" &&
      typeof h.prompt === "string" &&
      typeof h.text === "string" &&
      typeof h.createdAt === "number"
    );
  }
  if (o.kind === "pipeline") {
    const p = o.pipeline;
    if (!p || typeof p !== "object") return false;
    return typeof (p as { apiPrompt?: string }).apiPrompt === "string";
  }
  return false;
}

export function ExploreImageSessionPage() {
  const def = getExploreCapability("create", "image");
  if (!def) {
    return <Navigate to="/app/explore" replace />;
  }
  return <ExploreImageSessionView def={def} />;
}

function ExploreImageSessionView({ def }: { def: ExploreCapabilityDefinition }) {
  const location = useLocation();
  const launchStateRef = useRef(location.state);

  const {
    prompt,
    setPrompt,
    promptRef,
    messages,
    isGenerating,
    error,
    uploadFlowMessage,
    clearUploadFlowMessage,
    submitComposer,
    seedFromHistoryItem,
    runPipeline,
    threadEndRef,
    abortPendingPipeline,
    promptExpansionMode,
    setPromptExpansionMode
  } = useExploreImageThread(def);

  useLayoutEffect(() => {
    let cancelled = false;
    const raw = launchStateRef.current;
    if (!isLaunchState(raw)) return () => {};

    void (async () => {
      if (raw.kind === "history") {
        if (cancelled) return;
        seedFromHistoryItem(raw.item);
        return;
      }

      if (raw.autoStart !== false) {
        if (cancelled) return;
        await runPipeline(raw.pipeline, { replaceIncompleteUserTurn: true });
      }
    })();

    return () => {
      cancelled = true;
      abortPendingPipeline();
    };
    // One-shot hydration from route state; cleanup aborts Strict Mode's first (discarded) mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const launcherPath = exploreCapabilityPath(def);

  if (!location.state || !isLaunchState(location.state)) {
    return <Navigate to={launcherPath} replace />;
  }

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-background via-background to-[rgb(var(--malv-surface-void-rgb)/0.65)] text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 pb-6 pt-3 min-[400px]:px-4 sm:px-6 sm:pb-8 sm:pt-4 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center gap-3 sm:mb-6">
          <Link
            to={launcherPath}
            className="inline-flex items-center gap-1.5 rounded-full bg-muted/25 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm shadow-black/5 ring-1 ring-border/30 transition hover:bg-muted/40 hover:text-foreground hover:ring-border/50"
          >
            <ArrowLeft className="h-3.5 w-3.5 opacity-70" aria-hidden />
            Image studio
          </Link>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/90">
            Session
          </span>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl bg-destructive/10 px-4 py-3 text-[13px] leading-relaxed text-destructive shadow-sm ring-1 ring-destructive/20 sm:text-sm">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          <ImagePreviewPanel
            threadClassName="malv-explore-thread-surface max-h-[min(72vh,720px)] overflow-y-auto rounded-2xl p-3 min-[400px]:rounded-3xl min-[400px]:p-4 sm:p-5"
            messages={messages}
          />
        </div>

        <div ref={threadEndRef} className="h-px w-full shrink-0 scroll-mt-4" aria-hidden />

        <div className="sticky bottom-0 z-10 mt-5 bg-gradient-to-t from-background via-background/95 to-transparent pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-5 backdrop-blur-[12px] sm:mt-6 sm:pt-6">
          <PromptExpansionModeBar
            className="mb-3 sm:mb-3.5"
            value={promptExpansionMode}
            onChange={setPromptExpansionMode}
            disabled={isGenerating}
          />
          <ExploreImagePromptComposer
            variant="session"
            prompt={prompt}
            setPrompt={setPrompt}
            placeholder={PROMPT_PLACEHOLDER}
            disabled={isGenerating}
            onSubmit={() => void submitComposer()}
            textareaRef={promptRef}
          />
          {uploadFlowMessage ? (
            <p
              role="status"
              className="mt-3 text-center text-[11px] leading-relaxed text-[color:var(--malv-color-text-secondary)] min-[400px]:text-[12px]"
            >
              {uploadFlowMessage}
              <button
                type="button"
                className="ml-2 underline underline-offset-2"
                onClick={() => clearUploadFlowMessage()}
              >
                Dismiss
              </button>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
