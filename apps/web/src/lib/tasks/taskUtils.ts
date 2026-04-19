/**
 * MALV Task Utilities — mapping, parsing, and formatting.
 * All functions are pure / side-effect-free.
 */
import type { WorkspaceTask, WorkspaceRuntimeSession } from "../api/dataPlane";
import type {
  ParsedTaskIntent,
  SourceBadgeConfig,
  TaskDisplayRow,
  TaskExecutionPosture,
  TaskSourceSurface,
  TaskUiStatus,
} from "./taskTypes";

// ─── Status Mapping ────────────────────────────────────────────────────────

export function mapTaskToUiStatus(task: WorkspaceTask): TaskUiStatus {
  // Prefer executionState when available (richer signal)
  if (task.executionState) {
    switch (task.executionState) {
      case "running":
      case "dispatched":
      case "due":
        return "running";
      case "pending":
      case "idle":
        return "queued";
      case "scheduled":
        return "scheduled";
      case "waiting_input":
        return "awaiting_input";
      case "waiting_approval":
        return "awaiting_approval";
      case "blocked":
        return "blocked";
      case "completed":
      case "cancelled":
        return "completed";
      case "failed":
        return "failed";
    }
  }
  // Fall back to status
  switch (task.status) {
    case "done":        return "completed";
    case "archived":    return "completed";
    case "in_progress": return "running";
    default:
      // If task has a future scheduledFor it's scheduled
      if (task.scheduledFor && new Date(task.scheduledFor) > new Date()) return "scheduled";
      return "queued";
  }
}

export function mapSessionToUiStatus(s: WorkspaceRuntimeSession): TaskUiStatus {
  switch (s.status) {
    case "running":          return "running";
    case "waiting_approval": return "awaiting_approval";
    case "completed":        return "completed";
    case "failed":           return "failed";
    default:                 return "queued";
  }
}

// ─── Posture Inference ─────────────────────────────────────────────────────

export function inferPosture(uiStatus: TaskUiStatus): TaskExecutionPosture {
  switch (uiStatus) {
    case "running":           return "malv_handling";
    case "queued":            return "malv_queued";
    case "scheduled":         return "scheduled";
    case "awaiting_input":    return "needs_input";
    case "awaiting_approval": return "needs_approval";
    case "blocked":           return "blocked";
    case "completed":         return "done";
    case "failed":            return "failed";
  }
}

// ─── Source Mapping ────────────────────────────────────────────────────────

export function sourceFromTask(task: WorkspaceTask): TaskSourceSurface {
  // Prefer sourceSurface (newer canonical field) over legacy source
  const src = (task.sourceSurface ?? task.source) as string;
  switch (src) {
    case "chat":          return "chat";
    case "call":          return "call";
    case "studio":        return "studio";
    case "voice":         return "voice";
    case "inbox":         return "inbox";
    case "collaboration": return "collaboration";
    case "external":      return "external";
    case "system":        return "system";
    default:              return "manual";
  }
}

export function sourceFromSession(s: WorkspaceRuntimeSession): TaskSourceSurface {
  switch (s.sourceType) {
    case "chat":   return "chat";
    case "studio": return "studio";
    default:       return "system";
  }
}

// ─── Source Badge ──────────────────────────────────────────────────────────

export function getSourceBadge(surface: TaskSourceSurface): SourceBadgeConfig {
  switch (surface) {
    case "chat":          return { label: "Chat",          colorClass: "text-blue-400/80 bg-blue-400/8" };
    case "studio":        return { label: "Studio",        colorClass: "text-violet-400/80 bg-violet-400/8" };
    case "call":          return { label: "Call",          colorClass: "text-emerald-400/80 bg-emerald-400/8" };
    case "voice":         return { label: "Voice",         colorClass: "text-emerald-400/80 bg-emerald-400/8" };
    case "inbox":         return { label: "Inbox",         colorClass: "text-amber-400/80 bg-amber-400/8" };
    case "collaboration": return { label: "Team",          colorClass: "text-cyan-400/80 bg-cyan-400/8" };
    case "external":      return { label: "External",      colorClass: "text-amber-400/80 bg-amber-400/8" };
    case "system":        return { label: "System",        colorClass: "text-malv-text/40 bg-malv-text/[0.04]" };
    default:              return { label: "Manual",        colorClass: "text-malv-text/40 bg-malv-text/[0.04]" };
  }
}

// ─── Posture Label ─────────────────────────────────────────────────────────

export function getPostureLabel(posture: TaskExecutionPosture): { text: string; colorClass: string } {
  switch (posture) {
    case "malv_handling":  return { text: "MALV handling",     colorClass: "text-emerald-400/85" };
    case "malv_queued":    return { text: "In queue",          colorClass: "text-malv-text/40" };
    case "needs_input":    return { text: "Needs your input",  colorClass: "text-amber-400/85" };
    case "needs_approval": return { text: "Needs approval",    colorClass: "text-amber-400/85" };
    case "blocked":        return { text: "Blocked",           colorClass: "text-amber-400/85" };
    case "scheduled":      return { text: "Scheduled",         colorClass: "text-violet-400/80" };
    case "done":           return { text: "Done",              colorClass: "text-malv-text/30" };
    case "failed":         return { text: "Needs attention",   colorClass: "text-rose-400/85" };
  }
}

// ─── Time Formatting ───────────────────────────────────────────────────────

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 60_000)           return "just now";
  if (diffMs < 3_600_000)        return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000)       return `${Math.floor(diffMs / 3_600_000)}h ago`;
  if (diffMs < 7 * 86_400_000)   return `${Math.floor(diffMs / 86_400_000)}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Row Builders ──────────────────────────────────────────────────────────

function sessionTitle(s: WorkspaceRuntimeSession): string {
  const m = s.metadata;
  if (m && typeof m === "object") {
    const t = (m as Record<string, unknown>).title;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  if (s.sourceType === "chat")   return "Chat execution";
  if (s.sourceType === "studio") return "Studio execution";
  return "Task execution";
}

export function buildSessionRow(s: WorkspaceRuntimeSession): TaskDisplayRow {
  const uiStatus  = mapSessionToUiStatus(s);
  const surface   = sourceFromSession(s);
  const posture   = inferPosture(uiStatus);
  const sortTime  = new Date(s.updatedAt).getTime();
  return {
    key:            `session:${s.id}`,
    kind:           "session",
    title:          sessionTitle(s),
    uiStatus,
    posture,
    sourceSurface:  surface,
    timeLabel:      formatRelativeTime(s.updatedAt),
    sortTime:       Number.isFinite(sortTime) ? sortTime : 0,
    conversationId: s.sourceType === "chat" ? s.sourceId : null,
    sessionId:      s.id,
    session:        s,
  };
}

export function buildTaskRow(task: WorkspaceTask): TaskDisplayRow {
  const uiStatus  = mapTaskToUiStatus(task);
  const surface   = sourceFromTask(task);
  const posture   = inferPosture(uiStatus);
  const sortIso   = task.updatedAt ?? task.createdAt;
  const sortTime  = sortIso ? new Date(sortIso).getTime() : 0;
  return {
    key:            `task:${task.id}`,
    kind:           "task",
    title:          task.title?.trim() || "Untitled task",
    uiStatus,
    posture,
    sourceSurface:  surface,
    timeLabel:      formatRelativeTime(sortIso),
    sortTime:       Number.isFinite(sortTime) ? sortTime : 0,
    conversationId: task.conversationId ?? null,
    sessionId:      null,
    task,
  };
}

// ─── Intent Parsing ────────────────────────────────────────────────────────

/** [pattern, display label] — first match wins */
const TIME_PATTERNS: Array<[RegExp, string]> = [
  [/\btonight\b/i,                                    "Tonight"],
  [/\btomorrow\s+(?:morning|afternoon|evening)?\b/i,  "Tomorrow"],
  [/\btoday\b/i,                                      "Today"],
  [/\bnext\s+(?:monday|tuesday|wednesday|thursday|friday|week|month)\b/i, "Next week"],
  [/\bthis\s+(?:monday|tuesday|wednesday|thursday|friday)\b/i,            "This week"],
  [/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,       "At time"],
  [/\bin\s+\d+\s+(?:hour|hr)s?\b/i,                  "In hours"],
  [/\bin\s+\d+\s+(?:minute|min)s?\b/i,                "Soon"],
  [/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, "This week"],
];

const PRIORITY_PATTERNS = [/\b(?:urgent|asap|critical|high.priority|immediately)\b/i];

const ACTION_PATTERNS: Array<[RegExp, "remind" | "schedule" | "execute"]> = [
  [/\b(?:remind\s+me|set\s+a?\s*reminder)\b/i, "remind"],
  [/\b(?:schedule|plan\s+for|set\s+up)\b/i,    "schedule"],
  [/\b(?:build|fix|implement|create|deploy|write|send|review|check|run)\b/i, "execute"],
];

export function parseTaskIntent(raw: string): ParsedTaskIntent {
  const trimmed = raw.trim();

  let dueHint:      string | null            = null;
  let priorityHint: "high" | null            = null;
  let actionHint:   "remind" | "schedule" | "execute" | null = null;

  for (const [pattern, label] of TIME_PATTERNS) {
    if (pattern.test(trimmed)) { dueHint = label; break; }
  }

  for (const pattern of PRIORITY_PATTERNS) {
    if (pattern.test(trimmed)) { priorityHint = "high"; break; }
  }

  for (const [pattern, action] of ACTION_PATTERNS) {
    if (pattern.test(trimmed)) { actionHint = action; break; }
  }

  return { raw, title: trimmed, dueHint, priorityHint, actionHint };
}

// ─── Filter predicate ──────────────────────────────────────────────────────

import type { TaskFilter } from "./taskTypes";

export function rowMatchesFilter(row: TaskDisplayRow, filter: TaskFilter): boolean {
  switch (filter) {
    // "all" = the active execution queue — excludes completed/done/archived rows
    case "all":        return row.uiStatus !== "completed";
    case "active":     return row.uiStatus === "running";
    case "queued":     return row.uiStatus === "queued" || row.uiStatus === "scheduled";
    case "waiting":
      return row.uiStatus === "awaiting_input" || row.uiStatus === "awaiting_approval" || row.uiStatus === "blocked";
    case "completed":  return row.uiStatus === "completed";
    case "from_chat":  return row.sourceSurface === "chat";
    case "from_studio":return row.sourceSurface === "studio";
    case "from_call":  return row.sourceSurface === "call" || row.sourceSurface === "voice";
  }
}
