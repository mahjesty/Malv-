/**
 * MALV Task Domain — Frontend type layer.
 *
 * These types live alongside the backend WorkspaceTask/WorkspaceRuntimeSession
 * types and enrich them for the UI without requiring backend changes.
 * The backend types remain the source of truth; these are derived views.
 */
import type { WorkspaceTask, WorkspaceRuntimeSession } from "../api/dataPlane";

// ─── Status ────────────────────────────────────────────────────────────────

/**
 * Unified UI status that spans both workspace tasks and runtime sessions.
 * Maps from backend `WorkspaceTaskStatus` + `WorkspaceRuntimeSession["status"]`.
 */
export type TaskUiStatus =
  | "queued"            // Todo, pending, not yet dispatched
  | "scheduled"         // Scheduled for a future time
  | "awaiting_input"    // MALV is waiting on user to provide something
  | "awaiting_approval" // Blocked on approval gate
  | "running"           // Actively executing (session running or task in_progress)
  | "blocked"           // Engine paused truthfully (manual step, unsupported bridge, policy)
  | "completed"         // Done successfully
  | "failed";           // Failed, needs attention

// ─── Source ────────────────────────────────────────────────────────────────

/**
 * Where the task originated.
 * Extends backend `WorkspaceTaskSource` ("call" | "chat" | "manual")
 * and adds surfaces not yet in the backend type.
 */
export type TaskSourceSurface =
  | "chat"          // Created from a chat conversation
  | "studio"        // Created from a Studio session/action
  | "call"          // Created during a voice or video call
  | "voice"         // Created via Hey MALV / voice trigger
  | "inbox"         // Created from an inbox/approval action
  | "collaboration" // Created in a collaboration room
  | "manual"        // User typed directly on the Tasks page
  | "external"      // Future: share-in, device agent, email bridge
  | "system";       // Internal/MALV-initiated

// ─── Execution Posture ─────────────────────────────────────────────────────

/**
 * Who is responsible for advancing this task right now.
 * Used for the posture indicator on each task row.
 */
export type TaskExecutionPosture =
  | "malv_handling"    // MALV is actively working on this
  | "malv_queued"      // MALV will handle this — in queue
  | "needs_input"      // User must provide something to continue
  | "needs_approval"   // Blocked on explicit user approval
  | "blocked"          // Cannot proceed without user or missing capability
  | "scheduled"        // Will auto-run at a scheduled time
  | "done"             // Completed — no action needed
  | "failed";          // Needs user attention

// ─── Display Row ───────────────────────────────────────────────────────────

/**
 * Unified display row for the Tasks page.
 * A row can represent either a WorkspaceTask or a WorkspaceRuntimeSession.
 * All fields are pre-computed for fast rendering.
 */
export interface TaskDisplayRow {
  /** Stable unique key for React rendering */
  key: string;
  /** Whether this row represents a manual task or a runtime execution session */
  kind: "task" | "session";
  /** Display title */
  title: string;
  /** Unified UI status */
  uiStatus: TaskUiStatus;
  /** Who is responsible right now */
  posture: TaskExecutionPosture;
  /** Where this task came from */
  sourceSurface: TaskSourceSurface;
  /** Human-readable time label (relative) */
  timeLabel: string;
  /** Unix ms for sorting */
  sortTime: number;
  /** Chat conversation this is linked to, for deep linking */
  conversationId: string | null;
  /** Runtime session id, for opening the drawer */
  sessionId: string | null;
  /** Raw task (if kind === "task") */
  task?: WorkspaceTask;
  /** Raw session (if kind === "session") */
  session?: WorkspaceRuntimeSession;
}

// ─── Task Filter ───────────────────────────────────────────────────────────

export type TaskFilter =
  | "all"
  | "active"
  | "queued"
  | "waiting"
  | "completed"
  | "from_chat"
  | "from_studio"
  | "from_call";

export const TASK_FILTER_LABELS: Record<TaskFilter, string> = {
  all:        "All",
  active:     "Active",
  queued:     "Queued",
  waiting:    "Waiting",
  completed:  "Completed",
  from_chat:  "Chat",
  from_studio: "Studio",
  from_call:  "Call",
};

// ─── Smart Capture Intent ──────────────────────────────────────────────────

/**
 * Parsed intent from the natural-language capture input.
 * Purely frontend — no backend round-trip.
 * Used to show contextual chips while the user types.
 */
export interface ParsedTaskIntent {
  /** Original raw input */
  raw: string;
  /** Cleaned title (temporal/meta phrases not stripped — user controls final title) */
  title: string;
  /** Human-readable time reference detected, or null */
  dueHint: string | null;
  /** Priority signal detected */
  priorityHint: "high" | null;
  /** What kind of action is being requested */
  actionHint: "remind" | "schedule" | "execute" | null;
}

// ─── Source Badge Config ───────────────────────────────────────────────────

export interface SourceBadgeConfig {
  label: string;
  /** Tailwind text + bg color pair, safe to use in className */
  colorClass: string;
}
