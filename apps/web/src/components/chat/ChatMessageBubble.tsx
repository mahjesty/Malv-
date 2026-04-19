import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, Copy, GitBranch, Pencil, RefreshCw, Send } from "lucide-react";
import { stripLegacyAttachmentPrefix } from "../../lib/chat/chatAttachmentUtils";
import { deriveMalvAssistantTypingBand } from "../../lib/chat/malvAssistantUiState";
import {
  malvStreamLatencyAuditBubbleRender,
  malvStreamLatencyAuditFirstVisibleText
} from "../../lib/chat/malvChatStreamLatencyAudit";
import { deriveRichSurfaceStripTargets } from "../../lib/chat/malvRichResponsePresentation";
import type { MalvChatMessage } from "../../lib/chat/types";
import type { MalvReplyMode } from "../../lib/settings/malvChatComposerSettingsTypes";
import { MalvMessageBody } from "./MalvMessageBody";
import { MalvRichResponseBlock } from "./MalvRichResponseBlock";
import { MalvTypingIndicator } from "./MalvTypingIndicator";
import { MalvVisibleThought } from "./MalvVisibleThought";
import { UserMessageAttachments } from "./UserMessageAttachments";
import { UserMessageGroup } from "./UserMessageGroup";
import { VoicePlaybackControls } from "./voice/VoicePlaybackControls";

const USER_ACTION_LONG_PRESS_MS = 2000;
const USER_LONG_PRESS_MOVE_TOLERANCE_PX = 24;

function usePreferMobileMessageActions() {
  const [mobileActions, setMobileActions] = useState(false);

  useLayoutEffect(() => {
    const sync = () => {
      const narrow = window.matchMedia("(max-width: 639px)").matches;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      setMobileActions(narrow || coarse);
    };

    sync();

    const mqNarrow = window.matchMedia("(max-width: 639px)");
    const mqCoarse = window.matchMedia("(pointer: coarse)");

    mqNarrow.addEventListener("change", sync);
    mqCoarse.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);

    return () => {
      mqNarrow.removeEventListener("change", sync);
      mqCoarse.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, []);

  return mobileActions;
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // fallback below
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}

function userMessageCopyPlainText(msg: MalvChatMessage) {
  const base = stripLegacyAttachmentPrefix(msg.content).trim();
  const labels = (msg.attachments?.map((a) => a.label).filter(Boolean) as string[]) ?? [];
  if (labels.length && !base) return labels.join(", ");
  if (labels.length && base) return `${labels.join(", ")}\n\n${base}`;
  return base || msg.content;
}

function buildAssistantSharePayload(messageText: string) {
  const compact = messageText.trim().replace(/\n{3,}/g, "\n\n");
  const snippet = compact.length > 720 ? `${compact.slice(0, 720)}…` : compact;
  const url = typeof window !== "undefined" ? window.location.href : "";
  return {
    title: "MALV reply",
    text: `MALV reply\n\n${snippet}${url ? `\n\n${url}` : ""}`,
    url
  };
}

/** Icon button used in assistant action row */
function ActionButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-30"
      style={{ color: "rgb(var(--malv-muted-rgb))" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgb(var(--malv-text-rgb) / 0.07)"; (e.currentTarget as HTMLButtonElement).style.color = "rgb(var(--malv-text-rgb) / 0.8)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgb(var(--malv-muted-rgb))"; }}
    >
      {children}
    </button>
  );
}

export type ChatMessageBubbleProps = {
  msg: MalvChatMessage;
  showDiagnostics: boolean;
  actionsDisabled: boolean;
  onUserEdit: (args: { messageId: string; newContent: string }) => void | Promise<void>;
  onUserResend: (args: { messageId: string }) => void | Promise<void>;
  onAssistantFork: (args: { messageId: string }) => void | Promise<void>;
  onAssistantRetry?: () => void | Promise<void>;
  revealedUserMessageActions?: boolean;
  onRevealUserMessageActions?: () => void;
  onDismissUserMessageActions?: () => void;
  onEditStateChange?: (p: { messageId: string; isEditing: boolean }) => void;
  replyMode?: MalvReplyMode;
  onOpenRuntimeDetail?: (sessionId: string) => void;
  /** Visible thought props — only set on the active pending assistant row. */
  visibleThought?: boolean;
  visibleThoughtLines?: string[];
};

function ChatMessageBubbleInner(props: ChatMessageBubbleProps) {
  const {
    msg,
    showDiagnostics,
    actionsDisabled,
    onUserEdit,
    onUserResend,
    onAssistantFork,
    onAssistantRetry,
    revealedUserMessageActions,
    onRevealUserMessageActions,
    onDismissUserMessageActions,
    onEditStateChange,
    replyMode = "text",
    onOpenRuntimeDetail,
    visibleThought = false,
    visibleThoughtLines = []
  } = props;

  const showPlaybackChrome = replyMode === "text_and_voice";
  const preferMobileActions = usePreferMobileMessageActions();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const editTaRef = useRef<HTMLTextAreaElement | null>(null);

  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartedAtRef = useRef<number | null>(null);
  const longPressPointerIdRef = useRef<number | null>(null);
  const longPressStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  const suppressOutsideDismissRef = useRef(false);
  const suppressPointerIdRef = useRef<number | null>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const assistantActionFeedbackTimerRef = useRef<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => stripLegacyAttachmentPrefix(msg.content));
  const [copiedActionKey, setCopiedActionKey] = useState<string | null>(null);
  const [assistantActionBusy, setAssistantActionBusy] = useState<"fork" | "share" | null>(null);
  const [assistantActionFeedback, setAssistantActionFeedback] = useState<{
    key: "fork" | "share";
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const [mobileUserTrayOpen, setMobileUserTrayOpen] = useState(Boolean(revealedUserMessageActions));
  const lastControlledRevealRef = useRef<boolean | undefined>(revealedUserMessageActions);

  const onEditStateChangeRef = useRef(onEditStateChange);
  onEditStateChangeRef.current = onEditStateChange;

  const isUser = msg.role === "user";
  const isAssistant = msg.role === "assistant";

  malvStreamLatencyAuditBubbleRender(msg.id, msg.role);

  useLayoutEffect(() => {
    if (!isAssistant || msg.content.length === 0) return;
    malvStreamLatencyAuditFirstVisibleText(msg.id);
  }, [isAssistant, msg.id, msg.content]);

  const devLongPressLog = useCallback(
    (event: string, extra?: Record<string, unknown>) => {
      if (!import.meta.env.DEV) return;
      console.debug("[MALV user longpress]", {
        messageId: msg.id,
        isMobileViewport: preferMobileActions,
        controlledReveal: Boolean(revealedUserMessageActions),
        localReveal: mobileUserTrayOpen,
        suppressOutsideDismiss: suppressOutsideDismissRef.current,
        event,
        ...(extra ?? {})
      });
    },
    [msg.id, preferMobileActions, revealedUserMessageActions, mobileUserTrayOpen]
  );

  useEffect(() => {
    if (!editing) setDraft(stripLegacyAttachmentPrefix(msg.content));
  }, [msg.content, editing]);

  useEffect(() => {
    onEditStateChangeRef.current?.({ messageId: msg.id, isEditing: editing });
  }, [editing, msg.id]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current != null) window.clearTimeout(longPressTimerRef.current);
      if (copyFeedbackTimerRef.current != null) window.clearTimeout(copyFeedbackTimerRef.current);
      if (assistantActionFeedbackTimerRef.current != null) window.clearTimeout(assistantActionFeedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mobileUserTrayOpen) setCopiedActionKey(null);
  }, [mobileUserTrayOpen]);

  useEffect(() => {
    if (lastControlledRevealRef.current !== revealedUserMessageActions) {
      lastControlledRevealRef.current = revealedUserMessageActions;
      if (typeof revealedUserMessageActions === "boolean") {
        setMobileUserTrayOpen(revealedUserMessageActions);
      }
    }
  }, [revealedUserMessageActions]);

  useEffect(() => {
    if (editing) setMobileUserTrayOpen(false);
  }, [editing]);

  const clearUserLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartedAtRef.current = null;
    longPressPointerIdRef.current = null;
    longPressStartPointRef.current = null;
    longPressTriggeredRef.current = false;
  }, []);

  const revealUserActions = useCallback(
    (reason: string, pointerId?: number) => {
      suppressOutsideDismissRef.current = true;
      suppressPointerIdRef.current = pointerId ?? null;
      setMobileUserTrayOpen(true);
      onRevealUserMessageActions?.();
      devLongPressLog("reveal-fired", { reason, pointerId });
    },
    [onRevealUserMessageActions, devLongPressLog]
  );

  const dismissUserActions = useCallback(
    (reason: string) => {
      setMobileUserTrayOpen(false);
      onDismissUserMessageActions?.();
      devLongPressLog("dismiss-fired", { reason });
    },
    [onDismissUserMessageActions, devLongPressLog]
  );

  const handleCopyWithFeedback = useCallback(async (key: string, text: string) => {
    await copyText(text);
    setCopiedActionKey(key);
    if (copyFeedbackTimerRef.current != null) window.clearTimeout(copyFeedbackTimerRef.current);
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopiedActionKey(null);
      copyFeedbackTimerRef.current = null;
    }, 1400);
  }, []);

  const setAssistantActionFeedbackWithTimeout = useCallback(
    (next: { key: "fork" | "share"; tone: "success" | "error"; text: string }) => {
      setAssistantActionFeedback(next);
      if (assistantActionFeedbackTimerRef.current != null) window.clearTimeout(assistantActionFeedbackTimerRef.current);
      assistantActionFeedbackTimerRef.current = window.setTimeout(() => {
        setAssistantActionFeedback((prev) => (prev?.key === next.key ? null : prev));
        assistantActionFeedbackTimerRef.current = null;
      }, 1700);
    },
    []
  );

  const handleAssistantFork = useCallback(async () => {
    if (actionsDisabled || assistantActionBusy) return;
    setAssistantActionBusy("fork");
    try {
      await onAssistantFork({ messageId: msg.id });
      setAssistantActionFeedbackWithTimeout({ key: "fork", tone: "success", text: "Forked" });
    } catch {
      setAssistantActionFeedbackWithTimeout({ key: "fork", tone: "error", text: "Fork failed" });
    } finally {
      setAssistantActionBusy((prev) => (prev === "fork" ? null : prev));
    }
  }, [actionsDisabled, assistantActionBusy, msg.id, onAssistantFork, setAssistantActionFeedbackWithTimeout]);

  const handleAssistantShare = useCallback(async () => {
    if (actionsDisabled || assistantActionBusy) return;
    setAssistantActionBusy("share");
    const payload = buildAssistantSharePayload(msg.content);
    const fallbackCopy = async () => {
      await copyText(payload.text);
      setAssistantActionFeedbackWithTimeout({ key: "share", tone: "success", text: "Copied to share" });
    };
    try {
      if (navigator.share) {
        try {
          const shareData = payload.url
            ? { title: payload.title, text: payload.text, url: payload.url }
            : { title: payload.title, text: payload.text };
          await navigator.share(shareData);
          setAssistantActionFeedbackWithTimeout({ key: "share", tone: "success", text: "Shared" });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          await fallbackCopy();
          return;
        }
      }
      await fallbackCopy();
    } catch {
      setAssistantActionFeedbackWithTimeout({ key: "share", tone: "error", text: "Share failed" });
    } finally {
      setAssistantActionBusy((prev) => (prev === "share" ? null : prev));
    }
  }, [actionsDisabled, assistantActionBusy, msg.content, setAssistantActionFeedbackWithTimeout]);

  const beginEdit = useCallback(() => {
    setDraft(stripLegacyAttachmentPrefix(msg.content));
    setEditing(true);
    requestAnimationFrame(() => {
      const el = editTaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [msg.content]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDraft(stripLegacyAttachmentPrefix(msg.content));
  }, [msg.content]);

  const saveEdit = useCallback(() => {
    const next = draft.trim();
    if (!next && !(msg.attachments?.length ?? 0)) {
      cancelEdit();
      return;
    }
    void onUserEdit({ messageId: msg.id, newContent: next });
    setEditing(false);
  }, [draft, msg.attachments?.length, msg.id, onUserEdit, cancelEdit]);

  const onUserPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isUser || !preferMobileActions || editing) return;
      if (mobileUserTrayOpen) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      devLongPressLog("pointerdown", { pointerId: e.pointerId, pointerType: e.pointerType, x: Math.round(e.clientX), y: Math.round(e.clientY) });
      clearUserLongPressTimer();
      longPressStartedAtRef.current = performance.now();
      longPressPointerIdRef.current = e.pointerId;
      longPressStartPointRef.current = { x: e.clientX, y: e.clientY };
      longPressTriggeredRef.current = false;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no-op */ }
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        longPressTriggeredRef.current = true;
        revealUserActions("timer-complete", e.pointerId);
      }, USER_ACTION_LONG_PRESS_MS);
    },
    [isUser, preferMobileActions, editing, mobileUserTrayOpen, clearUserLongPressTimer, revealUserActions, devLongPressLog]
  );

  const onUserPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isUser || !preferMobileActions) return;
      if (longPressPointerIdRef.current == null) return;
      if (e.pointerId !== longPressPointerIdRef.current) return;
      if (longPressTriggeredRef.current) return;
      const start = longPressStartPointRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const distance = Math.hypot(dx, dy);
      if (distance > USER_LONG_PRESS_MOVE_TOLERANCE_PX) {
        devLongPressLog("pointermove-cancelled", { pointerId: e.pointerId, dx: Math.round(dx), dy: Math.round(dy), distance: Math.round(distance), tolerance: USER_LONG_PRESS_MOVE_TOLERANCE_PX });
        clearUserLongPressTimer();
      }
    },
    [isUser, preferMobileActions, clearUserLongPressTimer, devLongPressLog]
  );

  const releaseSuppressionAfterPointerSequence = useCallback(
    (pointerId: number) => {
      if (suppressPointerIdRef.current !== pointerId) return;
      window.setTimeout(() => {
        if (suppressPointerIdRef.current === pointerId) {
          suppressOutsideDismissRef.current = false;
          suppressPointerIdRef.current = null;
          devLongPressLog("suppression-cleared", { pointerId });
        }
      }, 0);
    },
    [devLongPressLog]
  );

  const handleUserPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isUser || !preferMobileActions) return;
      if (longPressPointerIdRef.current != null && e.pointerId !== longPressPointerIdRef.current) return;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* no-op */ }
      const startedAt = longPressStartedAtRef.current;
      const elapsed = startedAt == null ? 0 : performance.now() - startedAt;
      if (!longPressTriggeredRef.current && elapsed >= USER_ACTION_LONG_PRESS_MS) {
        revealUserActions("pointerup-fallback", e.pointerId);
      }
      if (longPressTriggeredRef.current) {
        releaseSuppressionAfterPointerSequence(e.pointerId);
      }
      devLongPressLog("pointerup", { pointerId: e.pointerId, elapsedMs: Math.round(elapsed), triggered: longPressTriggeredRef.current });
      clearUserLongPressTimer();
    },
    [isUser, preferMobileActions, revealUserActions, releaseSuppressionAfterPointerSequence, clearUserLongPressTimer, devLongPressLog]
  );

  const handleUserPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isUser || !preferMobileActions) return;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* no-op */ }
      if (longPressTriggeredRef.current) {
        releaseSuppressionAfterPointerSequence(e.pointerId);
      }
      devLongPressLog("pointercancel", { pointerId: e.pointerId });
      clearUserLongPressTimer();
    },
    [isUser, preferMobileActions, releaseSuppressionAfterPointerSequence, clearUserLongPressTimer, devLongPressLog]
  );

  useEffect(() => {
    if (!isUser || !preferMobileActions || !mobileUserTrayOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (suppressOutsideDismissRef.current) {
        devLongPressLog("dismiss-skipped-suppressed", { pointerId: e.pointerId });
        return;
      }
      const root = rowRef.current;
      if (!root) return;
      if (e.composedPath().includes(root)) return;
      dismissUserActions("outside-pointerdown");
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [isUser, preferMobileActions, mobileUserTrayOpen, dismissUserActions, devLongPressLog]);

  const statusLabel =
    msg.status === "error"
      ? msg.errorMessage ?? "Something went wrong."
      : msg.status === "interrupted"
        ? "Stopped"
        : null;

  const userDeliveryLabel =
    isUser && !editing
      ? msg.status === "pending"
        ? "Sending…"
        : msg.status === "error"
          ? msg.errorMessage ?? "Failed to send."
          : null
      : null;

  const showMobileUserTray = isUser && preferMobileActions && mobileUserTrayOpen;
  const desktopUserActionsVisible = isUser && !preferMobileActions;

  const userPlain = stripLegacyAttachmentPrefix(msg.content);
  const showUserTextBubble = editing || userPlain.trim().length > 0;
  const planPhases = Array.isArray(msg.metadata?.planPhases) ? (msg.metadata?.planPhases as string[]) : [];
  const changes = Array.isArray(msg.metadata?.changes) ? (msg.metadata?.changes as string[]) : [];
  const reasoning = typeof msg.metadata?.reasoningLight === "string" ? msg.metadata.reasoningLight : "";

  const runtimeOpenable =
    isAssistant &&
    Boolean(msg.runtimeSessionId?.trim() && onOpenRuntimeDetail) &&
    msg.hasRuntimeDetail !== false;

  const assistantTypingBand = isAssistant ? deriveMalvAssistantTypingBand(msg) : null;

  const richSurfaceStrip = isAssistant ? deriveRichSurfaceStripTargets(msg.metadata) : null;

  const assistantBody =
    isAssistant ? (
      <>
        <MalvMessageBody
          content={msg.content}
          emptyHint="…"
          streaming={msg.status === "streaming"}
          richSurfaceStrip={richSurfaceStrip}
        />
        {msg.status === "done" || msg.status === "interrupted" || msg.status === "partial_done" ? (
          <MalvRichResponseBlock msg={msg} />
        ) : null}
      </>
    ) : null;

  const voicePlaybackEl =
    isAssistant &&
    showPlaybackChrome &&
    (msg.status === "done" || msg.status === "interrupted") &&
    msg.content.trim() ? (
      <VoicePlaybackControls messageId={msg.id} text={msg.content} enabled />
    ) : null;

  /* ─── Message row ─── */
  return (
    <div
      ref={rowRef}
      className={[
        "group relative w-full min-w-0 touch-manipulation py-1",
        isUser ? "flex justify-end" : "flex justify-start"
      ].join(" ")}
      onPointerDown={isUser ? onUserPointerDown : undefined}
      onPointerMove={isUser ? onUserPointerMove : undefined}
      onPointerUp={isUser ? handleUserPointerUp : undefined}
      onPointerCancel={isUser ? handleUserPointerCancel : undefined}
      onContextMenu={isUser && preferMobileActions ? (e) => e.preventDefault() : undefined}
    >
      <div
        className={[
          "relative",
          /* User: full-width lane (percentage max resolves against chat row) — avoids shrink-to-fit + min-w-0 collapsing bubbles */
          isUser ? "ml-auto w-full max-w-[min(78%,520px)] shrink-0" : "w-full max-w-[min(100%,680px)]"
        ].join(" ")}
      >
        {/* ── User message ── */}
        {isUser ? (
          <UserMessageGroup>
            {msg.attachments?.length ? (
              <UserMessageAttachments attachments={msg.attachments} />
            ) : null}

            {showUserTextBubble ? (
              <div
                className={[
                  "malv-edit-bubble relative ml-auto overflow-hidden",
                  editing ? "min-w-0 w-full max-w-full rounded-2xl" : "inline-block w-fit max-w-full min-w-fit rounded-[18px]",
                  /* Light mode: clean elevated surface */
                  "bg-[var(--malv-chat-surface-bg)] border border-[var(--malv-chat-surface-border)]",
                  "shadow-[var(--malv-chat-surface-shadow)]",
                  /* Dark mode: glass tint */
                  "dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.068),rgba(255,255,255,0.028))]",
                  "dark:border-white/[0.08] dark:backdrop-blur-[10px]",
                  "dark:ring-1 dark:ring-inset dark:ring-white/[0.04]",
                  "dark:shadow-[0_8px_28px_rgba(0,0,0,0.22)]",
                  "transition-[background-color,border-color,box-shadow] duration-200",
                  "px-3.5 py-2.5"
                ].join(" ")}
              >
                <div className="pointer-events-none absolute inset-0 dark:bg-[radial-gradient(circle_at_top_right,rgba(95,180,255,0.10),transparent_50%),radial-gradient(circle_at_bottom_left,rgba(120,96,255,0.07),transparent_40%)] rounded-[inherit]" />
                {editing ? (
                  <textarea
                    ref={editTaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className={[
                      "malv-edit-textarea relative z-10 min-h-[5.25rem] w-full max-w-full resize-y bg-transparent px-0 py-0",
                      "text-[14px] font-[450] leading-[1.6] tracking-[-0.01em] sm:text-[15px]",
                      "rounded-lg border border-transparent shadow-none outline-none ring-0",
                      "focus:outline-none focus:shadow-none focus:ring-0 focus-visible:outline-none"
                    ].join(" ")}
                    style={{ color: "rgb(var(--malv-text-rgb))" }}
                    disabled={actionsDisabled}
                    placeholder={msg.attachments?.length ? "Add a caption (optional)…" : undefined}
                  />
                ) : (
                  <p
                    className="relative max-w-full whitespace-pre-wrap break-normal break-words text-left text-[14px] font-[450] leading-[1.6] tracking-[-0.01em] sm:text-[15px]"
                    style={{ color: "rgb(var(--malv-text-rgb) / 0.95)" }}
                  >
                    {userPlain}
                  </p>
                )}
              </div>
            ) : null}

            {userDeliveryLabel ? (
              <p
                className="w-full min-w-0 text-right text-[11px]"
                style={{ color: "rgb(var(--malv-muted-rgb) / 0.55)" }}
              >
                {userDeliveryLabel}
              </p>
            ) : null}

            {editing ? (
              <div className="flex w-full flex-wrap items-center justify-end gap-2 mt-1.5">
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                  style={{
                    background: "rgb(var(--malv-surface-raised-rgb))",
                    border: "1px solid rgb(var(--malv-border-rgb) / 0.1)",
                    color: "rgb(var(--malv-text-rgb) / 0.6)"
                  }}
                  onClick={cancelEdit}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-[filter,opacity] hover:brightness-110 disabled:opacity-40"
                  style={{
                    background: "rgb(var(--malv-brand-rgb))",
                    color: "#000",
                    boxShadow: "0 4px 16px rgb(var(--malv-brand-rgb) / 0.3)"
                  }}
                  disabled={actionsDisabled || (!draft.trim() && !(msg.attachments?.length ?? 0))}
                  onClick={() => void saveEdit()}
                >
                  Save
                </button>
              </div>
            ) : null}

            {!editing ? (
              <>
                {/* Desktop inline actions — fade in on hover */}
                <div
                  className={[
                    "flex w-full items-center justify-end gap-0.5 pt-1",
                    desktopUserActionsVisible
                      ? "pointer-events-none opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100"
                      : "hidden"
                  ].join(" ")}
                >
                  <ActionButton
                    label={copiedActionKey === "user-desktop-copy" ? "Copied" : "Copy message"}
                    disabled={actionsDisabled}
                    onClick={() => void handleCopyWithFeedback("user-desktop-copy", userMessageCopyPlainText(msg))}
                  >
                    {copiedActionKey === "user-desktop-copy"
                      ? <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.3} />
                      : <Copy className="h-3.5 w-3.5" strokeWidth={2.1} />}
                  </ActionButton>
                  <ActionButton label="Edit message" disabled={actionsDisabled} onClick={() => void beginEdit()}>
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2.1} />
                  </ActionButton>
                  <ActionButton label="Resend message" disabled={actionsDisabled} onClick={() => void onUserResend({ messageId: msg.id })}>
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.1} />
                  </ActionButton>
                </div>

                {/* Mobile long-press tray */}
                <AnimatePresence>
                  {showMobileUserTray ? (
                    <motion.div
                      role="toolbar"
                      aria-label="Message actions"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="mt-1.5 flex w-full items-center justify-end gap-1"
                    >
                      {[
                        {
                          key: "user-mobile-copy",
                          label: copiedActionKey === "user-mobile-copy" ? "Copied" : "Copy",
                          icon: copiedActionKey === "user-mobile-copy"
                            ? <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.3} />
                            : <Copy className="h-3.5 w-3.5" strokeWidth={2.1} />,
                          action: () => void handleCopyWithFeedback("user-mobile-copy", userMessageCopyPlainText(msg))
                        },
                        {
                          key: "edit",
                          label: "Edit",
                          icon: <Pencil className="h-3.5 w-3.5" strokeWidth={2.1} />,
                          action: () => { dismissUserActions("edit-click"); beginEdit(); }
                        },
                        {
                          key: "resend",
                          label: "Resend",
                          icon: <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.1} />,
                          action: () => { dismissUserActions("resend-click"); void onUserResend({ messageId: msg.id }); }
                        }
                      ].map((item) => (
                      <button
                          key={item.key}
                        type="button"
                          className="flex h-8 min-w-[2.5rem] items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-colors disabled:opacity-40"
                          style={{
                            background: "rgb(var(--malv-surface-raised-rgb))",
                            border: "1px solid rgb(var(--malv-border-rgb) / 0.1)",
                            color: "rgb(var(--malv-text-rgb) / 0.7)"
                          }}
                        disabled={actionsDisabled}
                          aria-label={item.label}
                          onClick={item.action}
                        >
                          {item.icon}
                      </button>
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </>
            ) : null}
          </UserMessageGroup>
        ) : (
          /* ── Assistant message ── */
          <div className="relative w-full">
            {/* Left accent line */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 top-1.5 block h-[calc(100%-0.75rem)] w-[2px] rounded-full"
              style={{
                background: "linear-gradient(180deg, rgb(var(--malv-brand-rgb) / 0.55), rgb(var(--malv-brand-rgb) / 0.18), transparent)"
              }}
            />

              {runtimeOpenable ? (
              /* Runtime-openable assistant message — acts as a detail trigger */
              <motion.div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  const el = e.target as HTMLElement;
                  if (el.closest("button, a, [role='button']")) return;
                  onOpenRuntimeDetail?.(msg.runtimeSessionId!);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenRuntimeDetail?.(msg.runtimeSessionId!);
                  }
                }}
                whileTap={{ scale: preferMobileActions ? 0.995 : 1 }}
                transition={{ duration: 0.15 }}
                className={[
                  "relative min-w-0 w-full pl-4 pr-9 py-0.5 text-left cursor-pointer rounded-lg",
                  "transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--malv-brand-rgb)/0.3)]"
                ].join(" ")}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgb(var(--malv-text-rgb) / 0.025)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                aria-label="Open runtime details"
              >
                <MalvVisibleThought visible={visibleThought} lines={visibleThoughtLines} />
                {!visibleThought ? (
                  assistantTypingBand ? (
                    <MalvTypingIndicator phase={msg.activityPhase} band={assistantTypingBand} />
                  ) : (
                    assistantBody
                  )
                ) : null}

                {/* Metadata tags */}
                <AssistantMetaTags planPhases={planPhases} changes={changes} reasoning={reasoning} />

                {statusLabel ? (
                  <p className="mt-1.5 text-[12px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.7)" }}>
                    {statusLabel}
                  </p>
                ) : null}
                {showDiagnostics && msg.diagnosticErrorMessage ? (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-lg p-2 text-left font-mono text-[10px]"
                    style={{ background: "rgb(var(--malv-surface-raised-rgb))", border: "1px solid rgb(var(--malv-border-rgb) / 0.1)", color: "rgb(var(--malv-muted-rgb))" }}>
                    {msg.diagnosticErrorMessage}
                  </pre>
                ) : null}
                {voicePlaybackEl ? (
                  <div className="mt-1.5" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                    {voicePlaybackEl}
                  </div>
                ) : null}

                {/* Runtime chevron indicator */}
                <div
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  aria-hidden
                >
                  <span className="text-[10px] font-medium" style={{ color: "rgb(var(--malv-brand-rgb) / 0.65)" }}>
                    runtime
                  </span>
                  <ChevronRight className="h-3.5 w-3.5" style={{ color: "rgb(var(--malv-brand-rgb) / 0.55)" }} strokeWidth={2} />
                </div>
              </motion.div>
            ) : (
              /* Regular assistant message */
              <div className="relative min-w-0 w-full pl-4 py-0.5">
                <MalvVisibleThought visible={visibleThought} lines={visibleThoughtLines} />
                {!visibleThought ? (
                  assistantTypingBand ? (
                    <MalvTypingIndicator phase={msg.activityPhase} band={assistantTypingBand} />
                  ) : (
                    assistantBody
                  )
                ) : null}

                <AssistantMetaTags planPhases={planPhases} changes={changes} reasoning={reasoning} />

                {statusLabel ? (
                  <p className="mt-1.5 text-[12px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.7)" }}>
                    {statusLabel}
                  </p>
                ) : null}
                {showDiagnostics && msg.diagnosticErrorMessage ? (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-lg p-2 text-left font-mono text-[10px]"
                    style={{ background: "rgb(var(--malv-surface-raised-rgb))", border: "1px solid rgb(var(--malv-border-rgb) / 0.1)", color: "rgb(var(--malv-muted-rgb))" }}>
                    {msg.diagnosticErrorMessage}
                  </pre>
                ) : null}
                {voicePlaybackEl}
              </div>
            )}
          </div>
        )}

        {/* ── Assistant action row ── */}
        {isAssistant && (msg.status === "done" || msg.status === "error" || msg.status === "interrupted") ? (
          <div
            className={[
              "mt-2 flex flex-wrap items-center gap-0.5 pl-4",
              preferMobileActions ? "opacity-100" : "opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            ].join(" ")}
          >
            <ActionButton
              label={copiedActionKey === "assistant-copy" ? "Copied" : "Copy response"}
              disabled={actionsDisabled}
              onClick={() => void handleCopyWithFeedback("assistant-copy", msg.content)}
            >
              {copiedActionKey === "assistant-copy"
                ? <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.3} />
                : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
            </ActionButton>

            <ActionButton label="Retry response" disabled={actionsDisabled} onClick={() => void onAssistantRetry?.()}>
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            </ActionButton>

            <ActionButton
              label={assistantActionFeedback?.key === "fork" ? assistantActionFeedback.text : "Fork response"}
              disabled={actionsDisabled || assistantActionBusy != null}
              onClick={() => void handleAssistantFork()}
            >
              {assistantActionBusy === "fork"
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                : assistantActionFeedback?.key === "fork" && assistantActionFeedback.tone === "success"
                  ? <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.3} />
                  : <GitBranch className="h-3.5 w-3.5" strokeWidth={2} />}
            </ActionButton>

            <ActionButton
              label={assistantActionFeedback?.key === "share" ? assistantActionFeedback.text : "Share response"}
              disabled={actionsDisabled || assistantActionBusy != null}
              onClick={() => void handleAssistantShare()}
            >
              {assistantActionBusy === "share"
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                : assistantActionFeedback?.key === "share" && assistantActionFeedback.tone === "success"
                  ? <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.3} />
                  : <Send className="h-3.5 w-3.5" strokeWidth={2} />}
            </ActionButton>

            {assistantActionFeedback ? (
              <span
                aria-live="polite"
                className={[
                  "ml-1 text-[11px] tracking-[-0.01em]",
                  assistantActionFeedback.tone === "success"
                    ? "text-emerald-400/80"
                    : "text-rose-400/80"
                ].join(" ")}
              >
                {assistantActionFeedback.text}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const ChatMessageBubble = memo(ChatMessageBubbleInner);

/** Inline metadata tags shown below message content */
function AssistantMetaTags({ planPhases, changes, reasoning }: {
  planPhases: string[];
  changes: string[];
  reasoning: string;
}) {
  if (!planPhases.length && !changes.length && !reasoning) return null;

  return (
    <div
      className="mt-2.5 space-y-1.5 rounded-xl px-3 py-2.5 text-[12px]"
      style={{
        background: "rgb(var(--malv-surface-raised-rgb))",
        border: "1px solid rgb(var(--malv-border-rgb) / 0.08)"
      }}
    >
      {planPhases.length ? (
        <div>
          <div
            className="mb-1 text-[10px] font-medium uppercase tracking-[0.15em]"
            style={{ color: "rgb(var(--malv-muted-rgb) / 0.6)" }}
          >
            Plan
          </div>
          <div className="flex flex-wrap gap-1">
            {planPhases.slice(0, 6).map((phase) => (
              <span
                key={phase}
                className="rounded-full px-2 py-0.5 text-[11px]"
                style={{
                  background: "rgb(var(--malv-surface-overlay-rgb))",
                  border: "1px solid rgb(var(--malv-border-rgb) / 0.08)",
                  color: "rgb(var(--malv-text-rgb) / 0.7)"
                }}
              >
                {phase}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {changes.length ? (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.15em]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.6)" }}>
            Changes
          </div>
          <ul className="space-y-0.5" style={{ color: "rgb(var(--malv-text-rgb) / 0.7)" }}>
            {changes.slice(0, 4).map((item) => (
              <li key={item}>— {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {reasoning ? (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.15em]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.6)" }}>
            Reasoning
          </div>
          <p style={{ color: "rgb(var(--malv-text-rgb) / 0.65)" }}>{reasoning}</p>
        </div>
      ) : null}
    </div>
  );
}
