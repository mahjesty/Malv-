import { apiFetch } from "../api/http";
import { malvChatDebug } from "./malvChatDebug";
import { malvE2eLog } from "./malvE2eLog";
import { malvChatPipelineLog } from "./malvChatPipelineLog";
import type { MalvActivityPhase, MalvChatClientConfig, MalvOrchestrationEvent, MalvSendPayload } from "./types";
import type { MalvSocket } from "../realtime/socket";

type Listener = (event: MalvOrchestrationEvent) => void;

function chunkTextForStream(text: string, maxLen: number): string[] {
  const out: string[] = [];
  let buf = "";
  const parts = text.split(/(\s+)/);
  for (const p of parts) {
    if (buf.length + p.length > maxLen && buf) {
      out.push(buf);
      buf = p;
    } else {
      buf += p;
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : [""];
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = window.setTimeout(resolve, ms);
    const onAbort = () => {
      window.clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function buildMockReply(userText: string): string {
  const excerpt = userText.trim().slice(0, 220) || "(no directive text)";
  return [
    "**MALV · practice mode**",
    "",
    "This is a simulated reply to help you preview the MALV chat experience.",
    "",
    "**Directive (trimmed)**",
    excerpt,
    "",
    "**Next**",
    "If this were live, MALV would now compose a full answer using your message."
  ].join("\n");
}

/**
 * MALV chat client: normalizes socket chunks, HTTP replies, and mock simulation into MalvOrchestrationEvent.
 * Swap or extend transports without changing UI hooks.
 */
export class MalvChatClient {
  private listeners = new Set<Listener>();
  private config: MalvChatClientConfig;
  private ignoreIncoming = false;
  private socketUnsubs: Array<() => void> = [];

  constructor(config: MalvChatClientConfig) {
    this.config = config;
  }

  updateConfig(partial: Partial<MalvChatClientConfig>) {
    this.config = { ...this.config, ...partial };
  }

  subscribeToReply(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: MalvOrchestrationEvent) {
    malvChatPipelineLog("event received", { type: event.type });
    malvChatDebug("reply_event_received", {
      type: event.type,
      ...(event.type === "assistant_delta"
        ? { messageId: event.messageId, done: Boolean(event.done), deltaLen: event.delta.length }
        : event.type === "error"
          ? { message: event.message, messageId: event.messageId }
          : {})
    });
    if (this.listeners.size === 0) {
      malvE2eLog("client emit dropped — no subscribers (UI will miss this event)", {
        type: event.type,
        listenerCount: 0
      });
      if (import.meta.env.DEV) {
        console.warn("[MALV chat] Orchestration event had no subscribers — UI may miss this update:", event.type);
      }
    }
    if (event.type === "error") {
      malvChatPipelineLog("assistant failed", { message: event.message, code: event.code });
    }
    for (const l of this.listeners) l(event);
  }

  stopReply(assistantMessageId?: string | null) {
    const socket = this.config.getSocket();
    if (socket?.connected && assistantMessageId) {
      malvE2eLog("cancel propagated", { assistantMessageId });
      socket.emit("chat:cancel", { assistantMessageId });
    }
    this.ignoreIncoming = true;
    this.teardownSocketScope();
  }

  /** Same payload shape as the last user turn — call from UI retry. */
  retryReply(payload: MalvSendPayload): Promise<void> {
    this.ignoreIncoming = false;
    return this.sendMessage(payload);
  }

  /**
   * Starts the MALV reply pipeline (socket when connected, else HTTP).
   * Socket path returns after ack; chunks continue asynchronously until done/error/stop.
   */
  async sendMessage(payload: MalvSendPayload): Promise<void> {
    malvChatDebug("sendMessage called", {
      assistantMessageId: payload.assistantMessageId,
      conversationId: payload.conversationId
    });

    // Yield so React can commit optimistic user + assistant rows before orchestration events mutate state.
    await Promise.resolve();

    this.ignoreIncoming = false;
    this.teardownSocketScope();

    if (this.config.useMock) {
      malvE2eLog("transport selected", { transport: "mock" });
      malvChatPipelineLog("selected transport: mock");
      malvChatDebug("transport_selected", { transport: "mock" });
      try {
        await this.runMockPipeline(payload);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          const msg = e instanceof Error ? e.message : String(e);
          this.emit({
            type: "error",
            message: msg,
            code: "mock_failed",
            messageId: payload.assistantMessageId
          });
        }
      }
      return;
    }

    const socket = this.config.getSocket();
    const token = this.config.accessToken;

    try {
      if (socket?.connected) {
        malvE2eLog("transport selected", { transport: "socket", socketId: socket.id });
        malvChatPipelineLog("selected transport: socket", { socketId: socket.id });
        malvChatDebug("transport_selected", { transport: "socket", socketId: socket.id });
        await this.runSocketPipeline(socket, payload);
        return;
      }
      malvE2eLog("transport selected", {
        transport: "http",
        reason: socket ? "socket_not_connected" : "no_socket"
      });
      malvChatPipelineLog("selected transport: http", {
        reason: socket ? "socket_not_connected" : "no_socket"
      });
      malvChatDebug("transport_selected", { transport: "http", reason: socket ? "socket_not_connected" : "no_socket" });
      if (!token) {
        this.emit({
          type: "error",
          message: "No access token — sign in again or enable mock mode (VITE_MALV_CHAT_MOCK=true).",
          code: "no_token",
          messageId: payload.assistantMessageId
        });
        return;
      }
      await this.runHttpPipeline(payload, token);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        malvChatDebug("done_error_reached", { kind: "abort" });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      malvChatDebug("done_error_reached", { kind: "exception", message: msg });
      this.emit({
        type: "error",
        message: msg,
        code: "send_failed",
        conversationId: payload.conversationId ?? undefined,
        messageId: payload.assistantMessageId
      });
    }
  }

  private teardownSocketScope() {
    for (const u of this.socketUnsubs) u();
    this.socketUnsubs = [];
  }

  private async runMockPipeline(payload: MalvSendPayload) {
    const rate = Number(import.meta.env.VITE_MALV_CHAT_MOCK_ERROR_RATE ?? 0);
    if (rate > 0 && Math.random() < rate) {
      await sleep(320, payload.signal);
      this.emit({
        type: "error",
        message: "Simulated orchestration fault — retry to continue.",
        code: "mock_error",
        messageId: payload.assistantMessageId
      });
      return;
    }

    const cid = payload.conversationId ?? crypto.randomUUID();
    malvE2eLog("request dispatched", { kind: "mock", conversationId: cid });
    malvChatPipelineLog("request dispatched", { kind: "mock", conversationId: cid });
    malvChatDebug("request_emitted", { kind: "mock_pipeline_start", conversationId: cid });
    this.emit({ type: "conversation_bound", conversationId: cid });

    const phases = ["thinking", "analyzing_context", "planning_next_step", "building_response"] as const;
    for (const phase of phases) {
      if (this.ignoreIncoming) return;
      this.emit({
        type: "thinking",
        conversationId: cid,
        messageId: payload.assistantMessageId,
        phase
      });
      await sleep(160 + Math.random() * 220, payload.signal);
    }

    const full = buildMockReply(payload.text);
    const chunks = chunkTextForStream(full, 80);
    for (let i = 0; i < chunks.length; i++) {
      if (this.ignoreIncoming) return;
      await sleep(14 + Math.random() * 22, payload.signal);
      this.emit({
        type: "assistant_delta",
        conversationId: cid,
        messageId: payload.assistantMessageId,
        delta: chunks[i]!,
        done: i === chunks.length - 1
      });
    }

    if (!this.ignoreIncoming) {
      malvChatPipelineLog("assistant completed", { via: "mock", messageId: payload.assistantMessageId });
      malvChatDebug("done_error_reached", { kind: "assistant_done_mock" });
      this.emit({
        type: "assistant_done",
        conversationId: cid,
        messageId: payload.assistantMessageId,
        finalContent: full
      });
    }
  }

  private async runSocketPipeline(socket: MalvSocket, payload: MalvSendPayload) {
    const assistantId = payload.assistantMessageId;
    let completedViaChunk = false;

    this.emit({
      type: "thinking",
      conversationId: payload.conversationId ?? "",
      messageId: assistantId,
      phase: "thinking"
    });

    const onMalvOrch = (raw: Record<string, unknown>) => {
      if (this.ignoreIncoming) return;
      const t = raw.type as string | undefined;
      const cid = String(raw.conversationId ?? payload.conversationId ?? "");
      if (t === "thinking") {
        this.emit({
          type: "thinking",
          conversationId: cid,
          messageId: assistantId,
          phase: raw.phase as MalvActivityPhase | undefined,
          detail: typeof raw.detail === "string" ? raw.detail : undefined
        });
        return;
      }
      if (t === "memory_context") {
        this.emit({
          type: "memory_context",
          conversationId: cid,
          messageId: typeof raw.messageId === "string" ? raw.messageId : assistantId,
          snippetCount: typeof raw.snippetCount === "number" ? raw.snippetCount : undefined,
          vaultScoped: Boolean(raw.vaultScoped)
        });
        return;
      }
      if (t === "runtime_update") {
        this.emit({
          type: "runtime_update",
          conversationId: cid || undefined,
          messageId: typeof raw.messageId === "string" ? raw.messageId : assistantId,
          payload: (raw.payload as Record<string, unknown>) ?? {}
        });
        return;
      }
      if (t === "assistant_done" && raw.terminal === "interrupted") {
        this.emit({
          type: "assistant_done",
          conversationId: cid,
          messageId: assistantId,
          finalContent: typeof raw.finalContent === "string" ? raw.finalContent : undefined,
          terminal: "interrupted"
        });
        this.teardownSocketScope();
      }
    };

    const onChunk = (p: { conversationId: string; index: number; done: boolean; text: string }) => {
      if (this.ignoreIncoming) return;
      malvE2eLog("client received reply event", {
        kind: "socket.chat:reply_chunk",
        index: p.index,
        done: p.done,
        textLen: (p.text ?? "").length,
        conversationId: p.conversationId
      });
      this.emit({
        type: "assistant_delta",
        conversationId: p.conversationId,
        messageId: assistantId,
        delta: p.text,
        done: p.done
      });
      if (p.done) {
        completedViaChunk = true;
        malvChatPipelineLog("assistant completed", { via: "socket_chunk", messageId: assistantId });
        this.emit({
          type: "assistant_done",
          conversationId: p.conversationId,
          messageId: assistantId
        });
        this.teardownSocketScope();
      }
    };

    const onError = (p: { message: string }) => {
      if (this.ignoreIncoming) return;
      this.emit({
        type: "error",
        message: p?.message ?? "Chat failed.",
        messageId: assistantId,
        conversationId: payload.conversationId ?? undefined
      });
      this.teardownSocketScope();
    };

    const onJob = (p: { status?: string }) => {
      if (this.ignoreIncoming) return;
      if (p?.status === "failed") {
        this.emit({
          type: "error",
          message: "Orchestration job failed. Check worker health.",
          code: "job_failed",
          messageId: assistantId
        });
        this.teardownSocketScope();
      }
    };

    socket.on("chat:reply_chunk", onChunk);
    socket.on("chat:error", onError);
    socket.on("job:update", onJob);
    socket.on("malv:orchestration", onMalvOrch);
    this.socketUnsubs.push(() => socket.off("chat:reply_chunk", onChunk));
    this.socketUnsubs.push(() => socket.off("chat:error", onError));
    this.socketUnsubs.push(() => socket.off("job:update", onJob));
    this.socketUnsubs.push(() => socket.off("malv:orchestration", onMalvOrch));

    await new Promise<void>((resolve) => {
      const ACK_MS = 25_000;
      const timer = window.setTimeout(() => {
        this.emit({
          type: "error",
          message: "Realtime handshake timed out.",
          code: "ack_timeout",
          messageId: assistantId
        });
        this.teardownSocketScope();
        resolve();
      }, ACK_MS);

      const finish = () => window.clearTimeout(timer);

      const onAbort = () => {
        finish();
        this.teardownSocketScope();
        resolve();
      };
      payload.signal?.addEventListener("abort", onAbort, { once: true });

      malvE2eLog("request dispatched", { kind: "socket.chat:send", path: "chat:send" });
      malvChatPipelineLog("request dispatched", { kind: "socket.chat:send" });
      malvChatDebug("request_emitted", { kind: "socket.chat:send" });
      socket.emit(
        "chat:send",
        {
          conversationId: payload.conversationId,
          message: payload.text,
          beastLevel: payload.beastLevel,
          workspaceId: payload.workspaceId,
          vaultSessionId: payload.vaultSessionId ?? null,
          assistantMessageId: payload.assistantMessageId,
          inputMode: payload.inputMode ?? "text",
          operatorPhase: payload.operatorPhase ?? null,
          userMoodHint: payload.userMoodHint ?? null
        },
        (ack: { ok: boolean; conversationId?: string; error?: string } | undefined) => {
          finish();
          payload.signal?.removeEventListener("abort", onAbort);

          if (this.ignoreIncoming) {
            resolve();
            return;
          }
          malvE2eLog("client received reply event", {
            kind: "socket.chat:send_ack",
            ok: Boolean(ack?.ok),
            conversationId: ack?.conversationId,
            error: ack?.error
          });
          if (ack?.ok && ack.conversationId) {
            this.emit({ type: "conversation_bound", conversationId: ack.conversationId });
            // If the server returned ok but emitted no reply chunks (e.g. legacy empty body), finish the row here.
            if (!completedViaChunk && !this.ignoreIncoming) {
              malvChatPipelineLog("assistant completed", { via: "socket_ack_fallback", messageId: assistantId });
              this.emit({
                type: "assistant_done",
                conversationId: ack.conversationId,
                messageId: assistantId,
                finalContent: ""
              });
              this.teardownSocketScope();
            }
            resolve();
            return;
          }
          this.emit({
            type: "error",
            message: ack?.error ?? "Chat send rejected.",
            messageId: assistantId
          });
          this.teardownSocketScope();
          resolve();
        }
      );
    });
  }

  private async runHttpPipeline(payload: MalvSendPayload, accessToken: string | undefined) {
    const assistantId = payload.assistantMessageId;

    this.emit({
      type: "thinking",
      conversationId: payload.conversationId ?? "",
      messageId: assistantId,
      phase: "analyzing_context"
    });

    malvE2eLog("request dispatched", { kind: "http.POST", path: "/v1/chat" });
    malvChatPipelineLog("request dispatched", { kind: "http.POST", path: "/v1/chat" });
    malvChatDebug("request_emitted", { kind: "http.POST", path: "/v1/chat" });
    const res = await apiFetch<{ reply: string; conversationId?: string; runId?: string }>({
      path: "/v1/chat",
      method: "POST",
      accessToken,
      body: {
        conversationId: payload.conversationId,
        message: payload.text,
        assistantMessageId: payload.assistantMessageId,
        beastLevel: payload.beastLevel,
        vaultSessionId: payload.vaultSessionId ?? null,
        inputMode: payload.inputMode ?? "text",
        operatorPhase: payload.operatorPhase ?? null,
        userMoodHint: payload.userMoodHint ?? null
      },
      signal: payload.signal
    });

    const cid = res.conversationId ?? payload.conversationId ?? "";
    malvE2eLog("client received reply event", {
      kind: "http.POST /v1/chat response",
      replyLen: (res.reply ?? "").length,
      conversationId: cid || null
    });
    if (res.conversationId) {
      this.emit({ type: "conversation_bound", conversationId: res.conversationId });
    }

    this.emit({
      type: "thinking",
      conversationId: cid,
      messageId: assistantId,
      phase: "building_response"
    });

    const chunks = chunkTextForStream(res.reply ?? "", 96);
    for (let i = 0; i < chunks.length; i++) {
      if (this.ignoreIncoming) break;
      await sleep(14, payload.signal);
      this.emit({
        type: "assistant_delta",
        conversationId: cid,
        messageId: assistantId,
        delta: chunks[i]!,
        done: i === chunks.length - 1
      });
    }

    if (!this.ignoreIncoming) {
      malvChatPipelineLog("assistant completed", { via: "http", messageId: assistantId });
      malvChatDebug("done_error_reached", { kind: "assistant_done_http" });
      this.emit({
        type: "assistant_done",
        conversationId: cid,
        messageId: assistantId,
        finalContent: res.reply
      });
    }
  }
}

/** Alias for consumers that split “intent” from “pipeline start”. */
export const startReply = (client: MalvChatClient, payload: MalvSendPayload) => client.sendMessage(payload);
