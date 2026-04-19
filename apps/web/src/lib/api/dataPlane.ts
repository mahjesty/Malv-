import { sanitizeBuildUnitPreviewFields } from "../preview/previewArtifactValidation";
import { apiFetch, apiFetchBlob, apiUpload } from "./http";
import { parseNestErrorMessage } from "./http-core";

export type FileKind = "pdf" | "image" | "audio" | "video" | "doc" | "text";

export type FileListItem = {
  id: string;
  fileKind: FileKind;
  originalName: string;
  mimeType: string | null;
  sizeBytes: string | null;
  storageUri: string;
  collaborationRoomId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MultimodalExtractionStatus = "queued" | "processing" | "completed" | "failed";
export type MultimodalExtractionModality = "pdf" | "image" | "audio" | "video" | "other";

export type MultimodalExtractionPayload = {
  id: string;
  status: MultimodalExtractionStatus;
  modality: MultimodalExtractionModality;
  unifiedResult: Record<string, unknown> | null;
  retrievalText: string | null;
  sectionsJson: Record<string, unknown> | null;
  pageMetaJson: Record<string, unknown> | null;
  tablesFiguresJson: Record<string, unknown> | null;
  segmentMetaJson: Record<string, unknown> | null;
  imageAnalysisJson: Record<string, unknown> | null;
  processorVersion: string | null;
  errorMessage: string | null;
  aiJobId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CollaborationRoomSummary = {
  roomId: string;
  title: string | null;
  malvEnabled: boolean;
  yourRole: string;
  conversationId?: string | null;
  updatedAt: string;
};

export type CollaborationRoomDetail = {
  roomId: string;
  title: string | null;
  ownerUserId: string;
  malvEnabled: boolean;
  conversationId?: string | null;
  updatedAt: string;
};

export type CollaborationRoomMember = {
  userId: string;
  displayName: string;
  role: string;
};

export type WorkspaceTaskStatus = "todo" | "in_progress" | "done" | "archived";
export type WorkspaceTaskSource = "call" | "chat" | "manual" | "studio" | "voice" | "inbox" | "collaboration" | "external" | "system";
export type WorkspaceTaskPriority = "low" | "normal" | "high" | "urgent";
export type WorkspaceTaskExecutionType =
  | "manual"
  | "automated"
  | "reminder"
  | "scheduled"
  | "approval_gate"
  | "reminder_only"
  | "call_followup"
  | "chat_followup"
  | "external_action"
  | "workflow_task"
  | "manual_checklist";

export type WorkspaceTaskExecutionState =
  | "idle"
  | "pending"
  | "scheduled"
  | "due"
  | "dispatched"
  | "running"
  | "waiting_input"
  | "waiting_approval"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";
export type WorkspaceTaskRiskLevel = "low" | "medium" | "high" | "critical";

export type WorkspaceTask = {
  id: string;
  title: string;
  description: string | null;
  status: WorkspaceTaskStatus;
  priority: WorkspaceTaskPriority;
  /** Legacy source field — kept for backward compat. Prefer sourceSurface. */
  source: WorkspaceTaskSource;
  /** Canonical surface where this task originated. */
  sourceSurface: WorkspaceTaskSource;
  /** Semantic type of source object (e.g. "conversation", "call_session"). */
  sourceType?: string | null;
  /** ID of the originating source object. */
  sourceReferenceId?: string | null;
  executionType: WorkspaceTaskExecutionType;
  executionState: WorkspaceTaskExecutionState;
  conversationId: string | null;
  callSessionId: string | null;
  roomId: string | null;
  assigneeUserId?: string | null;
  dueAt?: string | null;
  scheduledFor?: string | null;
  reminderAt?: string | null;
  requiresApproval?: boolean;
  riskLevel?: WorkspaceTaskRiskLevel;
  tags?: string[] | null;
  completedAt?: string | null;
  archivedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  executionLeaseOwner?: string | null;
  executionLeaseExpiresAt?: string | null;
  executionLastAttemptAt?: string | null;
  executionLastOutcome?: string | null;
  executionFailureCode?: string | null;
  executionFailureDetail?: string | null;
  updatedAt?: string;
  createdAt?: string;
};

export type WorkspaceActivityEvent = {
  id: string;
  activityType: string;
  workspaceId: string | null;
  roomId: string | null;
  conversationId: string | null;
  entityId: string | null;
  title: string;
  payloadJson: Record<string, unknown> | null;
  createdAt: string;
};

export type WorkspaceApproval = {
  id: string;
  source: string;
  sourceRefId: string | null;
  actionDescription: string;
  riskLevel: string;
  status: "pending" | "approved" | "rejected";
  conversationId: string | null;
  callSessionId: string | null;
  roomId: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkspaceCallRecap = {
  callSessionId: string;
  kind: string;
  conversationId: string | null;
  endedAt: string | null;
  recap: {
    summary?: string;
    actionItems?: string[];
    decisions?: string[];
    unresolvedQuestions?: string[];
    suggestedFollowUps?: string[];
    decidedAt?: number;
  } | null;
};

export type WorkspaceConversationSummary = {
  conversationId: string;
  title: string | null;
  mode: string;
  updatedAt: string;
};

export type WorkspaceOutputSummary = {
  messageId: string;
  conversationId: string | null;
  preview: string;
  source: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

export type WorkspaceRuntimeSession = {
  id: string;
  sourceType: "chat" | "studio" | "task";
  sourceId: string;
  status: "idle" | "running" | "waiting_approval" | "completed" | "failed";
  activeRunId: string | null;
  lastEventAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceRuntimeRun = {
  id: string;
  runType: string;
  status: string;
  runPriority: number;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  inputPayload: Record<string, unknown> | null;
  outputPayload: Record<string, unknown> | null;
};

export type WorkspaceRuntimeLog = {
  id: string;
  sandboxRunId: string;
  stepIndex: number;
  commandClass: string;
  commandText: string;
  status: string;
  exitCode: number | null;
  durationMs: number | null;
  stdoutText: string | null;
  stderrText: string | null;
  createdAt: string;
};

export type WorkspaceRuntimePatch = {
  id: string;
  sandboxRunId: string;
  status: string;
  diffText: string;
  summary: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export async function fetchConversations(accessToken: string, args?: { limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (args?.limit != null) q.set("limit", String(args.limit));
  if (args?.offset != null) q.set("offset", String(args.offset));
  const qs = q.toString();
  return apiFetch<{ ok: boolean; items: Array<{ id: string; title: string | null; mode: string; updatedAt: string }>; total: number }>({
    path: `/v1/conversations${qs ? `?${qs}` : ""}`,
    accessToken
  });
}

export async function fetchConversationDetail(
  accessToken: string,
  id: string,
  opts?: { signal?: AbortSignal }
) {
  return apiFetch<{
    ok: boolean;
    conversation: { id: string; title: string | null; mode: string; createdAt: string; updatedAt: string };
    messages: Array<{
      id: string;
      role: string;
      content: string;
      status: string;
      source?: string;
      createdAt: string;
      metadata?: Record<string, unknown> | null;
    }>;
  }>({
    path: `/v1/conversations/${encodeURIComponent(id)}?messageLimit=300`,
    accessToken,
    signal: opts?.signal
  });
}

export async function renameConversation(accessToken: string, id: string, title: string) {
  return apiFetch<{ ok: boolean }>({
    path: `/v1/conversations/${encodeURIComponent(id)}`,
    method: "PATCH",
    accessToken,
    body: { title }
  });
}

export async function deleteConversation(accessToken: string, id: string) {
  return apiFetch<{ ok: boolean }>({
    path: `/v1/conversations/${encodeURIComponent(id)}`,
    method: "DELETE",
    accessToken
  });
}

export async function fetchConversationOutputs(accessToken: string, conversationId: string, args?: { limit?: number }) {
  const q = new URLSearchParams();
  if (args?.limit != null) q.set("limit", String(args.limit));
  const qs = q.toString();
  return apiFetch<{
    ok: boolean;
    outputs?: Array<{
      messageId: string;
      runId: string | null;
      createdAt: string;
      preview: string;
      source: string | null;
      status: string;
      metadataKeys: string[];
    }>;
    error?: string;
  }>({
    path: `/v1/conversations/${encodeURIComponent(conversationId)}/outputs${qs ? `?${qs}` : ""}`,
    accessToken
  });
}

export async function searchDirectoryUsers(accessToken: string, q: string, args?: { limit?: number }) {
  const params = new URLSearchParams();
  params.set("q", q);
  if (args?.limit != null) params.set("limit", String(args.limit));
  return apiFetch<{
    ok: boolean;
    users?: Array<{ userId: string; displayName: string }>;
    error?: string;
  }>({
    path: `/v1/directory/users?${params.toString()}`,
    accessToken
  });
}

export async function fetchCollaborationRooms(accessToken: string) {
  return apiFetch<{
    ok: boolean;
    rooms?: CollaborationRoomSummary[];
    error?: string;
  }>({
    path: "/v1/rooms",
    accessToken
  });
}

export async function fetchCollaborationRoom(accessToken: string, roomId: string) {
  return apiFetch<{
    ok: boolean;
    room?: CollaborationRoomDetail;
    yourRole?: string;
    members?: CollaborationRoomMember[];
    error?: string;
  }>({
    path: `/v1/rooms/${encodeURIComponent(roomId)}`,
    accessToken
  });
}

export async function fetchCollaborationRoomSummaries(accessToken: string, roomId: string) {
  return apiFetch<{
    ok: boolean;
    summaries?: Array<Record<string, unknown>>;
    error?: string;
  }>({
    path: `/v1/rooms/${encodeURIComponent(roomId)}/summaries`,
    accessToken
  });
}

export async function createCollaborationRoom(accessToken: string, body: { title?: string }) {
  return apiFetch<{
    ok: boolean;
    room?: { roomId: string; title: string | null; malvEnabled: boolean; updatedAt: string };
    error?: string;
  }>({
    path: "/v1/rooms",
    method: "POST",
    accessToken,
    body
  });
}

export async function addCollaborationRoomMember(accessToken: string, roomId: string, userId: string) {
  return apiFetch<{ ok: boolean; error?: string }>({
    path: `/v1/rooms/${encodeURIComponent(roomId)}/members`,
    method: "POST",
    accessToken,
    body: { userId }
  });
}

export async function leaveCollaborationRoom(accessToken: string, roomId: string) {
  return apiFetch<{ ok: boolean; error?: string }>({
    path: `/v1/rooms/${encodeURIComponent(roomId)}/members/me`,
    method: "DELETE",
    accessToken
  });
}

export async function deleteCollaborationRoom(accessToken: string, roomId: string) {
  return apiFetch<{ ok: boolean; error?: string }>({
    path: `/v1/rooms/${encodeURIComponent(roomId)}`,
    method: "DELETE",
    accessToken
  });
}

export async function forkConversationFromMessage(accessToken: string, args: { conversationId: string; anchorMessageId: string }) {
  return apiFetch<{
    ok: boolean;
    conversation: { id: string; title: string | null; mode: string; createdAt: string; updatedAt: string };
    messages: Array<{
      id: string;
      role: string;
      content: string;
      status: string;
      source?: string;
      createdAt: string;
      metadata?: Record<string, unknown> | null;
    }>;
  }>({
    path: `/v1/conversations/${encodeURIComponent(args.conversationId)}/fork`,
    method: "POST",
    accessToken,
    body: { anchorMessageId: args.anchorMessageId }
  });
}

export async function duplicateConversation(accessToken: string, conversationId: string) {
  return apiFetch<{
    ok: boolean;
    conversation: { id: string; title: string | null; mode: string; createdAt: string; updatedAt: string };
  }>({
    path: `/v1/conversations/${encodeURIComponent(conversationId)}/duplicate`,
    method: "POST",
    accessToken
  });
}

export async function fetchMemoryEntries(accessToken: string, args?: { limit?: number; offset?: number; scope?: string }) {
  const q = new URLSearchParams();
  if (args?.limit != null) q.set("limit", String(args.limit));
  if (args?.offset != null) q.set("offset", String(args.offset));
  if (args?.scope) q.set("scope", args.scope);
  const qs = q.toString();
  return apiFetch<{ ok: boolean; items: Array<Record<string, unknown>>; total: number }>({
    path: `/v1/memory${qs ? `?${qs}` : ""}`,
    accessToken
  });
}

export async function deleteMemoryEntry(accessToken: string, id: string) {
  return apiFetch<{ ok: boolean }>({
    path: `/v1/memory/${encodeURIComponent(id)}`,
    method: "DELETE",
    accessToken
  });
}

export async function openVaultSession(accessToken: string, body: { secretPhrase: string; accessLabel?: string | null }) {
  return apiFetch<{ ok: boolean; sessionId: string }>({
    path: "/v1/vault/sessions/open",
    method: "POST",
    accessToken,
    body
  });
}

export async function closeVaultSession(accessToken: string, sessionId: string) {
  return apiFetch<{ ok: boolean }>({
    path: "/v1/vault/sessions/close",
    method: "POST",
    accessToken,
    body: { sessionId }
  });
}

export async function fetchVaultEntries(accessToken: string, vaultSessionId?: string | null) {
  const q = new URLSearchParams();
  if (vaultSessionId) q.set("vaultSessionId", vaultSessionId);
  return apiFetch<{ ok: boolean; items: Array<Record<string, unknown>>; total: number }>({
    path: `/v1/vault/entries?${q.toString()}`,
    accessToken
  });
}

export async function addVaultEntry(
  accessToken: string,
  body: { vaultSessionId: string; entryType: "secret" | "note" | "document" | "media"; label?: string | null; content: string }
) {
  return apiFetch<{ ok: boolean; entryId: string }>({
    path: "/v1/vault/entries",
    method: "POST",
    accessToken,
    body
  });
}

export async function fetchFileStorageHealth(accessToken: string) {
  return apiFetch<{
    ok: boolean;
    storage: { backend: string; root: string; writable: boolean; error?: string };
  }>({
    path: "/v1/files/storage/health",
    accessToken
  });
}

export async function uploadFileToStorage(
  accessToken: string,
  args: {
    file: File;
    fileKind: FileKind;
    workspaceId?: string | null;
    roomId?: string | null;
  }
) {
  const fd = new FormData();
  fd.append("file", args.file);
  fd.append("fileKind", args.fileKind);
  if (args.workspaceId) fd.append("workspaceId", args.workspaceId);
  if (args.roomId) fd.append("roomId", args.roomId);
  const data = await apiUpload<{ ok?: boolean; fileId?: string; storageUri?: string; error?: string }>({
    path: "/v1/files/upload",
    accessToken,
    formData: fd
  });
  const fileId = typeof data.fileId === "string" ? data.fileId.trim() : "";
  if (data.ok !== true || !fileId) {
    const detail =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : "Server did not register the upload (missing file id).";
    throw new Error(detail);
  }
  return { ok: true as const, fileId, storageUri: data.storageUri ?? "" };
}

export async function fetchFiles(accessToken: string, args?: { limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (args?.limit != null) q.set("limit", String(args.limit));
  if (args?.offset != null) q.set("offset", String(args.offset));
  const qs = q.toString();
  return apiFetch<{ ok: boolean; items: FileListItem[]; total: number }>({
    path: `/v1/files${qs ? `?${qs}` : ""}`,
    accessToken
  });
}

export async function registerFile(
  accessToken: string,
  body: {
    fileKind: FileKind;
    originalName: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    storageUri: string;
  }
) {
  return apiFetch<{ ok: boolean; fileId: string }>({
    path: "/v1/files",
    method: "POST",
    accessToken,
    body
  });
}

export async function enqueueFileUnderstand(
  accessToken: string,
  fileId: string,
  body: { conversationId?: string | null; vaultSessionId?: string | null; supportTicketId?: string | null; requiresApproval: boolean }
) {
  return apiFetch<{ ok: boolean; aiJobId: string; status: string; progress: number }>({
    path: `/v1/files/${encodeURIComponent(fileId)}/understand`,
    method: "POST",
    accessToken,
    body
  });
}

export async function enqueueMultimodalDeep(accessToken: string, fileId: string) {
  return apiFetch<{ ok: boolean; aiJobId: string; extractionId: string }>({
    path: `/v1/files/${encodeURIComponent(fileId)}/multimodal/deep`,
    method: "POST",
    accessToken
  });
}

/** Dev harness only — requires MALV_DEV_HARNESS_ENABLED on API. */
export async function devHarnessMultimodalDeep(accessToken: string, fileId: string, scenario?: string) {
  return apiFetch<{ ok: boolean; aiJobId: string; extractionId: string; devHarnessFixture?: boolean }>({
    path: `/v1/files/${encodeURIComponent(fileId)}/multimodal/deep/dev-harness`,
    method: "POST",
    accessToken,
    body: scenario ? { scenario } : {}
  });
}

export async function fetchMultimodalDeep(accessToken: string, fileId: string) {
  return apiFetch<{ ok: boolean; extraction: MultimodalExtractionPayload }>({
    path: `/v1/files/${encodeURIComponent(fileId)}/multimodal/deep`,
    accessToken
  });
}

export async function fetchSupportTickets(accessToken: string) {
  return apiFetch<{
    ok: boolean;
    items: Array<{
      id: string;
      subject: string;
      status: string;
      priority: string;
      category: { id: string; name: string; slug: string } | null;
      createdAt: string;
      updatedAt: string;
    }>;
    total: number;
  }>({
    path: "/v1/support/tickets",
    accessToken
  });
}

export async function fetchSupportTicket(accessToken: string, id: string) {
  return apiFetch<{
    ok: boolean;
    ticket: Record<string, unknown>;
    messages: Array<Record<string, unknown>>;
  }>({
    path: `/v1/support/tickets/${encodeURIComponent(id)}`,
    accessToken
  });
}

export async function createSupportTicket(
  accessToken: string,
  body: { subject: string; message: string; priority?: "low" | "normal" | "high"; categoryId?: string | null }
) {
  return apiFetch<{ ok: boolean; ticketId: string }>({
    path: "/v1/support/tickets",
    method: "POST",
    accessToken,
    body
  });
}

export async function postTicketMessage(accessToken: string, ticketId: string, content: string) {
  return apiFetch<{ ok: boolean; messageId: string }>({
    path: `/v1/support/tickets/${encodeURIComponent(ticketId)}/messages`,
    method: "POST",
    accessToken,
    body: { content }
  });
}

export async function fetchDevices(accessToken: string) {
  return apiFetch<{ ok: boolean; devices: Array<Record<string, unknown>> }>({
    path: "/v1/devices",
    accessToken
  });
}

export async function fetchDeviceSessions(accessToken: string) {
  return apiFetch<{ ok: boolean; sessions: Array<Record<string, unknown>> }>({
    path: "/v1/devices/sessions",
    accessToken
  });
}

export async function fetchDeviceBridgeHealth(accessToken: string) {
  return apiFetch<{
    ok: boolean;
    trustModel: string;
    tables: string[];
    enrollment: Record<string, unknown>;
    devHarness: { enabled: boolean; note: string };
  }>({
    path: "/v1/devices/bridge/health",
    accessToken
  });
}

/** @deprecated Legacy path — prefer fetchDeviceBridgeHealth */
export async function fetchDeviceSimulatorHealth(accessToken: string) {
  return apiFetch<{ ok: boolean; devHarnessEnabled?: boolean; trustModel?: string }>({
    path: "/v1/devices/simulator/health",
    accessToken
  });
}

export async function seedDeviceDevHarness(accessToken: string, body?: { deviceCount?: number; sessionCount?: number }) {
  return apiFetch<{ ok: boolean; devHarnessEnabled?: boolean; insertedDevices?: number; insertedSessions?: number; error?: string; hint?: string }>({
    path: "/v1/devices/dev-harness/seed",
    method: "POST",
    accessToken,
    body: body ?? {}
  });
}

export async function fetchSmartHomeBridgeHealth(accessToken: string) {
  return apiFetch<{ ok: boolean; bridge: Record<string, unknown> }>({
    path: "/v1/smart-home/bridge/health",
    accessToken
  });
}

export async function createCall(
  accessToken: string,
  kind: "voice" | "video",
  opts?: { conversationId?: string | null; vaultSessionId?: string | null; participationScope?: "direct" | "group" }
) {
  return apiFetch<{ ok: boolean; callSessionId: string; status: string; kind: string; runtime?: Record<string, unknown> }>({
    path: "/v1/calls",
    method: "POST",
    accessToken,
    body: { kind, ...opts }
  });
}

export async function fetchCallSession(accessToken: string, callSessionId: string) {
  return apiFetch<{
    ok: boolean;
    callSessionId?: string;
    status?: string;
    kind?: string;
    runtime?: Record<string, unknown>;
    error?: string;
  }>({
    path: `/v1/calls/${encodeURIComponent(callSessionId)}`,
    accessToken
  });
}

export async function fetchCallHistory(accessToken: string, query?: { limit?: number }) {
  const q = query?.limit !== undefined ? `?limit=${encodeURIComponent(String(query.limit))}` : "";
  return apiFetch<{
    ok: boolean;
    sessions?: Array<{
      callSessionId: string;
      kind: string;
      conversationId: string | null;
      endedAt: string | null;
      recap: {
        summary?: string;
        actionItems?: string[];
        decisions?: string[];
        unresolvedQuestions?: string[];
        suggestedFollowUps?: string[];
        decidedAt?: number;
      } | null;
    }>;
    error?: string;
  }>({
    path: `/v1/calls/history${q}`,
    accessToken
  });
}

export async function fetchWorkspaceSurface(accessToken: string) {
  return apiFetch<{
    ok: boolean;
    tasks: WorkspaceTask[];
    approvals: WorkspaceApproval[];
    callRecaps: WorkspaceCallRecap[];
    conversations: WorkspaceConversationSummary[];
    outputs: WorkspaceOutputSummary[];
    activity?: WorkspaceActivityEvent[];
  }>({
    path: "/v1/workspaces/surface",
    accessToken
  });
}

export async function createWorkspaceRuntimeSession(
  accessToken: string,
  body: { sourceType: "chat" | "studio" | "task"; sourceId: string }
) {
  return apiFetch<{ ok: boolean; sessionId: string }>({
    path: "/v1/workspaces/runtime-sessions",
    method: "POST",
    accessToken,
    body
  });
}

export async function fetchWorkspaceRuntimeSessionsList(accessToken: string, query?: { limit?: number }) {
  const q = new URLSearchParams();
  if (query?.limit != null) q.set("limit", String(query.limit));
  const qs = q.toString();
  return apiFetch<{ ok: boolean; sessions: WorkspaceRuntimeSession[] }>({
    path: `/v1/workspaces/runtime-sessions${qs ? `?${qs}` : ""}`,
    accessToken
  });
}

export async function fetchWorkspaceRuntimeSession(accessToken: string, sessionId: string) {
  return apiFetch<{
    ok: boolean;
    session: WorkspaceRuntimeSession;
    tasks: WorkspaceTask[];
    runs: WorkspaceRuntimeRun[];
    logs: WorkspaceRuntimeLog[];
    patches: WorkspaceRuntimePatch[];
    approvals: WorkspaceApproval[];
    outputs: WorkspaceOutputSummary[];
  }>({
    path: `/v1/workspaces/runtime-sessions/${encodeURIComponent(sessionId)}`,
    accessToken
  });
}

/**
 * Send a message to MALV — optionally within an existing conversation (task thread).
 * Works identically to the chat page, but callable from any surface.
 */
export async function sendChatMessage(
  accessToken: string,
  body: { message: string; conversationId?: string | null; sessionType?: string | null }
) {
  return apiFetch<{ reply: string; conversationId?: string; runId?: string }>({
    path: "/v1/chat",
    method: "POST",
    accessToken,
    body: {
      message:        body.message,
      conversationId: body.conversationId ?? null,
      sessionType:    body.sessionType ?? null
    }
  });
}

export type ExploreImageInferredAttributes = {
  style?: string;
  mood?: string;
  lighting?: string;
  composition?: string;
  detail?: string;
};

export type ExploreImageInterpretation = {
  refinedPrompt: string;
  userPrompt?: string;
  inferred: ExploreImageInferredAttributes;
  confidence: number;
};

export type ExploreImageGenerateResponse = {
  status: "processing" | "done";
  interpretation: ExploreImageInterpretation;
  imageUrl?: string;
  logs?: string[];
  plan?: { steps: string[] };
  directionSummary?: string;
};

/** Explore image pipeline: intent interpretation + execution plan (image URL when backend exists). */
export async function postExploreImageGenerate(
  accessToken: string,
  body: {
    prompt: string;
    sourceImageDataUrl?: string;
    sourceImageFileId?: string;
    modeId?: string;
    promptExpansionMode?: string;
  },
  signal?: AbortSignal
) {
  return apiFetch<ExploreImageGenerateResponse>({
    path: "/v1/explore/image/generate",
    method: "POST",
    accessToken,
    body: {
      prompt: body.prompt,
      ...(body.sourceImageFileId ? { sourceImageFileId: body.sourceImageFileId } : {}),
      ...(!body.sourceImageFileId && body.sourceImageDataUrl ? { sourceImageDataUrl: body.sourceImageDataUrl } : {}),
      ...(body.modeId ? { modeId: body.modeId } : {}),
      ...(body.promptExpansionMode ? { promptExpansionMode: body.promptExpansionMode } : {})
    },
    signal
  });
}

export async function fetchWorkspaceTasks(accessToken: string, query?: { status?: WorkspaceTaskStatus; limit?: number }) {
  const q = new URLSearchParams();
  if (query?.status) q.set("status", query.status);
  if (query?.limit != null) q.set("limit", String(query.limit));
  return apiFetch<{ ok: boolean; tasks: WorkspaceTask[] }>({
    path: `/v1/workspaces/tasks${q.toString() ? `?${q.toString()}` : ""}`,
    accessToken
  });
}

export async function fetchArchivedWorkspaceTasks(accessToken: string) {
  return apiFetch<{ ok: boolean; tasks: WorkspaceTask[] }>({
    path: "/v1/workspaces/tasks?status=archived&limit=200",
    accessToken
  });
}

export async function fetchMyWorkspaceTasks(accessToken: string, query?: { status?: "todo" | "in_progress" | "done"; limit?: number }) {
  const q = new URLSearchParams();
  if (query?.status) q.set("status", query.status);
  if (query?.limit != null) q.set("limit", String(query.limit));
  q.set("assignedToMe", "true");
  return apiFetch<{ ok: boolean; tasks: WorkspaceTask[] }>({
    path: `/v1/workspaces/tasks?${q.toString()}`,
    accessToken
  });
}

export async function createWorkspaceTask(
  accessToken: string,
  body: {
    title: string;
    description?: string | null;
    status?: WorkspaceTaskStatus;
    priority?: WorkspaceTaskPriority;
    source?: WorkspaceTaskSource;
    sourceSurface?: WorkspaceTaskSource;
    sourceType?: string | null;
    sourceReferenceId?: string | null;
    executionType?: WorkspaceTaskExecutionType;
    conversationId?: string | null;
    callSessionId?: string | null;
    roomId?: string | null;
    assigneeUserId?: string | null;
    dueAt?: string | null;
    scheduledFor?: string | null;
    reminderAt?: string | null;
    requiresApproval?: boolean;
    riskLevel?: WorkspaceTaskRiskLevel;
    tags?: string[] | null;
  }
) {
  return apiFetch<{ ok: boolean; task: WorkspaceTask }>({
    path: "/v1/workspaces/tasks",
    method: "POST",
    accessToken,
    body
  });
}

export async function createWorkspaceTaskFromChatOutput(
  accessToken: string,
  body: { messageId: string; title?: string | null; description?: string | null }
) {
  return apiFetch<{ ok: boolean; task: WorkspaceTask }>({
    path: "/v1/workspaces/tasks/from-chat-output",
    method: "POST",
    accessToken,
    body
  });
}

export async function archiveWorkspaceTask(accessToken: string, taskId: string) {
  return apiFetch<{ ok: boolean; task: WorkspaceTask }>({
    path: `/v1/workspaces/tasks/${encodeURIComponent(taskId)}/archive`,
    method: "POST",
    accessToken
  });
}

export async function patchWorkspaceTask(
  accessToken: string,
  taskId: string,
  body: {
    title?: string;
    description?: string | null;
    status?: WorkspaceTaskStatus;
    priority?: WorkspaceTaskPriority;
    executionState?: WorkspaceTaskExecutionState;
    assigneeUserId?: string | null;
    dueAt?: string | null;
    scheduledFor?: string | null;
    reminderAt?: string | null;
    requiresApproval?: boolean;
    riskLevel?: WorkspaceTaskRiskLevel;
    tags?: string[] | null;
  }
) {
  return apiFetch<{ ok: boolean; task: WorkspaceTask }>({
    path: `/v1/workspaces/tasks/${encodeURIComponent(taskId)}`,
    method: "PATCH",
    accessToken,
    body
  });
}

export async function completeWorkspaceTask(accessToken: string, taskId: string) {
  return apiFetch<{ ok: boolean; task: WorkspaceTask }>({
    path: `/v1/workspaces/tasks/${encodeURIComponent(taskId)}/complete`,
    method: "POST",
    accessToken
  });
}

export async function fetchWorkspaceApprovals(
  accessToken: string,
  query?: { status?: "pending" | "approved" | "rejected"; limit?: number }
) {
  const q = new URLSearchParams();
  if (query?.status) q.set("status", query.status);
  if (query?.limit != null) q.set("limit", String(query.limit));
  return apiFetch<{ ok: boolean; approvals: WorkspaceApproval[] }>({
    path: `/v1/workspaces/approvals${q.toString() ? `?${q.toString()}` : ""}`,
    accessToken
  });
}

export async function decideWorkspaceApproval(accessToken: string, approvalId: string, decision: "approved" | "rejected") {
  return apiFetch<{ ok: boolean; approval: WorkspaceApproval }>({
    path: `/v1/workspaces/approvals/${encodeURIComponent(approvalId)}/decision`,
    method: "POST",
    accessToken,
    body: { decision }
  });
}

export async function fetchCallTranscripts(accessToken: string, callSessionId: string, query?: { limit?: number }) {
  const q = query?.limit !== undefined ? `?limit=${encodeURIComponent(String(query.limit))}` : "";
  return apiFetch<{
    ok: boolean;
    transcripts?: Array<{
      transcriptId: string;
      speakerRole: string;
      content: string;
      startTimeMs: number | null;
      createdAt: number;
    }>;
    error?: string;
  }>({
    path: `/v1/calls/${encodeURIComponent(callSessionId)}/transcripts${q}`,
    accessToken
  });
}

export async function patchCallRecap(
  accessToken: string,
  callSessionId: string,
  body: {
    summary?: string;
    actionItems?: string[];
    decisions?: string[];
    unresolvedQuestions?: string[];
    suggestedFollowUps?: string[];
  }
) {
  return apiFetch<{ ok: boolean; callSessionId?: string; runtime?: Record<string, unknown>; error?: string }>({
    path: `/v1/calls/${encodeURIComponent(callSessionId)}/recap`,
    method: "PATCH",
    accessToken,
    body
  });
}

export async function patchCallState(accessToken: string, callSessionId: string, status: "active" | "ended") {
  return apiFetch<{ ok: boolean; callSessionId: string; status: string; endedAt: number | null }>({
    path: `/v1/calls/${encodeURIComponent(callSessionId)}/state`,
    method: "PATCH",
    accessToken,
    body: { status }
  });
}

export async function patchCallControls(
  accessToken: string,
  callSessionId: string,
  body: { micMuted?: boolean; malvPaused?: boolean; cameraAssistEnabled?: boolean }
) {
  return apiFetch<{ ok: boolean; runtime: Record<string, unknown> }>({
    path: `/v1/calls/${encodeURIComponent(callSessionId)}/controls`,
    method: "PATCH",
    accessToken,
    body
  });
}

export async function fetchAuthMe(accessToken: string) {
  return apiFetch<{ ok: boolean; userId: string; email?: string | null; displayName?: string | null; role: string; permissions: string[] }>({
    path: "/v1/auth/me",
    accessToken
  });
}

export async function fetchAdminKillSwitch(accessToken: string) {
  return apiFetch<{ ok: boolean; state: { systemOn: boolean; occurredAt?: number } }>({
    path: "/v1/admin/system/kill-switch",
    accessToken
  });
}

export async function fetchAdminHealth(accessToken: string) {
  return apiFetch<{ ok: boolean; killSwitch: unknown; worker: Record<string, unknown> }>({
    path: "/v1/admin/system/health",
    accessToken
  });
}

export async function fetchAdminRuns(accessToken: string) {
  return apiFetch<{ ok: boolean; runs: Array<Record<string, unknown>> }>({
    path: "/v1/admin/runtime/runs?limit=25",
    accessToken
  });
}

export async function fetchAdminInferenceSettings(accessToken: string) {
  return apiFetch<{ ok: boolean; effectiveConfig: Record<string, unknown>; configSource: string; effectiveBackend: string; worker: Record<string, unknown> }>({
    path: "/v1/admin/inference/settings",
    accessToken
  });
}

export async function patchAdminInferenceSettings(
  accessToken: string,
  body: Record<string, unknown>
) {
  return apiFetch<{ ok: boolean; configSource: string; configRevision: string; effectiveConfig: Record<string, unknown> }>({
    path: "/v1/admin/inference/settings",
    method: "PATCH",
    accessToken,
    body
  });
}

export async function testAdminInferenceSettings(accessToken: string) {
  return apiFetch<{ ok: boolean; workerHealth: Record<string, unknown> }>({
    path: "/v1/admin/inference/settings/test",
    method: "POST",
    accessToken
  });
}

export async function resetAdminInferenceSettings(accessToken: string) {
  return apiFetch<{ ok: boolean; effectiveConfig: Record<string, unknown>; configSource: string; configRevision: string }>({
    path: "/v1/admin/inference/settings/reset",
    method: "POST",
    accessToken
  });
}

export async function fetchInferenceHealth(accessToken?: string) {
  return apiFetch<{ ok: boolean; effectiveBackend: string | null; inferenceReady: boolean; fallbackActive: boolean; fallbackEnabled: boolean; primaryBackend: string | null; selectedModel: string | null }>({
    path: "/v1/health/inference",
    accessToken
  });
}

export type StudioSession = {
  id: string;
  title: string;
  status: string;
  selectedTarget?: Record<string, unknown> | null;
  previewContext?: Record<string, unknown> | null;
  pendingChangeSummary?: Record<string, unknown> | null;
  versions?: Array<Record<string, unknown>> | null;
  lastSandboxRunId?: string | null;
  lastPatchProposalId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudioVersionCompare = {
  leftVersionId: string;
  rightVersionId: string;
  changedFiles: string[];
  insightDelta: string[];
  summary: string;
};

export async function createStudioSession(accessToken: string, body?: { title?: string; workspaceId?: string | null }) {
  return apiFetch<{ ok: boolean; session: StudioSession }>({
    path: "/v1/studio/sessions",
    method: "POST",
    accessToken,
    body: body ?? {}
  });
}

export async function fetchStudioSession(accessToken: string, sessionId: string) {
  return apiFetch<{ ok: boolean; session: StudioSession }>({
    path: `/v1/studio/sessions/${encodeURIComponent(sessionId)}`,
    accessToken
  });
}

export async function captureStudioTarget(accessToken: string, sessionId: string, target: Record<string, unknown>) {
  return apiFetch<{ ok: boolean; session: StudioSession }>({
    path: `/v1/studio/sessions/${encodeURIComponent(sessionId)}/targets`,
    method: "POST",
    accessToken,
    body: { target }
  });
}

export async function sendStudioInstruction(
  accessToken: string,
  sessionId: string,
  body: { instruction: string; workspaceId?: string | null }
) {
  return apiFetch<{ ok: boolean; session: StudioSession }>({
    path: `/v1/studio/sessions/${encodeURIComponent(sessionId)}/chat`,
    method: "POST",
    accessToken,
    body
  });
}

export async function fetchStudioVersions(accessToken: string, sessionId: string) {
  return apiFetch<{ ok: boolean; versions: Array<Record<string, unknown>> }>({
    path: `/v1/studio/sessions/${encodeURIComponent(sessionId)}/versions`,
    accessToken
  });
}

export async function applyStudioChanges(accessToken: string, sessionId: string, body?: { riskAcknowledged?: boolean }) {
  return apiFetch<{ ok: boolean; patchStatus?: string; patchId?: string; error?: string; requiresApproval?: boolean }>({
    path: `/v1/studio/sessions/${encodeURIComponent(sessionId)}/apply`,
    method: "POST",
    accessToken,
    body: body ?? {}
  });
}

export async function revertStudioChanges(accessToken: string, sessionId: string) {
  return apiFetch<{ ok: boolean }>({
    path: `/v1/studio/sessions/${encodeURIComponent(sessionId)}/revert`,
    method: "POST",
    accessToken
  });
}

export async function restoreStudioVersion(accessToken: string, sessionId: string, versionId: string) {
  return apiFetch<{ ok: boolean; session: StudioSession; error?: string }>({
    path: `/v1/studio/sessions/${encodeURIComponent(sessionId)}/versions/${encodeURIComponent(versionId)}/restore`,
    method: "POST",
    accessToken
  });
}

export async function compareStudioVersions(
  accessToken: string,
  sessionId: string,
  body: { leftVersionId: string; rightVersionId: string }
) {
  return apiFetch<{ ok: boolean; compare: StudioVersionCompare; error?: string }>({
    path: `/v1/studio/sessions/${encodeURIComponent(sessionId)}/versions/compare`,
    method: "POST",
    accessToken,
    body
  });
}

// ─── Build Units ──────────────────────────────────────────────────────────────

export type BuildUnitType =
  | "template"
  | "component"
  | "behavior"
  | "workflow"
  | "plugin"
  | "blueprint"
  | "ai_generated";

export type BuildUnitVisibility = "public" | "private" | "team";
export type BuildUnitSourceKind = "system" | "user";

export type BuildUnitPreviewKind = "image" | "code" | "rendered" | "animation" | "mixed" | "none";

/** Server-computed, deterministic preview feasibility (Explore + intakes). */
export type ApiPreviewFeasibility = {
  previewFeasible: boolean;
  previewMode: "none" | "code" | "static" | "live";
  reasonCode: string;
  reasonLabel: string;
  blockingIssues: string[];
  /** When true, a browser preview artifact may still be materializing (async build). */
  frontendPreviewable?: boolean;
  signals: {
    framework?: string | null;
    runtime?: string | null;
    entrypointDetected?: boolean;
    surface?: string | null;
  };
};

/** Live preview delivery (build units only). `url` / `fetchPath` require Bearer — not a public iframe src. */
export type ApiLivePreview = {
  available: boolean;
  kind: "iframe_url" | "html_doc";
  url?: string | null;
  fetchPath?: string | null;
  mimeType?: string | null;
  viewport?: "component" | "page";
  title?: string | null;
  generatedAt?: string | null;
  reasonCode?: string | null;
  reasonLabel?: string | null;
};

export type BuildUnitExecutionProfile = {
  requiresInput: boolean;
  steps:         Array<{ order: number; label: string; detail?: string }>;
  estimatedComplexity: "low" | "medium" | "high";
};

/** User-owned units only: explicit async preview pipeline phase (additive API contract). */
export type BuildUnitPreviewPipelineStatus = "pending" | "ready" | "failed" | "not_previewable";

export type ApiBuildUnit = {
  id:                  string;
  slug:                string;
  title:               string;
  description:         string | null;
  type:                BuildUnitType;
  category:            string;
  tags:                string[] | null;
  prompt:              string | null;
  codeSnippet:         string | null;
  previewImageUrl:     string | null;
  previewKind:         BuildUnitPreviewKind;
  /** Persisted Explore grid snapshot (files.id); preferred over previewFileId for catalog cards. */
  previewSnapshotId:   string | null;
  previewFileId:       string | null;
  sourceFileId:        string | null;
  sourceFileName:      string | null;
  sourceFileMime:      string | null;
  sourceFileUrl:       string | null;
  authorUserId:        string | null;
  authorLabel:         string | null;
  visibility:          BuildUnitVisibility;
  sourceKind:          BuildUnitSourceKind;
  originalBuildUnitId: string | null;
  forkable:            boolean;
  downloadable:        boolean;
  verified:            boolean;
  trending:            boolean;
  recommended:         boolean;
  isNew:               boolean;
  accent:              string | null;
  usesCount:           number;
  forksCount:          number;
  downloadsCount:      number;
  /** Optional extension point: usage lineage, fork hints, provenance — not for social counters. */
  metadataJson:        Record<string, unknown> | null;
  /** Present after API backfill; may be absent on stale list payloads. */
  executionProfileJson?: Record<string, unknown> | null;
  /** Code-derived preview lifecycle (null for legacy catalog rows). */
  intakePreviewState?: "not_requested" | "queued" | "ready" | "unavailable" | null;
  intakePreviewUnavailableReason?: string | null;
  intakeAuditDecision?: "pending" | "approved" | "approved_with_warnings" | "declined" | null;
  intakeDetectionJson?: Record<string, unknown> | null;
  /** When present on detail payloads, authoritative preview permission vs coarse intake fields. */
  normalizedReview?: ApiNormalizedSourceIntakeReview | null;
  /** Present when API runs preview feasibility v1. */
  previewFeasibility?: ApiPreviewFeasibility | null;
  /** Present when server evaluates live delivery (detail/list). */
  livePreview?: ApiLivePreview | null;
  /** User-owned units: server-derived pending vs terminal failure vs ready (omit on catalog rows). */
  previewPipelineStatus?: BuildUnitPreviewPipelineStatus | null;
  createdAt:           string;
  updatedAt:           string;
  archivedAt:          string | null;
};

/** Coerce nullable preview fields for older API payloads and sanitize preview URLs at the data boundary. */
export function normalizeApiBuildUnit(u: ApiBuildUnit): ApiBuildUnit {
  return sanitizeBuildUnitPreviewFields({
    ...u,
    previewKind:    u.previewKind ?? "none",
    previewSnapshotId: u.previewSnapshotId ?? null,
    previewFileId:  u.previewFileId ?? null,
    sourceFileId:     u.sourceFileId ?? null,
    sourceFileName:   u.sourceFileName ?? null,
    sourceFileMime:   u.sourceFileMime ?? null,
    sourceFileUrl:    u.sourceFileUrl ?? null,
    intakePreviewState:             u.intakePreviewState ?? null,
    intakePreviewUnavailableReason: u.intakePreviewUnavailableReason ?? null,
    intakeAuditDecision:            u.intakeAuditDecision ?? null,
    intakeDetectionJson:            u.intakeDetectionJson ?? null,
    normalizedReview:               u.normalizedReview ?? null,
    previewFeasibility:             u.previewFeasibility ?? null,
    livePreview:                    u.livePreview ?? null,
    previewPipelineStatus:          u.previewPipelineStatus ?? null
  });
}

export type SourceIntakeSessionStatus =
  | "uploaded"
  | "detecting"
  | "auditing"
  | "approved"
  | "approved_with_warnings"
  | "declined";

export type SourceIntakeAuditDecision = "pending" | "approved" | "approved_with_warnings" | "declined";

export type SourceIntakePreviewState = "not_requested" | "queued" | "ready" | "unavailable";

/** Backend-normalized review policy (v1). Mirrors `auditJson.modelReview` + live `buildUnitId` gates. */
export type ApiNormalizedSourceIntakeReview = {
  version: 1;
  reviewMode: "static_policy_only" | "model_assisted";
  decision: "approved" | "approved_with_warnings" | "declined" | "pending";
  rationale: string;
  previewAllowed: boolean;
  publishAllowed: boolean;
  pipelineReadError: boolean;
  limitations: string[];
  modelReview: Record<string, unknown> | null;
  reviewPolicy: Record<string, unknown>;
};

export type ApiSourceIntakeSession = {
  id: string;
  userId: string;
  status: SourceIntakeSessionStatus;
  auditDecision: SourceIntakeAuditDecision;
  sourceFileId: string;
  detectionJson: Record<string, unknown> | null;
  auditJson: Record<string, unknown> | null;
  /** Truthful one-line policy outcome from static review (not a malware verdict). */
  auditSummary: string | null;
  previewState: SourceIntakePreviewState;
  previewUnavailableReason: string | null;
  buildUnitId: string | null;
  previewFeasibility?: ApiPreviewFeasibility | null;
  /** Policy truth distinct from `previewFeasibility` (technical feasibility). */
  normalizedReview?: ApiNormalizedSourceIntakeReview | null;
  createdAt: string;
  updatedAt: string;
};

function normalizeSourceIntakeSession(raw: ApiSourceIntakeSession): ApiSourceIntakeSession {
  return {
    ...raw,
    detectionJson: raw.detectionJson ?? null,
    auditJson: raw.auditJson ?? null,
    auditSummary: raw.auditSummary ?? null,
    previewUnavailableReason: raw.previewUnavailableReason ?? null,
    buildUnitId: raw.buildUnitId ?? null,
    previewFeasibility: raw.previewFeasibility ?? null,
    normalizedReview: raw.normalizedReview ?? null
  };
}

export async function createSourceIntakeSession(accessToken: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  const raw = await apiUpload<{ ok: boolean; session?: ApiSourceIntakeSession; error?: string }>({
    path: "/v1/workspaces/source-intakes",
    accessToken,
    formData: form
  });
  if (!raw.ok || !raw.session) return { ok: false as const, error: raw.error ?? "Intake failed" };
  return { ok: true as const, session: normalizeSourceIntakeSession(raw.session) };
}

export async function fetchSourceIntakeSession(accessToken: string, id: string) {
  const raw = await apiFetch<{ ok: boolean; session?: ApiSourceIntakeSession; error?: string }>({
    path: `/v1/workspaces/source-intakes/${encodeURIComponent(id)}`,
    accessToken
  });
  if (!raw.ok || !raw.session) return { ok: false as const, error: raw.error ?? "Not found" };
  return { ok: true as const, session: normalizeSourceIntakeSession(raw.session) };
}

export type PublishSourceIntakeBody = {
  title?: string;
  description?: string | null;
  category?: string;
  type?: string;
  tags?: string[];
};

/** Server creates a build unit and links `session.buildUnitId`. Eligibility enforced server-side only. */
export async function publishSourceIntake(
  accessToken: string,
  intakeSessionId: string,
  body?: PublishSourceIntakeBody
) {
  try {
    const raw = await apiFetch<{
      ok: boolean;
      buildUnit?: ApiBuildUnit;
      session?: ApiSourceIntakeSession;
      error?: string;
    }>({
      path: `/v1/workspaces/source-intakes/${encodeURIComponent(intakeSessionId)}/publish`,
      accessToken,
      method: "POST",
      body: body && Object.keys(body).length ? body : {}
    });
    if (!raw.ok || !raw.buildUnit || !raw.session) {
      return { ok: false as const, error: raw.error ?? "Publish failed" };
    }
    return {
      ok: true as const,
      buildUnit: normalizeApiBuildUnit(raw.buildUnit),
      session: normalizeSourceIntakeSession(raw.session)
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? parseNestErrorMessage(e) : "Publish failed"
    };
  }
}

/** Local/dev only — POST `v1/dev/explore-fixtures/landing-published-unit`. 404 in production unless `MALV_DEV_EXPLORE_FIXTURES=1`. */
export async function devSeedExploreLandingUnit(accessToken: string) {
  try {
    const raw = await apiFetch<{
      ok: boolean;
      unit?: ApiBuildUnit;
      error?: string;
    }>({
      path: "/v1/dev/explore-fixtures/landing-published-unit",
      accessToken,
      method: "POST",
      body: {}
    });
    if (!raw.ok || !raw.unit) {
      return { ok: false as const, error: raw.error ?? "Fixture seed failed" };
    }
    return { ok: true as const, unit: normalizeApiBuildUnit(raw.unit) };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? parseNestErrorMessage(e) : "Fixture seed failed"
    };
  }
}

/** Local/dev only — POST `v1/dev/explore-fixtures/landing-source-intake`. */
export async function devSeedExploreLandingIntake(accessToken: string) {
  try {
    const raw = await apiFetch<{
      ok: boolean;
      session?: ApiSourceIntakeSession;
      error?: string;
    }>({
      path: "/v1/dev/explore-fixtures/landing-source-intake",
      accessToken,
      method: "POST",
      body: {}
    });
    if (!raw.ok || !raw.session) {
      return { ok: false as const, error: raw.error ?? "Fixture seed failed" };
    }
    return { ok: true as const, session: normalizeSourceIntakeSession(raw.session) };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? parseNestErrorMessage(e) : "Fixture seed failed"
    };
  }
}

export type ApiBuildUnitVersion = {
  id:            string;
  buildUnitId:   string;
  versionNumber: number;
  snapshotJson:  Record<string, unknown>;
  createdAt:     string;
};

export type ApiBuildUnitComposition = {
  id:           string;
  name:         string;
  userId:       string;
  unitIds:      string[];
  metadataJson: Record<string, unknown> | null;
  createdAt:    string;
};

export async function fetchBuildUnits(
  accessToken: string,
  query?: {
    type?:     string;
    category?: string;
    section?:  "trending" | "recommended" | "new";
    mine?:     boolean;
    forked?:   boolean;
    search?:   string;
    limit?:    number;
    page?:     number;
  }
) {
  const q = new URLSearchParams();
  if (query?.type)     q.set("type",     query.type);
  if (query?.category) q.set("category", query.category);
  if (query?.section)  q.set("section",  query.section);
  if (query?.mine)     q.set("mine",     "true");
  if (query?.forked)   q.set("forked",   "true");
  if (query?.search)   q.set("search",   query.search);
  if (query?.limit  != null) q.set("limit",  String(query.limit));
  if (query?.page   != null) q.set("page",   String(query.page));
  const raw = await apiFetch<{ ok: boolean; units: ApiBuildUnit[]; total: number; hasMore: boolean }>({
    path: `/v1/workspaces/units${q.toString() ? `?${q.toString()}` : ""}`,
    accessToken
  });
  return {
    ...raw,
    units: (raw.units ?? []).map(normalizeApiBuildUnit)
  };
}

export async function fetchBuildUnit(accessToken: string, id: string) {
  const raw = await apiFetch<{ ok: boolean; unit: ApiBuildUnit }>({
    path: `/v1/workspaces/units/${encodeURIComponent(id)}`,
    accessToken
  });
  return raw.ok && raw.unit ? { ...raw, unit: normalizeApiBuildUnit(raw.unit) } : raw;
}

export async function forkBuildUnit(accessToken: string, id: string) {
  const raw = await apiFetch<{ ok: boolean; unit: ApiBuildUnit }>({
    path: `/v1/workspaces/units/${encodeURIComponent(id)}/fork`,
    method: "POST",
    accessToken
  });
  return raw.ok && raw.unit ? { ...raw, unit: normalizeApiBuildUnit(raw.unit) } : raw;
}

export async function patchBuildUnit(
  accessToken: string,
  id: string,
  body: {
    title?:       string;
    description?: string | null;
    tags?:        string[] | null;
    prompt?:      string | null;
    codeSnippet?: string | null;
    category?:    string;
    visibility?:  BuildUnitVisibility;
    forkable?:    boolean;
    downloadable?: boolean;
    accent?:      string | null;
    previewKind?:       BuildUnitPreviewKind;
    previewImageUrl?:   string | null;
    previewFileId?:     string | null;
    sourceFileId?:      string | null;
    sourceFileName?:    string | null;
    sourceFileMime?:    string | null;
    sourceFileUrl?:     string | null;
  }
) {
  const raw = await apiFetch<{ ok: boolean; unit: ApiBuildUnit }>({
    path:   `/v1/workspaces/units/${encodeURIComponent(id)}`,
    method: "PATCH",
    accessToken,
    body
  });
  return raw.ok && raw.unit ? { ...raw, unit: normalizeApiBuildUnit(raw.unit) } : raw;
}

export async function sendBuildUnitToTask(accessToken: string, id: string) {
  return apiFetch<{ ok: boolean; task: { id: string; title: string; status: string }; taskLinkId: string }>({
    path:   `/v1/workspaces/units/${encodeURIComponent(id)}/send-to-task`,
    method: "POST",
    accessToken
  });
}

export async function seedBuildUnits(accessToken: string) {
  return apiFetch<{ ok: boolean; seeded: number; skipped: number }>({
    path:   "/v1/workspaces/units/seed",
    method: "POST",
    accessToken
  });
}

export async function createBuildUnit(
  accessToken: string,
  body: {
    title:        string;
    description?: string | null;
    type:         BuildUnitType;
    category:     string;
    tags?:        string[] | null;
    prompt?:      string | null;
    codeSnippet?: string | null;
    visibility?:  BuildUnitVisibility;
    forkable?:    boolean;
    downloadable?: boolean;
    accent?:      string | null;
    previewKind?:       BuildUnitPreviewKind;
    previewImageUrl?:   string | null;
    previewFileId?:     string | null;
    sourceFileId?:      string | null;
    sourceFileName?:    string | null;
    sourceFileMime?:    string | null;
    sourceFileUrl?:     string | null;
  }
) {
  const raw = await apiFetch<{ ok: boolean; unit: ApiBuildUnit }>({
    path:   "/v1/workspaces/units",
    method: "POST",
    accessToken,
    body
  });
  return raw.ok && raw.unit ? { ...raw, unit: normalizeApiBuildUnit(raw.unit) } : raw;
}

export async function uploadBuildUnitPreview(accessToken: string, file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return apiUpload<{ ok: boolean; fileId: string; storageUri: string; mimeType: string | null }>({
    path:       "/v1/workspaces/units/uploads/preview",
    accessToken,
    formData
  });
}

export async function uploadBuildUnitSource(accessToken: string, file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return apiUpload<{ ok: boolean; fileId: string; storageUri: string; mimeType: string | null }>({
    path:       "/v1/workspaces/units/uploads/source",
    accessToken,
    formData
  });
}

export async function fetchBuildUnitSourceBlob(accessToken: string, unitId: string): Promise<Blob> {
  return apiFetchBlob({
    path:        `/v1/workspaces/units/${encodeURIComponent(unitId)}/source-download`,
    accessToken
  });
}

export async function fetchBuildUnitVersions(accessToken: string, unitId: string) {
  return apiFetch<{ ok: boolean; versions: ApiBuildUnitVersion[] }>({
    path: `/v1/workspaces/units/${encodeURIComponent(unitId)}/versions`,
    accessToken
  });
}

export type ImproveBuildUnitOptions = {
  /** Optional — biases server-side improve prompt (Explore preview intents). */
  improveIntent?: "generic_improve" | "optimize_mobile" | "tighten_spacing_typography";
};

export async function improveBuildUnit(accessToken: string, unitId: string, options?: ImproveBuildUnitOptions) {
  const body =
    options?.improveIntent != null
      ? { improveIntent: options.improveIntent }
      : undefined;
  const raw = await apiFetch<{ ok: boolean; unit: ApiBuildUnit }>({
    path:   `/v1/workspaces/units/${encodeURIComponent(unitId)}/improve`,
    method: "POST",
    accessToken,
    body
  });
  return raw.ok && raw.unit ? { ...raw, unit: normalizeApiBuildUnit(raw.unit) } : raw;
}

export async function createUnitComposition(
  accessToken: string,
  body: { name: string; unitIds: string[]; metadataJson?: Record<string, unknown> | null }
) {
  return apiFetch<{ ok: boolean; composition: ApiBuildUnitComposition }>({
    path:   "/v1/workspaces/unit-compositions",
    method: "POST",
    accessToken,
    body
  });
}

export async function fetchMyUnitCompositions(accessToken: string) {
  return apiFetch<{ ok: boolean; compositions: ApiBuildUnitComposition[] }>({
    path: "/v1/workspaces/unit-compositions/mine",
    accessToken
  });
}

export async function fetchUnitComposition(accessToken: string, compositionId: string) {
  return apiFetch<{ ok: boolean; composition: ApiBuildUnitComposition }>({
    path: `/v1/workspaces/unit-compositions/${encodeURIComponent(compositionId)}`,
    accessToken
  });
}

export async function patchUnitComposition(accessToken: string, compositionId: string, body: { name: string }) {
  return apiFetch<{ ok: boolean; composition: ApiBuildUnitComposition }>({
    path:   `/v1/workspaces/unit-compositions/${encodeURIComponent(compositionId)}`,
    method: "PATCH",
    accessToken,
    body
  });
}

export async function deleteBuildUnit(accessToken: string, unitId: string) {
  return apiFetch<{ ok: boolean }>({
    path:   `/v1/workspaces/units/${encodeURIComponent(unitId)}`,
    method: "DELETE",
    accessToken
  });
}

export async function unforkBuildUnit(accessToken: string, unitId: string) {
  const raw = await apiFetch<{ ok: boolean; unit: ApiBuildUnit }>({
    path:   `/v1/workspaces/units/${encodeURIComponent(unitId)}/unfork`,
    method: "POST",
    accessToken
  });
  return raw.ok && raw.unit ? { ...raw, unit: normalizeApiBuildUnit(raw.unit) } : raw;
}

export async function deleteUnitComposition(accessToken: string, compositionId: string) {
  return apiFetch<{ ok: boolean }>({
    path:   `/v1/workspaces/unit-compositions/${encodeURIComponent(compositionId)}`,
    method: "DELETE",
    accessToken
  });
}

export async function sendCompositionToTask(accessToken: string, compositionId: string) {
  return apiFetch<{ ok: boolean; task: { id: string; title: string; status: string } }>({
    path:   `/v1/workspaces/unit-compositions/${encodeURIComponent(compositionId)}/send-to-task`,
    method: "POST",
    accessToken
  });
}
