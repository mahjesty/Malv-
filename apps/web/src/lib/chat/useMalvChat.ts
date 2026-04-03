import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createMalvSocket, type MalvSocket } from "../realtime/socket";
import { useAuth } from "../auth/AuthContext";
import { MalvChatClient } from "./malvChatClient";
import { fetchConversationDetail, forkConversationFromMessage } from "../api/dataPlane";
import { parseNestErrorMessage } from "../api/http-core";
import { malvActivityLabel } from "./malvActivityLabels";
import { computeMalvPresence } from "./malvPresence";
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
import { getMalvBeastLevel, getMalvVaultSessionId } from "../malvOperatorPrefs";
import { getStoredUserMoodHint } from "../malvMoodHint";

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

/**
 * Chat state + MALV reply pipeline: optimistic send, batched streaming, stop/retry, transport hints.
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
  const abortRef = useRef<AbortController | null>(null);
  const pendingDeltaRef = useRef("");
  const rafFlushRef = useRef(0);
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
      malvChatPipelineLog("assistant failed", { source: "watchdog_timeout", assistantMessageId: aid });
      setThreadError(mapGenerationWatchdogToUserMessage());
      setThreadErrorDiagnostic("Timed out waiting for orchestration events.");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aid && m.role === "assistant"
            ? {
                ...m,
                status: "error",
                errorMessage: mapGenerationWatchdogToUserMessage(),
                diagnosticErrorMessage: "Timed out waiting for orchestration events.",
                eventType: "error"
              }
            : m
        )
      );
      setGenerationActive(false);
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

  const flushPendingDelta = useCallback(() => {
    rafFlushRef.current = 0;
    const chunk = pendingDeltaRef.current;
    pendingDeltaRef.current = "";
    if (!chunk) return;
    const aid = activeAssistantIdRef.current;
    if (!aid) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === aid
          ? {
              ...m,
              content: m.content + chunk,
              status: "streaming",
              eventType: "assistant_delta",
              source: m.source ?? "malv_socket"
            }
          : m
      )
    );
  }, []);

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

  const scheduleDeltaFlush = useCallback(() => {
    if (rafFlushRef.current) return;
    rafFlushRef.current = requestAnimationFrame(() => {
      flushPendingDelta();
    });
  }, [flushPendingDelta]);

  const handleOrchestrationEvent = useCallback(
    (e: MalvOrchestrationEvent) => {
      let aid = activeAssistantIdRef.current;
      if (
        (e.type === "thinking" || e.type === "assistant_delta" || e.type === "assistant_done") &&
        !aid &&
        "messageId" in e &&
        e.messageId
      ) {
        activeAssistantIdRef.current = e.messageId;
        aid = e.messageId;
        malvE2eLog("client assistant id restored from event (was null)", { messageId: e.messageId, eventType: e.type });
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
        const userMsg = mapMalvErrorToUserMessage({ code: e.code, message: e.message });
        setThreadError(userMsg);
        setThreadErrorDiagnostic(e.message);
        if (aid) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aid
                ? {
                    ...m,
                    status: "error",
                    errorMessage: userMsg,
                    diagnosticErrorMessage: e.message,
                    eventType: "error"
                  }
                : m
            )
          );
        }
        setGenerationActive(false);
        activeAssistantIdRef.current = null;
        return;
      }

      if (e.type === "assistant_delta") {
        if (e.messageId != null && aid != null && e.messageId !== aid) {
          malvChatDebug("assistant_delta_skipped_id_mismatch", { eventMessageId: e.messageId, activeAssistantId: aid });
          malvE2eLog("client assistant delta skipped (id mismatch)", { eventMessageId: e.messageId, activeAssistantId: aid });
          return;
        }
        pendingDeltaRef.current += e.delta;
        malvE2eLog("client assistant updated", {
          kind: "assistant_delta",
          deltaLen: e.delta.length,
          done: Boolean(e.done),
          bufferedLen: pendingDeltaRef.current.length
        });
        malvChatPipelineLog("assistant delta applied", {
          deltaLen: e.delta.length,
          done: Boolean(e.done),
          bufferedLen: pendingDeltaRef.current.length
        });
        malvChatDebug("assistant_message_updated", { bufferedLen: pendingDeltaRef.current.length, done: Boolean(e.done) });
        if (e.done) {
          if (rafFlushRef.current) {
            cancelAnimationFrame(rafFlushRef.current);
            rafFlushRef.current = 0;
          }
          flushPendingDelta();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aid
                ? {
                    ...m,
                    status: "streaming",
                    eventType: "assistant_delta"
                  }
                : m
            )
          );
        } else {
          scheduleDeltaFlush();
        }
        return;
      }

      if (e.type === "assistant_done") {
        if (e.messageId != null && aid != null && e.messageId !== aid) {
          malvChatDebug("assistant_done_skipped_id_mismatch", { eventMessageId: e.messageId, activeAssistantId: aid });
          malvE2eLog("client assistant done skipped (id mismatch)", { eventMessageId: e.messageId, activeAssistantId: aid });
          return;
        }
        const interrupted = e.terminal === "interrupted";
        malvE2eLog("client assistant done", {
          messageId: e.messageId,
          finalContentLen: (e.finalContent ?? "").length,
          terminal: e.terminal
        });
        malvChatPipelineLog("assistant completed", { source: "hook", messageId: aid, interrupted });
        malvChatDebug("done_error_reached", { kind: "assistant_done_handler", interrupted });
        if (rafFlushRef.current) {
          cancelAnimationFrame(rafFlushRef.current);
          rafFlushRef.current = 0;
        }
        flushPendingDelta();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aid
              ? {
                  ...m,
                  content: e.finalContent ?? m.content,
                  status: interrupted ? "interrupted" : "done",
                  eventType: interrupted ? "interrupted" : "assistant_done",
                  activityPhase: undefined,
                  metadata: { ...m.metadata, activeTool: undefined }
                }
              : m
          )
        );
        setGenerationActive(false);
        activeAssistantIdRef.current = null;
        return;
      }
    },
    [flushPendingDelta, scheduleDeltaFlush]
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
    const aid = activeAssistantIdRef.current;
    abortRef.current?.abort();
    clientRef.current?.stopReply(aid);
    if (aid) {
      if (rafFlushRef.current) {
        cancelAnimationFrame(rafFlushRef.current);
        rafFlushRef.current = 0;
      }
      flushPendingDelta();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aid && m.role === "assistant"
            ? {
                ...m,
                status: "interrupted",
                activityPhase: undefined,
                metadata: { ...m.metadata, interruptedAt: Date.now() }
              }
            : m
        )
      );
    }
    setGenerationActive(false);
    activeAssistantIdRef.current = null;
  }, [flushPendingDelta]);

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
      status: "thinking",
      source: mock ? "mock" : "malv_socket",
      activityPhase: "thinking",
      eventType: "thinking"
    };

    setMessages((m) => [...m, userMsg, assistantMsg]);
    malvE2eLog("assistant placeholder inserted", { assistantId, status: "thinking" });
    malvChatPipelineLog("user message inserted", { userId });
    malvChatPipelineLog("assistant placeholder inserted", { assistantId, status: "thinking" });
    malvChatDebug("user_message_inserted", { userId });
    malvChatDebug("assistant_placeholder_inserted", { assistantId, status: "thinking" });
    setInput("");
    setSending(true);
    setGenerationActive(true);
    activeAssistantIdRef.current = assistantId;

    const ac = new AbortController();
    abortRef.current = ac;

    const moodHint = getStoredUserMoodHint();
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
      userMoodHint: moodHint
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
      userMoodHint: moodHint
    };

    const client = clientRef.current;
    if (!client) {
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
      activeAssistantIdRef.current = null;
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
        /* stopReply path — UI already marked interrupted */
      } else {
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
        activeAssistantIdRef.current = null;
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
    activeAssistantIdRef.current = last.assistantMessageId;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === last.assistantMessageId
          ? {
              ...m,
              content: "",
              status: "thinking",
              errorMessage: undefined,
              diagnosticErrorMessage: undefined,
              activityPhase: "thinking",
              eventType: "thinking",
              metadata: { ...m.metadata, activeTool: undefined }
            }
          : m
      )
    );

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
      setThreadErrorDiagnostic(null);
      setThreadError("Chat client failed to initialize. Reload the page.");
      setGenerationActive(false);
      activeAssistantIdRef.current = null;
      setSending(false);
      return;
    }
    try {
      await client.retryReply(payload);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
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
        activeAssistantIdRef.current = null;
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
          status: "thinking",
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
      activeAssistantIdRef.current = assistantId;
      pendingDeltaRef.current = "";

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
        activeAssistantIdRef.current = null;
        setSending(false);
        return;
      }

      try {
        await client.sendMessage(payload);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
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
          activeAssistantIdRef.current = null;
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
          status: "thinking",
          source: mock ? "mock" : "malv_socket",
          activityPhase: "thinking",
          eventType: "thinking"
        };
        return [...kept, assistantMsg];
      });

      setSending(true);
      setGenerationActive(true);
      activeAssistantIdRef.current = assistantId;
      pendingDeltaRef.current = "";

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
        activeAssistantIdRef.current = null;
        setSending(false);
        return;
      }

      try {
        await client.sendMessage(payload);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
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
          activeAssistantIdRef.current = null;
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

      abortRef.current?.abort();
      abortRef.current = null;
      const aid = activeAssistantIdRef.current;
      if (aid) clientRef.current?.stopReply(aid);
      if (rafFlushRef.current) {
        cancelAnimationFrame(rafFlushRef.current);
        rafFlushRef.current = 0;
      }

      pendingDeltaRef.current = "";
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
      setSending(false);
      activeAssistantIdRef.current = null;
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

      abortRef.current?.abort();
      abortRef.current = null;
      const aid = activeAssistantIdRef.current;
      if (aid) clientRef.current?.stopReply(aid);
      if (rafFlushRef.current) {
        cancelAnimationFrame(rafFlushRef.current);
        rafFlushRef.current = 0;
      }

      pendingDeltaRef.current = "";
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
        setSending(false);
        activeAssistantIdRef.current = null;
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
        setSending(false);
        activeAssistantIdRef.current = null;
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
    if (rafFlushRef.current) {
      cancelAnimationFrame(rafFlushRef.current);
      rafFlushRef.current = 0;
    }
    pendingDeltaRef.current = "";
    lastRetryPayloadRef.current = null;
    setForkSeedMessages(null);
    setMessages([]);
    setConversationId(null);
    clearThreadError();
    setGenerationActive(false);
    setSending(false);
    activeAssistantIdRef.current = null;
    setInput("");
  }, [clearThreadError]);

  const executionStatusLabel = useMemo(() => {
    if (!generationActive) return "Idle";
    const la = [...messages].reverse().find((m) => m.role === "assistant");
    if (la?.status === "thinking") return malvActivityLabel(la.activityPhase) ?? "Thinking";
    if (la?.status === "streaming") return "Live";
    return "Thinking";
  }, [messages, generationActive]);

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
