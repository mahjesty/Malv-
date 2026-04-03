import { apiFetch, apiUpload } from "./http";

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

export type WorkspaceTaskStatus = "todo" | "in_progress" | "done";
export type WorkspaceTaskSource = "call" | "chat" | "manual";

export type WorkspaceTask = {
  id: string;
  title: string;
  description: string | null;
  status: WorkspaceTaskStatus;
  source: WorkspaceTaskSource;
  conversationId: string | null;
  callSessionId: string | null;
  roomId: string | null;
  assigneeUserId?: string | null;
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
  return apiUpload<{ ok: boolean; fileId: string; storageUri: string }>({
    path: "/v1/files/upload",
    accessToken,
    formData: fd
  });
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

export async function fetchWorkspaceTasks(accessToken: string, query?: { status?: "todo" | "in_progress" | "done"; limit?: number }) {
  const q = new URLSearchParams();
  if (query?.status) q.set("status", query.status);
  if (query?.limit != null) q.set("limit", String(query.limit));
  return apiFetch<{ ok: boolean; tasks: WorkspaceTask[] }>({
    path: `/v1/workspaces/tasks${q.toString() ? `?${q.toString()}` : ""}`,
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
    status?: "todo" | "in_progress" | "done";
    source?: "call" | "chat" | "manual";
    conversationId?: string | null;
    callSessionId?: string | null;
    roomId?: string | null;
    assigneeUserId?: string | null;
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

export async function patchWorkspaceTask(
  accessToken: string,
  taskId: string,
  body: { title?: string; description?: string | null; status?: "todo" | "in_progress" | "done"; assigneeUserId?: string | null }
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
