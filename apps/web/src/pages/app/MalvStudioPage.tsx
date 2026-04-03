import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  Bug,
  Check,
  CheckCheck,
  ChevronRight,
  Eye,
  FileCode2,
  Fullscreen,
  History,
  LayoutPanelTop,
  Monitor,
  ShieldCheck,
  RefreshCcw,
  Smartphone,
  Tablet,
  Wand2,
  X
} from "lucide-react";
import { useAuth } from "../../lib/auth/AuthContext";
import { ModuleShell } from "./common/ModuleShell";
import {
  applyStudioChanges,
  compareStudioVersions,
  captureStudioTarget,
  createStudioSession,
  fetchConversationDetail,
  fetchStudioVersions,
  revertStudioChanges,
  restoreStudioVersion,
  sendStudioInstruction,
  type StudioSession
} from "../../lib/api/dataPlane";
import { buildStudioHandoffComposerText } from "../../lib/conversationExport";
import { createMalvSocket } from "../../lib/realtime/socket";
import { mergeStudioRuntimeEvent, mergeStudioRuntimeReplay, runtimeEventKey, type StudioRuntimeEvent } from "../../lib/studio/studioRuntimeEvents";
import { classifySemanticRegion, computeOverlayRect, type OverlayRect, type SemanticRegion } from "../../lib/studio/previewOverlay";
import {
  detectInspectableIframe,
  findTargetBySignature,
  resolveTargetFromPointer,
  scanIframeSemanticTargets,
  type BridgeSemanticTarget
} from "../../lib/studio/iframeDomBridge";
import {
  diffPanelCaption,
  readProductTruth,
  studioResultHeadline,
  studioResultSummaryLines
} from "../../lib/studio/studioProductTruth";

type DeviceMode = "desktop" | "tablet" | "mobile";
type LayoutMode = "chat_preview" | "chat_inspect" | "full_preview" | "focused_chat";
type ScopeMode = "element" | "component" | "section" | "page";
type StudioMode = "build" | "preview" | "inspect" | "debug" | "full_preview" | "focus";
type PreviewTarget = { label: string; selector: string; componentName: string; route: string; contextText: string };
type StudioConfidence = "high" | "medium" | "low";
type OnboardingStage = 1 | 2 | 3 | 4;
type PreviewVisualState = "idle" | "refining" | "updated";

const ONBOARDING_STORAGE_KEY = "malv_studio_onboarding_v1";
const ONBOARDING_DONE_KEY = "malv_studio_onboarding_done_v1";
const starterActions = ["Improve this page", "Make this more premium", "Start from scratch"];
const quickActionPrompts = ["Make this more premium", "Improve spacing", "Change theme", "Optimize mobile", "Clean up layout"];

const mockTargets: PreviewTarget[] = [
  { label: "Hero Section", selector: "[data-hero]", componentName: "HeroPanel", route: "/landing", contextText: "Build premium UI with MALV Studio" },
  { label: "Navbar", selector: "header nav", componentName: "TopNavigation", route: "/landing", contextText: "Studio, Features, Pricing" },
  { label: "Pricing Card", selector: "[data-pricing-card='pro']", componentName: "PricingGrid", route: "/landing", contextText: "Pro annual" },
  { label: "CTA Button", selector: "button[data-cta='start']", componentName: "PrimaryCTA", route: "/landing", contextText: "Start building" }
];

function toPreviewTargetFromBridge(target: BridgeSemanticTarget): PreviewTarget {
  return {
    label: target.label,
    selector: target.selector,
    componentName: target.componentName,
    route: "/landing",
    contextText: target.contextText
  };
}

export function MalvStudioPage() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [session, setSession] = useState<StudioSession | null>(null);
  const [versions, setVersions] = useState<Array<Record<string, unknown>>>([]);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("chat_preview");
  const [studioMode, setStudioMode] = useState<StudioMode>("build");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("section");
  const [selectedTarget, setSelectedTarget] = useState<PreviewTarget | null>(null);
  const [composer, setComposer] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    { role: "assistant", text: "MALV Studio is ready. Select a surface in preview or describe the UI upgrade you want." }
  ]);
  const [showInspect, setShowInspect] = useState(true);
  const [showConsole, setShowConsole] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [split, setSplit] = useState(48);
  const [hoveredTarget, setHoveredTarget] = useState<PreviewTarget | null>(null);
  const [showAdminInsights, setShowAdminInsights] = useState(false);
  const [riskGateNeeded, setRiskGateNeeded] = useState(false);
  const [stateTag, setStateTag] = useState<"preview" | "applied">("preview");
  const [compareVersionIds, setCompareVersionIds] = useState<{ left: string; right: string }>({ left: "", right: "" });
  const [compareSummary, setCompareSummary] = useState<string>("");
  const [showWelcome, setShowWelcome] = useState(false);
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [onboardingStage, setOnboardingStage] = useState<OnboardingStage>(1);
  const [firstEditCompleted, setFirstEditCompleted] = useState(false);
  const [showWhatHappened, setShowWhatHappened] = useState(false);
  const [previewVisualState, setPreviewVisualState] = useState<PreviewVisualState>("idle");
  const [previewPulseKey, setPreviewPulseKey] = useState(0);
  const [previewSuccessNote, setPreviewSuccessNote] = useState("");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [liveState, setLiveState] = useState<"live" | "reconnecting" | "offline">("offline");
  const [streamFallbackMode, setStreamFallbackMode] = useState(false);
  const [overlayRect, setOverlayRect] = useState<OverlayRect | null>(null);
  const [overlayRegion, setOverlayRegion] = useState<SemanticRegion>("unknown");
  const [overlayPrecise, setOverlayPrecise] = useState(false);
  const [iframeBridgeReady, setIframeBridgeReady] = useState(false);
  const [iframeBridgeReason, setIframeBridgeReason] = useState<string>("");
  const [iframeBridgeTargets, setIframeBridgeTargets] = useState<BridgeSemanticTarget[]>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const selectedBridgeSignatureRef = useRef<string | null>(null);
  const seenEventKeysRef = useRef<Set<string>>(new Set());
  const lastUpdateTokenRef = useRef<string>("");
  const previewSurfaceRef = useRef<HTMLDivElement | null>(null);
  const targetNodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const pendingSummary = (session?.pendingChangeSummary as Record<string, unknown> | null) ?? null;
  const productTruth = readProductTruth(pendingSummary);
  const rawDiffPreview = pendingSummary?.diffPreview;
  const diffPreviewText =
    typeof rawDiffPreview === "string" && rawDiffPreview.trim().length > 0 ? rawDiffPreview.trim() : "";
  const diffCaption = diffPanelCaption(productTruth, Boolean(diffPreviewText));
  const confidence = String(pendingSummary?.confidence ?? "medium").toLowerCase() as StudioConfidence;
  const confidenceLabel = confidence === "high" ? "High" : confidence === "low" ? "Low" : "Medium";
  const continuityMode = String(pendingSummary?.continuityMode ?? "continuing");

  const confidenceTone =
    confidence === "high"
      ? "text-emerald-200 border-emerald-300/25 bg-emerald-400/10"
      : confidence === "low"
        ? "text-amber-100 border-amber-300/25 bg-amber-400/10"
        : "text-cyan-100 border-cyan-300/25 bg-cyan-400/10";
  const riskLevel = String(pendingSummary?.riskLevel ?? "medium");
  const planPhases = (pendingSummary?.plan as Array<Record<string, unknown>> | undefined) ?? [];
  const changeInsights = (pendingSummary?.insights as string[] | undefined) ?? [];
  const consoleEntries = (pendingSummary?.console as Array<Record<string, unknown>> | undefined) ?? [];
  const terminalEntries = (pendingSummary?.terminal as Array<Record<string, unknown>> | undefined) ?? [];
  const livePlanPhases = (session?.pendingChangeSummary as Record<string, unknown> | null)?.plan as Array<Record<string, unknown>> | undefined;
  const liveConsoleEntries = (session?.pendingChangeSummary as Record<string, unknown> | null)?.console as Array<Record<string, unknown>> | undefined;
  const liveTerminalEntries = (session?.pendingChangeSummary as Record<string, unknown> | null)?.terminal as Array<Record<string, unknown>> | undefined;

  const lastUserLine = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].text;
    }
    return undefined;
  }, [messages]);

  const hasUserSubmitted = useMemo(() => messages.some((m) => m.role === "user"), [messages]);

  const changedFiles = (pendingSummary?.changedFiles as string[] | undefined) ?? [];

  const resultHeadline = useMemo(
    () =>
      studioResultHeadline({
        pendingTitle:
          typeof pendingSummary?.title === "string" && pendingSummary.title.trim() ? pendingSummary.title.trim() : undefined,
        lastUserLine,
        selectedLabel: selectedTarget?.label,
        hasPreviewRun: hasUserSubmitted
      }),
    [pendingSummary?.title, lastUserLine, selectedTarget?.label, hasUserSubmitted]
  );

  const resultSummaryLines = useMemo(
    () =>
      studioResultSummaryLines({
        pending: pendingSummary,
        selectedLabel: selectedTarget?.label,
        scopeMode,
        stateTag,
        previewStatusNote: streamFallbackMode
          ? "Live stream snapshot — runtime events may be partial while reconnecting."
          : ""
      }),
    [pendingSummary, selectedTarget?.label, scopeMode, stateTag, streamFallbackMode]
  );

  const fromConversation = searchParams.get("fromConversation");

  useEffect(() => {
    if (!fromConversation || !accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchConversationDetail(accessToken, fromConversation);
        if (cancelled) return;
        setComposer(buildStudioHandoffComposerText(d));
        setSearchParams(
          (p) => {
            p.delete("fromConversation");
            return p;
          },
          { replace: true }
        );
      } catch {
        setSearchParams(
          (p) => {
            p.delete("fromConversation");
            return p;
          },
          { replace: true }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, fromConversation, setSearchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = window.localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
    const dismissed = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
    if (!done && !dismissed) setShowWelcome(true);
    if (done || dismissed) setOnboardingDismissed(true);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    (async () => {
      const res = await createStudioSession(accessToken, { title: "MALV Studio" });
      if (!active) return;
      setSession(res.session);
      const v = await fetchStudioVersions(accessToken, res.session.id);
      if (active) setVersions(v.versions ?? []);
      if (active) setShowEmptyState((v.versions ?? []).length === 0);
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !session?.id) return;
    const socket = createMalvSocket();
    const onConnect = () => {
      setLiveState("live");
      setStreamFallbackMode(false);
      socket.emit("studio:join_session", { sessionId: session.id });
    };
    const onDisconnect = () => setLiveState("reconnecting");
    const onRuntimeEvent = (event: StudioRuntimeEvent) => {
      if (!event || event.sessionId !== session.id) return;
      const key = runtimeEventKey(event);
      if (seenEventKeysRef.current.has(key)) return;
      seenEventKeysRef.current.add(key);
      setSession((prev) => {
        if (!prev) return prev;
        const summary = (prev.pendingChangeSummary as Record<string, unknown> | null) ?? {};
        const merged = mergeStudioRuntimeEvent(
          {
            plan: (summary.plan as Array<Record<string, unknown>> | undefined) ?? [],
            console: (summary.console as Array<Record<string, unknown>> | undefined) ?? [],
            terminal: (summary.terminal as Array<Record<string, unknown>> | undefined) ?? [],
            previewLiveState: "idle",
            riskLevel: summary.riskLevel != null ? String(summary.riskLevel) : undefined,
            confidence: summary.confidence != null ? String(summary.confidence) : undefined,
            applyState: summary.applyState != null ? String(summary.applyState) : undefined
          },
          event
        );
        return {
          ...prev,
          pendingChangeSummary: {
            ...summary,
            plan: merged.plan,
            console: merged.console,
            terminal: merged.terminal,
            riskLevel: merged.riskLevel ?? summary.riskLevel,
            confidence: merged.confidence ?? summary.confidence,
            applyState: merged.applyState ?? summary.applyState,
            previewLiveState: merged.previewLiveState
          }
        };
      });
    };
    const onRuntimeReplay = (payload: { sessionId: string; events: StudioRuntimeEvent[] }) => {
      if (!payload || payload.sessionId !== session.id) return;
      const events = Array.isArray(payload.events) ? payload.events : [];
      setSession((prev) => {
        if (!prev) return prev;
        const summary = (prev.pendingChangeSummary as Record<string, unknown> | null) ?? {};
        const merged = mergeStudioRuntimeReplay(
          {
            plan: (summary.plan as Array<Record<string, unknown>> | undefined) ?? [],
            console: (summary.console as Array<Record<string, unknown>> | undefined) ?? [],
            terminal: (summary.terminal as Array<Record<string, unknown>> | undefined) ?? [],
            previewLiveState: "idle",
            riskLevel: summary.riskLevel != null ? String(summary.riskLevel) : undefined,
            confidence: summary.confidence != null ? String(summary.confidence) : undefined,
            applyState: summary.applyState != null ? String(summary.applyState) : undefined
          },
          events,
          seenEventKeysRef.current
        );
        return {
          ...prev,
          pendingChangeSummary: {
            ...summary,
            plan: merged.plan,
            console: merged.console,
            terminal: merged.terminal,
            riskLevel: merged.riskLevel ?? summary.riskLevel,
            confidence: merged.confidence ?? summary.confidence,
            applyState: merged.applyState ?? summary.applyState,
            previewLiveState: merged.previewLiveState
          }
        };
      });
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("studio:runtime_event", onRuntimeEvent);
    socket.on("studio:runtime_replay", onRuntimeReplay);
    if (socket.connected) onConnect();
    return () => {
      socket.emit("studio:leave_session", { sessionId: session.id });
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("studio:runtime_event", onRuntimeEvent);
      socket.off("studio:runtime_replay", onRuntimeReplay);
      socket.disconnect();
      setLiveState("offline");
      setStreamFallbackMode(true);
    };
  }, [accessToken, session?.id]);

  useEffect(() => {
    if (selectedTarget && onboardingStage < 2) setOnboardingStage(2);
  }, [selectedTarget, onboardingStage]);

  useEffect(() => {
    if (firstEditCompleted && onboardingStage < 3) setOnboardingStage(3);
  }, [firstEditCompleted, onboardingStage]);

  useEffect(() => {
    if ((showVersions || showInspect) && onboardingStage < 4) setOnboardingStage(4);
  }, [showVersions, showInspect, onboardingStage]);

  const composerChip = useMemo(() => (selectedTarget ? `[${selectedTarget.label}] ` : ""), [selectedTarget]);
  const sendPrompt = async () => {
    if (!accessToken || !session || !composer.trim()) return;
    const full = `${composerChip}${composer.trim()}`;
    setBusy(true);
    setStudioMode("preview");
    setStatus("Building preview safely...");
    setPreviewVisualState("refining");
    setMessages((m) => [...m, { role: "user", text: full }]);
    try {
      const next = await sendStudioInstruction(accessToken, session.id, { instruction: full });
      setSession(next.session);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `Prepared preview update for ${selectedTarget?.label ?? "selected scope"}. Open Inspect for diff summary and apply/revert controls.`
        }
      ]);
      setComposer("");
      const v = await fetchStudioVersions(accessToken, session.id);
      setVersions(v.versions ?? []);
      setStatus("Preview updated.");
      setStateTag("preview");
      const insight = (next.session.pendingChangeSummary as Record<string, unknown> | null)?.insights as string[] | undefined;
      setPreviewSuccessNote((insight && insight[0]) || "Preview refined.");
      const token = `${next.session.updatedAt}:${next.session.id}`;
      if (lastUpdateTokenRef.current !== token) {
        lastUpdateTokenRef.current = token;
        setPreviewVisualState("updated");
        setPreviewPulseKey((k) => k + 1);
      }
      if (!firstEditCompleted) {
        setFirstEditCompleted(true);
        setShowWhatHappened(true);
        setOnboardingDismissed(true);
        if (typeof window !== "undefined") window.localStorage.setItem(ONBOARDING_DONE_KEY, "1");
      }
    } catch {
      setStatus("Preview build failed. Check logs and iterate.");
      setPreviewVisualState("idle");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (previewVisualState !== "updated") return;
    const delay = prefersReducedMotion ? 900 : 1600;
    const t = window.setTimeout(() => setPreviewVisualState("idle"), delay);
    return () => window.clearTimeout(t);
  }, [previewVisualState, prefersReducedMotion]);

  useEffect(() => {
    const livePreviewState = String((session?.pendingChangeSummary as Record<string, unknown> | null)?.previewLiveState ?? "");
    if (livePreviewState === "refining") setPreviewVisualState("refining");
    if (livePreviewState === "ready") {
      setPreviewVisualState("updated");
      setPreviewPulseKey((k) => k + 1);
    }
    if (livePreviewState === "error") setPreviewVisualState("idle");
  }, [session?.pendingChangeSummary]);

  const syncIframeBridge = () => {
    const inspect = detectInspectableIframe(iframeRef.current);
    setIframeBridgeReady(inspect.inspectable);
    setIframeBridgeReason(inspect.reason ?? "");
    if (!inspect.inspectable) {
      setIframeBridgeTargets([]);
      return;
    }
    const targets = scanIframeSemanticTargets(iframeRef.current, previewSurfaceRef.current);
    setIframeBridgeTargets(targets);
    const stable = findTargetBySignature(targets, selectedBridgeSignatureRef.current);
    if (stable) setSelectedTarget(toPreviewTargetFromBridge(stable));
  };

  useEffect(() => {
    updateOverlayForTarget(hoveredTarget ?? selectedTarget);
  }, [hoveredTarget, selectedTarget, deviceMode, layoutMode, split, iframeBridgeTargets]);

  useEffect(() => {
    const onWindow = () => {
      syncIframeBridge();
      updateOverlayForTarget(hoveredTarget ?? selectedTarget);
    };
    window.addEventListener("resize", onWindow);
    window.addEventListener("scroll", onWindow, { passive: true });
    return () => {
      window.removeEventListener("resize", onWindow);
      window.removeEventListener("scroll", onWindow);
    };
  }, [hoveredTarget, selectedTarget]);

  useEffect(() => {
    syncIframeBridge();
  }, [deviceMode, layoutMode, split]);

  useEffect(() => {
    if (previewVisualState === "updated") syncIframeBridge();
  }, [previewVisualState]);

  const dismissOnboarding = () => {
    setShowWelcome(false);
    setOnboardingDismissed(true);
    if (typeof window !== "undefined") window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  };

  const restartHints = () => {
    setOnboardingDismissed(false);
    setShowWelcome(true);
    setOnboardingStage(1);
    setShowWhatHappened(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      window.localStorage.removeItem(ONBOARDING_DONE_KEY);
    }
  };

  const onSelectTarget = async (t: PreviewTarget) => {
    selectedBridgeSignatureRef.current = t.selector.startsWith("sig:") ? t.selector.slice(4) : null;
    setSelectedTarget(t);
    if (accessToken && session) {
      const next = await captureStudioTarget(accessToken, session.id, {
        ...t,
        scope: scopeMode,
        deviceMode,
        screenshotCrop: null
      });
      setSession(next.session);
    }
  };

  const apply = async () => {
    if (!accessToken || !session) return;
    setBusy(true);
    const out = await applyStudioChanges(accessToken, session.id, { riskAcknowledged: riskGateNeeded });
    if (!out.ok && out.requiresApproval) {
      setRiskGateNeeded(true);
      setStatus("High-risk change detected. Confirm apply again to acknowledge risk.");
    } else {
      setStatus(out.ok ? "Changes applied through safe patch flow." : out.error ?? "Apply failed.");
      if (out.ok) setStateTag("applied");
    }
    setBusy(false);
  };

  const revert = async () => {
    if (!accessToken || !session) return;
    setBusy(true);
    await revertStudioChanges(accessToken, session.id);
    setStatus("Latest studio changes reverted.");
    setStateTag("preview");
    setBusy(false);
  };

  const restoreVersion = async (versionId: string) => {
    if (!accessToken || !session) return;
    setBusy(true);
    const out = await restoreStudioVersion(accessToken, session.id, versionId);
    if (out.ok) {
      setSession(out.session);
      setStatus(`Restored ${versionId} into preview state.`);
      setStateTag("preview");
    } else {
      setStatus(out.error ?? "Restore failed.");
    }
    setBusy(false);
  };

  const compareVersions = async () => {
    if (!accessToken || !session || !compareVersionIds.left || !compareVersionIds.right) return;
    setBusy(true);
    const out = await compareStudioVersions(accessToken, session.id, {
      leftVersionId: compareVersionIds.left,
      rightVersionId: compareVersionIds.right
    });
    setCompareSummary(out.ok ? out.compare.summary : out.error ?? "Compare failed.");
    setBusy(false);
  };

  const previewWidth = deviceMode === "desktop" ? "100%" : deviceMode === "tablet" ? "768px" : "390px";
  const openPreviewFullscreen = () => {
    const root = document.getElementById("malv-studio-preview-frame");
    if (root?.requestFullscreen) {
      void root.requestFullscreen();
    }
  };

  const updateOverlayForTarget = (target: PreviewTarget | null) => {
    if (!target) {
      setOverlayRect(null);
      setOverlayRegion("unknown");
      setOverlayPrecise(false);
      return;
    }
    if (target.selector.startsWith("sig:")) {
      const signature = target.selector.slice(4);
      const bridgeTarget = findTargetBySignature(iframeBridgeTargets, signature);
      if (!bridgeTarget) {
        setOverlayRect(null);
        setOverlayRegion("section");
        setOverlayPrecise(false);
        return;
      }
      setOverlayRect(bridgeTarget.overlayRect);
      setOverlayRegion(bridgeTarget.region);
      setOverlayPrecise(true);
      return;
    }
    const node = targetNodeRefs.current[target.selector];
    const container = previewSurfaceRef.current;
    if (!node || !container) {
      setOverlayRect(null);
      setOverlayRegion("section");
      setOverlayPrecise(false);
      return;
    }
    const rect = computeOverlayRect(node.getBoundingClientRect(), container.getBoundingClientRect());
    setOverlayRect(rect);
    setOverlayPrecise(Boolean(rect));
    setOverlayRegion(
      classifySemanticRegion({
        tagName: node.tagName,
        className: node.className,
        dataset: Object.fromEntries(Object.entries(node.dataset))
      })
    );
  };

  return (
    <ModuleShell
      title="MALV Studio"
      kicker="Preview workspace"
      subtitle="Target the preview, describe the change, and review sandbox output before apply. Heuristic routing and file hints are labeled when they are not attached patch artifacts."
      flush
      right={
        <div className="flex items-center gap-2">
          {([
            ["build", "Build"],
            ["preview", "Preview"],
            ["inspect", "Inspect"],
            ["debug", "Debug"],
            ["full_preview", "Full"],
            ["focus", "Focus"]
          ] as Array<[StudioMode, string]>).map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              className={`rounded-xl border px-3 py-2 text-xs ${studioMode === mode ? "border-cyan-300/50 bg-cyan-300/20 text-cyan-100" : "border-white/10 bg-white/5 text-white/80"}`}
              onClick={() => {
                setStudioMode(mode);
                if (mode === "inspect") setLayoutMode("chat_inspect");
                else if (mode === "full_preview") setLayoutMode("full_preview");
                else if (mode === "focus") setLayoutMode("focused_chat");
                else setLayoutMode("chat_preview");
              }}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-4 xl:gap-5">
        {hasUserSubmitted || pendingSummary ? (
          <div className="rounded-2xl border border-cyan-400/25 bg-[linear-gradient(135deg,rgba(34,211,238,0.08),rgba(15,17,24,0.95))] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Result</div>
                <h2 className="mt-1 text-lg font-semibold leading-snug text-white">{resultHeadline}</h2>
                <ul className="mt-2 space-y-1 text-sm text-white/75">
                  {resultSummaryLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {changedFiles.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {changedFiles.slice(0, 8).map((f) => (
                      <span
                        key={f}
                        className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-white/70"
                      >
                        {f}
                        {productTruth.fileHintsAreInferred ? (
                          <span className="ml-1 text-[9px] text-amber-200/80">(inferred)</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
                <span className="rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-white/70">
                  {stateTag === "applied" ? "Applied (sandbox path)" : "Preview only"}
                </span>
                {!overlayPrecise && selectedTarget ? (
                  <span className="max-w-[14rem] text-[11px] text-amber-100/90">Targeting is approximate for this element — refine scope if needed.</span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {layoutMode !== "full_preview" ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[rgba(16,18,26,0.8)] p-2">
            {onboardingStage >= 2 ? <button className="rounded-lg px-3 py-2 text-xs text-white/80 hover:bg-white/5" onClick={() => setShowInspect((v) => !v)}><LayoutPanelTop className="mr-1 inline h-3.5 w-3.5" />Inspect</button> : null}
            {onboardingStage >= 4 ? <button className="rounded-lg px-3 py-2 text-xs text-white/80 hover:bg-white/5" onClick={() => setShowConsole((v) => !v)}><Bot className="mr-1 inline h-3.5 w-3.5" />Console</button> : null}
            {onboardingStage >= 3 ? <button className="rounded-lg px-3 py-2 text-xs text-white/80 hover:bg-white/5" onClick={() => setShowVersions((v) => !v)}><History className="mr-1 inline h-3.5 w-3.5" />Versions</button> : null}
            <div className="mx-2 h-5 w-px bg-white/10" />
            <button className="rounded-lg px-2 py-2 text-white/75 hover:bg-white/5" onClick={() => setDeviceMode("desktop")}><Monitor className="h-4 w-4" /></button>
            <button className="rounded-lg px-2 py-2 text-white/75 hover:bg-white/5" onClick={() => setDeviceMode("tablet")}><Tablet className="h-4 w-4" /></button>
            <button className="rounded-lg px-2 py-2 text-white/75 hover:bg-white/5" onClick={() => setDeviceMode("mobile")}><Smartphone className="h-4 w-4" /></button>
            <button className="ml-auto rounded-lg px-2 py-2 text-white/75 hover:bg-white/5" onClick={openPreviewFullscreen}><Fullscreen className="h-4 w-4" /></button>
            <button className="rounded-lg px-3 py-2 text-xs text-white/80 hover:bg-white/5" onClick={() => setShowAdminInsights((v) => !v)}>Operator insights</button>
            <button className="rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/5" onClick={restartHints}>Hints</button>
          </div>
        ) : null}

        {!onboardingDismissed ? (
          <AnimatePresence mode="wait">
            {onboardingStage === 1 ? (
              <motion.div key="hint-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
                Click any element to refine it.
              </motion.div>
            ) : onboardingStage === 2 ? (
              <motion.div key="hint-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
                Open Inspect to see what MALV changed.
              </motion.div>
            ) : onboardingStage === 3 ? (
              <motion.div key="hint-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
                Compare versions and choose the best direction.
              </motion.div>
            ) : (
              <motion.div key="hint-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
                Switch device views to validate responsive quality.
              </motion.div>
            )}
          </AnimatePresence>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-3 text-xs text-emerald-100">
            <div className="mb-1 flex items-center gap-1.5 font-medium"><ShieldCheck className="h-4 w-4" />Safe execution active</div>
            <div>Sandbox is active, running in preview environment, and not touching production directly.</div>
          </div>
          <div className={`rounded-2xl border p-3 text-xs ${confidenceTone}`}>
            <div className="mb-1 font-medium">Confidence & risk</div>
            <div>{confidence === "high" ? "Ready to apply." : confidence === "medium" ? "Review suggested before apply." : "Needs validation before apply."}</div>
            <div className="mt-1 opacity-80">Risk level: {riskLevel}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/75">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-white/90"><CheckCheck className="h-4 w-4" />State</div>
            <div>{stateTag === "applied" ? "Applied to project" : "Preview only (safe)"}.</div>
            <div className="mt-1">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  liveState === "live"
                    ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-100"
                    : liveState === "reconnecting"
                      ? "border-amber-300/35 bg-amber-400/10 text-amber-100"
                      : "border-white/15 bg-white/5 text-white/70"
                }`}
              >
                {liveState === "live" ? "Live" : liveState === "reconnecting" ? "Reconnecting..." : "Offline"}
              </span>
              {streamFallbackMode ? <span className="ml-2 text-[11px] text-white/55">Snapshot fallback active</span> : null}
            </div>
          </div>
          <AnimatePresence>
            {showWelcome ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-40 flex items-end justify-start rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(10,12,20,0.45),rgba(10,12,20,0.92))] p-5"
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full max-w-xl rounded-2xl border border-white/15 bg-black/45 p-5 backdrop-blur"
                >
                  <div className="text-sm uppercase tracking-[0.18em] text-cyan-200/80">Welcome to MALV Studio</div>
                  <div className="mt-2 text-2xl font-semibold text-white">Build, preview, and refine with MALV in real time.</div>
                  <div className="mt-3 text-sm text-white/70">Click a starter to run your first live iteration in seconds.</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {starterActions.map((action) => (
                      <button
                        key={action}
                        className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-400/15"
                        onClick={() => {
                          setComposer(action);
                          dismissOnboarding();
                        }}
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/80" onClick={dismissOnboarding}>Skip for now</button>
                    <span className="text-xs text-white/55">Optional and always available from Hints.</span>
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {showEmptyState ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/10 bg-[linear-gradient(130deg,rgba(130,180,255,0.14),rgba(20,22,28,0.8))] p-5"
          >
            <div className="text-sm uppercase tracking-[0.16em] text-white/55">Studio ready</div>
            <div className="mt-1 text-xl font-semibold text-white">Start your first preview workspace</div>
            <div className="mt-1 text-sm text-white/70">Generate a clean baseline and begin refining instantly.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Create landing page", "Design dashboard", "Fix UI issues"].map((action) => (
                <button key={action} onClick={() => setComposer(action)} className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15">
                  {action}
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}

        <div className="relative min-h-[70vh] rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(90,120,255,0.18),transparent_38%),#0b0e15] p-3">
          <div className="flex h-full min-h-[66vh] gap-3">
            {layoutMode !== "full_preview" && layoutMode !== "focused_chat" ? (
              <div className="min-w-[340px]" style={{ width: `${split}%` }}>
                <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-black/30">
                  <div className="border-b border-white/10 px-4 py-3 text-sm text-white/85">Studio Conversation</div>
                  <div className="flex-1 space-y-2 overflow-auto p-4">
                    {messages.map((m, i) => (
                      <div key={i} className={`max-w-[92%] rounded-xl px-3 py-2 text-sm ${m.role === "assistant" ? "bg-white/8 text-white/85" : "ml-auto bg-[oklch(0.66_0.15_250/0.35)] text-white"}`}>{m.text}</div>
                    ))}
                  </div>
                  <div className="px-4 pb-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className={`rounded-full border px-2 py-1 ${confidenceTone}`}>Confidence: {confidenceLabel}</span>
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-white/75">
                        {continuityMode === "new" ? "New context" : "Continuing context"}
                      </span>
                    </div>
                  </div>
                  {selectedTarget ? (
                    <div className="px-4 pb-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
                        {selectedTarget.label}
                        <button
                          onClick={() => {
                            selectedBridgeSignatureRef.current = null;
                            setSelectedTarget(null);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                  ) : null}
                  <div className="space-y-2 border-t border-white/10 p-3">
                    <div className="flex flex-wrap gap-1">
                      {quickActionPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => setComposer(prompt)}
                          className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 hover:border-cyan-300/40 hover:text-cyan-100"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1 text-[11px] text-white/60">
                      {(["element", "component", "section", "page"] as ScopeMode[]).map((s) => (
                        <button key={s} onClick={() => setScopeMode(s)} className={`rounded-md px-2 py-1 ${scopeMode === s ? "bg-white/15 text-white" : "bg-white/5"}`}>{s}</button>
                      ))}
                    </div>
                    {!selectedTarget && !onboardingDismissed ? (
                      <div className="text-[11px] text-cyan-100/85">Hint: click any part of preview to target it.</div>
                    ) : null}
                    {selectedTarget && !composer && !onboardingDismissed ? (
                      <button onClick={() => setComposer("make this more modern")} className="w-fit rounded-full border border-cyan-300/35 bg-cyan-400/10 px-3 py-1 text-[11px] text-cyan-100">
                        Try: make this more modern
                      </button>
                    ) : null}
                    <div className="flex gap-2">
                      <input
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                        placeholder={`${composerChip}make this more premium and improve spacing`}
                        aria-label="Studio instruction"
                        className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void sendPrompt()}
                        className="rounded-xl bg-[oklch(0.72_0.16_240)] px-3 py-2 text-sm font-medium text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
                      >
                        {busy ? "Building..." : "Send"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {layoutMode !== "focused_chat" ? (
              <div className="relative flex-1">
                {layoutMode !== "full_preview" ? (
                  <div
                    className="absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize rounded bg-white/10"
                    onMouseDown={(e) => {
                      const startX = e.clientX;
                      const start = split;
                      const move = (ev: MouseEvent) => setSplit(Math.max(32, Math.min(68, start + ((ev.clientX - startX) / window.innerWidth) * 100)));
                      const up = () => {
                        window.removeEventListener("mousemove", move);
                        window.removeEventListener("mouseup", up);
                      };
                      window.addEventListener("mousemove", move);
                      window.addEventListener("mouseup", up);
                    }}
                  />
                ) : null}
                <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-black/40">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm text-white/80">
                    <span>Live Preview</span>
                    <div className="flex items-center gap-1">
                      <button className="rounded-lg p-1.5 hover:bg-white/10"><RefreshCcw className="h-4 w-4" /></button>
                      <button className="rounded-lg p-1.5 hover:bg-white/10"><Eye className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="relative flex-1 overflow-auto p-4">
                    <div
                      id="malv-studio-preview-frame"
                      className={`mx-auto overflow-hidden rounded-xl border border-white/15 bg-[#0d1220] ${
                        previewVisualState === "refining" ? "ring-1 ring-cyan-300/35 shadow-[0_0_0_1px_rgba(120,200,255,0.15),0_20px_50px_rgba(0,0,0,0.35)]" : ""
                      }`}
                      style={{ width: previewWidth, transition: prefersReducedMotion ? "none" : "width 180ms ease, box-shadow 220ms ease, transform 220ms ease", transform: previewVisualState === "refining" ? "translateY(-1px)" : "translateY(0)" }}
                    >
                      <div className="h-8 border-b border-white/10 bg-black/40 px-3 py-2 text-[11px] text-white/60">https://studio.preview.malv.local/landing</div>
                      <div ref={previewSurfaceRef} className="relative min-h-[560px] p-5">
                        {!iframeBridgeReady ? (
                          <div className="mb-3 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
                            <span className="font-semibold">Stand-in regions:</span> the interactive DOM bridge is not ready yet, so the blocks below are static
                            stand-ins for targeting. When the preview iframe is inspectable, selection uses live DOM bounds.
                          </div>
                        ) : null}
                        <iframe
                          ref={iframeRef}
                          title="MALV Studio Preview"
                          src="/landing"
                          className="pointer-events-none absolute inset-5 h-[calc(100%-2.5rem)] w-[calc(100%-2.5rem)] rounded-xl border border-white/10 bg-[#0d1220]"
                          style={{ opacity: iframeBridgeReady ? 1 : 0, transition: "opacity 140ms ease" }}
                          onLoad={syncIframeBridge}
                        />
                        {iframeBridgeReady ? (
                          <div
                            className="absolute inset-5 z-20"
                            onMouseMove={(event) => {
                              const resolved = resolveTargetFromPointer({
                                iframe: iframeRef.current,
                                overlayContainer: previewSurfaceRef.current,
                                clientX: event.clientX,
                                clientY: event.clientY
                              });
                              setHoveredTarget(resolved ? toPreviewTargetFromBridge(resolved) : null);
                            }}
                            onMouseLeave={() => setHoveredTarget(null)}
                            onClick={(event) => {
                              const resolved = resolveTargetFromPointer({
                                iframe: iframeRef.current,
                                overlayContainer: previewSurfaceRef.current,
                                clientX: event.clientX,
                                clientY: event.clientY
                              });
                              if (resolved) void onSelectTarget(toPreviewTargetFromBridge(resolved));
                            }}
                          />
                        ) : null}
                        <AnimatePresence>
                          {previewVisualState === "refining" ? (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: prefersReducedMotion ? 0.08 : 0.22 }}
                              className="pointer-events-none absolute right-5 top-5 z-40 rounded-xl border border-cyan-300/30 bg-cyan-400/12 px-3 py-1.5 text-[11px] text-cyan-100 backdrop-blur"
                            >
                              MALV refining preview...
                            </motion.div>
                          ) : null}
                          {previewVisualState === "updated" ? (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: prefersReducedMotion ? 0.08 : 0.22 }}
                              className="pointer-events-none absolute right-5 top-5 z-40 rounded-xl border border-emerald-300/35 bg-emerald-400/12 px-3 py-1.5 text-[11px] text-emerald-100 backdrop-blur"
                            >
                              Updated
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                        {previewVisualState === "updated" && !prefersReducedMotion ? (
                          <motion.div
                            key={`preview-resolve-${previewPulseKey}`}
                            initial={{ opacity: 0.22 }}
                            animate={{ opacity: 0 }}
                            transition={{ duration: 0.7, ease: "easeOut" }}
                            className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(105deg,transparent_10%,rgba(255,255,255,0.14)_45%,transparent_75%)]"
                          />
                        ) : null}
                        {!onboardingDismissed && onboardingStage === 1 ? (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="pointer-events-none absolute left-6 top-6 z-30 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-[11px] text-cyan-100 backdrop-blur"
                          >
                            Click any part of the page to edit it
                          </motion.div>
                        ) : null}
                        {!iframeBridgeReady
                          ? mockTargets.map((t, idx) => (
                          <button
                            key={t.selector}
                            ref={(node) => {
                              targetNodeRefs.current[t.selector] = node;
                            }}
                            data-region={t.label.toLowerCase().includes("hero") ? "hero" : t.label.toLowerCase().includes("nav") ? "nav" : "section"}
                            onClick={() => void onSelectTarget(t)}
                            onMouseEnter={() => setHoveredTarget(t)}
                            onMouseLeave={() => setHoveredTarget((h) => (h?.selector === t.selector ? null : h))}
                            className={`group relative mb-3 block w-full rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-cyan-300/45 hover:bg-cyan-300/10 ${
                              previewVisualState === "updated" && selectedTarget?.selector === t.selector ? "border-emerald-300/55 bg-emerald-400/12" : ""
                            }`}
                          >
                            {previewVisualState === "updated" && selectedTarget?.selector === t.selector && !prefersReducedMotion ? (
                              <motion.div
                                key={`target-pulse-${previewPulseKey}-${t.selector}`}
                                initial={{ opacity: 0.32, scale: 0.985 }}
                                animate={{ opacity: 0, scale: 1.01 }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                                className="pointer-events-none absolute inset-0 rounded-xl border border-emerald-300/45"
                              />
                            ) : null}
                            <div className="text-sm font-medium text-white/90">{t.label}</div>
                            <div className="text-xs text-white/55">{t.contextText}</div>
                            <div className="mt-2 hidden gap-1 group-hover:flex">
                              {["Edit this", "Restyle", "Rewrite copy", "Change layout", "Inspect"].map((a) => (
                                <span key={a} className="rounded-md border border-white/15 bg-black/25 px-2 py-0.5 text-[10px] text-white/70">{a}</span>
                              ))}
                            </div>
                            {selectedTarget?.selector === t.selector ? <Check className="absolute right-3 top-3 h-4 w-4 text-cyan-300" /> : null}
                            {idx < 3 ? <ChevronRight className="absolute right-3 bottom-3 h-4 w-4 text-white/40" /> : null}
                          </button>
                          ))
                          : null}
                        {overlayRect ? (
                          <div
                            className="pointer-events-none absolute z-30 rounded-lg border border-cyan-300/55 bg-cyan-300/10"
                            style={{
                              left: overlayRect.left,
                              top: overlayRect.top,
                              width: overlayRect.width,
                              height: overlayRect.height,
                              transition: prefersReducedMotion ? "none" : "all 120ms ease"
                            }}
                          >
                            <div className="absolute -top-6 left-0 rounded-md border border-cyan-300/35 bg-black/65 px-2 py-0.5 text-[10px] text-cyan-100">
                              {overlayRegion} {overlayPrecise ? "target" : "approx"}
                            </div>
                          </div>
                        ) : selectedTarget ? (
                          <div className="pointer-events-none absolute left-6 bottom-6 z-30 rounded-lg border border-white/20 bg-black/55 px-2.5 py-1 text-[10px] text-white/75">
                            Precise DOM targeting unavailable ({iframeBridgeReason || "fallback"}). Using stable section target.
                          </div>
                        ) : null}
                        {hoveredTarget ? (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="pointer-events-none absolute right-6 top-6 z-30 rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-[11px] text-white/85 backdrop-blur"
                          >
                            Scope: {scopeMode} - {hoveredTarget.componentName}
                          </motion.div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <AnimatePresence>
          {(((onboardingStage >= 2 && showInspect) || (onboardingStage >= 4 && showConsole) || (onboardingStage >= 3 && showVersions) || (layoutMode === "chat_inspect" && onboardingStage >= 2)) && layoutMode !== "focused_chat") ? (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 text-xs uppercase tracking-widest text-white/55">What MALV changed</div>
                  <div className="text-sm text-white/85">{resultHeadline}</div>
                  <ul className="mt-2 space-y-1 text-xs text-white/60">
                    {(changeInsights.length
                      ? changeInsights
                      : hasUserSubmitted
                        ? ["Review the result card above — insights populate when the planner attaches them."]
                        : ["Send an instruction after choosing a target to generate a preview summary."]
                    ).map((insight) => (
                      <li key={insight}>• {insight}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 text-xs uppercase tracking-widest text-white/55">Error + Console</div>
                  <div className="space-y-1 text-xs text-white/60">
                    {((liveConsoleEntries?.length ? liveConsoleEntries : consoleEntries).length
                      ? (liveConsoleEntries?.length ? liveConsoleEntries : consoleEntries)
                      : [
                          {
                            at: new Date().toISOString(),
                            severity: "info",
                            group: "studio",
                            message: hasUserSubmitted
                              ? "No additional console events for this preview step."
                              : "Console output appears when the sandbox emits log lines."
                          }
                        ]).map((entry, i) => (
                      <div key={`${String(entry.at)}-${i}`} className="rounded border border-white/10 bg-black/30 px-2 py-1">
                        [{new Date(String(entry.at)).toLocaleTimeString()}] <span className="uppercase">{String(entry.severity)}</span> · {String(entry.group)} · {String(entry.message)}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 text-xs uppercase tracking-widest text-white/55">Apply / Reject Flow</div>
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => void apply()} className="rounded-lg bg-emerald-400/20 px-3 py-2 text-xs text-emerald-200"><Wand2 className="mr-1 inline h-3.5 w-3.5" />Apply</button>
                    <button disabled={busy} onClick={() => void revert()} className="rounded-lg bg-rose-400/20 px-3 py-2 text-xs text-rose-200">Revert</button>
                  </div>
                  <button disabled={busy} onClick={() => setRiskGateNeeded(true)} className="mt-2 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100">Acknowledge risk for high-risk apply</button>
                  <div className="mt-3 text-xs text-white/55">{status || "Safe preview flow active. No direct production writes."}</div>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="mb-2 text-xs uppercase tracking-widest text-white/55">Plan View (Phases)</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {((livePlanPhases?.length ? livePlanPhases : planPhases).length
                    ? (livePlanPhases?.length ? livePlanPhases : planPhases)
                    : [
                        {
                          id: "idle",
                          phase: "Ready",
                          status: "pending",
                          detail: hasUserSubmitted
                            ? "Planner output will appear here when phases stream from the run."
                            : "Send a prompt to start a preview run."
                        }
                      ]).map((phase) => (
                    <div key={String(phase.id)} className="rounded-lg border border-white/10 bg-black/25 p-2 text-xs text-white/75">
                      <div className="font-medium text-white/90">{String(phase.phase)} · {String(phase.status)}</div>
                      <div>{String(phase.detail)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-widest text-white/55">
                  <span>Patch preview</span>
                  {!productTruth.unifiedDiffAttached ? (
                    <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-100">
                      No unified diff attached
                    </span>
                  ) : null}
                </div>
                <p className="mb-2 text-[11px] leading-relaxed text-white/60">{diffCaption}</p>
                {diffPreviewText ? (
                  <pre className="max-h-44 overflow-auto rounded-lg border border-white/10 bg-black/40 p-2 text-[11px] text-white/70">{diffPreviewText}</pre>
                ) : (
                  <div className="rounded-lg border border-dashed border-white/15 bg-black/25 px-3 py-4 text-[11px] text-white/55">
                    Unified diff text is not attached for this preview tier. Use Inspect for planner output, confidence, and apply controls — apply still routes
                    through the sandbox patch proposal when available.
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex items-center gap-1 text-xs uppercase tracking-widest text-white/55"><Bug className="h-3.5 w-3.5" />Terminal + Debug</div>
                <div className="space-y-1 text-xs text-white/70">
                  {((liveTerminalEntries?.length ? liveTerminalEntries : terminalEntries).length
                    ? (liveTerminalEntries?.length ? liveTerminalEntries : terminalEntries)
                    : [
                          {
                            at: new Date().toISOString(),
                            command: hasUserSubmitted ? "no_terminal_output" : "idle",
                            group: "terminal",
                            success: true
                          }
                        ]).map((t, i) => (
                    <div key={`${String(t.at)}-${i}`} className="rounded border border-white/10 bg-black/25 px-2 py-1">
                      [{new Date(String(t.at)).toLocaleTimeString()}] {String(t.command)} · {String(t.group)} ·{" "}
                      {t.success === true || String(t.success) === "true" ? "success" : "failed"}
                    </div>
                  ))}
                </div>
              </div>
              {showVersions ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 text-xs uppercase tracking-widest text-white/55">Version History</div>
                  <div className="space-y-1 text-xs text-white/65">
                    {versions.length ? versions.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 rounded border border-white/10 bg-black/25 px-2 py-1">
                        <span className="flex-1">v{i + 1}: {String(v.summary ?? "Studio iteration")}</span>
                        <button className="rounded border border-white/15 px-2 py-0.5" onClick={() => void restoreVersion(String(v.id ?? `v${i + 1}`))}>Restore</button>
                        <button className="rounded border border-white/15 px-2 py-0.5" onClick={() => setCompareVersionIds((s) => ({ left: s.left || String(v.id ?? `v${i + 1}`), right: String(v.id ?? `v${i + 1}`) }))}>Pick</button>
                      </div>
                    )) : <div>No versions yet.</div>}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100" onClick={() => void compareVersions()}>Compare selected versions</button>
                    <div className="text-xs text-white/60">{compareVersionIds.left || "-"} vs {compareVersionIds.right || "-"}</div>
                  </div>
                  {compareSummary ? <div className="mt-2 text-xs text-white/75">{compareSummary}</div> : null}
                </div>
              ) : null}
              {showAdminInsights ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                    <div className="mb-1 font-medium text-white/85">Router trace</div>
                    <div>{pendingSummary?.routerDecision != null ? String(pendingSummary.routerDecision) : "—"}</div>
                    <p className="mt-2 text-[10px] text-white/45">Shown when the operator pipeline attaches a routing decision.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                    <div className="mb-1 font-medium text-white/85">Confidence trace</div>
                    <div>{pendingSummary?.confidenceTrace != null ? String(pendingSummary.confidenceTrace) : "—"}</div>
                    <p className="mt-2 text-[10px] text-white/45">No placeholder narrative — fill comes from runtime metadata.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                    <div className="mb-1 font-medium text-white/85">Continuity trace</div>
                    <div>{pendingSummary?.continuityTrace != null ? String(pendingSummary.continuityTrace) : "—"}</div>
                  </div>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-1 text-[11px] ${confidenceTone}`}>Confidence: {confidenceLabel}</span>
                {confidence === "low" ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-100">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Needs validation before apply
                  </span>
                ) : null}
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/75">
                  {continuityMode === "new" ? "New context" : "Continuing context"}
                </span>
                <a href={`/app/chat?targetChip=${encodeURIComponent(selectedTarget?.label ?? "Studio Target")}`} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5 text-[11px] text-cyan-100">
                  <FileCode2 className="h-3.5 w-3.5" />
                  Continue in Operator chat
                </a>
              </div>
              {showWhatHappened ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-3 text-sm text-emerald-100"
                >
                  {previewSuccessNote ||
                    (changeInsights[0] ? String(changeInsights[0]) : "Preview iteration recorded — inspect confidence and apply when ready.")}
                </motion.div>
              ) : null}
              {previewVisualState === "updated" ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: prefersReducedMotion ? 0.08 : 0.2 }}
                  className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75"
                >
                  {previewSuccessNote || "Preview refined."}
                </motion.div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </ModuleShell>
  );
}
