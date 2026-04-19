import type { MalvSocket } from "../realtime/socket";
import type { MalvUserMoodHint } from "../malvMoodHint";

/**
 * MALV-native chat domain types. Transport-agnostic; map socket/HTTP/job events into these shapes.
 */

export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus =
  | "pending"
  | "sent"
  /**
   * Assistant row inserted optimistically before the first visible stream paint.
   * Not “streaming” yet — no reply bytes have been committed to the visible buffer.
   */
  | "preparing"
  | "thinking"
  | "streaming"
  | "done"
  | "error"
  /** User stopped generation; partial content retained */
  | "interrupted"
  /** Model stream ended abnormally after at least one token was shown */
  | "partial_done";

export type MalvEventType =
  | "assistant_delta"
  | "assistant_done"
  | "thinking_state"
  | "thinking"
  | "planning"
  | "memory_context"
  | "tool_started"
  | "tool_completed"
  | "runtime_update"
  | "approval_required"
  | "error"
  | "interrupted";

/** High-level operator activity for subtle in-thread status (not provider-specific). */
export type MalvActivityPhase =
  | "thinking"
  | "analyzing_context"
  | "building_response"
  | "planning_next_step"
  | "accessing_memory"
  | "secure_operator"
  | "reasoning_chain"
  | "super_fix_execute"
  /** Beast phased orchestration steps (`server_phase:<InternalPhaseId>`). */
  | MalvServerOrchestrationActivityPhase;

/** Emitted by Beast as `server_phase:${InternalPhaseId}` (see phased-chat orchestration). */
export type MalvServerOrchestrationActivityPhase = `server_phase:${string}`;

export interface ChatAttachmentRef {
  id: string;
  kind: "file" | "image" | "link" | "voice" | "video_session";
  label?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface MalvChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  status: MessageStatus;
  attachments?: ChatAttachmentRef[];
  /**
   * Extension fields (e.g. `malvStreamCanonicalActive`: first `assistant_delta` received this turn —
   * combined with raw `content` length so whitespace-only stream starts are not treated as empty).
   */
  metadata?: Record<string, unknown>;
  /**
   * Workspace runtime session (chat / studio / task). When set with hasRuntimeDetail, the transcript
   * row opens live runtime inspection — casual messages omit these.
   */
  runtimeSessionId?: string;
  /** True when this message is wired to a persisted workspace runtime session (not merely in-thread copy). */
  hasRuntimeDetail?: boolean;
  /** Snapshot from last runtime_update (e.g. idle | running | waiting_approval | completed | failed). */
  runtimeStatus?: string;
  /** Coarse phase label from orchestration (e.g. inferencing, planning). */
  runtimePhase?: string;
  /** Conversation / operator mode (companion, task, etc.) — forward-compatible */
  mode?: string;
  /** Where this message was produced or observed */
  source?: "local" | "malv_socket" | "malv_http" | "malv_job" | "mock";
  /** Last orchestration event that touched this message */
  eventType?: MalvEventType;
  /** When status is preparing/thinking/streaming, optional fine-grained activity */
  activityPhase?: MalvActivityPhase;
  errorMessage?: string;
  /**
   * Raw backend/transport error text for privileged diagnostics only.
   * Never render this in normal user chat experience.
   */
  diagnosticErrorMessage?: string;
}

/**
 * Normalized stream from MALV orchestration (API, worker, supervisor, websocket, SSE, polling).
 * Extend with new variants as Beast / operator features land.
 */
export type MalvOrchestrationEvent =
  | {
      type: "assistant_delta";
      conversationId: string;
      messageId: string;
      delta: string;
      done?: boolean;
    }
  | {
      type: "assistant_done";
      conversationId: string;
      messageId: string;
      finalContent?: string;
      /** Present when user stopped or worker aborted mid-turn */
      terminal?: "interrupted" | "completed";
      /** Server-authoritative turn outcome (WS path). */
      malvTurnOutcome?: "complete" | "partial_done" | "failed_before_output";
      /**
       * Allowlisted rich-rendering fields mirrored from assistant DB meta (WS + HTTP completion).
       * Older servers omit this key entirely.
       */
      assistantMeta?: Record<string, unknown>;
    }
  | {
      type: "thinking_state";
      conversationId?: string | null;
      messageId?: string;
      steps: string[];
    }
  | {
      type: "memory_context";
      conversationId: string;
      messageId?: string;
      snippetCount?: number;
      vaultScoped?: boolean;
    }
  | {
      type: "interrupted";
      conversationId: string;
      messageId?: string;
      reason?: string;
    }
  | {
      type: "thinking";
      conversationId: string;
      messageId?: string;
      phase?: MalvActivityPhase;
      detail?: string;
    }
  | {
      type: "planning";
      conversationId: string;
      messageId?: string;
      detail?: string;
    }
  | {
      type: "tool_started";
      toolId: string;
      label?: string;
      conversationId?: string;
      messageId?: string;
    }
  | {
      type: "tool_completed";
      toolId: string;
      conversationId?: string;
      messageId?: string;
      resultSummary?: string;
    }
  | {
      type: "runtime_update";
      conversationId?: string;
      messageId?: string;
      payload: Record<string, unknown>;
    }
  | {
      type: "approval_required";
      requestId: string;
      summary?: string;
      conversationId?: string;
    }
  | {
      type: "error";
      message: string;
      code?: string;
      conversationId?: string;
      messageId?: string;
    }
  | {
      type: "conversation_bound";
      conversationId: string;
    }
  | {
      type: "transport";
      status: "connected" | "disconnected" | "reconnecting";
    };

export interface MalvSendPayload {
  conversationId: string | null;
  text: string;
  assistantMessageId: string;
  attachments?: ChatAttachmentRef[];
  workspaceId?: string | null;
  beastLevel?: "Passive" | "Smart" | "Advanced" | "Beast";
  /** Active vault session (open) — operator plane; must match server-side open session */
  vaultSessionId?: string | null;
  signal?: AbortSignal;
  /** Bias orchestration toward operator workflow (matches WS `chat:send.operatorPhase`). */
  operatorPhase?: string;
  inputMode?: "text" | "voice" | "video";
  /** Phase 5 — merged with text-derived tone on the API (see Workspace mood strip). */
  userMoodHint?: MalvUserMoodHint;
  /**
   * Explore → Chat canonical handoff JSON (v1). Server-only; never shown in user-visible chat chrome.
   * Cleared after the first successful send that attaches it.
   */
  exploreHandoffJson?: string | null;
}

export interface MalvChatClientConfig {
  /** When true, no API/socket — simulated pipeline for UI dev */
  useMock: boolean;
  accessToken: string | undefined;
  /** Lazy socket for realtime path; may be null before mount */
  getSocket: () => MalvSocket | null;
}
