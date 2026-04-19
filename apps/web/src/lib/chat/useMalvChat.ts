import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createMalvSocket, type MalvSocket } from "../realtime/socket";
import { useAuth } from "../auth/AuthContext";
import { MalvChatClient } from "./malvChatClient";
import { fetchConversationDetail, forkConversationFromMessage } from "../api/dataPlane";
import { parseNestErrorMessage } from "../api/http-core";
import { computeMalvPresence } from "./malvPresence";
import { deriveMalvExecutionStatusLabel, MALV_STREAM_CANONICAL_ACTIVE_META_KEY } from "./malvAssistantUiState";
import { malvChatDebug } from "./malvChatDebug";
import { malvE2eLog } from "./malvE2eLog";
import { malvChatPipelineLog } from "./malvChatPipelineLog";
import { mapApprovalRequiredToUserMessage, mapGenerationWatchdogToUserMessage, mapMalvErrorToUserMessage } from "./malvUserAdapter";
import {
  buildBackendUserMessageText,
  cloneChatAttachmentRefs,
  collectBlobUrlsFromMessages,
  stripLegacyAttachmentPrefix
} from "./chatAttachmentUtils";
import type { ChatAttachmentRef, MalvChatMessage, MalvOrchestrationEvent, MalvSendPayload } from "./types";
import { mergeRuntimeFieldsFromStorage } from "./malvMessageRuntime";
import { applyMalvEmojiExpressionLayer } from "./emoji-expression-intelligence";
import { getMalvBeastLevel, getMalvVaultSessionId } from "../malvOperatorPrefs";
import { getStoredUserMoodHint } from "../malvMoodHint";
import { clearArmedExploreHandoffJson, consumeArmedExploreHandoffJsonForSend } from "../explore/exploreChatHandoffStorage";
import {
  appendAssistantStreamCanonical,
  reconcileAssistantDoneText,
  type AssistantStreamCanonical
} from "./assistant-text";
import { computeAssistantStreamVisibleEnd } from "./malvAssistantStreamVisibleCadence";
import {
  cancelAssistantStreamVisualRafFromRegistry,
  registerAssistantStreamVisualRafCancel
} from "./malvAssistantStreamVisualRegistry";
import {
  logAssistantStreamCadenceSummary,
  recordAssistantStreamCadenceDelta,
  recordAssistantStreamCadenceVisiblePaint
} from "./malvAssistantStreamCadenceDebug";
import {
  malvStreamLatencyAuditAbortTurn,
  malvStreamLatencyAuditAssistantDone,
  malvStreamLatencyAuditBeginTurn,
  malvStreamLatencyAuditFirstDelta,
  malvStreamLatencyAuditScheduleFinalRenderLog
} from "./malvChatStreamLatencyAudit";

const GENERATION_WATCHDOG_MS = 120_000;

const useMockMode = () => import.meta.env.VITE_MALV_CHAT_MOCK === "true";

const COMPOSER_OPERATOR_PHASE = "composer_route";

export type UseMalvChatOptions = {
  /** Settings-driven chat vs operator routing for every send (typed, voice auto-send, retry, etc.). */
  getAssistantRoute?: () => "chat" | "operator";
  /**
   * Conversation id from the URL (`?conversationId=`). When set, socket `conversation_bound` for a
   * different id is ignored so stale realtime events cannot hijack the active thread during hydration.
   */
  routeConversationId?: string | null;
};

function applyConversationId(messages: MalvChatMessage[], cid: string): MalvChatMessage[] {
  return messages.map((m) =>
    m.conversationId === "pending" || m.conversationId === "" ? { ...m, conversationId: cid } : m
  );
}

function stripMalvStreamCanonicalActiveMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  const { [MALV_STREAM_CANONICAL_ACTIVE_META_KEY]: _drop, ...rest } = meta;
  return rest;
}

/**
 * Chat state + MALV reply pipeline: optimistic send, immediate streaming updates, stop/retry, transport hints.
 */
export function useMalvChat(options?: UseMalvChatOptions) {
  const { accessToken: accessTokenRaw } = useAuth();
  const accessToken = accessTokenRaw ?? undefined;
  const mock = useMockMode();
  const getAssistantRouteRef = useRef(options?.getAssistantRoute);
  getAssistantRouteRef.current = options?.getAssistantRoute;
  const routeConversationIdRef = useRef<string | null>(null);
  routeConversationIdRef.current = options?.routeConversationId ?? null;

  const routingForTurn = useCallback((inputMode: "text" | "voice" = "text") => {
    const isOperator = getAssistantRouteRef.current?.() === "operator";
    return {
      operatorPhase: isOperator ? COMPOSER_OPERATOR_PHASE : undefined,
      inputMode
    };
  }, []);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MalvChatMessage[]>(() => []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [generationActive, setGenerationActive] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  /**
   * When the user forks a MALV message into a new chat, we keep an initial transcript slice
   * and inject it into the next backend request (the backend doesn't currently support seeding
   * persisted assistant rows into a new conversation).
   */
  const [forkSeedMessages, setForkSeedMessages] = useState<MalvChatMessage[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [threadErrorDiagnostic, setThreadErrorDiagnostic] = useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [transportStatus, setTransportStatus] = useState<"idle" | "connected" | "disconnected" | "reconnecting">(
    mock ? "idle" : "idle"
  );

  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  const messagesRef = useRef<MalvChatMessage[]>(messages);
  messagesRef.current = messages;

  const conversationLoadSeqRef = useRef(0);
  const conversationLoadAbortRef = useRef<AbortController | null>(null);

  const socketRef = useRef<MalvSocket | null>(null);
  const clientRef = useRef<MalvChatClient | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  /**
   * Streaming contract (assistant turns):
   * - **Canonical** (`assistantStreamCanonicalRef`): full text after each real `assistant_delta` (truthful, immediate).
   * - **Visible** (`messages[].content` while streaming): prefix of canonical, coalesced via rAF + {@link computeAssistantStreamVisibleEnd} (adaptive, no wall-clock hold).
   * - **Pre-stream** (`status==="preparing"`): optimistic row before the first visible paint — not “streaming” in UX terms.
   * - **Final**: `assistant_done` uses {@link reconcileAssistantDoneText} — for normal complete turns the
   *   streamed buffer stays the visible answer; partial/failed paths still merge toward server text.
   */
  const assistantStreamCanonicalRef = useRef<AssistantStreamCanonical | null>(null);
  /** Message ids that reached terminal assistant state; protects against out-of-order late deltas. */
  const finalizedAssistantMessageIdsRef = useRef<Set<string>>(new Set());
  /** At most one requestAnimationFrame commit per frame — visible transcript/bubble cadence. */
  const assistantStreamRafRef = useRef<number | null>(null);
  /** Painted prefix length; always ≤ canonical length in {@link assistantStreamCanonicalRef}. */
  const assistantStreamVisibleLenRef = useRef(0);
  const assistantStreamPendingCidRef = useRef<string | null>(null);
  const scheduleAssistantStreamVisualFlushRef = useRef<() => void>(() => {});
  const abortRef = useRef<AbortController | null>(null);
  const normalizeThinkingSteps = useCallback((steps: string[] | null | undefined): string[] => {
    // Only return real server-sent steps. No generic fallback — visible thought
    // must reflect actual reasoning, not placeholder text.
    return (steps ?? []).map((x) => x.trim()).filter((x) => x.length > 0).slice(0, 4);
  }, []);

  scheduleAssistantStreamVisualFlushRef.current = () => {
    if (assistantStreamRafRef.current != null) return;
    assistantStreamRafRef.current = requestAnimationFrame(() => {
      assistantStreamRafRef.current = null;
      const aidNow = activeAssistantIdRef.current;
      const snap = assistantStreamCanonicalRef.current;
      if (!aidNow || !snap || snap.messageId !== aidNow) return;

      const routeId = routeConversationIdRef.current;
      const evCid = assistantStreamPendingCidRef.current?.trim() ?? "";
      const shouldBindCid =
        Boolean(evCid) &&
        evCid !== "pending" &&
        (routeId == null || evCid === routeId) &&
        (!conversationIdRef.current || conversationIdRef.current === "pending");

      let visibleLen = Math.min(assistantStreamVisibleLenRef.current, snap.text.length);
      assistantStreamVisibleLenRef.current = visibleLen;

      const nextEnd = computeAssistantStreamVisibleEnd({
        canonical: snap.text,
        visibleLen
      });

      if (nextEnd > visibleLen) {
        assistantStreamVisibleLenRef.current = nextEnd;

        if (shouldBindCid) {
          assistantStreamPendingCidRef.current = null;
          setConversationId(evCid);
        }

        const painted = snap.text.slice(0, nextEnd);
        setMessages((prev) => {
          const base = shouldBindCid ? applyConversationId(prev, evCid) : prev;
          return base.map((m) =>
            m.id === aidNow
              ? {
                  ...m,
                  content: painted,
                  status: "streaming",
                  eventType: "assistant_delta",
                  source: m.source ?? "malv_socket"
                }
              : m
          );
        });
        recordAssistantStreamCadenceVisiblePaint(nextEnd);
      }
    });
  };

  useLayoutEffect(() => {
    const cancel = () => {
      if (assistantStreamRafRef.current != null) {
        cancelAnimationFrame(assistantStreamRafRef.current);
        assistantStreamRafRef.current = null;
      }
    };
    registerAssistantStreamVisualRafCancel(cancel);
    return () => {
      registerAssistantStreamVisualRafCancel(null);
      cancel();
    };
  }, []);
  const lastRetryPayloadRef = useRef<Omit<MalvSendPayload, "signal"> | null>(null);
  const trackedBlobUrlsRef = useRef<Set<string>>(new Set());

  if (!clientRef.current) {
    clientRef.current = new MalvChatClient({
      useMock: mock,
      accessToken,
      getSocket: () => socketRef.current
    });
  }

  useEffect(() => {
    clientRef.current?.updateConfig({ useMock: mock, accessToken });
  }, [mock, accessToken]);

  useEffect(() => {
    if (!generationActive) return;
    const aid = activeAssistantIdRef.current;
    if (!aid) return;
    const t = window.setTimeout(() => {
      if (activeAssistantIdRef.current !== aid) return;
      const row = messagesRef.current.find((x) => x.id === aid && x.role === "assistant");
      const snapWd = assistantStreamCanonicalRef.current;
      const mergedWd =
        snapWd?.messageId === aid ? snapWd.text : (row?.content ?? "");
      if (row && mergedWd.length > 0) {
        malvChatPipelineLog("watchdog_skipped_visible_assistant_text", { assistantMessageId: aid });
        assistantStreamCanonicalRef.current = null;
        assistantStreamPendingCidRef.current = null;
        setGenerationActive(false);
        setIsThinking(false);
        setThinkingSteps([]);
        activeAssistantIdRef.current = null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aid && m.role === "assistant"
              ? {
                  ...m,
                  content: mergedWd,
                  status: "partial_done",
                  eventType: "assistant_done",
                  metadata: stripMalvStreamCanonicalActiveMeta(m.metadata)
                }
              : m
          )
        );
        return;
      }
      malvChatPipelineLog("assistant failed", { source: "watchdog_timeout", assistantMessageId: aid });
      assistantStreamCanonicalRef.current = null;
      assistantStreamPendingCidRef.current = null;
      setThreadError(mapGenerationWatchdogToUserMessage());
      setThreadErrorDiagnostic("Timed out waiting for orchestration events.");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aid && m.role === "assistant"
            ? {
                ...m,
                content: mergedWd.length ? mergedWd : m.content,
                status: "error",
                errorMessage: mapGenerationWatchdogToUserMessage(),
                diagnosticErrorMessage: "Timed out waiting for orchestration events.",
                eventType: "error",
                metadata: stripMalvStreamCanonicalActiveMeta(m.metadata)
              }
            : m
        )
      );
      setGenerationActive(false);
      setIsThinking(false);
      setThinkingSteps([]);
      activeAssistantIdRef.current = null;
    }, GENERATION_WATCHDOG_MS);
    return () => window.clearTimeout(t);
  }, [generationActive]);

  const clearThreadError = useCallback(() => {
    setThreadError(null);
    setThreadErrorDiagnostic(null);
  }, []);

  useEffect(() => {
    if (mock || !accessToken) return;
    const socket = createMalvSocket();
    socketRef.current = socket;

    const onDisconnect = () => {
      setTransportStatus((prev) => (prev === "connected" ? "disconnected" : prev));
    };
    const onConnect = () => {
      setTransportStatus("connected");
    };
    socket.on("disconnect", onDisconnect);
    socket.on("connect", onConnect);
    if (socket.connected) setTransportStatus("connected");

    return () => {
      socket.off("disconnect", onDisconnect);
      socket.off("connect", onConnect);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [mock, accessToken]);

  function buildForkContextPrefix(seed: MalvChatMessage[]) {
    const MAX_TOTAL_CHARS = 4200;
    const MAX_SINGLE_MSG_CHARS = 520;
    const parts: string[] = [];
    parts.push("Context transcript (fork seed):");

    const trimmedSeed = seed.filter((m) => m.role === "user" || m.role === "assistant");
    for (const m of trimmedSeed) {
      const role = m.role === "user" ? "You" : "MALV";
      const c = (m.content ?? "").trim();
      const stripped = m.role === "user" ? stripLegacyAttachmentPrefix(c) : c;
      const clipped =
        stripped.length > MAX_SINGLE_MSG_CHARS ? `${stripped.slice(0, MAX_SINGLE_MSG_CHARS)}…` : stripped;
      const attN = m.attachments?.length ?? 0;
      const hasImage = Boolean(m.attachments?.some((a) => a.kind === "image"));
      const attHint =
        attN > 0 ? ` · ${attN} attachment${attN > 1 ? "s" : ""}${hasImage ? " (incl. images)" : ""}` : "";
      parts.push(`${role}: ${clipped || "(empty)"}${attHint}`);

      const joined = parts.join("\n");
      if (joined.length > MAX_TOTAL_CHARS) break;
    }

    return parts.join("\n");
  }

  const handleOrchestrationEvent = useCallback(
    (e: MalvOrchestrationEvent) => {
      let aid = activeAssistantIdRef.current;
      const isTerminalAssistantStatus = (status: MalvChatMessage["status"] | undefined) =>
        status === "done" || status === "interrupted" || status === "partial_done" || status === "error";
      const isFinalizedAssistantId = (messageId: string | null | undefined) =>
        Boolean(messageId && finalizedAssistantMessageIdsRef.current.has(messageId));
      if (
        (e.type === "thinking" || e.type === "thinking_state" || e.type === "assistant_delta" || e.type === "assistant_done") &&
        !aid &&
        "messageId" in e &&
        e.messageId
      ) {
        const rowForEvent = messagesRef.current.find((x) => x.id === e.messageId && x.role === "assistant");
        const isTerminalRow = isTerminalAssistantStatus(rowForEvent?.status);
        const allowRestoreForDone = e.type === "assistant_done" && !isFinalizedAssistantId(e.messageId);
        const allowRestoreForLiveEvent =
          (e.type === "assistant_delta" || e.type === "thinking" || e.type === "thinking_state") &&
          !isFinalizedAssistantId(e.messageId) &&
          !isTerminalRow &&
          Boolean(rowForEvent);
        if (allowRestoreForDone || allowRestoreForLiveEvent) {
          activeAssistantIdRef.current = e.messageId;
          aid = e.messageId;
          malvE2eLog("client assistant id restored from event (was null)", {
            messageId: e.messageId,
            eventType: e.type
          });
        }
      }

      if (e.type === "transport") {
        if (e.status === "disconnected") setTransportStatus("disconnected");
        if (e.status === "connected") setTransportStatus("connected");
        if (e.status === "reconnecting") setTransportStatus("reconnecting");
        return;
      }

      if (e.type === "conversation_bound") {
        const routeId = routeConversationIdRef.current;
        if (routeId != null && e.conversationId !== routeId) {
          malvE2eLog("conversation_bound ignored (route mismatch)", { routeId, bound: e.conversationId });
          return;
        }
        setConversationId(e.conversationId);
        setMessages((prev) => applyConversationId(prev, e.conversationId));
        return;
      }

      if (e.type === "memory_context") {
        if (!aid) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aid
              ? {
                  ...m,
                  status: "thinking",
                  activityPhase: "accessing_memory",
                  eventType: "memory_context",
                  metadata: {
                    ...m.metadata,
                    memorySnippetCount: e.snippetCount,
                    vaultScoped: e.vaultScoped
                  }
                }
              : m
          )
        );
        malvE2eLog("frontend event received", { type: "memory_context", snippetCount: e.snippetCount });
        return;
      }

      if (e.type === "thinking" || e.type === "planning") {
        if (!aid || (e.messageId != null && e.messageId !== aid)) return;
        malvE2eLog("client received reply event", { kind: e.type, messageId: aid, phase: e.type === "planning" ? "planning" : e.phase });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aid
              ? {
                  ...m,
                  status: "thinking",
                  activityPhase: e.type === "planning" ? "planning_next_step" : e.phase ?? "thinking",
                  eventType: e.type === "planning" ? "planning" : "thinking",
                  metadata: {
                    ...m.metadata,
                    lastDetail: "detail" in e ? e.detail : undefined
                  }
                }
              : m
          )
        );
        return;
      }

      if (e.type === "thinking_state") {
        if (!aid || (e.messageId != null && e.messageId !== aid)) return;
        // Only show visible thought when the server sends real content.
        // Empty steps mean no eligible thought — don't fall back to generic lines.
        const normalized = normalizeThinkingSteps(e.steps);
        if (normalized.length > 0) {
          setIsThinking(true);
          setThinkingSteps(normalized);
        }
        return;
      }

      if (e.type === "tool_started" || e.type === "tool_completed") {
        if (!aid) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aid
              ? {
                  ...m,
                  metadata: {
                    ...m.metadata,
                    activeTool:
                      e.type === "tool_started" ? { id: e.toolId, label: e.label } : null
                  },
                  eventType: e.type
                }
              : m
          )
        );
        return;
      }

      if (e.type === "runtime_update") {
        const routeId = routeConversationIdRef.current;
        if (routeId != null && e.conversationId != null && e.conversationId !== routeId) {
          malvE2eLog("runtime_update ignored (route mismatch)", { routeId, event: e.conversationId });
          return;
        }
        const payload = e.payload ?? {};
        const mid =
          e.messageId ??
          (typeof payload.messageId === "string" ? payload.messageId : null) ??
          activeAssistantIdRef.current;
        if (!mid) return;
        const runtimeSessionId =
          typeof payload.runtimeSessionId === "string" ? payload.runtimeSessionId.trim() : "";
        if (!runtimeSessionId) return;

        const runtimeStatus = typeof payload.runtimeStatus === "string" ? payload.runtimeStatus : undefined;
        const runtimePhase = typeof payload.runtimePhase === "string" ? payload.runtimePhase : undefined;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === mid
              ? {
                  ...m,
                  runtimeSessionId,
                  hasRuntimeDetail: true,
                  runtimeStatus: runtimeStatus ?? m.runtimeStatus,
                  runtimePhase: runtimePhase ?? m.runtimePhase,
                  eventType: "runtime_update",
                  metadata: {
                    ...m.metadata,
                    runtimeSessionId,
                    hasRuntimeDetail: true,
                    ...(runtimeStatus != null ? { runtimeStatus } : {}),
                    ...(runtimePhase != null ? { runtimePhase } : {})
                  }
                }
              : m
          )
        );
        return;
      }

      if (e.type === "approval_required") {
        setThreadError(mapApprovalRequiredToUserMessage());
        setThreadErrorDiagnostic(e.summary ?? "Approval required for next operator step.");
        return;
      }

      if (e.type === "error") {
        if (e.messageId != null && aid && e.messageId !== aid) return;
        malvE2eLog("client assistant error", { message: e.message, code: e.code, messageId: e.messageId });
        malvChatDebug("done_error_reached", { kind: "error_event", message: e.message });
        if (aid) {
          const row = messagesRef.current.find((x) => x.id === aid);
          const snap = assistantStreamCanonicalRef.current;
          const rowText = row?.role === "assistant" ? (row.content ?? "") : "";
          const canonicalText = snap?.messageId === aid ? snap.text : "";
          const hasAssistantText = rowText.length > 0 || canonicalText.length > 0;
          if (hasAssistantText && e.code !== "failed_before_output") {
            malvChatDebug("error_suppressed_after_visible_assistant_text", { code: e.code });
            malvStreamLatencyAuditAbortTurn();
            assistantStreamCanonicalRef.current = null;
            assistantStreamPendingCidRef.current = null;
            const contentOut = snap?.messageId === aid ? snap.text : rowText;
            setThreadError(null);
            setThreadErrorDiagnostic(null);
            setGenerationActive(false);
            setIsThinking(false);
            setThinkingSteps([]);
            activeAssistantIdRef.current = null;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aid && m.role === "assistant"
                  ? {
                      ...m,
                      content: contentOut,
                      status: "done",
                      eventType: "assistant_done",
                      metadata: stripMalvStreamCanonicalActiveMeta(m.metadata)
                    }
                  : m
              )
            );
            return;
          }
        }
        const userMsg = mapMalvErrorToUserMessage({ code: e.code, message: e.message });
        setThreadError(userMsg);
        setThreadErrorDiagnostic(e.message);
        if (aid) {
          const snapErr = assistantStreamCanonicalRef.current;
          assistantStreamCanonicalRef.current = null;
          assistantStreamPendingCidRef.current = null;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aid
                ? {
                    ...m,
                    content: snapErr?.messageId === aid ? snapErr.text : m.content,
                    status: "error",
                    errorMessage: userMsg,
                    diagnosticErrorMessage: e.message,
                    eventType: "error",
                    metadata: stripMalvStreamCanonicalActiveMeta(m.metadata)
                  }
                : m
            )
          );
        }
        setGenerationActive(false);
        setIsThinking(false);
        setThinkingSteps([]);
        activeAssistantIdRef.current = null;
        malvStreamLatencyAuditAbortTurn();
        return;
      }

      if (e.type === "assistant_delta") {
        if (isFinalizedAssistantId(e.messageId)) {
          malvChatDebug("assistant_delta_skipped_after_terminal", { eventMessageId: e.messageId });
          return;
        }
        if (e.messageId != null && aid != null && e.messageId !== aid) {
          malvChatDebug("assistant_delta_skipped_id_mismatch", { eventMessageId: e.messageId, activeAssistantId: aid });
          malvE2eLog("client assistant delta skipped (id mismatch)", { eventMessageId: e.messageId, activeAssistantId: aid });
          return;
        }
        if (!aid) return;
        const existingAssistantRow = messagesRef.current.find((x) => x.id === aid && x.role === "assistant");
        if (isTerminalAssistantStatus(existingAssistantRow?.status)) {
          malvChatDebug("assistant_delta_skipped_terminal_row", {
            eventMessageId: e.messageId,
            activeAssistantId: aid,
            status: existingAssistantRow?.status
          });
          return;
        }
        const evCid = e.conversationId?.trim() ?? "";
        if (evCid) assistantStreamPendingCidRef.current = evCid;
        const delta = e.delta ?? "";
        if (delta.length > 0) {
          setIsThinking(false);
          setThinkingSteps([]);
        }
        malvE2eLog("client assistant updated", {
          kind: "assistant_delta",
          deltaLen: delta.length,
          done: Boolean(e.done)
        });
        malvChatPipelineLog("assistant delta applied", {
          deltaLen: delta.length,
          done: Boolean(e.done)
        });
        malvChatDebug("assistant_message_updated", { deltaLen: delta.length, done: Boolean(e.done) });
        const row = messagesRef.current.find((x) => x.id === aid && x.role === "assistant");
        assistantStreamCanonicalRef.current = appendAssistantStreamCanonical(
          assistantStreamCanonicalRef.current,
          aid,
          row?.content ?? "",
          delta
        );
        const snapAfter = assistantStreamCanonicalRef.current;
        const rowMeta = messagesRef.current.find((x) => x.id === aid && x.role === "assistant");
        if (
          snapAfter &&
          snapAfter.text.length > 0 &&
          rowMeta &&
          rowMeta.metadata?.[MALV_STREAM_CANONICAL_ACTIVE_META_KEY] !== true
        ) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aid && m.role === "assistant"
                ? {
                    ...m,
                    metadata: { ...m.metadata, [MALV_STREAM_CANONICAL_ACTIVE_META_KEY]: true }
                  }
                : m
            )
          );
        }
        recordAssistantStreamCadenceDelta(delta.length);
        malvStreamLatencyAuditFirstDelta();
        scheduleAssistantStreamVisualFlushRef.current();
        return;
      }

      if (e.type === "assistant_done") {
        const doneMessageId = e.messageId ?? aid;
        if (!doneMessageId) return;
        if (isFinalizedAssistantId(doneMessageId)) {
          malvChatDebug("assistant_done_skipped_already_finalized", { messageId: doneMessageId });
          return;
        }
        if (e.messageId != null && aid != null && e.messageId !== aid) {
          malvChatDebug("assistant_done_skipped_id_mismatch", { eventMessageId: e.messageId, activeAssistantId: aid });
          malvE2eLog("client assistant done skipped (id mismatch)", { eventMessageId: e.messageId, activeAssistantId: aid });
          return;
        }
        setThreadError(null);
        setThreadErrorDiagnostic(null);
        const interrupted = e.terminal === "interrupted";
        const partialDone = !interrupted && e.malvTurnOutcome === "partial_done";
        malvE2eLog("client assistant done", {
          messageId: e.messageId,
          finalContentLen: (e.finalContent ?? "").length,
          terminal: e.terminal,
          malvTurnOutcome: e.malvTurnOutcome
        });
        malvChatPipelineLog("assistant completed", {
          source: "hook",
          messageId: aid,
          interrupted,
          partialDone
        });
        malvChatDebug("done_error_reached", {
          kind: "assistant_done_handler",
          interrupted,
          partialDone
        });
        cancelAssistantStreamVisualRafFromRegistry();
        assistantStreamPendingCidRef.current = null;
        const canonicalAtDone = assistantStreamCanonicalRef.current;
        const canonicalForAid = canonicalAtDone?.messageId === doneMessageId ? canonicalAtDone : null;
        assistantStreamCanonicalRef.current = null;
        finalizedAssistantMessageIdsRef.current.add(doneMessageId);

        setMessages((prev) => {
          const idx = prev.findIndex((x) => x.id === doneMessageId);
          const streamedFromRow = (idx >= 0 ? prev[idx]?.content : "") ?? "";
          const streamed = canonicalForAid != null ? canonicalForAid.text : streamedFromRow;
          const streamedTrimmed = streamed.trim();
          const lastUserBefore =
            idx >= 0 ? prev.slice(0, idx).reverse().find((x) => x.role === "user") : undefined;
          const lastUserPlain = lastUserBefore
            ? stripLegacyAttachmentPrefix(lastUserBefore.content)
            : undefined;
          const { text: reconciled, source: reconcileSource, applyEmojiLayer } = reconcileAssistantDoneText({
            interrupted,
            streamed,
            finalContent: e.finalContent,
            malvTurnOutcome: e.malvTurnOutcome
          });
          let contentOut = reconciled;
          if (applyEmojiLayer) {
            const { transformedText, decision } = applyMalvEmojiExpressionLayer(
              {
                responseText: contentOut,
                responseKind: "assistant_chat_reply",
                lastUserMessage: lastUserPlain
              },
              { includeDebugReason: import.meta.env.DEV }
            );
            contentOut = transformedText;
            if (import.meta.env.DEV) {
              malvChatDebug("emoji_expression_layer", {
                reasoning: decision.reasoning,
                applied: decision.shouldUseEmoji,
                count: decision.insertions.length,
                reconcileSource
              });
            }
          }
          malvStreamLatencyAuditAssistantDone(Boolean(streamedTrimmed), streamed, contentOut);
          const doneStatus = interrupted ? "interrupted" : partialDone ? "partial_done" : "done";
          const serverAssistantMeta =
            e.assistantMeta && typeof e.assistantMeta === "object" && !Array.isArray(e.assistantMeta)
              ? e.assistantMeta
              : null;
          return prev.map((m) =>
            m.id === doneMessageId
              ? {
                  ...m,
                  content: contentOut,
                  status: doneStatus,
                  eventType: interrupted ? "interrupted" : "assistant_done",
                  activityPhase: undefined,
                  metadata: {
                    ...stripMalvStreamCanonicalActiveMeta(m.metadata),
                    ...(serverAssistantMeta ? serverAssistantMeta : {}),
                    activeTool: undefined,
                    malvTurnOutcome: e.malvTurnOutcome
                  }
                }
              : m
          );
        });
        logAssistantStreamCadenceSummary("assistant_done");
        malvStreamLatencyAuditScheduleFinalRenderLog();
        setGenerationActive(false);
        setIsThinking(false);
        setThinkingSteps([]);
        activeAssistantIdRef.current = null;
        return;
      }
    },
    [normalizeThinkingSteps]
  );

  const handleOrchestrationEventRef = useRef(handleOrchestrationEvent);
  handleOrchestrationEventRef.current = handleOrchestrationEvent;

  useLayoutEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    malvE2eLog("client orchestration subscription attached");
    malvChatPipelineLog("subscription attached");
    return client.subscribeToReply((ev) => handleOrchestrationEventRef.current(ev));
  }, []);

  const stopReply = useCallback(() => {
    malvStreamLatencyAuditAbortTurn();
    const aid = activeAssistantIdRef.current;
    const snapStop = assistantStreamCanonicalRef.current;
    assistantStreamCanonicalRef.current = null;
    assistantStreamPendingCidRef.current = null;
    abortRef.current?.abort();
    clientRef.current?.stopReply(aid);
    if (aid) {
      finalizedAssistantMessageIdsRef.current.add(aid);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aid && m.role === "assistant"
            ? {
                ...m,
                content: snapStop?.messageId === aid ? snapStop.text : m.content,
                status: "interrupted",
                activityPhase: undefined,
                metadata: {
                  ...stripMalvStreamCanonicalActiveMeta(m.metadata),
                  interruptedAt: Date.now()
                }
              }
            : m
        )
      );
    }
    setGenerationActive(false);
    setIsThinking(false);
    setThinkingSteps([]);
    activeAssistantIdRef.current = null;
    logAssistantStreamCadenceSummary("stop_reply");
  }, []);

  useEffect(() => {
    const next = collectBlobUrlsFromMessages(messages);
    for (const url of trackedBlobUrlsRef.current) {
      if (!next.has(url)) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* noop */
        }
      }
    }
    trackedBlobUrlsRef.current = next;
  }, [messages]);

  useEffect(() => {
    return () => {
      for (const url of trackedBlobUrlsRef.current) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* noop */
        }
      }
      trackedBlobUrlsRef.current = new Set();
    };
  }, []);

  const send = useCallback(async (opts?: { attachments?: ChatAttachmentRef[]; composerText?: string; inputMode?: "text" | "voice" }) => {
    const attachmentList = cloneChatAttachmentRefs(opts?.attachments);
    const userText = (opts?.composerText ?? input).trim();
    const { operatorPhase, inputMode } = routingForTurn(opts?.inputMode ?? "text");
    const hasTurnBody = userText.length > 0 || attachmentList.length > 0;
    const backendUserTurn = buildBackendUserMessageText(userText, attachmentList);
    const backendText = forkSeedMessages
      ? `${buildForkContextPrefix(forkSeedMessages)}\n\n${backendUserTurn}`
      : backendUserTurn;

    if (!hasTurnBody || sending || generationActive) {
      malvChatDebug("input_submit_ignored", {
        reason: !hasTurnBody ? "empty" : sending ? "sending" : "generationActive",
        attachmentCount: attachmentList.length
      });
      return;
    }

    malvE2eLog("web submit", { textLen: backendText.length, conversationId: conversationId ?? "new" });
    malvChatPipelineLog("send invoked", { textLen: backendText.length });
    malvChatDebug("input_submit_triggered", { textLen: backendText.length });
    clearThreadError();
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const cid = conversationId ?? "pending";

    const userMsg: MalvChatMessage = {
      id: userId,
      conversationId: cid,
      role: "user",
      content: userText,
      createdAt: Date.now(),
      status: "pending",
      source: "local",
      attachments: attachmentList.length ? attachmentList : undefined
    };

    const assistantMsg: MalvChatMessage = {
      id: assistantId,
      conversationId: cid,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      status: "preparing",
      source: mock ? "mock" : "malv_socket",
      activityPhase: "thinking",
      eventType: "thinking"
    };

    malvStreamLatencyAuditBeginTurn(assistantId);
    setMessages((m) => [...m, userMsg, assistantMsg]);
    malvE2eLog("assistant placeholder inserted", { assistantId, status: "preparing" });
    malvChatPipelineLog("user message inserted", { userId });
    malvChatPipelineLog("assistant placeholder inserted", { assistantId, status: "preparing" });
    malvChatDebug("user_message_inserted", { userId });
    malvChatDebug("assistant_placeholder_inserted", { assistantId, status: "preparing" });
    setInput("");
    setSending(true);
    setGenerationActive(true);
    // isThinking and thinkingSteps stay false/empty until server sends real thought lines.
    activeAssistantIdRef.current = assistantId;
    assistantStreamCanonicalRef.current = { messageId: assistantId, text: "" };
    finalizedAssistantMessageIdsRef.current.delete(assistantId);
    assistantStreamVisibleLenRef.current = 0;
    assistantStreamPendingCidRef.current = null;

    const ac = new AbortController();
    abortRef.current = ac;

    const moodHint = getStoredUserMoodHint();
    const exploreHandoffJson = consumeArmedExploreHandoffJsonForSend();
    const payload: MalvSendPayload = {
      conversationId,
      text: backendText,
      assistantMessageId: assistantId,
      beastLevel: getMalvBeastLevel(),
      vaultSessionId: getMalvVaultSessionId(),
      signal: ac.signal,
      attachments: attachmentList.length ? attachmentList : undefined,
      operatorPhase,
      inputMode,
      userMoodHint: moodHint,
      exploreHandoffJson: exploreHandoffJson ?? undefined
    };
    lastRetryPayloadRef.current = {
      conversationId,
      text: backendText,
      assistantMessageId: assistantId,
      beastLevel: payload.beastLevel,
      vaultSessionId: payload.vaultSessionId,
      attachments: attachmentList.length ? attachmentList : undefined,
      operatorPhase,
      inputMode,
      userMoodHint: moodHint,
      exploreHandoffJson: exploreHandoffJson ?? undefined
    };

    const client = clientRef.current;
    if (!client) {
      malvStreamLatencyAuditAbortTurn();
      malvChatDebug("sendMessage blocked", { reason: "no_client_instance" });
      setThreadErrorDiagnostic(null);
      setThreadError("Chat client failed to initialize. Reload the page.");
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === assistantId) {
            return { ...m, status: "error", errorMessage: "Client not initialized.", eventType: "error" };
          }
          if (m.id === userId && m.role === "user") {
            return { ...m, status: "error", errorMessage: "Client not initialized." };
          }
          return m;
        })
      );
      setGenerationActive(false);
      setIsThinking(false);
      setThinkingSteps([]);
      activeAssistantIdRef.current = null;
      assistantStreamCanonicalRef.current = null;
      assistantStreamPendingCidRef.current = null;
      setSending(false);
      return;
    }

    try {
      malvChatDebug("calling_sendMessage", { assistantId });
      await client.sendMessage(payload);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userId && m.role === "user" && m.status === "pending" ? { ...m, status: "sent" } : m
        )
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        malvStreamLatencyAuditAbortTurn();
        assistantStreamCanonicalRef.current = null;
        assistantStreamPendingCidRef.current = null;
        /* stopReply path — UI already marked interrupted */
      } else {
        malvStreamLatencyAuditAbortTurn();
        malvChatPipelineLog("assistant failed", { source: "send_catch", error: String(e) });
        setThreadErrorDiagnostic(null);
        setThreadError("Request failed unexpectedly.");
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === assistantId) {
              return { ...m, status: "error", errorMessage: "Request failed.", eventType: "error" };
            }
            if (m.id === userId && m.role === "user") {
              return { ...m, status: "error", errorMessage: "Request failed." };
            }
            return m;
          })
        );
        setGenerationActive(false);
        setIsThinking(false);
        setThinkingSteps([]);
        activeAssistantIdRef.current = null;
        assistantStreamCanonicalRef.current = null;
        assistantStreamPendingCidRef.current = null;
      }
    } finally {
      setSending(false);
    }
  }, [conversationId, forkSeedMessages, generationActive, input, mock, routingForTurn, sending]);

  const retryLast = useCallback(async () => {
    const last = lastRetryPayloadRef.current;
    if (!last || sending || generationActive) return;

    clearThreadError();
    setGenerationActive(true);
    // isThinking and thinkingSteps stay false/empty until server sends real thought lines.
    activeAssistantIdRef.current = last.assistantMessageId;
    malvStreamLatencyAuditBeginTurn(last.assistantMessageId);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === last.assistantMessageId
          ? {
              ...m,
              content: "",
              status: "preparing",
              errorMessage: undefined,
              diagnosticErrorMessage: undefined,
              activityPhase: "thinking",
              eventType: "thinking",
              metadata: { ...m.metadata, activeTool: undefined }
            }
          : m
      )
    );
    assistantStreamCanonicalRef.current = { messageId: last.assistantMessageId, text: "" };
    finalizedAssistantMessageIdsRef.current.delete(last.assistantMessageId);
    assistantStreamVisibleLenRef.current = 0;
    assistantStreamPendingCidRef.current = null;

    const ac = new AbortController();
    abortRef.current = ac;

    const payload: MalvSendPayload = {
      ...last,
      conversationId,
      signal: ac.signal,
      userMoodHint: getStoredUserMoodHint()
    };

    setSending(true);
    const client = clientRef.current;
    if (!client) {
      malvStreamLatencyAuditAbortTurn();
      setThreadErrorDiagnostic(null);
      setThreadError("Chat client failed to initialize. Reload the page.");
      setGenerationActive(false);
      setIsThinking(false);
      setThinkingSteps([]);
      activeAssistantIdRef.current = null;
      assistantStreamCanonicalRef.current = null;
      assistantStreamPendingCidRef.current = null;
      setSending(false);
      return;
    }
    try {
      await client.retryReply(payload);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        malvStreamLatencyAuditAbortTurn();
        assistantStreamCanonicalRef.current = null;
        assistantStreamPendingCidRef.current = null;
      } else {
        malvStreamLatencyAuditAbortTurn();
        malvChatPipelineLog("assistant failed", { source: "retry_catch", error: String(e) });
        setThreadErrorDiagnostic(null);
        setThreadError("Retry failed.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === last.assistantMessageId && m.role === "assistant"
              ? { ...m, status: "error", errorMessage: "Retry request failed.", eventType: "error" }
              : m
          )
        );
        setGenerationActive(false);
        setIsThinking(false);
        setThinkingSteps([]);
        activeAssistantIdRef.current = null;
        assistantStreamCanonicalRef.current = null;
        assistantStreamPendingCidRef.current = null;
      }
    } finally {
      setSending(false);
    }
  }, [conversationId, generationActive, sending]);

  const editUserMessage = useCallback(
    async (args: { messageId: string; newContent: string }) => {
      if (sending || generationActive) return;
      const trimmed = args.newContent.trim();

      const idx = messages.findIndex((m) => m.id === args.messageId && m.role === "user");
      if (idx < 0) return;

      const userRow = messages[idx]!;
      if (!trimmed && !(userRow.attachments?.length ?? 0)) return;

      clearThreadError();

      const cid = conversationId ?? "pending";
      const assistantId = crypto.randomUUID();
      const seedForBackend = (() => {
        if (!forkSeedMessages) return null;
        const seedIdx = forkSeedMessages.findIndex((m) => m.id === args.messageId && m.role === "user");
        if (seedIdx < 0) return forkSeedMessages;
        return forkSeedMessages
          .slice(0, seedIdx + 1)
          .map((m) => (m.id === args.messageId ? { ...m, content: trimmed } : m));
      })();
      const mergedBackend = buildBackendUserMessageText(trimmed, userRow.attachments);
      const backendText = seedForBackend ? `${buildForkContextPrefix(seedForBackend)}\n\n${mergedBackend}` : mergedBackend;

      malvStreamLatencyAuditBeginTurn(assistantId);
      // Replace the selected user turn content and remove downstream continuation.
      setMessages((prev) => {
        const i = prev.findIndex((m) => m.id === args.messageId && m.role === "user");
        if (i < 0) return prev;
        const kept = prev.slice(0, i + 1).map((m) => (m.id === args.messageId ? { ...m, content: trimmed } : m));
        const assistantMsg: MalvChatMessage = {
          id: assistantId,
          conversationId: cid,
          role: "assistant",
          content: "",
          createdAt: Date.now(),
          status: "preparing",
          source: mock ? "mock" : "malv_socket",
          activityPhase: "thinking",
          eventType: "thinking"
        };
        return [...kept, assistantMsg];
      });

      // Keep fork injection transcript aligned with the new active branch.
      setForkSeedMessages((prev) => {
        if (!prev) return prev;
        const seedIdx = prev.findIndex((m) => m.id === args.messageId && m.role === "user");
        if (seedIdx < 0) return prev;
        return prev
          .slice(0, seedIdx + 1)
          .map((m) => (m.id === args.messageId ? { ...m, content: trimmed } : m));
      });

      setSending(true);
      setGenerationActive(true);
      // isThinking and thinkingSteps stay false/empty until server sends real thought lines.
      activeAssistantIdRef.current = assistantId;
      assistantStreamCanonicalRef.current = { messageId: assistantId, text: "" };
      finalizedAssistantMessageIdsRef.current.delete(assistantId);
      assistantStreamVisibleLenRef.current = 0;
      assistantStreamPendingCidRef.current = null;

      const ac = new AbortController();
      abortRef.current = ac;

      const payloadAttachments = cloneChatAttachmentRefs(userRow.attachments);
      const { operatorPhase, inputMode } = routingForTurn("text");
      const payload: MalvSendPayload = {
        conversationId,
        text: backendText,
        assistantMessageId: assistantId,
        beastLevel: getMalvBeastLevel(),
        vaultSessionId: getMalvVaultSessionId(),
        signal: ac.signal,
        attachments: payloadAttachments.length ? payloadAttachments : undefined,
        operatorPhase,
        inputMode
      };

      lastRetryPayloadRef.current = {
        conversationId,
        text: backendText,
        assistantMessageId: assistantId,
        beastLevel: payload.beastLevel,
        vaultSessionId: payload.vaultSessionId,
        attachments: payloadAttachments.length ? payloadAttachments : undefined,
        operatorPhase,
        inputMode
      };

      const client = clientRef.current;
      if (!client) {
        malvStreamLatencyAuditAbortTurn();
        setThreadErrorDiagnostic(null);
        setThreadError("Chat client failed to initialize. Reload the page.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, status: "error", errorMessage: "Client not initialized.", eventType: "error" }
              : m
          )
        );
        setGenerationActive(false);
        setIsThinking(false);
        setThinkingSteps([]);
        activeAssistantIdRef.current = null;
        assistantStreamCanonicalRef.current = null;
        assistantStreamPendingCidRef.current = null;
        setSending(false);
        return;
      }

      try {
        await client.sendMessage(payload);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          malvStreamLatencyAuditAbortTurn();
          assistantStreamCanonicalRef.current = null;
          assistantStreamPendingCidRef.current = null;
        } else {
          malvStreamLatencyAuditAbortTurn();
          malvChatPipelineLog("assistant failed", { source: "edit_catch", error: String(e) });
          setThreadErrorDiagnostic(null);
          setThreadError("Request failed unexpectedly.");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, status: "error", errorMessage: "Request failed.", eventType: "error" }
                : m
            )
          );
          setGenerationActive(false);
          setIsThinking(false);
          setThinkingSteps([]);
          activeAssistantIdRef.current = null;
          assistantStreamCanonicalRef.current = null;
          assistantStreamPendingCidRef.current = null;
        }
      } finally {
        setSending(false);
      }
    },
    [conversationId, forkSeedMessages, generationActive, messages, mock, routingForTurn, sending, clearThreadError]
  );

  const resendUserMessage = useCallback(
    async (args: { messageId: string }) => {
      if (sending || generationActive) return;

      const idx = messages.findIndex((m) => m.id === args.messageId && m.role === "user");
      if (idx < 0) return;

      clearThreadError();

      const userMsg = messages[idx]!;
      const cid = conversationId ?? "pending";
      const assistantId = crypto.randomUUID();
      const mergedBackend = buildBackendUserMessageText(
        stripLegacyAttachmentPrefix(userMsg.content),
        userMsg.attachments
      );
      const backendText = forkSeedMessages
        ? `${buildForkContextPrefix(forkSeedMessages)}\n\n${mergedBackend}`
        : mergedBackend;

      malvStreamLatencyAuditBeginTurn(assistantId);
      // Remove downstream continuation and generate a fresh assistant reply.
      setMessages((prev) => {
        const i = prev.findIndex((m) => m.id === args.messageId && m.role === "user");
        if (i < 0) return prev;
        const kept = prev.slice(0, i + 1);
        const assistantMsg: MalvChatMessage = {
          id: assistantId,
          conversationId: cid,
          role: "assistant",
          content: "",
          createdAt: Date.now(),
          status: "preparing",
          source: mock ? "mock" : "malv_socket",
          activityPhase: "thinking",
          eventType: "thinking"
        };
        return [...kept, assistantMsg];
      });

      setSending(true);
      setGenerationActive(true);
      // isThinking and thinkingSteps stay false/empty until server sends real thought lines.
      activeAssistantIdRef.current = assistantId;
      assistantStreamCanonicalRef.current = { messageId: assistantId, text: "" };
      finalizedAssistantMessageIdsRef.current.delete(assistantId);
      assistantStreamVisibleLenRef.current = 0;
      assistantStreamPendingCidRef.current = null;

      const ac = new AbortController();
      abortRef.current = ac;

      const payloadAttachments = cloneChatAttachmentRefs(userMsg.attachments);
      const { operatorPhase, inputMode } = routingForTurn("text");
      const mh2 = getStoredUserMoodHint();
      const payload: MalvSendPayload = {
        conversationId,
        text: backendText,
        assistantMessageId: assistantId,
        beastLevel: getMalvBeastLevel(),
        vaultSessionId: getMalvVaultSessionId(),
        signal: ac.signal,
        attachments: payloadAttachments.length ? payloadAttachments : undefined,
        operatorPhase,
        inputMode,
        userMoodHint: mh2
      };

      lastRetryPayloadRef.current = {
        conversationId,
        text: backendText,
        assistantMessageId: assistantId,
        beastLevel: payload.beastLevel,
        vaultSessionId: payload.vaultSessionId,
        attachments: payloadAttachments.length ? payloadAttachments : undefined,
        operatorPhase,
        inputMode,
        userMoodHint: mh2
      };

      const client = clientRef.current;
      if (!client) {
        malvStreamLatencyAuditAbortTurn();
        setThreadErrorDiagnostic(null);
        setThreadError("Chat client failed to initialize. Reload the page.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, status: "error", errorMessage: "Client not initialized.", eventType: "error" }
              : m
          )
        );
        setGenerationActive(false);
        setIsThinking(false);
        setThinkingSteps([]);
        activeAssistantIdRef.current = null;
        assistantStreamCanonicalRef.current = null;
        assistantStreamPendingCidRef.current = null;
        setSending(false);
        return;
      }

      try {
        await client.sendMessage(payload);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          malvStreamLatencyAuditAbortTurn();
          assistantStreamCanonicalRef.current = null;
          assistantStreamPendingCidRef.current = null;
        } else {
          malvStreamLatencyAuditAbortTurn();
          malvChatPipelineLog("assistant failed", { source: "resend_catch", error: String(e) });
          setThreadErrorDiagnostic(null);
          setThreadError("Request failed unexpectedly.");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, status: "error", errorMessage: "Request failed.", eventType: "error" }
                : m
            )
          );
          setGenerationActive(false);
          setIsThinking(false);
          setThinkingSteps([]);
          activeAssistantIdRef.current = null;
          assistantStreamCanonicalRef.current = null;
          assistantStreamPendingCidRef.current = null;
        }
      } finally {
        setSending(false);
      }
    },
    [conversationId, forkSeedMessages, generationActive, messages, mock, routingForTurn, sending, clearThreadError]
  );

  const forkFromAssistantMessage = useCallback(
    async (args: { messageId: string }) => {
      if (sending || generationActive) return;

      malvStreamLatencyAuditAbortTurn();
      assistantStreamCanonicalRef.current = null;
      assistantStreamPendingCidRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
      const aid = activeAssistantIdRef.current;
      if (aid) clientRef.current?.stopReply(aid);

      lastRetryPayloadRef.current = null;

      const idx = messages.findIndex((m) => m.id === args.messageId);
      if (idx < 0) return;
      const anchor = messages[idx];
      if (!anchor || anchor.role !== "assistant") return;

      if (!accessToken || !conversationId) {
        throw new Error("Cannot fork before this chat session is persisted.");
      }

      const forked = await forkConversationFromMessage(accessToken, {
        conversationId,
        anchorMessageId: args.messageId
      });

      const nextMessages: MalvChatMessage[] = forked.messages
        .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
        .map((m) => ({
          id: m.id,
          conversationId: forked.conversation.id,
          role: m.role as MalvChatMessage["role"],
          content: m.content,
          createdAt: new Date(m.createdAt).getTime(),
          status: (m.status as MalvChatMessage["status"]) ?? "done",
          source: (m.source as MalvChatMessage["source"]) ?? "malv_http",
          metadata: m.metadata ?? undefined
        }));

      setForkSeedMessages(null);
      setMessages(nextMessages);
      setConversationId(forked.conversation.id);
      clearThreadError();
      setGenerationActive(false);
      setIsThinking(false);
      setThinkingSteps([]);
      setSending(false);
      activeAssistantIdRef.current = null;
      assistantStreamCanonicalRef.current = null;
      assistantStreamPendingCidRef.current = null;
      setInput("");
      return forked.conversation.id;
    },
    [accessToken, clearThreadError, conversationId, generationActive, messages, sending]
  );

  const loadConversationById = useCallback(
    async (targetConversationId: string) => {
      if (!accessToken || !targetConversationId) return;

      if (targetConversationId === conversationIdRef.current) {
        return;
      }

      conversationLoadAbortRef.current?.abort();
      const loadAc = new AbortController();
      conversationLoadAbortRef.current = loadAc;
      const seq = ++conversationLoadSeqRef.current;

      malvStreamLatencyAuditAbortTurn();
      assistantStreamCanonicalRef.current = null;
      assistantStreamPendingCidRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
      const aid = activeAssistantIdRef.current;
      if (aid) clientRef.current?.stopReply(aid);

      lastRetryPayloadRef.current = null;

      clearThreadError();
      setConversationLoading(true);
      try {
        const detail = await fetchConversationDetail(accessToken, targetConversationId, {
          signal: loadAc.signal
        });
        if (seq !== conversationLoadSeqRef.current) return;

        const loadedMessages: MalvChatMessage[] = detail.messages
          .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
          .map((m) =>
            mergeRuntimeFieldsFromStorage({
              id: m.id,
              conversationId: detail.conversation.id,
              role: m.role as MalvChatMessage["role"],
              content: m.content,
              createdAt: new Date(m.createdAt).getTime(),
              status: (m.status as MalvChatMessage["status"]) ?? "done",
              source: (m.source as MalvChatMessage["source"]) ?? "malv_http",
              metadata: m.metadata ?? undefined
            })
          );

        setForkSeedMessages(null);
        setMessages(loadedMessages);
        setConversationId(detail.conversation.id);
        setGenerationActive(false);
        setIsThinking(false);
        setThinkingSteps([]);
        setSending(false);
        activeAssistantIdRef.current = null;
        assistantStreamCanonicalRef.current = null;
        assistantStreamPendingCidRef.current = null;
        setInput("");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (seq !== conversationLoadSeqRef.current) return;
        malvChatPipelineLog("loadConversation failed", { error: String(e) });
        setThreadErrorDiagnostic(import.meta.env.DEV && e instanceof Error ? e.message : null);
        setThreadError(
          e instanceof Error ? parseNestErrorMessage(e) : "We couldn’t load this conversation."
        );
        setForkSeedMessages(null);
        setMessages([]);
        setConversationId(null);
        setGenerationActive(false);
        setIsThinking(false);
        setThinkingSteps([]);
        setSending(false);
        activeAssistantIdRef.current = null;
        assistantStreamCanonicalRef.current = null;
        assistantStreamPendingCidRef.current = null;
        setInput("");
      } finally {
        if (seq === conversationLoadSeqRef.current) {
          setConversationLoading(false);
        }
      }
    },
    [accessToken, clearThreadError]
  );

  const canRetry = useMemo(() => {
    const ctx = lastRetryPayloadRef.current;
    if (!ctx || generationActive || sending) return false;
    const m = messages.find((x) => x.id === ctx.assistantMessageId);
    return !!m && m.role === "assistant" && (m.status === "error" || m.status === "interrupted");
  }, [messages, generationActive, sending, threadError]);

  const startNewConversation = useCallback(() => {
    malvStreamLatencyAuditAbortTurn();
    assistantStreamCanonicalRef.current = null;
    assistantStreamPendingCidRef.current = null;
    conversationLoadSeqRef.current += 1;
    conversationLoadAbortRef.current?.abort();
    conversationLoadAbortRef.current = null;
    setConversationLoading(false);
    abortRef.current?.abort();
    abortRef.current = null;
    const aid = activeAssistantIdRef.current;
    if (aid) {
      clientRef.current?.stopReply(aid);
    }
    lastRetryPayloadRef.current = null;
    setForkSeedMessages(null);
    setMessages([]);
    setConversationId(null);
    clearThreadError();
    setGenerationActive(false);
    setIsThinking(false);
    setThinkingSteps([]);
    setSending(false);
    activeAssistantIdRef.current = null;
    assistantStreamCanonicalRef.current = null;
    assistantStreamPendingCidRef.current = null;
    setInput("");
    clearArmedExploreHandoffJson();
  }, [clearThreadError]);

  const executionStatusLabel = useMemo(
    () => deriveMalvExecutionStatusLabel({ generationActive, messages }),
    [messages, generationActive]
  );

  const presence = useMemo(
    () =>
      computeMalvPresence({
        generationActive,
        messages,
        transportStatus,
        useMock: mock
      }),
    [generationActive, messages, transportStatus, mock]
  );

  const getRealtimeSocket = useCallback(() => socketRef.current, []);

  return {
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
    transportStatus,
    getRealtimeSocket,
    send,
    editUserMessage,
    resendUserMessage,
    forkFromAssistantMessage,
    loadConversationById,
    stopReply,
    retryLast,
    canRetry,
    useMock: mock,
    executionStatusLabel,
    presence,
    startNewConversation
  };
}
