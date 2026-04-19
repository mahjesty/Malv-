import {
  MALV_TASK_SCAN_ELIGIBLE_STATES,
  malvDueAtReminderEligible,
  malvReminderTimeDue,
  malvScheduledTimeDue,
  malvShouldPromoteScheduledApprovalGate,
  malvTaskEngineScannableStatus,
  resolveMalvTaskExecutionRoute,
  type MalvTaskExecutionRoute
} from "./workspace-task-execution-engine.util";

const now = new Date("2026-04-13T12:00:00.000Z");

describe("workspace-task-execution-engine.util", () => {
  describe("malvReminderTimeDue / malvScheduledTimeDue", () => {
    it("detects reminder when reminderAt is in the past", () => {
      expect(malvReminderTimeDue({ reminderAt: new Date(now.getTime() - 60_000) }, now)).toBe(true);
    });
    it("ignores future reminderAt", () => {
      expect(malvReminderTimeDue({ reminderAt: new Date(now.getTime() + 60_000) }, now)).toBe(false);
    });
    it("detects scheduled when scheduledFor is due", () => {
      expect(malvScheduledTimeDue({ scheduledFor: new Date(now.getTime() - 1) }, now)).toBe(true);
    });
    it("ignores future scheduledFor", () => {
      expect(malvScheduledTimeDue({ scheduledFor: new Date(now.getTime() + 60_000) }, now)).toBe(false);
    });
  });

  describe("malvDueAtReminderEligible", () => {
    it("fires for reminder types when only dueAt is set and due", () => {
      expect(
        malvDueAtReminderEligible(
          {
            dueAt: new Date(now.getTime() - 1),
            reminderAt: null,
            scheduledFor: null,
            executionType: "reminder_only"
          },
          now
        )
      ).toBe(true);
    });
    it("does not fire when reminder_at is also set (reminder path handles it)", () => {
      expect(
        malvDueAtReminderEligible(
          {
            dueAt: new Date(now.getTime() - 1),
            reminderAt: new Date(now.getTime() - 1),
            scheduledFor: null,
            executionType: "reminder_only"
          },
          now
        )
      ).toBe(false);
    });
  });

  describe("malvTaskEngineScannableStatus", () => {
    it("allows todo and in_progress", () => {
      expect(malvTaskEngineScannableStatus("todo")).toBe(true);
      expect(malvTaskEngineScannableStatus("in_progress")).toBe(true);
    });
    it("excludes done and archived", () => {
      expect(malvTaskEngineScannableStatus("done")).toBe(false);
      expect(malvTaskEngineScannableStatus("archived")).toBe(false);
    });
  });

  describe("malvShouldPromoteScheduledApprovalGate", () => {
    it("is true when approval required and scheduled time is due", () => {
      expect(
        malvShouldPromoteScheduledApprovalGate(
          {
            requiresApproval: true,
            scheduledFor: new Date(now.getTime() - 1),
            executionState: "idle"
          },
          now
        )
      ).toBe(true);
    });
    it("is false without approval", () => {
      expect(
        malvShouldPromoteScheduledApprovalGate(
          {
            requiresApproval: false,
            scheduledFor: new Date(now.getTime() - 1),
            executionState: "idle"
          },
          now
        )
      ).toBe(false);
    });
    it("is false when already failed", () => {
      expect(
        malvShouldPromoteScheduledApprovalGate(
          {
            requiresApproval: true,
            scheduledFor: new Date(now.getTime() - 1),
            executionState: "failed"
          },
          now
        )
      ).toBe(false);
    });
  });

  describe("resolveMalvTaskExecutionRoute", () => {
    const route = (t: Partial<Parameters<typeof resolveMalvTaskExecutionRoute>[0]>): MalvTaskExecutionRoute =>
      resolveMalvTaskExecutionRoute({
        executionType: "manual",
        sourceSurface: "manual",
        source: "manual",
        callSessionId: null,
        conversationId: null,
        metadata: null,
        ...t
      } as Parameters<typeof resolveMalvTaskExecutionRoute>[0]);

    it("respects metadata.malvExecutionRoute", () => {
      expect(route({ metadata: { malvExecutionRoute: "external_action" } })).toBe("external_action");
    });
    it("maps legacy execution types", () => {
      expect(route({ executionType: "reminder" })).toBe("reminder_only");
      expect(route({ executionType: "automated" })).toBe("workflow_task");
      expect(route({ executionType: "scheduled" })).toBe("manual_checklist");
    });
    it("infers call_followup from callSessionId", () => {
      expect(route({ executionType: "manual", callSessionId: "call-1" })).toBe("call_followup");
    });
    it("infers chat_followup from conversationId", () => {
      expect(route({ executionType: "manual", conversationId: "c1" })).toBe("chat_followup");
    });
    it("infers external_action from surface", () => {
      expect(route({ executionType: "manual", sourceSurface: "external", source: "external" })).toBe("external_action");
    });
  });

  describe("idempotency guard (eligible states)", () => {
    it("does not include dispatched/running so claimed tasks cannot be re-scanned", () => {
      expect(MALV_TASK_SCAN_ELIGIBLE_STATES).not.toContain("dispatched");
      expect(MALV_TASK_SCAN_ELIGIBLE_STATES).not.toContain("running");
      expect(MALV_TASK_SCAN_ELIGIBLE_STATES).not.toContain("waiting_approval");
      expect(MALV_TASK_SCAN_ELIGIBLE_STATES).not.toContain("completed");
    });
  });
});
