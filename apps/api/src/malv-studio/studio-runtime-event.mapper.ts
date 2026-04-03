export type StudioRuntimeEventType = "phase_update" | "console_event" | "terminal_event" | "preview_state" | "apply_state";

export type StudioRuntimeEvent = {
  sessionId: string;
  at: number;
  type: StudioRuntimeEventType;
  payload: Record<string, unknown>;
};

export class StudioRuntimeEventMapper {
  mapRuntimeTruthRaw(args: { sessionId: string; source: "sandbox" | "job"; status: string; message?: string; progress?: number }): StudioRuntimeEvent[] {
    const out: StudioRuntimeEvent[] = [];
    if (args.source === "sandbox") {
      out.push(
        this.mapConsoleEvent({
          sessionId: args.sessionId,
          severity: args.status.includes("failed") || args.status.includes("blocked") ? "error" : "info",
          group: "sandbox",
          message: args.message ?? `Sandbox state: ${args.status}`
        })
      );
      out.push(this.mapPreviewState({ sessionId: args.sessionId, state: args.status.includes("failed") ? "error" : args.status === "completed" ? "ready" : "refining" }));
      out.push(this.mapPhaseUpdate({ sessionId: args.sessionId, phaseId: "rebuild", status: args.status, detail: args.message ?? "Runtime update from sandbox." }));
    } else {
      out.push(
        this.mapConsoleEvent({
          sessionId: args.sessionId,
          severity: args.status === "failed" ? "error" : "info",
          group: "job_runner",
          message: args.message ?? `Job state: ${args.status}${args.progress != null ? ` (${args.progress}%)` : ""}`
        })
      );
      out.push(this.mapPhaseUpdate({ sessionId: args.sessionId, phaseId: "update", status: args.status, detail: "Runtime update from job queue." }));
    }
    return out;
  }

  mapPhaseUpdate(args: { sessionId: string; phaseId: string; status: string; detail?: string }): StudioRuntimeEvent {
    return {
      sessionId: args.sessionId,
      at: Date.now(),
      type: "phase_update",
      payload: {
        phaseId: args.phaseId,
        status: args.status,
        detail: args.detail ?? null
      }
    };
  }

  mapConsoleEvent(args: {
    sessionId: string;
    severity: "info" | "warning" | "error";
    group: string;
    message: string;
  }): StudioRuntimeEvent {
    return {
      sessionId: args.sessionId,
      at: Date.now(),
      type: "console_event",
      payload: {
        severity: args.severity,
        group: args.group,
        message: args.message
      }
    };
  }

  mapTerminalEvent(args: { sessionId: string; command: string; group: string; success: boolean }): StudioRuntimeEvent {
    return {
      sessionId: args.sessionId,
      at: Date.now(),
      type: "terminal_event",
      payload: {
        command: args.command,
        group: args.group,
        success: args.success
      }
    };
  }

  mapPreviewState(args: { sessionId: string; state: "refining" | "ready" | "error"; reason?: string }): StudioRuntimeEvent {
    return {
      sessionId: args.sessionId,
      at: Date.now(),
      type: "preview_state",
      payload: {
        state: args.state,
        reason: args.reason ?? null
      }
    };
  }

  mapApplyState(args: {
    sessionId: string;
    state: "pending_approval" | "applying" | "applied" | "reverted" | "failed";
    riskLevel?: string;
    confidence?: string;
    message?: string;
  }): StudioRuntimeEvent {
    return {
      sessionId: args.sessionId,
      at: Date.now(),
      type: "apply_state",
      payload: {
        state: args.state,
        riskLevel: args.riskLevel ?? null,
        confidence: args.confidence ?? null,
        message: args.message ?? null
      }
    };
  }
}

