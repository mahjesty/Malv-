import {
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
import type { MalvChatMessage } from "../../lib/chat/types";
import type { MalvReplyMode } from "../../lib/settings/malvChatComposerSettingsTypes";
import { MalvMessageBody } from "./MalvMessageBody";
import { MalvTypingIndicator } from "./MalvTypingIndicator";
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

export function ChatMessageBubble(props: {
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
  /** From settings: text-only, auto spoken replies, or both with per-message controls. */
  replyMode?: MalvReplyMode;
  /** When the message is tied to a workspace runtime session, opens the in-chat runtime panel. */
  onOpenRuntimeDetail?: (sessionId: string) => void;
}) {
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
    onOpenRuntimeDetail
  } = props;

  /** Per-message play/stop — only when replies are both text-forward and spoken (settings). */
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

  // Local fallback so the tray still opens reliably even if parent reveal state lags.
  const [mobileUserTrayOpen, setMobileUserTrayOpen] = useState(Boolean(revealedUserMessageActions));
  const lastControlledRevealRef = useRef<boolean | undefined>(revealedUserMessageActions);

  const onEditStateChangeRef = useRef(onEditStateChange);
  onEditStateChangeRef.current = onEditStateChange;

  const isUser = msg.role === "user";
  const isAssistant = msg.role === "assistant";

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
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
      }
      if (copyFeedbackTimerRef.current != null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
      if (assistantActionFeedbackTimerRef.current != null) {
        window.clearTimeout(assistantActionFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mobileUserTrayOpen) setCopiedActionKey(null);
  }, [mobileUserTrayOpen]);

  // Sync with parent-controlled reveal only when that prop actually changes.
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
    if (copyFeedbackTimerRef.current != null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopiedActionKey(null);
      copyFeedbackTimerRef.current = null;
    }, 1400);
  }, []);

  const setAssistantActionFeedbackWithTimeout = useCallback(
    (next: { key: "fork" | "share"; tone: "success" | "error"; text: string }) => {
      setAssistantActionFeedback(next);
      if (assistantActionFeedbackTimerRef.current != null) {
        window.clearTimeout(assistantActionFeedbackTimerRef.current);
      }
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

      devLongPressLog("pointerdown", {
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        x: Math.round(e.clientX),
        y: Math.round(e.clientY)
      });

      clearUserLongPressTimer();

      longPressStartedAtRef.current = performance.now();
      longPressPointerIdRef.current = e.pointerId;
      longPressStartPointRef.current = { x: e.clientX, y: e.clientY };
      longPressTriggeredRef.current = false;

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // no-op on unsupported cases
      }

      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        longPressTriggeredRef.current = true;
        revealUserActions("timer-complete", e.pointerId);
      }, USER_ACTION_LONG_PRESS_MS);
    },
    [
      isUser,
      preferMobileActions,
      editing,
      mobileUserTrayOpen,
      clearUserLongPressTimer,
      revealUserActions,
      devLongPressLog
    ]
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
        devLongPressLog("pointermove-cancelled", {
          pointerId: e.pointerId,
          dx: Math.round(dx),
          dy: Math.round(dy),
          distance: Math.round(distance),
          tolerance: USER_LONG_PRESS_MOVE_TOLERANCE_PX
        });
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

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // no-op
      }

      const startedAt = longPressStartedAtRef.current;
      const elapsed = startedAt == null ? 0 : performance.now() - startedAt;

      if (!longPressTriggeredRef.current && elapsed >= USER_ACTION_LONG_PRESS_MS) {
        revealUserActions("pointerup-fallback", e.pointerId);
      }

      if (longPressTriggeredRef.current) {
        releaseSuppressionAfterPointerSequence(e.pointerId);
      }

      devLongPressLog("pointerup", {
        pointerId: e.pointerId,
        elapsedMs: Math.round(elapsed),
        triggered: longPressTriggeredRef.current
      });

      clearUserLongPressTimer();
    },
    [
      isUser,
      preferMobileActions,
      revealUserActions,
      releaseSuppressionAfterPointerSequence,
      clearUserLongPressTimer,
      devLongPressLog
    ]
  );

  const handleUserPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isUser || !preferMobileActions) return;

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // no-op
      }

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

  /** Only rows explicitly tied to a workspace runtime session (or hydrated from persisted metadata) open the drawer. */
  const runtimeOpenable =
    isAssistant &&
    Boolean(msg.runtimeSessionId?.trim() && onOpenRuntimeDetail) &&
    msg.hasRuntimeDetail !== false;

  const voicePlaybackEl =
    isAssistant &&
    showPlaybackChrome &&
    (msg.status === "done" || msg.status === "interrupted") &&
    msg.content.trim() ? (
      <VoicePlaybackControls messageId={msg.id} text={msg.content} enabled />
    ) : null;

  return (
    <div
      ref={rowRef}
      className={[
        "group relative w-full min-w-0 touch-manipulation",
        isUser ? "pl-0 pr-1 sm:pr-2" : "pl-2 pr-0 sm:pl-4",
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
          "relative max-w-[min(100%,720px)]",
          isUser ? "ml-auto w-fit text-right" : "w-full text-left"
        ].join(" ")}
      >
        {isUser ? (
          <UserMessageGroup>
            {msg.attachments?.length ? (
              <UserMessageAttachments attachments={msg.attachments} />
            ) : null}

            {showUserTextBubble ? (
              <div
                className={[
                  "malv-edit-bubble relative ml-auto min-w-0 overflow-hidden rounded-[20px] border border-white/[0.08]",
                  editing ? "w-full max-w-full" : "w-fit max-w-full",
                  "bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))]",
                  "shadow-[0_10px_36px_rgba(0,0,0,0.24)] ring-1 ring-inset ring-white/[0.04] backdrop-blur-[10px]",
                  "transition-[background-color,box-shadow,border-color] duration-200",
                  "focus-within:border-white/[0.12] focus-within:bg-[linear-gradient(180deg,rgba(255,255,255,0.078),rgba(255,255,255,0.03))]",
                  "focus-within:shadow-[0_12px_40px_rgba(0,0,0,0.28),0_0_0_1px_rgba(255,255,255,0.06)]",
                  "px-3 py-1.5"
                ].join(" ")}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(95,180,255,0.14),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(120,96,255,0.10),transparent_35%)]" />
                {editing ? (
                  <textarea
                    ref={editTaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className={[
                      "malv-edit-textarea relative z-10 min-h-[5.25rem] w-full max-w-full resize-y bg-transparent px-0 py-0",
                      "text-[14px] font-[450] leading-[1.55] tracking-[-0.01em] text-malv-text/[0.97] sm:text-[15px] sm:leading-[1.6]",
                      "rounded-lg border border-transparent shadow-none outline-none ring-0",
                      "focus:outline-none focus:shadow-none focus:ring-0 focus-visible:outline-none focus-visible:shadow-none focus-visible:ring-0"
                    ].join(" ")}
                    disabled={actionsDisabled}
                    placeholder={msg.attachments?.length ? "Add a caption (optional)…" : undefined}
                  />
                ) : (
                  <p className="relative min-w-0 whitespace-pre-wrap break-words text-left text-[14px] font-[450] leading-[1.55] tracking-[-0.01em] text-malv-text/[0.97] sm:text-[15px] sm:leading-[1.6]">
                    {userPlain}
                  </p>
                )}
              </div>
            ) : null}

            {userDeliveryLabel ? (
              <p className="w-full min-w-0 text-right text-[11px] text-malv-text/42 sm:text-[12px]">{userDeliveryLabel}</p>
            ) : null}

            {editing ? (
              <div className="flex w-full flex-wrap items-center justify-end gap-2">
                <motion.button
                  type="button"
                  className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[12.5px] font-medium text-malv-text/70 transition-colors hover:bg-white/[0.08] hover:text-malv-text/88"
                  onClick={cancelEdit}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="button"
                  className={[
                    "rounded-lg border border-[oklch(0.62_0.15_225_/_0.32)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[oklch(0.95_0.02_250)]",
                    "bg-[linear-gradient(180deg,rgba(96,165,250,0.34),rgba(96,165,250,0.20))]",
                    "shadow-[0_10px_24px_rgba(30,64,175,0.28),inset_0_1px_0_rgba(255,255,255,0.22)]",
                    "transition-[transform,filter,opacity] duration-200 hover:brightness-110 active:brightness-95 disabled:opacity-40"
                  ].join(" ")}
                  disabled={actionsDisabled || (!draft.trim() && !(msg.attachments?.length ?? 0))}
                  onClick={() => void saveEdit()}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Save
                </motion.button>
              </div>
            ) : null}

            {!editing ? (
              <>
                <div
                  className={[
                    "pointer-events-none mt-1 flex w-full items-center justify-end gap-1 border-t border-white/[0.04] pt-1.5",
                    desktopUserActionsVisible
                      ? "opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100"
                      : "hidden"
                  ].join(" ")}
                >
                  <button
                    type="button"
                    className="pointer-events-auto rounded-md p-1 text-malv-text/45 transition-colors hover:bg-white/[0.05] hover:text-malv-text/75"
                    disabled={actionsDisabled}
                    aria-label={copiedActionKey === "user-desktop-copy" ? "Copied" : "Copy message"}
                    onClick={() => {
                      void handleCopyWithFeedback("user-desktop-copy", userMessageCopyPlainText(msg));
                    }}
                  >
                    {copiedActionKey === "user-desktop-copy" ? (
                      <Check className="h-3.5 w-3.5 text-[oklch(0.78_0.16_145)]" strokeWidth={2.35} />
                    ) : (
                      <Copy className="h-3.5 w-3.5" strokeWidth={2.1} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="pointer-events-auto rounded-md p-1 text-malv-text/45 transition-colors hover:bg-white/[0.05] hover:text-malv-text/75"
                    disabled={actionsDisabled}
                    aria-label="Edit message"
                    onClick={() => void beginEdit()}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2.1} />
                  </button>
                  <button
                    type="button"
                    className="pointer-events-auto rounded-md p-1 text-malv-text/45 transition-colors hover:bg-white/[0.05] hover:text-malv-text/75"
                    disabled={actionsDisabled}
                    aria-label="Resend message"
                    onClick={() => void onUserResend({ messageId: msg.id })}
                  >
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.1} />
                  </button>
                </div>

                <AnimatePresence>
                  {showMobileUserTray ? (
                    <motion.div
                      role="toolbar"
                      aria-label="Message actions"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.18 }}
                      className="mt-1 flex w-full items-center justify-end gap-1 border-t border-white/[0.04] pt-1.5"
                    >
                      <button
                        type="button"
                        className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.025] px-2 text-malv-text/65 hover:bg-white/[0.06] active:bg-white/[0.1] disabled:opacity-40"
                        disabled={actionsDisabled}
                        aria-label={copiedActionKey === "user-mobile-copy" ? "Copied" : "Copy message"}
                        onClick={() => {
                          void handleCopyWithFeedback("user-mobile-copy", userMessageCopyPlainText(msg));
                        }}
                      >
                        {copiedActionKey === "user-mobile-copy" ? (
                          <Check className="h-3.5 w-3.5 text-[oklch(0.78_0.16_145)]" strokeWidth={2.35} />
                        ) : (
                          <Copy className="h-3.5 w-3.5" strokeWidth={2.1} />
                        )}
                      </button>

                      <button
                        type="button"
                        className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.025] px-2 text-malv-text/65 hover:bg-white/[0.06] active:bg-white/[0.1] disabled:opacity-40"
                        disabled={actionsDisabled}
                        aria-label="Edit message"
                        onClick={() => {
                          dismissUserActions("edit-click");
                          beginEdit();
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2.1} />
                      </button>

                      <button
                        type="button"
                        className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.025] px-2 text-malv-text/65 hover:bg-white/[0.06] active:bg-white/[0.1] disabled:opacity-40"
                        disabled={actionsDisabled}
                        aria-label="Resend message"
                        onClick={() => {
                          dismissUserActions("resend-click");
                          void onUserResend({ messageId: msg.id });
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.1} />
                      </button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </>
            ) : null}
          </UserMessageGroup>
        ) : (
            <div className="relative w-full space-y-2.5 pl-0 sm:pl-1">
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 top-1.5 block h-[calc(100%-0.75rem)] w-px"
              style={{
                background:
                  "linear-gradient(180deg, oklch(0.62 0.14 220 / 0.55), oklch(0.48 0.12 280 / 0.35), transparent)"
              }}
            />
            {runtimeOpenable ? (
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
                whileTap={{ scale: preferMobileActions ? 0.994 : 1 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className={[
                  "relative min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.02] py-2 pl-3 pr-10 text-left sm:pl-4",
                  "cursor-pointer transition-[background-color,border-color,box-shadow] duration-200",
                  "hover:border-white/[0.12] hover:bg-white/[0.04] hover:shadow-[0_12px_40px_rgba(0,0,0,0.22)]",
                  "active:bg-white/[0.04]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35"
                ].join(" ")}
                aria-label="Open runtime details"
              >
                {(msg.status === "thinking" || msg.status === "streaming") && !msg.content.trim() ? (
                  <MalvTypingIndicator phase={msg.activityPhase} streaming={msg.status === "streaming"} />
                ) : (
                  <MalvMessageBody content={msg.content} emptyHint="…" />
                )}
                {planPhases.length || changes.length || reasoning ? (
                  <div className="mt-2 space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5 text-[12px]">
                    {planPhases.length ? (
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-malv-text/50">Plan</div>
                        <div className="flex flex-wrap gap-1">
                          {planPhases.slice(0, 6).map((phase) => (
                            <span key={phase} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-malv-text/72">{phase}</span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {changes.length ? (
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-malv-text/50">Changes</div>
                        <ul className="space-y-0.5 text-malv-text/75">
                          {changes.slice(0, 4).map((item) => (
                            <li key={item}>- {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {reasoning ? (
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-malv-text/50">Reasoning</div>
                        <p className="text-malv-text/70">{reasoning}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {statusLabel ? (
                  <p className="mt-1 text-[12px] text-malv-text/50 sm:text-[13px]">{statusLabel}</p>
                ) : null}
                {showDiagnostics && msg.diagnosticErrorMessage ? (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-white/[0.08] bg-black/40 p-2 text-left font-mono text-[10px] text-malv-text/55">
                    {msg.diagnosticErrorMessage}
                  </pre>
                ) : null}
                {voicePlaybackEl ? (
                  <div
                    className="mt-1"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {voicePlaybackEl}
                  </div>
                ) : null}
                <ChevronRight
                  className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-malv-text/32"
                  strokeWidth={2}
                  aria-hidden
                />
              </motion.div>
            ) : (
              <div className="relative min-w-0 pl-3 sm:pl-4">
                {(msg.status === "thinking" || msg.status === "streaming") && !msg.content.trim() ? (
                  <MalvTypingIndicator phase={msg.activityPhase} streaming={msg.status === "streaming"} />
                ) : (
                  <MalvMessageBody content={msg.content} emptyHint="…" />
                )}
                {planPhases.length || changes.length || reasoning ? (
                  <div className="mt-2 space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5 text-[12px]">
                    {planPhases.length ? (
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-malv-text/50">Plan</div>
                        <div className="flex flex-wrap gap-1">
                          {planPhases.slice(0, 6).map((phase) => (
                            <span key={phase} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-malv-text/72">{phase}</span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {changes.length ? (
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-malv-text/50">Changes</div>
                        <ul className="space-y-0.5 text-malv-text/75">
                          {changes.slice(0, 4).map((item) => (
                            <li key={item}>- {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {reasoning ? (
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-malv-text/50">Reasoning</div>
                        <p className="text-malv-text/70">{reasoning}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {statusLabel ? (
                  <p className="mt-1 text-[12px] text-malv-text/50 sm:text-[13px]">{statusLabel}</p>
                ) : null}
                {showDiagnostics && msg.diagnosticErrorMessage ? (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-white/[0.08] bg-black/40 p-2 text-left font-mono text-[10px] text-malv-text/55">
                    {msg.diagnosticErrorMessage}
                  </pre>
                ) : null}
                {voicePlaybackEl}
              </div>
            )}
          </div>
        )}

        {isAssistant && (msg.status === "done" || msg.status === "error" || msg.status === "interrupted") ? (
          <div
            className={[
              "mt-2 flex flex-wrap items-center gap-1.5 pl-3 sm:mt-2.5 sm:pl-4",
              preferMobileActions ? "opacity-100" : "opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            ].join(" ")}
          >
            <button
              type="button"
              className="rounded-md p-1.25 text-malv-text/58 hover:bg-white/[0.06] hover:text-malv-text/88 disabled:opacity-30"
              disabled={actionsDisabled}
              aria-label={copiedActionKey === "assistant-copy" ? "Copied" : "Copy response"}
              onClick={() => {
                void handleCopyWithFeedback("assistant-copy", msg.content);
              }}
            >
              {copiedActionKey === "assistant-copy" ? (
                <Check className="h-3.5 w-3.5 text-[oklch(0.78_0.16_145)]" strokeWidth={2.3} />
              ) : (
                <Copy className="h-3.5 w-3.5" strokeWidth={2.1} />
              )}
            </button>

            <button
              type="button"
              className="rounded-md p-1.25 text-malv-text/58 hover:bg-white/[0.06] hover:text-malv-text/88 disabled:opacity-30"
              disabled={actionsDisabled}
              aria-label="Retry response"
              onClick={() => void onAssistantRetry?.()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              className="rounded-md p-1.25 text-malv-text/58 hover:bg-white/[0.06] hover:text-malv-text/88 disabled:opacity-30"
              disabled={actionsDisabled || assistantActionBusy != null}
              aria-label={assistantActionFeedback?.key === "fork" ? assistantActionFeedback.text : "Fork response"}
              onClick={() => {
                void handleAssistantFork();
              }}
            >
              {assistantActionBusy === "fork" ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : assistantActionFeedback?.key === "fork" && assistantActionFeedback.tone === "success" ? (
                <Check className="h-3.5 w-3.5 text-[oklch(0.78_0.16_145)]" strokeWidth={2.3} />
              ) : (
                <GitBranch className="h-3.5 w-3.5" />
              )}
            </button>

            <button
              type="button"
              className="rounded-md p-1.25 text-malv-text/58 hover:bg-white/[0.06] hover:text-malv-text/88 disabled:opacity-30"
              disabled={actionsDisabled || assistantActionBusy != null}
              aria-label={assistantActionFeedback?.key === "share" ? assistantActionFeedback.text : "Share response"}
              onClick={() => {
                void handleAssistantShare();
              }}
            >
              {assistantActionBusy === "share" ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : assistantActionFeedback?.key === "share" && assistantActionFeedback.tone === "success" ? (
                <Check className="h-3.5 w-3.5 text-[oklch(0.78_0.16_145)]" strokeWidth={2.3} />
              ) : (
                <Send className="h-3.5 w-3.5" strokeWidth={2.1} />
              )}
            </button>
            {assistantActionFeedback ? (
              <span
                aria-live="polite"
                className={[
                  "ml-1 text-[11px] tracking-[-0.01em]",
                  assistantActionFeedback.tone === "success" ? "text-malv-text/62" : "text-[oklch(0.72_0.16_25)]"
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