import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ListTodo,
  Loader2,
  RotateCcw,
  X,
  Zap
} from "lucide-react";
import { useAuth } from "../../lib/auth/AuthContext";
import { useMalvAppShell, type RuntimeEntryContext } from "../../lib/context/MalvAppShellContext";
import {
  createWorkspaceTask,
  decideWorkspaceApproval,
  fetchWorkspaceApprovals,
  fetchWorkspaceRuntimeSessionsList,
  type WorkspaceApproval,
  type WorkspaceRuntimeSession,
  type WorkspaceTaskPriority,
  type WorkspaceTaskRiskLevel,
} from "../../lib/api/dataPlane";
import { parseNestErrorMessage } from "../../lib/api/http-core";
import { ensureChatRuntimeSessionId, findChatRuntimeSessionId } from "../../lib/workspace/resolveRuntimeSession";
import { MobileSidebarTrigger } from "../../components/navigation/MobileSidebarTrigger";

// ─── Deterministic helpers ─────────────────────────────────────────────────────
// All functions are pure — no model, no side effects.
// MODEL INTEGRATION POINT: replace return values with model-generated strings.

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000)     return "just now";
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function resolveSourceLabel(source: string): string {
  switch (source.toLowerCase()) {
    case "chat":   return "Chat";
    case "task":   return "Task";
    case "studio": return "Studio";
    case "call":   return "Call";
    case "inbox":  return "Inbox";
    default:       return source.charAt(0).toUpperCase() + source.slice(1);
  }
}

/**
 * Deterministic recommended next action — derived from item type and state only.
 * MODEL INTEGRATION POINT — replace return value with model-generated copy.
 */
function resolveApprovalRecommendation(approval: WorkspaceApproval): string {
  if (approval.status === "pending") {
    const risk = (approval.riskLevel ?? "").toLowerCase();
    if (risk === "high")   return "Review impact carefully before approving";
    if (risk === "medium") return "Verify this action before approving";
    return "Approve to resume execution";
  }
  if (approval.status === "approved") {
    return approval.conversationId ? "Open run to review the result" : "Execution resumed";
  }
  return "Re-evaluate approach with MALV";
}

function resolveSessionRecommendation(session: WorkspaceRuntimeSession): string {
  switch (session.sourceType) {
    case "task":   return "Task run stopped — investigate and retry";
    case "chat":   return "Chat-triggered run failed — review context";
    case "studio": return "Studio run failed — review and retry";
    default:       return "Investigate execution and retry";
  }
}

type RiskStyle = { bg: string; color: string; border: string };

function resolveRiskStyle(risk: string): RiskStyle {
  switch (risk.toLowerCase()) {
    case "high":
      return { bg: "rgba(248,113,113,0.1)",  color: "rgba(248,113,113,0.9)", border: "1px solid rgba(248,113,113,0.22)" };
    case "medium":
      return { bg: "rgba(251,191,36,0.1)",   color: "rgba(251,191,36,0.9)", border: "1px solid rgba(251,191,36,0.22)" };
    default:
      return { bg: "rgb(var(--malv-surface-raised-rgb))", color: "rgb(var(--malv-muted-rgb))", border: "1px solid rgb(var(--malv-border-rgb) / 0.12)" };
  }
}

// ─── Task payload builders ────────────────────────────────────────────────────
// Fully deterministic — no model dependency.
// Priority and risk are mapped directly from existing inbox item data.
// sourceReferenceId preserves traceability from inbox item to created task.
// MODEL INTEGRATION POINT: enrich title/description with model-generated copy.

function resolveInboxPriority(riskLevel: string): WorkspaceTaskPriority {
  switch (riskLevel.toLowerCase()) {
    case "critical": return "urgent";
    case "high":     return "high";
    case "medium":   return "normal";
    default:         return "normal";
  }
}

function resolveInboxRiskLevel(riskLevel: string): WorkspaceTaskRiskLevel | undefined {
  switch (riskLevel.toLowerCase()) {
    case "critical": return "critical";
    case "high":     return "high";
    case "medium":   return "medium";
    case "low":      return "low";
    default:         return undefined;
  }
}

/**
 * Derives a task title from an approval's action description.
 * Cleans and truncates to be suitable as a task title.
 */
function buildApprovalTaskTitle(approval: WorkspaceApproval): string {
  const desc = approval.actionDescription.trim();
  if (!desc) return "Re-evaluate declined action";
  // Strip leading verbs like "The system will..." to get to the action
  const cleaned = desc.replace(/^(The system will|MALV will|Action:)\s*/i, "");
  return cleaned.length > 72 ? `${cleaned.slice(0, 69)}…` : cleaned;
}

/**
 * Derives a task title from a failed runtime session.
 * SOURCE of truth: session.sourceType determines the execution context.
 */
function buildSessionTaskTitle(session: WorkspaceRuntimeSession): string {
  switch (session.sourceType) {
    case "task":   return "Retry failed task execution";
    case "chat":   return "Retry failed chat-triggered run";
    case "studio": return "Retry failed Studio run";
    default:       return "Retry failed execution";
  }
}

// ─── Page component ───────────────────────────────────────────────────────────

export function InboxPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();
  const { openRuntimeDrawer } = useMalvAppShell();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [decidingId,    setDecidingId]    = useState<string | null>(null);
  const [openingConvId, setOpeningConvId] = useState<string | null>(null);

  // Conversion state — tracked client-side.
  // convertingIds: items currently mid-request
  // convertedIds:  items successfully committed to Tasks in this session
  const [convertingIds, setConvertingIds] = useState<Set<string>>(() => new Set());
  const [convertedIds,  setConvertedIds]  = useState<Set<string>>(() => new Set());

  // Ref to prevent double-submit
  const convertingRef = useRef<Set<string>>(new Set());

  const approvalsQ = useQuery({
    queryKey: ["workspace", "approvals", "inbox"],
    queryFn: async () => {
      const [pending, approved, rejected] = await Promise.all([
        fetchWorkspaceApprovals(token!, { status: "pending",  limit: 40 }),
        fetchWorkspaceApprovals(token!, { status: "approved", limit: 20 }),
        fetchWorkspaceApprovals(token!, { status: "rejected", limit: 20 })
      ]);
      return {
        pending:  pending.ok  ? pending.approvals  ?? [] : [],
        approved: approved.ok ? approved.approvals ?? [] : [],
        rejected: rejected.ok ? rejected.approvals ?? [] : []
      };
    },
    enabled: Boolean(token),
    refetchInterval: 10_000
  });

  const sessionsQ = useQuery({
    queryKey: ["workspace", "runtime-sessions", "inbox"],
    queryFn: () => fetchWorkspaceRuntimeSessionsList(token!, { limit: 50 }),
    enabled: Boolean(token),
    refetchInterval: 12_000
  });

  const runtimeSessions: WorkspaceRuntimeSession[] = sessionsQ.data?.ok ? sessionsQ.data.sessions ?? [] : [];
  const failedSessions = useMemo(() => runtimeSessions.filter((s) => s.status === "failed"), [runtimeSessions]);

  const urlSessionId = searchParams.get("runtimeSessionId")?.trim() ?? "";
  useEffect(() => {
    if (!urlSessionId) return;
    openRuntimeDrawer({ sessionId: urlSessionId });
  }, [urlSessionId, openRuntimeDrawer]);

  const pushRuntime = useCallback(
    (sessionId: string, entryContext?: RuntimeEntryContext) => {
      openRuntimeDrawer({ sessionId, entryContext });
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("runtimeSessionId", sessionId);
          return next;
        },
        { replace: true }
      );
    },
    [openRuntimeDrawer, setSearchParams]
  );

  const openCompletedRuntime = useCallback(
    async (conversationId: string) => {
      if (!token) return;
      setOpeningConvId(conversationId);
      try {
        let sid = findChatRuntimeSessionId(runtimeSessions, conversationId);
        if (!sid) sid = await ensureChatRuntimeSessionId(token, conversationId);
        await queryClient.invalidateQueries({ queryKey: ["workspace", "runtime-sessions"] });
        pushRuntime(sid, { intent: "Reviewing completed run", sourceAction: "open_run" });
      } catch {
        navigate(`/app/chat?conversationId=${encodeURIComponent(conversationId)}`);
      } finally {
        setOpeningConvId(null);
      }
    },
    [navigate, pushRuntime, queryClient, runtimeSessions, token]
  );

  const onDecide = async (a: WorkspaceApproval, decision: "approved" | "rejected") => {
    if (!token) return;
    setDecidingId(a.id);
    try {
      await decideWorkspaceApproval(token, a.id, decision);
      await queryClient.invalidateQueries({ queryKey: ["workspace", "approvals"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace", "runtime-sessions"] });
    } catch (e) {
      window.alert(e instanceof Error ? parseNestErrorMessage(e) : "Could not record decision.");
    } finally {
      setDecidingId(null);
    }
  };

  /**
   * Convert a failed session into a structured Task.
   *
   * Payload is fully deterministic — no model dependency:
   *   title        ← derived from session.sourceType
   *   priority     ← "high" (failed executions are always high priority)
   *   source/surface ← "inbox" (canonical intake surface)
   *   sourceType   ← "runtime_session" (for traceability)
   *   sourceRef    ← session.id (preserves inbox → task lineage)
   *   conversationId ← session.sourceId if source was chat
   */
  const convertSessionToTask = useCallback(
    async (session: WorkspaceRuntimeSession) => {
      if (!token || convertingRef.current.has(session.id)) return;
      convertingRef.current.add(session.id);
      setConvertingIds((prev) => new Set([...prev, session.id]));
      try {
        const res = await createWorkspaceTask(token, {
          title:             buildSessionTaskTitle(session),
          description:       resolveSessionRecommendation(session),
          status:            "todo",
          priority:          "high",
          source:            "inbox",
          sourceSurface:     "inbox",
          sourceType:        "runtime_session",
          sourceReferenceId: session.id,
          executionType:     "manual",
          riskLevel:         "high",
          conversationId:    session.sourceType === "chat" ? session.sourceId : null,
        });
        if (!res.ok) throw new Error("Could not create task.");
        // Bring new task into the Tasks queue immediately
        await queryClient.invalidateQueries({ queryKey: ["workspace", "tasks"] });
        setConvertedIds((prev) => new Set([...prev, session.id]));
      } catch (e) {
        window.alert(e instanceof Error ? parseNestErrorMessage(e) : "Could not convert to task.");
      } finally {
        convertingRef.current.delete(session.id);
        setConvertingIds((prev) => {
          const next = new Set(prev);
          next.delete(session.id);
          return next;
        });
      }
    },
    [token, queryClient]
  );

  /**
   * Convert a declined approval into a structured Task.
   *
   * Payload is fully deterministic — no model dependency:
   *   title        ← cleaned approval.actionDescription (≤72 chars)
   *   priority     ← mapped from approval.riskLevel
   *   source/surface ← "inbox"
   *   sourceType   ← "approval" (for traceability)
   *   sourceRef    ← approval.id (preserves inbox → task lineage)
   *   riskLevel    ← mapped from approval.riskLevel
   *   conversationId ← approval.conversationId (preserves chat context)
   */
  const convertApprovalToTask = useCallback(
    async (approval: WorkspaceApproval) => {
      if (!token || convertingRef.current.has(approval.id)) return;
      convertingRef.current.add(approval.id);
      setConvertingIds((prev) => new Set([...prev, approval.id]));
      try {
        const res = await createWorkspaceTask(token, {
          title:             buildApprovalTaskTitle(approval),
          description:       resolveApprovalRecommendation(approval),
          status:            "todo",
          priority:          resolveInboxPriority(approval.riskLevel ?? ""),
          source:            "inbox",
          sourceSurface:     "inbox",
          sourceType:        "approval",
          sourceReferenceId: approval.id,
          executionType:     "manual",
          riskLevel:         resolveInboxRiskLevel(approval.riskLevel ?? ""),
          conversationId:    approval.conversationId,
          callSessionId:     approval.callSessionId,
        });
        if (!res.ok) throw new Error("Could not create task.");
        // Bring new task into the Tasks queue immediately
        await queryClient.invalidateQueries({ queryKey: ["workspace", "tasks"] });
        setConvertedIds((prev) => new Set([...prev, approval.id]));
      } catch (e) {
        window.alert(e instanceof Error ? parseNestErrorMessage(e) : "Could not convert to task.");
      } finally {
        convertingRef.current.delete(approval.id);
        setConvertingIds((prev) => {
          const next = new Set(prev);
          next.delete(approval.id);
          return next;
        });
      }
    },
    [token, queryClient]
  );

  const loading       = approvalsQ.isLoading || sessionsQ.isLoading;
  const err           = approvalsQ.error ?? sessionsQ.error;
  const pending       = approvalsQ.data?.pending  ?? [];
  const approvedItems = approvalsQ.data?.approved ?? [];
  const rejectedItems = approvalsQ.data?.rejected ?? [];

  const hasAlerts  = failedSessions.length > 0 || rejectedItems.length > 0;
  const hasContent = pending.length > 0 || approvedItems.length > 0 || hasAlerts;

  return (
    <div className="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4 pb-28 pt-6 sm:px-6 lg:pb-12">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="mb-7 flex items-start gap-3">
        <MobileSidebarTrigger />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1
              className="text-[18px] font-semibold tracking-tight"
              style={{ color: "rgb(var(--malv-text-rgb))" }}
            >
              Inbox
            </h1>
            {pending.length > 0 && (
              <span
                className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
                style={{
                  background: "rgb(251 191 36 / 0.16)",
                  color:      "rgb(251 191 36 / 0.95)",
                  border:     "1px solid rgb(251 191 36 / 0.22)"
                }}
              >
                {pending.length}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px]" style={{ color: "rgb(var(--malv-muted-rgb))" }}>
            Triage incoming decisions and execution signals
          </p>
        </div>
      </header>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {err ? (
        <div
          className="mb-5 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px]"
          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.16)", color: "rgba(248,113,113,0.9)" }}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {err instanceof Error ? parseNestErrorMessage(err) : "Could not load inbox."}
        </div>
      ) : null}

      {/* ── Loading skeleton ─────────────────────────────────────────────────── */}
      {loading ? (
        <InboxSkeleton />
      ) : (
        <div className="space-y-8">

          {/* ── Section: Action required ──────────────────────────────────────
              Pending approvals — highest urgency. Always rendered.          */}
          <section>
            <InboxSectionHeader
              label="Action required"
              count={pending.length}
              variant="urgent"
            />
            {pending.length > 0 ? (
              <ul className="space-y-2.5">
                <AnimatePresence initial={false}>
                {pending.map((a, idx) => (
                    <DecisionCard
                    key={a.id}
                    approval={a}
                    deciding={decidingId === a.id}
                    onApprove={() => void onDecide(a, "approved")}
                    onReject={() => void onDecide(a, "rejected")}
                    index={idx}
                  />
                ))}
                </AnimatePresence>
              </ul>
            ) : (
              <InboxEmptySection message="No pending decisions. MALV is running autonomously." />
            )}
          </section>

          {/* ── Section: Needs attention ──────────────────────────────────────
              Failed executions + declined approvals.
              Both types support "Convert to task" — these are unresolved
              signals that need to be committed to execution.              */}
          {hasAlerts && (
            <section>
              <InboxSectionHeader
                label="Needs attention"
                count={failedSessions.length + rejectedItems.length}
                variant="error"
              />
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {failedSessions.map((s, idx) => (
                    <FailedRunCard
                      key={`fail-${s.id}`}
                      session={s}
                      converting={convertingIds.has(s.id)}
                      converted={convertedIds.has(s.id)}
                      onOpen={() => pushRuntime(s.id, { intent: "Investigating failed execution", sourceAction: "open_run" })}
                      onConvert={() => void convertSessionToTask(s)}
                      onViewTasks={() => navigate("/app/tasks")}
                    index={idx}
                  />
                ))}
                  {rejectedItems.slice(0, 8).map((a, idx) => (
                    <DeclinedRow
                      key={`rej-${a.id}`}
                      approval={a}
                      converting={convertingIds.has(a.id)}
                      converted={convertedIds.has(a.id)}
                      onConvert={() => void convertApprovalToTask(a)}
                      onViewTasks={() => navigate("/app/tasks")}
                      index={failedSessions.length + idx}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          )}

          {/* ── Section: Completed ────────────────────────────────────────────
              Approved approvals — reference, results.
              No conversion: these are already resolved.                    */}
          {approvedItems.length > 0 && (
            <section>
              <InboxSectionHeader
                label="Completed"
                count={approvedItems.length}
                variant="default"
              />
              <ul className="space-y-1">
                <AnimatePresence initial={false}>
                  {approvedItems.slice(0, 12).map((a, idx) => (
                    <CompletedRow
                      key={a.id}
                      approval={a}
                      opening={openingConvId === a.conversationId}
                      onOpen={a.conversationId ? () => void openCompletedRuntime(a.conversationId!) : undefined}
                    index={idx}
                  />
                ))}
                </AnimatePresence>
              </ul>
            </section>
          )}

          {/* ── Empty state ───────────────────────────────────────────────── */}
          {!loading && !hasContent && (
            <InboxEmptyState />
          )}

        </div>
      )}
    </div>
  );
}

// ─── Primitive badges ─────────────────────────────────────────────────────────

function StateChip({
  label,
  variant
}: {
  label: string;
  variant: "decision" | "approved" | "declined" | "failed" | "converted";
}) {
  const styles: Record<typeof variant, { bg: string; color: string; border: string; ping?: boolean }> = {
    decision:  { bg: "rgba(251,191,36,0.12)",  color: "rgba(251,191,36,0.95)",  border: "1px solid rgba(251,191,36,0.24)", ping: true },
    approved:  { bg: "rgba(52,211,153,0.1)",   color: "rgba(52,211,153,0.88)",  border: "1px solid rgba(52,211,153,0.2)"  },
    declined:  { bg: "rgba(248,113,113,0.08)", color: "rgba(248,113,113,0.72)", border: "1px solid rgba(248,113,113,0.16)" },
    failed:    { bg: "rgba(248,113,113,0.1)",  color: "rgba(248,113,113,0.88)", border: "1px solid rgba(248,113,113,0.22)" },
    converted: { bg: "rgba(52,211,153,0.1)",   color: "rgba(52,211,153,0.82)",  border: "1px solid rgba(52,211,153,0.18)" },
  };
  const s = styles[variant];
  return (
      <span
      className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em]"
      style={{ background: s.bg, color: s.color, border: s.border }}
    >
      {s.ping ? (
        <span className="relative flex h-[5px] w-[5px] shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ background: s.color, animationDuration: "1.6s" }} />
          <span className="relative inline-flex h-[5px] w-[5px] rounded-full" style={{ background: s.color }} />
        </span>
      ) : null}
        {label}
      </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-px text-[9.5px] font-medium"
      style={{
        background: "rgb(var(--malv-surface-raised-rgb))",
        border:     "1px solid rgb(var(--malv-border-rgb) / 0.14)",
        color:      "rgb(var(--malv-muted-rgb) / 0.72)"
      }}
    >
      {resolveSourceLabel(source)}
    </span>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  if (!risk || risk.toLowerCase() === "low") return null;
  const s = resolveRiskStyle(risk);
  return (
        <span
      className="shrink-0 rounded-full px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-[0.06em]"
      style={{ background: s.bg, color: s.color, border: s.border }}
    >
      {risk} risk
    </span>
  );
}

function RecommendedAction({ text }: { text: string }) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <Zap className="h-[10px] w-[10px] shrink-0" style={{ color: "rgba(52,211,153,0.5)" }} />
      <span className="text-[11px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.55)" }}>
        {text}
        </span>
    </div>
  );
}

/**
 * "Convert to task" button — primary CTA for unresolved inbox signals.
 * Shown on FailedRunCard and DeclinedRow.
 * Aligns with the item's RecommendedAction — both point to the same next step.
 */
function ConvertToTaskButton({
  converting,
  onClick
}: {
  converting: boolean;
  onClick:    () => void;
}) {
  return (
    <button
      type="button"
      disabled={converting}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-all disabled:opacity-60"
      style={{
        background: "rgb(var(--malv-surface-raised-rgb))",
        border:     "1px solid rgb(var(--malv-border-rgb) / 0.18)",
        color:      "rgb(var(--malv-text-rgb) / 0.72)"
      }}
      onMouseEnter={(e) => {
        if (!converting) {
          (e.currentTarget as HTMLElement).style.background = "rgb(var(--malv-surface-overlay-rgb))";
          (e.currentTarget as HTMLElement).style.color      = "rgb(var(--malv-text-rgb) / 0.92)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgb(var(--malv-surface-raised-rgb))";
        (e.currentTarget as HTMLElement).style.color      = "rgb(var(--malv-text-rgb) / 0.72)";
      }}
    >
      {converting
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <ListTodo className="h-3 w-3" />
      }
      {converting ? "Creating task…" : "Convert to task"}
    </button>
  );
}

/**
 * Shown after a successful conversion — replaces the Convert button.
 * Communicates commitment to execution without ambiguity.
 * Includes a "View in Tasks →" link to confirm the task exists.
 */
function ConvertedState({ onViewTasks }: { onViewTasks: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <StateChip label="Queued as task" variant="converted" />
      <button
        type="button"
        onClick={onViewTasks}
        className="flex items-center gap-1 text-[11px] transition-opacity hover:opacity-80"
        style={{ color: "rgba(52,211,153,0.62)" }}
      >
        <ArrowRight className="h-3 w-3" />
        View in Tasks
      </button>
    </div>
  );
}

// ─── Decision card ────────────────────────────────────────────────────────────
// Highest-urgency item. Full card treatment with risk, source, and decision controls.
// No conversion: pending decisions require Approve/Reject, not task creation.

function DecisionCard({
  approval,
  deciding,
  onApprove,
  onReject,
  index
}: {
  approval:  WorkspaceApproval;
  deciding:  boolean;
  onApprove: () => void;
  onReject:  () => void;
  index:     number;
}) {
  const recommendation = resolveApprovalRecommendation(approval);

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="relative overflow-hidden rounded-2xl"
      style={{ background: "rgba(251,191,36,0.03)", border: "1px solid rgba(251,191,36,0.14)" }}
    >
      {/* Left accent */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: "rgba(251,191,36,0.55)" }} />

      <div className="py-4 pl-5 pr-4">
        {/* Meta row */}
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          <StateChip label="Needs decision" variant="decision" />
          <SourceBadge source={approval.source} />
          <RiskBadge   risk={approval.riskLevel} />
          {approval.createdAt && (
            <span className="ml-auto shrink-0 text-[10px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.38)" }}>
              {formatRelativeTime(approval.createdAt)}
          </span>
          )}
        </div>

        {/* Action description */}
        <p className="text-[13.5px] font-medium leading-relaxed" style={{ color: "rgb(var(--malv-text-rgb) / 0.88)" }}>
          {approval.actionDescription}
        </p>

        {/* MALV recommended action */}
        <RecommendedAction text={recommendation} />

        {/* Decision controls */}
        <div className="mt-3.5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={deciding}
            onClick={onApprove}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold transition-opacity disabled:opacity-50"
            style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.22)", color: "rgba(52,211,153,0.95)" }}
          >
            {deciding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Approve
          </button>
          <button
            type="button"
            disabled={deciding}
            onClick={onReject}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-medium transition-opacity disabled:opacity-50"
            style={{ background: "rgb(var(--malv-surface-raised-rgb))", border: "1px solid rgb(var(--malv-border-rgb) / 0.12)", color: "rgb(var(--malv-text-rgb) / 0.6)" }}
          >
            <X className="h-3 w-3" />
            Reject
          </button>
        </div>
      </div>
    </motion.li>
  );
}

// ─── Failed run card ──────────────────────────────────────────────────────────
// Actionable: review the run OR commit it to Tasks as a retry task.
// "Convert to task" is the primary commitment path; "Review" is contextual.
// After conversion: shows "Queued as task" + "View in Tasks →", both buttons removed.

function FailedRunCard({
  session,
  converting,
  converted,
  onOpen,
  onConvert,
  onViewTasks,
  index
}: {
  session:     WorkspaceRuntimeSession;
  converting:  boolean;
  converted:   boolean;
  onOpen:      () => void;
  onConvert:   () => void;
  onViewTasks: () => void;
  index:       number;
}) {
  const recommendation = resolveSessionRecommendation(session);

  return (
    <motion.li
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: converted ? 0.6 : 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.18, delay: index * 0.03 }}
      className="relative overflow-hidden rounded-xl"
      style={{ background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.14)" }}
    >
      {/* Left accent */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: converted ? "rgba(52,211,153,0.45)" : "rgba(248,113,113,0.5)" }} />

      <div className="py-3.5 pl-5 pr-3.5">
        {/* Meta row */}
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {converted
            ? <StateChip label="Queued as task" variant="converted" />
            : <StateChip label="Run failed" variant="failed" />
          }
          <SourceBadge source={session.sourceType} />
          <span className="ml-auto shrink-0 text-[10px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.38)" }}>
            {formatRelativeTime(session.lastEventAt ?? session.updatedAt)}
          </span>
        </div>

        {/* Recommended action — always visible, drives the CTA */}
        <RecommendedAction text={recommendation} />

        {/* Action row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {converted ? (
            <button
              type="button"
              onClick={onViewTasks}
              className="flex items-center gap-1 text-[11px] transition-opacity hover:opacity-80"
              style={{ color: "rgba(52,211,153,0.7)" }}
            >
              <ArrowRight className="h-3 w-3" />
              View in Tasks
            </button>
          ) : (
            <>
              <ConvertToTaskButton converting={converting} onClick={onConvert} />
              <button
                type="button"
                onClick={onOpen}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-all"
                style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", color: "rgba(248,113,113,0.82)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.16)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.1)"; }}
              >
                <RotateCcw className="h-3 w-3" />
                Review run
              </button>
            </>
          )}
        </div>
      </div>
    </motion.li>
  );
}

// ─── Declined row ─────────────────────────────────────────────────────────────
// Terminal state — execution was rerouted. The recommended action is to commit
// this to Tasks so MALV can re-evaluate with proper execution context.
// "Convert to task" IS the recommended action here.
// After conversion: shows "Queued as task" + "View in Tasks →".

function DeclinedRow({
  approval,
  converting,
  converted,
  onConvert,
  onViewTasks,
  index
}: {
  approval:    WorkspaceApproval;
  converting:  boolean;
  converted:   boolean;
  onConvert:   () => void;
  onViewTasks: () => void;
  index:       number;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: converted ? 0.65 : 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.16, delay: index * 0.025 }}
      className="relative overflow-hidden rounded-xl px-3.5 py-3"
      style={{ background: "rgba(248,113,113,0.03)", border: "1px solid rgba(248,113,113,0.1)" }}
    >
      {/* Left accent */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: converted ? "rgba(52,211,153,0.4)" : "rgba(248,113,113,0.3)" }} />

      <div className="pl-2">
        {/* Meta row */}
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {converted
            ? <StateChip label="Queued as task" variant="converted" />
            : <StateChip label="Declined" variant="declined" />
          }
          <SourceBadge source={approval.source} />
          {approval.updatedAt && (
            <span className="ml-auto text-[10px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.35)" }}>
              {formatRelativeTime(approval.updatedAt)}
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-[12.5px] leading-snug" style={{ color: "rgb(var(--malv-text-rgb) / 0.65)" }}>
          {approval.actionDescription}
        </p>

        {/* Recommended action — "Convert to task" IS this action for declined items */}
        {!converted && (
          <RecommendedAction text={resolveApprovalRecommendation(approval)} />
        )}

        {/* CTA */}
        <div className="mt-2.5">
          {converted ? (
            <ConvertedState onViewTasks={onViewTasks} />
          ) : (
            <ConvertToTaskButton converting={converting} onClick={onConvert} />
          )}
        </div>
      </div>
    </motion.li>
  );
}

// ─── Completed row ────────────────────────────────────────────────────────────
// Approved approvals. No conversion — already resolved.

function CompletedRow({
  approval,
  opening,
  onOpen,
  index
}: {
  approval: WorkspaceApproval;
  opening:  boolean;
  onOpen?:  () => void;
  index:    number;
}) {
  const [hovered, setHovered] = useState(false);
  const canOpen = Boolean(onOpen);

  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.16, delay: index * 0.02 }}
    >
      <div
        className="flex items-start gap-3 rounded-xl px-3.5 py-3 transition-colors duration-100"
        style={{
          background: hovered && canOpen ? "rgb(var(--malv-surface-raised-rgb))" : "transparent",
          cursor: canOpen ? "pointer" : "default"
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={canOpen ? onOpen : undefined}
        role={canOpen ? "button" : undefined}
        tabIndex={canOpen ? 0 : undefined}
        onKeyDown={canOpen ? (e) => { if (e.key === "Enter" || e.key === " ") onOpen?.(); } : undefined}
      >
        <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(52,211,153,0.12)" }}>
          <CheckCircle2 className="h-2.5 w-2.5" style={{ color: "rgba(52,211,153,0.72)" }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <StateChip label="Approved" variant="approved" />
            <SourceBadge source={approval.source} />
            {approval.updatedAt && (
              <span className="ml-auto text-[10px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.35)" }}>
                {formatRelativeTime(approval.updatedAt)}
              </span>
            )}
          </div>

          <p className="text-[12.5px] leading-snug" style={{ color: "rgb(var(--malv-text-rgb) / 0.72)" }}>
            {approval.actionDescription}
          </p>

          {canOpen && (
            <div className="mt-1.5 flex items-center gap-1">
              {opening
                ? <Loader2 className="h-3 w-3 animate-spin" style={{ color: "rgba(52,211,153,0.5)" }} />
                : <ArrowRight className="h-3 w-3" style={{ color: "rgba(52,211,153,0.45)" }} />
              }
              <span className="text-[11px]" style={{ color: "rgba(52,211,153,0.55)" }}>
                {opening ? "Opening run…" : "Open run to review results"}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.li>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function InboxSectionHeader({
  label, count, variant = "default"
}: {
  label:    string;
  count:    number;
  variant?: "urgent" | "error" | "default";
}) {
  const color =
    variant === "urgent" ? "rgba(251,191,36,0.75)" :
    variant === "error"  ? "rgba(248,113,113,0.65)" :
    "rgb(var(--malv-muted-rgb) / 0.55)";

  return (
    <div className="mb-3 flex items-center gap-2 px-0.5">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ color }}>
        {label}
      </span>
      {count > 0 && (
        <span className="text-[10px] font-medium tabular-nums" style={{ color: "rgb(var(--malv-muted-rgb) / 0.42)" }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Empty section ────────────────────────────────────────────────────────────

function InboxEmptySection({ message }: { message: string }) {
  return (
    <p className="px-0.5 text-[12.5px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.52)" }}>
      {message}
    </p>
  );
}

// ─── Full empty state ─────────────────────────────────────────────────────────

function InboxEmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26 }}
      className="flex flex-col items-center py-16 text-center"
    >
      <div
        className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: "rgb(var(--malv-surface-raised-rgb))", border: "1px solid rgb(var(--malv-border-rgb) / 0.08)" }}
      >
        <CheckCircle2 className="h-5 w-5" style={{ color: "rgba(52,211,153,0.45)" }} />
      </div>
      <p className="text-[14px] font-medium" style={{ color: "rgb(var(--malv-text-rgb) / 0.7)" }}>
        Inbox is clear
      </p>
      <p className="mt-1 max-w-[240px] text-[12px] leading-relaxed" style={{ color: "rgb(var(--malv-muted-rgb) / 0.5)" }}>
        No decisions pending, no failed runs. MALV is running cleanly.
      </p>
    </motion.div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function InboxSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 0.65, 0.38].map((op, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl"
          style={{ height: i === 0 ? "6.5rem" : "4.5rem", background: "rgb(var(--malv-surface-raised-rgb))", opacity: op }}
        />
      ))}
    </div>
  );
}
