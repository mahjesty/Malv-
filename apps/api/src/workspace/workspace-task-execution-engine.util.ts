import type { WorkspaceTaskEntity, WorkspaceTaskExecutionType } from "../db/entities/workspace-task.entity";

export type MalvTaskExecutionRoute =
  | "reminder_only"
  | "call_followup"
  | "chat_followup"
  | "external_action"
  | "workflow_task"
  | "manual_checklist";

const ROUTES: ReadonlySet<string> = new Set<MalvTaskExecutionRoute>([
  "reminder_only",
  "call_followup",
  "chat_followup",
  "external_action",
  "workflow_task",
  "manual_checklist"
]);

/** Engine states that may be picked up by the due-task scanner. */
export const MALV_TASK_SCAN_ELIGIBLE_STATES = [
  "idle",
  "pending",
  "scheduled",
  "due"
] as const;

export type MalvTaskScanEligibleState = (typeof MALV_TASK_SCAN_ELIGIBLE_STATES)[number];

export function isMalvTaskScanEligibleState(s: string): s is MalvTaskScanEligibleState {
  return (MALV_TASK_SCAN_ELIGIBLE_STATES as readonly string[]).includes(s);
}

export function malvReminderTimeDue(task: { reminderAt?: Date | null }, now: Date): boolean {
  return Boolean(task.reminderAt && task.reminderAt.getTime() <= now.getTime());
}

export function malvScheduledTimeDue(task: { scheduledFor?: Date | null }, now: Date): boolean {
  return Boolean(task.scheduledFor && task.scheduledFor.getTime() <= now.getTime());
}

/** When only `due_at` is set on a reminder-type task, treat it like a reminder trigger. */
export function malvDueAtReminderEligible(
  task: Pick<WorkspaceTaskEntity, "dueAt" | "reminderAt" | "scheduledFor" | "executionType">,
  now: Date
): boolean {
  if (!task.dueAt || task.dueAt.getTime() > now.getTime()) return false;
  if (task.reminderAt || task.scheduledFor) return false;
  const et = task.executionType;
  return et === "reminder" || et === "reminder_only";
}

export function malvTaskEngineScannableStatus(status: string): boolean {
  return status === "todo" || status === "in_progress";
}

export function malvShouldPromoteScheduledApprovalGate(
  task: {
    requiresApproval: boolean;
    scheduledFor?: Date | null;
    executionState: string;
  },
  now: Date
): boolean {
  return (
    task.requiresApproval &&
    malvScheduledTimeDue(task, now) &&
    isMalvTaskScanEligibleState(task.executionState)
  );
}

/**
 * Resolve how the engine should treat a task. Prefer `metadata.malvExecutionRoute` when set.
 * Maps legacy `WorkspaceTaskExecutionType` values without requiring every client to migrate.
 */
export function resolveMalvTaskExecutionRoute(
  task: Pick<
    WorkspaceTaskEntity,
    "executionType" | "sourceSurface" | "source" | "callSessionId" | "conversationId" | "metadata"
  >
): MalvTaskExecutionRoute {
  const meta = task.metadata;
  if (meta && typeof meta === "object") {
    const hint = (meta as Record<string, unknown>).malvExecutionRoute;
    if (typeof hint === "string" && ROUTES.has(hint)) {
      return hint as MalvTaskExecutionRoute;
    }
  }

  const et = task.executionType as WorkspaceTaskExecutionType;
  switch (et) {
    case "reminder_only":
    case "reminder":
      return "reminder_only";
    case "call_followup":
      return "call_followup";
    case "chat_followup":
      return "chat_followup";
    case "external_action":
      return "external_action";
    case "workflow_task":
      return "workflow_task";
    case "manual_checklist":
      return "manual_checklist";
    case "automated":
      return "workflow_task";
    case "scheduled":
      return "manual_checklist";
    case "approval_gate":
      return "manual_checklist";
    case "manual":
    default:
      break;
  }

  if (task.callSessionId) return "call_followup";
  if (task.conversationId) return "chat_followup";
  const surface = (task.sourceSurface ?? task.source) as string;
  if (surface === "external") return "external_action";
  return "manual_checklist";
}
