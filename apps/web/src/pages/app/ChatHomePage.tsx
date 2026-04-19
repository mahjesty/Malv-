import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { parseChatConversationIdFromSearchParams } from "../../lib/chat/chatRouteConversation";
const ROOM_PROMPT_MAX_CHARS = 1200;
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Phone, Sparkles, Video } from "lucide-react";
import { malvE2eLog } from "../../lib/chat/malvE2eLog";
import { malvChatPipelineLog } from "../../lib/chat/malvChatPipelineLog";
import { isMalvChatDebugEnabled } from "../../lib/chat/malvChatDebug";
import { Button, AlertBanner, LogoMark } from "@malv/ui";
import { ChatMessageBubble } from "../../components/chat/ChatMessageBubble";
import { PresenceLayer, type PresenceMode } from "../../components/chat/PresenceLayer";
import { shouldRenderVisibleThought } from "../../lib/chat/malvVisibleThoughtState";
import { useMalvChat, type UseMalvChatOptions } from "../../lib/chat/useMalvChat";
import { useChatAutoScroll } from "../../lib/chat/useChatAutoScroll";
import { useAuth } from "../../lib/auth/AuthContext";
import { useMalvAppShell, useMalvAppShellOptional } from "../../lib/context/MalvAppShellContext";
import { OperatorChatComposer, type OperatorChatComposerHandle } from "../../components/malv/shell/OperatorChatComposer";
import { useVoiceAssistant } from "../../lib/voice/useVoiceAssistant";
import { useMalvChatComposerSettings } from "../../lib/settings/MalvChatComposerSettingsContext";
import { playMalvSpeech, stopMalvSpeech } from "../../lib/voice/malvSpeechPlayback";
import { dataTransferLikelyHasFiles, pointInsideRect } from "../../lib/chat/chatFileDragDrop";
import { MobileSidebarTrigger } from "../../components/navigation/MobileSidebarTrigger";
import { useVoiceCallShell } from "../../lib/voice/VoiceCallShellContext";
import { clearVideoChatContext, loadVideoChatContext } from "../../lib/video/videoChatContext";
import { createWorkspaceRuntimeSession, fetchCollaborationRoom } from "../../lib/api/dataPlane";
import { consumeExploreChatHandoffStash } from "../../lib/explore/exploreChatHandoffStorage";

/** Operator channel — upload MALV presentation with real `useMalvChat` + transport. */

const starterPrompts = [
  { title: "Diagnose an issue", desc: "Identify the root cause and recommend a clear resolution path." },
  { title: "Plan next actions", desc: "Break the situation into concrete, executable steps." },
  { title: "Evaluate options", desc: "Compare approaches and determine the most effective path forward." },
  { title: "Structure a solution", desc: "Turn a rough idea into a clear, actionable framework." }
];

const composerGradientStyle = {
  background:
    "linear-gradient(180deg, rgba(var(--malv-chat-bg-rgb), 0), rgba(var(--malv-chat-bg-rgb), 0.92) 22%, rgba(var(--malv-chat-bg-rgb), 0.98) 100%)",
  backdropFilter: "blur(8px)"
} as const;

/** Scroll column: `min-h-full` lets empty state center inside the scrollport; composer lives outside this column. */
const mxColClass =
  "relative z-20 mx-auto flex min-h-full w-full max-w-[860px] min-w-0 flex-col px-2.5 pb-6 pt-4 sm:px-4 sm:pb-8 sm:pt-6 lg:pb-5";

const scrollListClass =
  "relative isolate z-10 min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch]";

export function ChatHomePage() {
  const navigate = useNavigate();
  const callShell = useVoiceCallShell();
  const queryClient = useQueryClient();
  const { accessToken, role } = useAuth();
  const isAdmin = role === "admin";
  const shell = useMalvAppShellOptional();
  const setActiveChatId = shell?.setActiveChatConversationId;
  const { openRuntimeDrawer } = useMalvAppShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const videoContextHandledRef = useRef<string | null>(null);
  /** Tracks prior route `conversationId` so we only clear in-memory state when the URL drops from a real id → none (not during first-send URL sync). */
  const prevRouteConversationIdRef = useRef<string | null | undefined>(undefined);
  const [editingMessageIds, setEditingMessageIds] = useState<string[]>([]);
  const [targetChip, setTargetChip] = useState<string | null>(null);
  const [roomContext, setRoomContext] = useState<{
    roomId: string;
    roomTitle: string;
    participants: Array<{ userId: string; displayName: string; role: string }>;
  } | null>(null);
  /** Mobile: which user message row has actions visible after long-press (one at a time). */
  const [revealedUserActionMessageId, setRevealedUserActionMessageId] = useState<string | null>(null);
  const chatRootRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<OperatorChatComposerHandle>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const [exploreHandoffCard, setExploreHandoffCard] = useState<{
    originLine: string;
    subtitle: string;
    intentLine: string;
  } | null>(null);
  const dismissRevealedUserActions = useCallback(() => setRevealedUserActionMessageId(null), []);
  const revealUserActionsForMessage = useCallback((id: string) => setRevealedUserActionMessageId(id), []);

  const onMessageEditStateChange = useCallback(
    ({ messageId, isEditing }: { messageId: string; isEditing: boolean }) => {
      setEditingMessageIds((prev) => {
        if (isEditing) return prev.includes(messageId) ? prev : [...prev, messageId];
        if (!prev.includes(messageId)) return prev;
        return prev.filter((id) => id !== messageId);
      });
      if (isEditing) dismissRevealedUserActions();
    },
    [dismissRevealedUserActions]
  );

  const composerSettings = useMalvChatComposerSettings();
  const urlConversationId = useMemo(() => parseChatConversationIdFromSearchParams(searchParams), [searchParams]);
  const malvChatOptions = useMemo<UseMalvChatOptions>(
    () => ({
      getAssistantRoute: () => composerSettings.assistantRoute,
      routeConversationId: urlConversationId
    }),
    [composerSettings.assistantRoute, urlConversationId]
  );
  const {
    messages,
    input,
    setInput,
    conversationId,
    sending,
    generationActive,
    isThinking,
    thinkingSteps,
    conversationLoading,
    threadError,
    threadErrorDiagnostic,
    clearThreadError,
    send,
    editUserMessage,
    resendUserMessage,
    forkFromAssistantMessage,
    loadConversationById,
    stopReply,
    retryLast,
    canRetry,
    presence,
    startNewConversation,
    getRealtimeSocket
  } = useMalvChat(malvChatOptions);

  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === "assistant") return m;
    }
    return null;
  }, [messages]);
  const confidenceHint = String(lastAssistant?.metadata?.confidence ?? "").toLowerCase();
  const confidenceLabel = confidenceHint === "high" ? "High confidence" : confidenceHint === "low" ? "Low confidence" : confidenceHint ? "Medium confidence" : "";
  const continuityHint = String(lastAssistant?.metadata?.continuityMode ?? "");

  /**
   * Derive presence mode from live chat state.
   * Maps to the PresenceLayer environment without any extra API calls.
   * Uses the same “visible stream” rule as the bubble ({@link deriveMalvPresenceUsesStreamingAmbient} via `presence`).
   *
   *  idle      — no activity, no composer content
   *  composing — user has text in the composer (MALV is "listening")
   *  thinking  — turn in flight before visible reply text is painted
   *  streaming — user-visible reply text is forming (not merely pre-token / cadence-hold)
   *  error     — thread has a hard error
   */
  const presenceMode = useMemo<PresenceMode>(() => {
    if (threadError) return "error";
    if (sending) return "thinking";
    if (generationActive) {
      return presence.phase === "active" ? "streaming" : "thinking";
    }
    if (input.trim().length > 0) return "composing";
    return "idle";
  }, [threadError, sending, generationActive, presence.phase, input]);

  const inputRef = useRef(input);
  inputRef.current = input;

  const getSocket = useCallback(() => getRealtimeSocket(), [getRealtimeSocket]);

  const onAutoSubmitFromVoice = useCallback(
    (finalText: string) => {
      void send({ composerText: finalText.trim(), inputMode: "voice" });
    },
    [send]
  );

  const voice = useVoiceAssistant({
    getSocket,
    conversationId,
    // Product safety: composer mic always routes to composer_chat STT->composer flow.
    getVoiceRoute: () => "chat",
    getMicInteraction: () => composerSettings.voiceInputMode,
    // Debug simplification: always disable auto-send.
    getVoiceSubmitMode: () => "manual",
    onAutoSubmitFromVoice,
    onComposerTranscript: (text) => setInput(text),
    getComposerText: () => inputRef.current
  });

  const lastSpokenAssistantIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (messages.length === 0) lastSpokenAssistantIdRef.current = null;
  }, [messages.length]);

  const autoSpeakReplies =
    composerSettings.replyMode === "voice" || composerSettings.replyMode === "text_and_voice";

  useEffect(() => {
    if (!autoSpeakReplies) {
      stopMalvSpeech();
      return;
    }
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.status !== "done") return;
    const content = last.content.trim();
    if (!content) return;
    if (lastSpokenAssistantIdRef.current === last.id) return;
    lastSpokenAssistantIdRef.current = last.id;
    playMalvSpeech(last.id, last.content);
  }, [messages, autoSpeakReplies]);

  const showDiagnostics = isAdmin || isMalvChatDebugEnabled();

  const onAssistantFork = useCallback(
    async (args: { messageId: string }) => {
      const forkedConversationId = await forkFromAssistantMessage(args);
      await queryClient.invalidateQueries({ queryKey: ["conversations", "sidebar"] });
      if (forkedConversationId) {
        setActiveChatId?.(forkedConversationId);
        await loadConversationById(forkedConversationId);
      }
    },
    [forkFromAssistantMessage, loadConversationById, queryClient, setActiveChatId]
  );

  const onOpenRuntimeDetail = useCallback(
    (sessionId: string) => {
      openRuntimeDrawer({ sessionId, conversationId: conversationId ?? null });
    },
    [openRuntimeDrawer, conversationId]
  );

  const { listRef, scrollToBottom, scrollIfStuck } = useChatAutoScroll();

  /** Explicit new chat: clear client state and strip `conversationId` from the URL (deterministic fresh thread). */
  useEffect(() => {
    if (searchParams.get("fresh") !== "1") return;
    setExploreHandoffCard(null);
    startNewConversation();
    prevRouteConversationIdRef.current = null;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("fresh");
        next.delete("conversationId");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams, startNewConversation]);

  useEffect(() => {
    if (searchParams.get("exploreChatHandoff") !== "1") return;
    const stash = consumeExploreChatHandoffStash();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("exploreChatHandoff");
        return next;
      },
      { replace: true }
    );
    if (!stash) return;
    setExploreHandoffCard({
      originLine: stash.originLine,
      subtitle: stash.cardSubtitle,
      intentLine: stash.intentLine
    });
    setInput((prev) => {
      const v = stash.visibleComposerText.trim();
      if (!v) return prev;
      return prev.trim() ? `${prev}\n\n${v}` : v;
    });
  }, [searchParams, setSearchParams, setInput]);

  useEffect(() => {
    if (messages.some((m) => m.role === "user")) setExploreHandoffCard(null);
  }, [messages]);

  /** Route-driven load: `?conversationId=` is the source of truth for which thread is active. */
  useEffect(() => {
    if (searchParams.get("fresh") === "1") return;
    if (!accessToken || !urlConversationId) return;
    void loadConversationById(urlConversationId);
  }, [accessToken, urlConversationId, loadConversationById]);

  /**
   * When the user navigates from `?conversationId=<id>` to a bare `/app/chat` (sidebar / bottom nav),
   * drop in-memory thread state. We intentionally do **not** clear merely because `conversationId`
   * is set before the URL catches up after `conversation_bound` (see ref below).
   */
  useEffect(() => {
    if (searchParams.get("fresh") === "1") return;
    const prev = prevRouteConversationIdRef.current;
    if (prev === undefined) {
      prevRouteConversationIdRef.current = urlConversationId;
      return;
    }
    prevRouteConversationIdRef.current = urlConversationId;
    if (urlConversationId != null) return;
    if (prev !== null) {
      startNewConversation();
    }
  }, [urlConversationId, searchParams, startNewConversation]);

  /**
   * Persist newly created thread id into URL only when route does not already select a thread.
   * This prevents stale in-memory ids from briefly overwriting explicit route navigation targets.
   */
  useLayoutEffect(() => {
    if (!conversationId) return;
    if (urlConversationId && urlConversationId !== conversationId) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get("conversationId") === conversationId) return prev;
        next.set("conversationId", conversationId);
        return next;
      },
      { replace: true }
    );
  }, [conversationId, urlConversationId, setSearchParams]);

  /** Reset thread-local UI when the route-selected conversation changes (no cross-thread bleed). */
  useEffect(() => {
    setEditingMessageIds([]);
    setRevealedUserActionMessageId(null);
    setFileDragActive(false);
  }, [urlConversationId]);

  useEffect(() => {
    const cont = (searchParams.get("runtimeContinue") ?? "").trim();
    if (!cont) return;
    setInput((prev) => {
      const base = prev.trim();
      return base ? `${base}\n\n${cont}` : cont;
    });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("runtimeContinue");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams, setInput]);

  useEffect(() => {
    const explore = (searchParams.get("explorePrompt") ?? "").trim();
    if (!explore) return;
    setInput((prev) => {
      const base = prev.trim();
      return base ? `${base}\n\n${explore}` : explore;
    });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("explorePrompt");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams, setInput]);

  /** Ensures a chat-scoped runtime session exists (idempotent POST) after Explore/Tasks deep-links. */
  useEffect(() => {
    if (!accessToken || !conversationId) return;
    if (searchParams.get("ensureRuntime") !== "1") return;
    let cancelled = false;
    void (async () => {
      try {
        await createWorkspaceRuntimeSession(accessToken, { sourceType: "chat", sourceId: conversationId });
      } catch {
        /* non-fatal — execution may still create a session later */
      } finally {
        if (cancelled) return;
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("ensureRuntime");
            return next;
          },
          { replace: true }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, conversationId, searchParams, setSearchParams]);

  useEffect(() => {
    const chip = (searchParams.get("targetChip") ?? "").trim();
    if (!chip) return;
    setTargetChip(chip.slice(0, 80));
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("targetChip");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const roomId = searchParams.get("roomId");
    const roomTitle = searchParams.get("roomTitle") ?? "Room";
    if (!roomId || !accessToken) {
      setRoomContext(null);
      return;
    }
    let cancelled = false;
    void fetchCollaborationRoom(accessToken, roomId)
      .then((res) => {
        if (cancelled || !res.ok) return;
        setRoomContext({
          roomId,
          roomTitle: roomTitle.trim() || "Room",
          participants: res.members ?? []
        });
      })
      .catch(() => {
        if (!cancelled) setRoomContext({ roomId, roomTitle: roomTitle.trim() || "Room", participants: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, accessToken]);

  useEffect(() => {
    const roomPrompt = searchParams.get("roomPrompt");
    if (!roomPrompt) return;
    if (sending || generationActive) return;
    const cleanParams = () =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("roomPrompt");
          next.delete("askRoomPrompt");
          return next;
        },
        { replace: true }
      );
    const normalizedRoomPrompt = roomPrompt.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "").trim().slice(0, ROOM_PROMPT_MAX_CHARS);
    if (!normalizedRoomPrompt) {
      cleanParams();
      return;
    }
    const safeRoomPrompt = `[ROOM_CONTEXT_ONLY]\n${normalizedRoomPrompt}`;
    setInput(safeRoomPrompt);
    cleanParams();
  }, [searchParams, setSearchParams, setInput, sending, generationActive]);

  useEffect(() => {
    const contextKey = searchParams.get("videoContextKey");
    if (!contextKey) return;
    if (videoContextHandledRef.current === contextKey) return;
    if (sending || generationActive) return;
    videoContextHandledRef.current = contextKey;
    const ctx = loadVideoChatContext(contextKey);
    clearVideoChatContext(contextKey);

    const cleanParams = () =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("videoContextKey");
          next.delete("askVideo");
          return next;
        },
        { replace: true }
      );

    if (!ctx) {
      cleanParams();
      return;
    }

    const baseContext = [
      "[VIDEO_ANALYSIS_CONTEXT]",
      `Video file: ${ctx.fileName} (${ctx.fileId})`,
      `Duration: ${ctx.durationSec != null ? `${Math.round(ctx.durationSec)} seconds` : "unknown"}`,
      `Resolution: ${ctx.width ?? "?"}x${ctx.height ?? "?"}`,
      `Timeline segments: ${ctx.timeline.length}`,
      "Segments:",
      ...ctx.timeline.slice(0, 12).map((s, i) => {
        const obs = Array.isArray(s.keyObservations) && s.keyObservations.length ? ` | observations: ${s.keyObservations.slice(0, 2).join("; ")}` : "";
        const warns = Array.isArray(s.warnings) && s.warnings.length ? ` | warnings: ${s.warnings.slice(0, 2).join("; ")}` : "";
        const visual = typeof s.visualSummary === "string" && s.visualSummary.trim() ? ` | visual: ${s.visualSummary.trim()}` : "";
        const visErr = Array.isArray(s.visibleErrors) && s.visibleErrors.length ? ` | visibleErrors: ${s.visibleErrors.slice(0, 2).join("; ")}` : "";
        const exp = typeof s.explanation === "string" && s.explanation.trim() ? ` | explanation: ${s.explanation.trim()}` : "";
        return `- ${i + 1}. ${s.label} (${Math.round(s.tStartSec)}s-${Math.round(s.tEndSec)}s)${exp}${visual}${obs}${warns}${visErr}`;
      })
    ].join("\n");

    const segmentHint = ctx.selectedSegment
      ? `Focus segment: ${ctx.selectedSegment.label} (${Math.round(ctx.selectedSegment.tStartSec)}s-${Math.round(ctx.selectedSegment.tEndSec)}s).`
      : "";
    const prompt = `${baseContext}\n${segmentHint}\n\nVideo analysis mode request: explain this video, summarize user steps, identify what is wrong, and provide actionable fixes for likely flow/UI problems.`;
    setInput(prompt);
    cleanParams();
  }, [searchParams, setSearchParams, setInput, sending, generationActive]);

  useEffect(() => {
    setActiveChatId?.(conversationId);
    return () => setActiveChatId?.(null);
  }, [conversationId, setActiveChatId]);

  useEffect(() => {
    malvChatPipelineLog("render message list count", { count: messages.length });
    for (const m of messages) {
      if (m.role === "assistant") {
        malvE2eLog("render assistant row id/status/contentLength", {
          id: m.id,
          status: m.status,
          contentLength: m.content.length,
          source: m.source,
          eventType: m.eventType
        });
      }
    }
  }, [messages]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.role === "user") {
      scrollToBottom("smooth");
      return;
    }
    if (
      last.role === "assistant" &&
      (last.status === "streaming" || last.status === "thinking" || last.status === "preparing")
    ) {
      scrollIfStuck("auto");
    }
  }, [messages, scrollIfStuck, scrollToBottom]);

  const showThreadLoading = Boolean(conversationLoading && urlConversationId && !threadError);
  const showEmptyHero =
    !showThreadLoading && !messages.some((m) => m.role === "user" || m.role === "assistant");

  const canAcceptFileDrop = editingMessageIds.length === 0;

  useEffect(() => {
    if (!canAcceptFileDrop) setFileDragActive(false);
  }, [canAcceptFileDrop]);

  const onChatDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!canAcceptFileDrop) return;
      if (!dataTransferLikelyHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      setFileDragActive(true);
    },
    [canAcceptFileDrop]
  );

  const onChatDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!dataTransferLikelyHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    const root = chatRootRef.current;
    if (!root) {
      setFileDragActive(false);
      return;
    }
    if (pointInsideRect(e.clientX, e.clientY, root.getBoundingClientRect())) return;
    setFileDragActive(false);
  }, []);

  const onChatDragOverCapture = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!dataTransferLikelyHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = canAcceptFileDrop ? "copy" : "none";
    },
    [canAcceptFileDrop]
  );

  const onChatDropCapture = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!dataTransferLikelyHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      setFileDragActive(false);
      if (!canAcceptFileDrop) return;
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length === 0) return;
      composerRef.current?.addPendingFilesFromFiles(files);
      requestAnimationFrame(() => composerRef.current?.focusComposerInput());
    },
    [canAcceptFileDrop]
  );

  /** Composer is docked outside the scroll region on all breakpoints — only light padding under the transcript. */
  const messageListPadClass = "pb-4 sm:pb-6";

  const heroOneLiner = "Start anywhere.";

  const isConversationLoadFailure = Boolean(
    urlConversationId && threadError && messages.length === 0 && !conversationLoading
  );

  const threadErrorBlock: ReactNode = threadError ? (
    <div className="shrink-0 pb-2 pt-1">
      <AlertBanner tone="error" title="One moment">
        {threadError}
        {showDiagnostics && threadErrorDiagnostic ? (
          <div className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-malv-text/45">{threadErrorDiagnostic}</div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {isConversationLoadFailure ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void loadConversationById(urlConversationId!)}
              >
                Retry loading
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => navigate("/app/chat?fresh=1", { replace: true })}>
                New chat
              </Button>
            </>
          ) : null}
          {canRetry ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void retryLast()}>
              Retry reply
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={() => clearThreadError()}>
            Dismiss
          </Button>
        </div>
      </AlertBanner>
    </div>
  ) : null;

  const composer = (
    <div className="flex w-full min-w-0 flex-col">
      <OperatorChatComposer
        ref={composerRef}
        voice={voice}
        value={input}
        onChange={setInput}
        onSubmit={async ({ attachments } = {}) => {
          malvChatPipelineLog("submit triggered");
          const composerText = targetChip && !input.trim().startsWith(`[${targetChip}]`) ? `[${targetChip}] ${input}` : undefined;
          await send({ attachments, composerText });
        }}
        sending={sending}
        generationActive={generationActive}
        onStop={stopReply}
        placeholder="Drop in the task, idea, or problem…"
        inlineEditingActive={editingMessageIds.length > 0}
      />
    </div>
  );

  const messageListBlock = (
    <div
      className={[
        "relative z-20 w-full flex flex-col space-y-3 sm:space-y-5",
        messageListPadClass,
        showThreadLoading || showEmptyHero ? "min-h-full flex-1" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showThreadLoading ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 py-16 sm:px-4">
          <LogoMark size={30} variant="animated" className="text-malv-text/90" />
          <p className="mt-4 text-sm text-malv-text/55">Loading session…</p>
        </div>
      ) : showEmptyHero ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 py-10 sm:px-4 sm:py-12">
          <motion.div
            aria-hidden
            className="mb-7"
            animate={{
              scale: [1, 1.02, 1],
              filter: [
                "drop-shadow(0 0 0 rgba(0,0,0,0))",
                "drop-shadow(0 2px 12px rgba(0,0,0,0.16))",
                "drop-shadow(0 0 0 rgba(0,0,0,0))"
              ]
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          >
            <LogoMark size={44} variant="animated" className="text-malv-text" />
          </motion.div>
          <p className="mb-7 text-center text-sm text-malv-text/60">{heroOneLiner}</p>
          {exploreHandoffCard ? (
            <div className="mb-6 w-full max-w-xl rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3.5 text-left shadow-sm backdrop-blur-sm">
              <p className="text-[11px] font-medium tracking-wide text-malv-text/50">
                <span className="text-malv-text/38">[ </span>
                {exploreHandoffCard.originLine}
                <span className="text-malv-text/38"> ]</span>
              </p>
              <p className="mt-1 text-sm font-medium text-malv-text/90">{exploreHandoffCard.subtitle}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-malv-text/55">{exploreHandoffCard.intentLine}</p>
              <button
                type="button"
                className="mt-3 text-[11px] font-medium text-malv-text/40 transition-colors hover:text-malv-text/60"
                onClick={() => setExploreHandoffCard(null)}
              >
                Dismiss
              </button>
            </div>
          ) : null}
          <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
            {starterPrompts.slice(0, 4).map((p) => (
              <motion.button
                key={p.title}
                type="button"
                onClick={() => setInput(p.title)}
                className="malv-card malv-chat-suggestion-card group relative overflow-hidden rounded-2xl px-3.5 py-3.5 text-left"
                style={{
                  background: "var(--malv-chat-surface-bg)",
                  border: "1px solid var(--malv-chat-surface-border)",
                  boxShadow: "var(--malv-chat-surface-shadow), inset 0 1px 0 var(--malv-chat-surface-highlight)"
                }}
                whileHover={{
                  y: -1.5,
                  boxShadow: "var(--malv-chat-surface-shadow-hover), inset 0 1px 0 var(--malv-chat-surface-highlight)",
                  borderColor: "var(--malv-chat-surface-border-strong)"
                }}
                whileTap={{ scale: 0.995 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-3 bottom-3 w-px rounded-full bg-white/[0.14] opacity-90"
                />
                <p className="pl-2 text-[13.5px] font-semibold tracking-[-0.01em] text-malv-text/95">{p.title}</p>
                <p className="mt-1.5 pl-2 text-[11.5px] leading-snug text-malv-text/50">{p.desc}</p>
              </motion.button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {messages.map((msg) => {
          if (msg.role === "system") return null;
          const isLastAssistant =
            msg.role === "assistant" &&
            messages.findLast((m) => m.role === "assistant")?.id === msg.id;
          const thoughtVisible =
            isLastAssistant &&
            shouldRenderVisibleThought({ generationActive, isThinking, thinkingSteps, messages });
          return (
            <div key={msg.id}>
              <ChatMessageBubble
                msg={msg}
                replyMode={composerSettings.replyMode}
                showDiagnostics={showDiagnostics}
                actionsDisabled={sending || generationActive}
                onUserEdit={editUserMessage}
                onUserResend={resendUserMessage}
                onAssistantFork={onAssistantFork}
                onAssistantRetry={retryLast}
                revealedUserMessageActions={msg.role === "user" ? revealedUserActionMessageId === msg.id : false}
                onRevealUserMessageActions={msg.role === "user" ? () => revealUserActionsForMessage(msg.id) : undefined}
                onDismissUserMessageActions={msg.role === "user" ? dismissRevealedUserActions : undefined}
                onEditStateChange={onMessageEditStateChange}
                onOpenRuntimeDetail={onOpenRuntimeDetail}
                visibleThought={thoughtVisible}
                visibleThoughtLines={thoughtVisible ? thinkingSteps : undefined}
              />
            </div>
          );
          })}
        </>
      )}
    </div>
  );

  return (
    <>
    <motion.div
      ref={chatRootRef}
      className="malv-chat-shell relative flex min-h-0 h-full flex-1 flex-col overflow-hidden"
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onDragEnter={onChatDragEnter}
      onDragLeave={onChatDragLeave}
      onDragOverCapture={onChatDragOverCapture}
      onDropCapture={onChatDropCapture}
    >
      {/* Environment presence layer — sits at z-1 behind all transcript content */}
      <PresenceLayer mode={presenceMode} />

      <header className="malv-chat-topbar malv-header relative z-10 flex shrink-0 items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <MobileSidebarTrigger />
          <div className="malv-chat-brand-badge flex h-8 w-8 shrink-0 items-center justify-center rounded-lg lg:hidden">
            <Sparkles className="h-4 w-4 text-malv-text/78" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight text-malv-text sm:text-base">{presence.headline}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="malv-chat-header-actions-group flex items-center">
            <Link
              to={conversationId ? `/app/voice?conversationId=${encodeURIComponent(conversationId)}` : "/app/voice"}
              className="malv-chat-header-action malv-chat-header-action-voice malv-interactive group inline-flex items-center justify-center rounded-full focus-visible:outline-none"
              aria-label="Voice call"
            >
              <Phone className="malv-chat-header-action-icon h-4 w-4" />
            </Link>
            <Link
              to={conversationId ? `/app/video?conversationId=${encodeURIComponent(conversationId)}` : "/app/video"}
              className="malv-chat-header-action malv-chat-header-action-video malv-interactive group inline-flex items-center justify-center rounded-full focus-visible:outline-none"
              aria-label="Video call"
            >
              <Video className="malv-chat-header-action-icon h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {targetChip || confidenceLabel || continuityHint ? (
        <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 sm:mx-5">
          {targetChip ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-100">
              [{targetChip}]
              <button type="button" className="text-cyan-100/80" onClick={() => setTargetChip(null)}>x</button>
            </span>
          ) : null}
          {confidenceLabel ? <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">{confidenceLabel}</span> : null}
          {continuityHint ? <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">{continuityHint === "new" ? "New context" : "Continuing context"}</span> : null}
        </div>
      ) : null}

      {roomContext ? (
        <div className="mx-3 mb-2 rounded-2xl border border-cyan-300/20 bg-cyan-500/[0.06] px-3.5 py-2.5 text-[11px] sm:mx-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-cyan-50/90">
              Room context: <span className="font-semibold">{roomContext.roomTitle}</span>
            </div>
            <div className="text-cyan-100/70">{roomContext.participants.length} participants</div>
          </div>
          {roomContext.participants.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {roomContext.participants.slice(0, 8).map((p) => (
                <span key={p.userId} className="rounded-full border border-cyan-300/25 bg-black/20 px-2 py-0.5 text-[10px]">
                  {p.displayName}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {callShell.callActive ? (
        <motion.button
          type="button"
          onClick={() => callShell.openFullCall()}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="mx-3 mb-2 rounded-2xl border border-cyan-200/15 bg-[rgba(14,18,30,0.58)] px-3.5 py-2 text-left backdrop-blur-xl sm:mx-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-100/55">Live call in progress</p>
              <p className="truncate text-[12px] text-cyan-50/90">
                MALV is {callShell.callStatus} {callShell.unreadTranscriptCount > 0 ? `• +${callShell.unreadTranscriptCount} updates` : ""}
              </p>
            </div>
            <span className="rounded-full border border-cyan-300/25 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-100/76">
              Return
            </span>
          </div>
        </motion.button>
      ) : null}

      {/* One layout for all breakpoints: scroll = transcript + errors only; composer = flex sibling (never sticky/re-parented). */}
      <div className="relative isolate z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={listRef} className={scrollListClass}>
          <div className={mxColClass}>
            {/* Single scroll owner is `listRef` — no nested vertical overflow here */}
            {messageListBlock}
            {threadErrorBlock}
          </div>
        </div>

        <div className="malv-chat-composer-dock shrink-0 z-40 pt-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] sm:pb-1 lg:pt-1.5 lg:pb-0" style={composerGradientStyle}>
          <div className="mx-auto w-full max-w-[860px] min-w-0 px-2 sm:px-3">{composer}</div>
        </div>
      </div>

      <AnimatePresence>
        {fileDragActive ? (
          <motion.div
            key="chat-file-drop-overlay"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center p-6"
          >
            <div
              className="absolute inset-0 backdrop-blur-[3px]"
              style={{
                background: "rgba(var(--malv-chat-bg-rgb), 0.72)",
                boxShadow: "inset 0 0 0 1px var(--malv-chat-surface-border-strong), inset 0 0 40px rgba(0, 0, 0, 0.18)"
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.995 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 max-w-sm rounded-2xl px-5 py-4 text-center"
              style={{
                border: "1px solid var(--malv-chat-surface-border)",
                background: "var(--malv-chat-surface-bg)",
                boxShadow: "var(--malv-chat-surface-shadow-hover), inset 0 1px 0 var(--malv-chat-surface-highlight)"
              }}
            >
              <p className="text-[13.5px] font-medium tracking-[-0.02em] text-malv-text/[0.94]">Drop files to attach</p>
              <p className="mt-1 text-[11.5px] leading-snug text-malv-text/48">Release anywhere on this chat</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
    </>
  );
}
