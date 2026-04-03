import { createWorkspaceRuntimeSession, type WorkspaceRuntimeSession } from "../api/dataPlane";

/** Find existing chat-linked runtime session id from a list response. */
export function findChatRuntimeSessionId(sessions: WorkspaceRuntimeSession[], conversationId: string): string | undefined {
  const row = sessions.find((s) => s.sourceType === "chat" && s.sourceId === conversationId);
  return row?.id;
}

/**
 * Idempotent: returns existing session id for (chat, conversationId) or creates one.
 * Backend dedupes on (user, sourceType, sourceId).
 */
export async function ensureChatRuntimeSessionId(accessToken: string, conversationId: string): Promise<string> {
  const res = await createWorkspaceRuntimeSession(accessToken, { sourceType: "chat", sourceId: conversationId });
  if (!res.ok || !res.sessionId) {
    const err = (res as { error?: string }).error ?? "Could not ensure runtime session.";
    throw new Error(err);
  }
  return res.sessionId;
}

/** Idempotent runtime session for a workspace task row (sourceType `task`, sourceId = task id). */
export async function ensureTaskSourceRuntimeSessionId(accessToken: string, taskId: string): Promise<string> {
  const res = await createWorkspaceRuntimeSession(accessToken, { sourceType: "task", sourceId: taskId });
  if (!res.ok || !res.sessionId) {
    const err = (res as { error?: string }).error ?? "Could not ensure runtime session.";
    throw new Error(err);
  }
  return res.sessionId;
}
