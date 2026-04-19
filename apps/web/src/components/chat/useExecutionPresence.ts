/**
 * useExecutionPresence
 *
 * Deterministic execution-presence layer for the Task Run panel.
 *
 * ARCHITECTURE INTENT
 * ───────────────────
 * All derived UI state that makes execution feel directed, active, and
 * intelligent lives here. The pure resolver / enrichment functions are the
 * single integration seam for future model output: when a model becomes
 * available, swap or augment the return values of `resolveIntent`,
 * `enrichExecutionIntent`, `deriveExecutionPhase`, `deriveExecutionPosture`,
 * or `deriveBlockedDecisionContext`. The hook interface and every panel
 * rendering path remain unchanged.
 *
 * WHAT THIS MODULE OWNS
 * ─────────────────────
 * resolveIntent              — forward-looking "what MALV is trying to achieve"
 * enrichExecutionIntent      — makes raw step intent feel goal-oriented, not log-reactive
 * deriveExecutionPhase       — lightweight phase anchor (Planning / Analysis / Execution …)
 * deriveBlockedDecisionContext — specific blocked-context copy for the decision gate
 * summarizeGuidanceForReaction — causal reaction copy tied to the operator's instruction
 * deriveExecutionPosture     — subtle presence cue (progressing steadily / evaluating …)
 * resolveContextLine         — compact header status annotation
 * resolveProgressPct         — asymptotic 0→84% fill
 * humanizeStep               — normalises raw log text for display
 * useExecutionPresence       — React hook exposing all derived state + action callbacks
 *
 * WHAT THIS MODULE DOES NOT OWN
 * ─────────────────────────────
 * server fetching / polling (RuntimeDrawer), action handlers (RuntimeDrawer),
 * rendering (RuntimeDrawer), task isolation / generation ref (RuntimeDrawer)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceApproval, WorkspaceRuntimeLog } from "../../lib/api/dataPlane";

// ─── Input / output types ─────────────────────────────────────────────────────

export interface ExecutionPresenceInput {
  status:           string;
  sortedLogs:       WorkspaceRuntimeLog[];
  outputs:          Array<{ preview: string; createdAt: string }>;
  pendingApprovals: WorkspaceApproval[];
}

export interface ExecutionPresence {
  /** What MALV is currently trying to achieve. Forward-looking, enriched. */
  intent:      string;
  /** Compact status annotation for the panel header (step count, timing). */
  contextLine: string | null;
  /** 0–84: asymptotic fill while running. Never falsely signals completion. */
  progressPct: number;

  /**
   * Lightweight phase label — anchors progression to a named stage.
   * "Planning" | "Analysis" | "Execution" | "Validation" | "Finalization" |
   * "Deployment" | "Adapting" | "Blocked" | "" (empty = not applicable)
   */
  phase: string;
  /**
   * Subtle execution posture cue — communicates MALV's current operating mode.
   * Examples: "progressing steadily", "evaluating options", "final checks".
   * Intentionally low-emphasis; never a score or fake confidence bar.
   */
  posture: string;
  /**
   * Context-specific blocked message for the decision gate headline.
   * Null when status is not "waiting_approval".
   */
  blockedContext: string | null;

  /** Brief operator-action acknowledgment. Auto-clears after `durationMs`. */
  transitionMsg:       string | null;
  /** True for ~3.5 s after guidance is successfully submitted while running. */
  guidanceJustApplied: boolean;
  /**
   * Specific guidance reaction copy derived from the submitted text.
   * Example: "Adjusting execution to prioritize API-first approach".
   * Falls back to a generic phrase if text cannot be pattern-matched.
   * Cleared together with guidanceJustApplied.
   */
  lastGuidanceSummary: string | null;

  /** Set a temporary transition signal. Safe to call from any event handler. */
  setTransition: (msg: string, durationMs?: number) => void;
  /**
   * Trigger the guidance-applied feedback window.
   * Pass the raw guidance text for specific reaction copy; omit for generic.
   */
  setGuidanceFeedback: (guidanceText?: string) => void;
  /** Cancel all timers and reset short-lived state. Call on task switch. */
  clearPresence: () => void;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Converts a raw execution log entry into a human-readable step description.
 * Exported so RuntimeDrawer can build `executionFeed` identically to how the
 * hook sees the last step.
 */
export function humanizeStep(log: WorkspaceRuntimeLog): string {
  const text = (log.commandText ?? "").replace(/\s+/g, " ").trim();
  if (text && text.length < 140) return text;
  const cls = (log.commandClass ?? "")
    .replace(/^.*\./, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  return cls || "Step";
}

function elapsed(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function cap(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ─── Pure resolvers / enrichers ───────────────────────────────────────────────
// All functions below are intentionally pure (no React, no side effects).
// They are unit-testable, trivially composable, and trivially replaceable
// with model-generated output — the hook and the panel rendering never change.

/**
 * Enriches a raw "Executing: X" intent phrase so it sounds goal-oriented
 * rather than log-reactive.
 *
 * "Executing: Analyzing auth module"
 *   → "Analyzing auth module to determine next steps"
 *
 * "Executing: Implementing API integration"
 *   → "Implementing API integration as part of the execution plan"
 *
 * Phrases that don't start with "Executing:" are returned unchanged — they
 * are already enriched (idle fallback, guidance reaction, approval context, …).
 *
 * MODEL INTEGRATION POINT — override return value with model-generated copy.
 */
export function enrichExecutionIntent(rawIntent: string): string {
  if (!rawIntent.startsWith("Executing:")) return rawIntent;

  const action = rawIntent.slice("Executing:".length).trim();
  const lower  = action.toLowerCase();

  // Verb-first pattern matching — maps leading action verbs to goal completions
  if (/^analyz/.test(lower))                   return `${action} to determine next steps`;
  if (/^evaluat/.test(lower))                  return `${action} to identify the optimal approach`;
  if (/^implement/.test(lower))                return `${action} as part of the execution plan`;
  if (/^validat/.test(lower))                  return `${action} to ensure correctness`;
  if (/^verif/.test(lower))                    return `${action} before proceeding`;
  if (/^review/.test(lower))                   return `${action} before applying changes`;
  if (/^check/.test(lower))                    return `${action} to verify execution state`;
  if (/^appl/.test(lower))                     return `${action} to advance execution`;
  if (/^finaliz/.test(lower))                  return `${action} before completing execution`;
  if (/^prepar/.test(lower))                   return `${action} for the next execution step`;
  if (/^test/.test(lower))                     return `${action} to confirm expected behavior`;
  if (/^generat|^writ/.test(lower))            return `${action} as part of the execution plan`;
  if (/^fetch|^load|^retriev/.test(lower))     return `${action} to prepare for next step`;
  if (/^updat|^modif/.test(lower))             return `${action} as directed`;
  if (/^deploy|^publish|^releas|^commit/.test(lower)) return `${action} to complete this phase`;

  // Fallback — strip the "Executing: " prefix so it reads as a plain statement
  return action;
}

/**
 * Infers a lightweight phase label from current execution context.
 * Conservative — uses safe fallbacks when the phase cannot be determined.
 * Never fabricates specific plan structure.
 *
 * MODEL INTEGRATION POINT — override return value with a model-derived phase.
 */
export function deriveExecutionPhase(
  status:              string,
  stepCount:           number,
  lastStepText:        string | null,
  guidanceJustApplied: boolean,
): string {
  if (status === "waiting_approval") return "Blocked";
  if (status !== "running")          return "";
  if (guidanceJustApplied)           return "Adapting";
  if (stepCount === 0)               return "Planning";

  const lower = (lastStepText ?? "").toLowerCase();

  if (/analyz|evaluat|assess|investigat|examin|inspect/.test(lower)) return "Analysis";
  if (/validat|verif|check|test|confirm/.test(lower))                return "Validation";
  if (/finaliz|complet|finish|wrap|conclud/.test(lower))             return "Finalization";
  if (/prepar|plan|design|structur|initiali/.test(lower))            return "Planning";
  if (/deploy|publish|releas|commit/.test(lower))                    return "Deployment";

  // Conservative numeric fallback
  if (stepCount <= 2) return "Analysis";
  return "Execution";
}

/**
 * Produces a context-specific blocked-state message for the decision gate.
 * Uses the approval's actionDescription when available; falls back gracefully.
 *
 * MODEL INTEGRATION POINT — override return value with model-generated copy.
 */
export function deriveBlockedDecisionContext(approval: WorkspaceApproval | null): string {
  if (!approval) {
    return "MALV cannot proceed without your decision. Execution resumes immediately after you respond.";
  }
  const d     = approval.actionDescription.trim();
  const short = d.length > 65 ? `${d.slice(0, 62)}…` : d;
  return `${short} requires your approval before execution can continue.`;
}

/**
 * Produces a causal guidance-reaction phrase tied to the operator's instruction.
 * Makes the "guidance received" feedback feel like a specific response rather
 * than a generic acknowledgment.
 *
 * "prioritize API-first approach"  → "Adjusting execution to prioritize API-first approach"
 * "use staging before production"  → "Re-evaluating plan based on staging preference"
 * "focus on the login flow first"  → "Adjusting execution to focus on the login flow first"
 * "avoid using the legacy API"     → "Re-evaluating plan to avoid using the legacy API"
 *
 * Falls back to a polished generic phrase if no pattern matches.
 *
 * MODEL INTEGRATION POINT — override return value with model-generated copy.
 */
export function summarizeGuidanceForReaction(text: string): string {
  const lower = text.toLowerCase().trim();

  // Pattern pairs: [trigger substring, template prefix]
  const patterns: [string, string][] = [
    ["prioritize ",  "Adjusting execution to prioritize "],
    ["prioritise ",  "Adjusting execution to prioritize "],
    ["focus on ",    "Adjusting execution to focus on "],
    ["focus ",       "Adjusting execution to focus on "],
    ["use ",         "Re-evaluating plan based on "],
    ["avoid ",       "Re-evaluating plan to avoid "],
    ["skip ",        "Re-evaluating plan to skip "],
    ["don't ",       "Re-evaluating plan to avoid "],
    ["dont ",        "Re-evaluating plan to avoid "],
  ];

  for (const [trigger, template] of patterns) {
    const idx = lower.indexOf(trigger);
    if (idx !== -1) {
      const fragment = text.slice(idx + trigger.length).trim();
      // Take up to first hard punctuation or 40 chars
      const truncated = fragment.replace(/[.!?;].*$/, "").trim().slice(0, 40);
      if (truncated.length > 2) {
        const result = template + cap(truncated);
        return result.length > 80 ? `${result.slice(0, 77)}…` : result;
      }
    }
  }

  return "Incorporating your guidance into the execution path";
}

/**
 * Derives a subtle execution posture cue from current state.
 * This is a deterministic presence signal — not a score, not a confidence bar.
 * Kept low-emphasis so it enriches without creating noise.
 *
 * MODEL INTEGRATION POINT — override return value with model-derived posture.
 */
export function deriveExecutionPosture(
  status:              string,
  stepCount:           number,
  guidanceJustApplied: boolean,
  phase:               string,
): string {
  if (status === "waiting_approval") return "blocked pending decision";
  if (status === "idle")             return "ready to begin";
  if (status === "completed")        return "finished";
  if (status === "failed")           return "stopped — add guidance to retry";
  if (status !== "running")          return "";

  if (guidanceJustApplied) return "adapting to input";
  if (stepCount === 0)     return "initializing";

  switch (phase) {
    case "Validation":   return "final checks";
    case "Finalization": return "final checks";
    case "Analysis":     return "evaluating options";
    case "Planning":     return "preparing plan";
    case "Deployment":   return "applying changes";
    case "Adapting":     return "adapting to input";
    default:             return "progressing steadily";
  }
}

/**
 * Resolves what MALV is currently trying to achieve.
 *
 * Priority order:
 *   1. Blocking decision state  (operator must act)
 *   2. Guidance just applied    (system is reacting — use specific summary when available)
 *   3. Active execution phase   (step-level, enriched by enrichExecutionIntent)
 *   4. Finalization
 *   5. Failure / recovery
 *   6. Queued / idle fallback
 *
 * MODEL INTEGRATION POINT — replace return value with a model-generated string.
 * The enrichment helpers are still available as deterministic fallbacks.
 */
export function resolveIntent(
  status:              string,
  lastStepText:        string | null,
  lastOutputText:      string | null,
  pendingApproval:     WorkspaceApproval | null,
  stepCount:           number,
  guidanceJustApplied: boolean,
  lastGuidanceSummary: string | null,
): string {
  // 1. Blocking decision — surface the specific blocked action.
  if (status === "waiting_approval") {
    if (pendingApproval) {
      const d = pendingApproval.actionDescription.trim();
      return d.length > 80 ? `${d.slice(0, 77)}…` : d;
    }
    return "Waiting for your decision to continue…";
  }

  // 2. Guidance just applied — use specific reaction copy when available.
  if (status === "running" && guidanceJustApplied) {
    return lastGuidanceSummary ?? "Adjusting execution based on your guidance…";
  }

  // 3. Active execution — enrich the step description to feel directional.
  if (status === "running") {
    if (stepCount === 0) return "Preparing execution plan…";
    if (lastStepText) {
      const s = lastStepText.length > 72 ? `${lastStepText.slice(0, 69)}…` : lastStepText;
      return enrichExecutionIntent(`Executing: ${s}`);
    }
    if (lastOutputText) {
      const t = lastOutputText.trim().replace(/\.$/, "");
      return t.length > 80 ? `${t.slice(0, 77)}…` : t;
    }
    return "Progressing through execution plan…";
  }

  // 4. Finalization.
  if (status === "completed") {
    return lastOutputText?.trim() || "Task completed successfully";
  }

  // 5. Failure.
  if (status === "failed") {
    return "Execution stopped — add guidance below to retry or redirect";
  }

  // 6. Queued / idle.
  return "Ready to begin execution";
}

/**
 * Compact status annotation shown next to the status badge in the panel header.
 * Answers: where are we in the execution? how long did it take?
 */
export function resolveContextLine(
  status:        string,
  stepCount:     number,
  approvalCount: number,
  lastOutputAt:  string | null,
): string | null {
  switch (status) {
    case "running":
      return stepCount === 0 ? "Initializing…" : `Step ${stepCount} · active`;
    case "waiting_approval":
      return `${approvalCount} action${approvalCount !== 1 ? "s" : ""} blocking progress`;
    case "completed":
      return lastOutputAt ? `Finished ${elapsed(lastOutputAt)}` : "Execution finished";
    case "failed":
      return stepCount > 0
        ? `Stopped after ${stepCount} step${stepCount !== 1 ? "s" : ""}`
        : "Stopped before completing";
    default:
      return null;
  }
}

/**
 * Progress bar fill percentage (0–84).
 * f(n) = n / (n + 4), capped at 0.84
 *   n=1 → 20%   n=4 → 50%   n=8 → 67%   n=16 → 80%
 */
export function resolveProgressPct(stepCount: number): number {
  if (stepCount === 0) return 0;
  return Math.round(Math.min(stepCount / (stepCount + 4), 0.84) * 100);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useExecutionPresence
 *
 * Wraps all pure resolvers with React state for the short-lived perception
 * signals (transition message, guidance feedback, guidance summary).
 *
 * The hook is stable: callbacks never get new references after mount, so
 * callers can safely reference them in event handlers without exhaustive deps.
 *
 * MODEL INTEGRATION PATTERN
 * ─────────────────────────
 * When a model is available, feed model-generated strings into the hook via
 * a new optional `modelOverrides?` argument:
 *   { intent?: string; phase?: string; posture?: string }
 * The hook prefers model values and falls back to deterministic values.
 * The panel rendering requires zero changes.
 */
export function useExecutionPresence({
  status,
  sortedLogs,
  outputs,
  pendingApprovals,
}: ExecutionPresenceInput): ExecutionPresence {
  const [transitionMsg,       setTransitionMsg]       = useState<string | null>(null);
  const [guidanceJustApplied, setGuidanceJustApplied] = useState(false);
  const [lastGuidanceSummary, setLastGuidanceSummary] = useState<string | null>(null);

  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guidanceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel outstanding timers when the hook unmounts.
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      if (guidanceTimerRef.current)   clearTimeout(guidanceTimerRef.current);
    };
  }, []);

  // Stable callbacks — safe to reference from any event handler.
  const setTransition = useCallback((msg: string, durationMs = 4000) => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    setTransitionMsg(msg);
    transitionTimerRef.current = setTimeout(() => setTransitionMsg(null), durationMs);
  }, []);

  /**
   * Accepts an optional guidance text string. When provided, runs it through
   * `summarizeGuidanceForReaction` to produce specific reaction copy that is
   * surfaced via `lastGuidanceSummary` and piped into the intent line.
   */
  const setGuidanceFeedback = useCallback((guidanceText?: string) => {
    if (guidanceTimerRef.current) clearTimeout(guidanceTimerRef.current);
    const summary = guidanceText
      ? summarizeGuidanceForReaction(guidanceText)
      : null;
    setLastGuidanceSummary(summary);
    setGuidanceJustApplied(true);
    guidanceTimerRef.current = setTimeout(() => {
      setGuidanceJustApplied(false);
      setLastGuidanceSummary(null);
    }, 3500);
  }, []);

  const clearPresence = useCallback(() => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    if (guidanceTimerRef.current)   clearTimeout(guidanceTimerRef.current);
    setTransitionMsg(null);
    setGuidanceJustApplied(false);
    setLastGuidanceSummary(null);
  }, []);

  // Derive stable scalar inputs so memoised selectors don't thrash on every
  // poll response that returns the same logical values.
  const lastStep        = sortedLogs.length > 0 ? sortedLogs[sortedLogs.length - 1] : null;
  const lastOutput      = outputs.length > 0    ? outputs[outputs.length - 1]       : null;
  const pendingApproval = pendingApprovals.length > 0 ? pendingApprovals[0]         : null;

  const lastStepTextMemo = useMemo(
    () => (lastStep ? humanizeStep(lastStep) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastStep?.id],
  );

  const phase = useMemo(
    () => deriveExecutionPhase(status, sortedLogs.length, lastStepTextMemo, guidanceJustApplied),
    [status, sortedLogs.length, lastStepTextMemo, guidanceJustApplied],
  );

  const posture = useMemo(
    () => deriveExecutionPosture(status, sortedLogs.length, guidanceJustApplied, phase),
    [status, sortedLogs.length, guidanceJustApplied, phase],
  );

  const blockedContext = useMemo(
    () => (status === "waiting_approval" ? deriveBlockedDecisionContext(pendingApproval) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, pendingApproval?.id, pendingApproval?.actionDescription],
  );

  const intent = useMemo(
    () =>
      resolveIntent(
        status,
        lastStepTextMemo,
        lastOutput?.preview ?? null,
        pendingApproval ?? null,
        sortedLogs.length,
        guidanceJustApplied,
        lastGuidanceSummary,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, lastStepTextMemo, lastOutput?.preview, pendingApproval?.id, sortedLogs.length, guidanceJustApplied, lastGuidanceSummary],
  );

  const contextLine = useMemo(
    () =>
      resolveContextLine(
        status,
        sortedLogs.length,
        pendingApprovals.length,
        lastOutput?.createdAt ?? null,
      ),
    [status, sortedLogs.length, pendingApprovals.length, lastOutput?.createdAt],
  );

  const progressPct = useMemo(
    () => resolveProgressPct(sortedLogs.length),
    [sortedLogs.length],
  );

  return {
    intent,
    contextLine,
    progressPct,
    phase,
    posture,
    blockedContext,
    transitionMsg,
    guidanceJustApplied,
    lastGuidanceSummary,
    setTransition,
    setGuidanceFeedback,
    clearPresence,
  };
}
