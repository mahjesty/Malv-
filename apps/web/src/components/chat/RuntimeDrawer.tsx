import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  FileDiff,
  Loader2,
  Play,
  RotateCcw,
  Square,
  X,
  Zap
} from "lucide-react";
import { useAuth } from "../../lib/auth/AuthContext";
import { type RuntimeEntryContext } from "../../lib/context/MalvAppShellContext";
import {
  completeWorkspaceTask,
  decideWorkspaceApproval,
  fetchWorkspaceRuntimeSession,
  sendChatMessage,
  type WorkspaceApproval,
  type WorkspaceRuntimeLog,
  type WorkspaceRuntimeSession,
  type WorkspaceRuntimePatch,
  type WorkspaceTask
} from "../../lib/api/dataPlane";
import {
  humanizeStep,
  useExecutionPresence,
} from "./useExecutionPresence";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GuidanceEntry {
  id:        string;
  content:   string;
  createdAt: string;
  pending?:  boolean;
}

/**
 * Discriminated union covering every kind of entry in the execution timeline.
 * Preserved exactly — no changes to the feed structure.
 */
type FeedEntry =
  | { kind: "malv";     id: string; content: string; createdAt: string }
  | { kind: "guidance"; id: string; content: string; createdAt: string; pending?: boolean }
  | { kind: "step";     id: string; content: string; createdAt: string; active: boolean; index: number };

// ─── Local helpers ────────────────────────────────────────────────────────────
// Only rendering-time utilities live here. All derivation logic lives in
// useExecutionPresence so it can be upgraded independently.

function useMobileLayout() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return mobile;
}

interface StatusCfg {
  label: string;
  dot:   string;
  color: string;
  ping:  boolean;
}

function statusConfig(s: WorkspaceRuntimeSession["status"]): StatusCfg {
  switch (s) {
    case "waiting_approval": return { label: "Awaiting decision", dot: "bg-amber-400",      color: "rgba(251,191,36,0.88)",  ping: true  };
    case "running":          return { label: "Executing",         dot: "bg-emerald-400",     color: "rgba(52,211,153,0.88)",  ping: true  };
    case "completed":        return { label: "Completed",         dot: "bg-emerald-500/50",  color: "rgba(52,211,153,0.68)",  ping: false };
    case "failed":           return { label: "Failed",            dot: "bg-rose-400",        color: "rgba(248,113,113,0.88)", ping: false };
    default:                 return { label: "Queued",            dot: "bg-slate-400/25",    color: "rgb(var(--malv-muted-rgb) / 0.52)", ping: false };
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function entryTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Execution timeline entry ─────────────────────────────────────────────────
// Renders all three entry kinds. Logs are visually SUBORDINATE —
// intent and progress take precedence; logs are the record, not the story.

function ExecutionEntry({ entry }: { entry: FeedEntry }) {
  if (entry.kind === "step") {
    return (
      <div className="flex items-center gap-2.5 py-[3px]">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {entry.active ? (
            <span className="h-[5px] w-[5px] animate-pulse rounded-full" style={{ background: "rgba(52,211,153,0.7)" }} />
          ) : (
            <span className="h-[3px] w-[3px] rounded-full" style={{ background: "var(--malv-exec-dot)" }} />
          )}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[11.5px]"
          style={{ color: entry.active ? "rgb(var(--malv-text-rgb) / 0.72)" : "rgb(var(--malv-muted-rgb) / 0.35)" }}
        >
          {entry.content}
        </span>
        {entry.active ? (
          <span className="shrink-0 text-[10px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.25)" }}>
            {entryTime(entry.createdAt)}
          </span>
        ) : null}
      </div>
    );
  }

  const isMalv    = entry.kind === "malv";
  const isPending = entry.kind === "guidance" && entry.pending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-lg px-3.5 py-2.5"
      style={{
        background: isMalv ? "var(--malv-emerald-surface)" : "var(--malv-exec-surface)",
        borderLeft: isMalv ? "2px solid var(--malv-emerald-border-hi)" : "2px solid var(--malv-exec-border)",
        opacity:    isPending ? 0.55 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {isMalv ? (
            <>
              <Zap className="h-[10px] w-[10px] shrink-0" style={{ color: "rgba(52,211,153,0.65)" }} />
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(52,211,153,0.62)" }}>
                MALV
              </span>
            </>
          ) : (
            <>
              <ArrowRight className="h-[10px] w-[10px] shrink-0" style={{ color: "rgb(var(--malv-muted-rgb) / 0.4)" }} />
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.4)" }}>
                Guidance
              </span>
              {isPending ? (
                <span className="flex items-center gap-0.5 text-[9.5px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.32)" }}>
                  <Loader2 className="h-2 w-2 animate-spin" />
                  queuing
                </span>
              ) : null}
            </>
          )}
        </div>
        <span className="text-[9.5px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.24)" }}>
          {entryTime(entry.createdAt)}
        </span>
      </div>
      <p
        className="text-[12.5px] leading-relaxed"
        style={{ color: isMalv ? "rgb(var(--malv-text-rgb) / 0.88)" : "rgb(var(--malv-text-rgb) / 0.7)" }}
      >
        {entry.content}
      </p>
    </motion.div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9.5px] font-semibold uppercase tracking-widest" style={{ color: "rgb(var(--malv-muted-rgb) / 0.35)" }}>
      {children}
    </p>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// Compact labels shown next to the status badge before the session loads.
const ENTRY_ANNOTATION: Record<string, string> = {
  open_run:   "Opening run",
  reschedule: "Rescheduling",
  open_in_chat: "From chat",
};

export function RuntimeDrawer(props: {
  open:              boolean;
  sessionId:         string | null;
  conversationId:    string | null;
  taskTitle?:        string | null;
  /** Action-aware entry context passed from the triggering surface. */
  entryContext?:     RuntimeEntryContext | null;
  onClose:           () => void;
  closeDrawerState?: () => void;
}) {
  const { open, sessionId, conversationId, taskTitle, entryContext, onClose } = props;
  const { accessToken } = useAuth();
  const mobile   = useMobileLayout();
  const bodyRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Server state ──────────────────────────────────────────────────────────

  const [session,     setSession]     = useState<WorkspaceRuntimeSession | null>(null);
  const [logs,        setLogs]        = useState<WorkspaceRuntimeLog[]>([]);
  const [approvals,   setApprovals]   = useState<WorkspaceApproval[]>([]);
  const [patches,     setPatches]     = useState<WorkspaceRuntimePatch[]>([]);
  const [outputs,     setOutputs]     = useState<Array<{ messageId: string; preview: string; createdAt: string }>>([]);
  const [sessionTask, setSessionTask] = useState<WorkspaceTask | null>(null);

  // ── Operator guidance state ───────────────────────────────────────────────

  const [pendingGuidance, setPendingGuidance] = useState<GuidanceEntry[]>([]);
  const [inputDraft,      setInputDraft]      = useState("");
  const [sending,         setSending]         = useState(false);
  const [starting,        setStarting]        = useState(false);
  const [cancelling,      setCancelling]      = useState(false);
  const [decidingId,      setDecidingId]      = useState<string | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  // ── Derived execution state ───────────────────────────────────────────────

  const effectiveConvId = useMemo(() => {
    if (conversationId?.trim()) return conversationId.trim();
    if (session?.sourceType === "chat") return session.sourceId;
    return sessionTask?.conversationId ?? null;
  }, [conversationId, session, sessionTask]);

  const status           = session?.status ?? "idle";
  const pendingApprovals = useMemo(() => approvals.filter((a) => a.status === "pending"), [approvals]);

  const sortedLogs = useMemo(
    () =>
      [...logs]
        .sort(
          (a, b) =>
            a.stepIndex - b.stepIndex ||
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )
        .slice(-20),
    [logs],
  );

  // Unified execution feed — structure preserved exactly.
  // humanizeStep is imported from useExecutionPresence so step content
  // is computed identically to how the hook sees the last step.
  const executionFeed = useMemo((): FeedEntry[] => {
    const malvEntries: FeedEntry[]     = outputs.map((o) => ({ kind: "malv",     id: o.messageId, content: o.preview,         createdAt: o.createdAt }));
    const guidanceEntries: FeedEntry[] = pendingGuidance.map((g) => ({ kind: "guidance", id: g.id,         content: g.content,         createdAt: g.createdAt, pending: g.pending }));
    const stepEntries: FeedEntry[]     = sortedLogs.map((log, i) => ({ kind: "step",     id: log.id,       content: humanizeStep(log), createdAt: log.createdAt, active: i === sortedLogs.length - 1, index: i }));
    return [...malvEntries, ...guidanceEntries, ...stepEntries].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [outputs, pendingGuidance, sortedLogs]);

  const { label: statusLabel, dot: dotClass, color: statusColor, ping: doPing } = statusConfig(status);

  const displayTitle =
    loading && !session
      ? null
      : taskTitle?.trim() || sessionTask?.title?.trim() || "Task run";

  // ── Execution presence layer ──────────────────────────────────────────────
  //
  // All derived UI-intelligence state (intent, context line, progress,
  // transition signals) is managed by useExecutionPresence.
  //
  // To integrate a model: replace `resolveIntent` in useExecutionPresence.ts.
  // This component and its render tree require no changes.

  const presence = useExecutionPresence({ status, sortedLogs, outputs, pendingApprovals });

  // ── Data loading ──────────────────────────────────────────────────────────

  // Generation counter — stale in-flight responses from a previous task are
  // discarded to guarantee cross-task isolation.
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    if (!accessToken || !sessionId) return;
    const myGen = loadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWorkspaceRuntimeSession(accessToken, sessionId);
      if (loadGenRef.current !== myGen) return;
      if (!res || (res as { ok?: boolean }).ok === false) {
        setError("Could not load execution state.");
        return;
      }
      setSession(res.session ?? null);
      setLogs(res.logs ?? []);
      setApprovals(res.approvals ?? []);
      setPatches(res.patches ?? []);
      setOutputs(
        (res.outputs ?? []).map((o) => ({ messageId: o.messageId, preview: o.preview, createdAt: o.createdAt })),
      );
      if (res.tasks?.length) setSessionTask(res.tasks[0]);
    } catch {
      if (loadGenRef.current !== myGen) return;
      setError("Could not load execution state.");
    } finally {
      if (loadGenRef.current === myGen) setLoading(false);
    }
  }, [accessToken, sessionId]);

  // Reset on task switch — also clears presence timers so no stale signals
  // bleed from one task into another.
  useEffect(() => {
    loadGenRef.current++;
    presence.clearPresence();
    if (!open || !sessionId) {
      setSession(null); setLogs([]); setApprovals([]); setPatches([]);
      setOutputs([]); setSessionTask(null); setPendingGuidance([]);
      setError(null); setInputDraft("");
      return;
    }
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    void load();
    // presence.clearPresence is stable (useCallback, no deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId, load]);

  // Polling — active while non-terminal.
  useEffect(() => {
    if (!open || !sessionId) return;
    if (status === "completed" || status === "failed") return;
    const interval = !session || status === "idle" ? 2500 : 3500;
    const id = window.setInterval(() => void load(), interval);
    return () => window.clearInterval(id);
  }, [open, sessionId, status, session, load]);

  // Scroll to bottom when new feed entries arrive, but only when already
  // near the bottom — don't hijack intentional upward scrolling.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [executionFeed.length]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const sendGuidance = async (text?: string) => {
    const msg = (text ?? inputDraft).trim();
    if (!msg || sending || starting) return;
    setSending(true);
    const tempId = `local-${Date.now()}`;
    const now    = new Date().toISOString();
    setPendingGuidance((prev) => [...prev, { id: tempId, content: msg, createdAt: now, pending: true }]);
    setInputDraft("");
    requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    });
    try {
      await sendChatMessage(accessToken!, { message: msg, conversationId: effectiveConvId, sessionType: "task" });
      setPendingGuidance((prev) => prev.map((g) => (g.id === tempId ? { ...g, pending: false } : g)));
      // Pass the raw guidance text so the hook can produce specific reaction copy.
      if (status === "running") presence.setGuidanceFeedback(msg);
      if (status !== "idle")    presence.setTransition("Incorporating guidance…");
      await load();
    } catch {
      setPendingGuidance((prev) =>
        prev.map((g) => g.id === tempId ? { ...g, content: `${g.content} ⚠ failed`, pending: false } : g),
      );
    } finally {
      setSending(false);
    }
  };

  const startExecution = async () => {
    if (starting || sending) return;
    setStarting(true);
    presence.setTransition("Starting execution…", 5000);
    try {
      const title = taskTitle?.trim() || "this task";
      await sendChatMessage(accessToken!, {
        message: `Please handle this task: ${title}`,
        conversationId: effectiveConvId,
        sessionType: "task",
      });
      await load();
    } catch {
      setError("Could not start execution. Try again.");
      presence.setTransition("", 0); // clear the stale transition on error
    } finally {
      setStarting(false);
    }
  };

  const cancelTask = async () => {
    if (!accessToken || !sessionTask) return;
    setCancelling(true);
    try {
      await completeWorkspaceTask(accessToken, sessionTask.id);
      await load();
    } catch {
      setError("Could not cancel task.");
    } finally {
      setCancelling(false);
    }
  };

  const onDecide = async (approvalId: string, decision: "approved" | "rejected") => {
    if (!accessToken) return;
    setDecidingId(approvalId);
    presence.setTransition(
      decision === "approved" ? "Approved — resuming execution…" : "Rejected — re-evaluating plan…",
      5000,
    );
    try {
      await decideWorkspaceApproval(accessToken, approvalId, decision);
      await load();
    } finally {
      setDecidingId(null);
    }
  };

  const handleInputKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendGuidance();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const inputPlaceholder =
    status === "idle"             ? "Add a detail or constraint before executing…" :
    status === "running"          ? "Redirect or provide missing context…"         :
    status === "waiting_approval" ? "Add context for this decision…"               :
    status === "failed"           ? "Describe what to change, then retry…"         :
    "Add execution guidance…";

  return (
    <AnimatePresence>
      {open && sessionId ? (
        <>
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Close task panel"
            className="fixed inset-0 z-[100] cursor-default border-0"
            style={{ background: mobile ? "rgba(0,0,0,0.38)" : "transparent", backdropFilter: mobile ? "blur(2px)" : "none" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="malv-runtime-title"
            className={[
              "malv-runtime-panel fixed z-[110] flex flex-col overflow-hidden",
              mobile
                ? "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[20px]"
                : "inset-y-4 right-4 w-[min(440px,calc(100vw-2rem))] rounded-2xl",
            ].join(" ")}
            style={{
              background:     "rgb(var(--malv-canvas-rgb))",
              border:         "1px solid var(--malv-exec-border)",
              boxShadow:      "0 24px 72px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.03)",
              backdropFilter: "blur(20px)",
            }}
            initial={mobile ? { y: "100%" } : { x: "108%", opacity: 0.8 }}
            animate={mobile ? { y: 0 }      : { x: 0,      opacity: 1   }}
            exit={mobile    ? { y: "100%" } : { x: "108%", opacity: 0.8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Mobile drag handle */}
            {mobile ? (
              <div className="flex shrink-0 justify-center pt-3 pb-1">
                <div className="h-[3px] w-10 rounded-full" style={{ background: "var(--malv-exec-border)" }} aria-hidden />
              </div>
            ) : null}

            {/* ── Header ───────────────────────────────────────────────────
                UI hierarchy (top to bottom):
                  1. Status badge + context annotation
                  2. Task title
                  3. Current intent — PERSISTENT, derived from execution state
                This means the operator always knows what MALV is doing without
                scrolling into the body. ─────────────────────────────────── */}
            <div
              className="flex shrink-0 items-start gap-3 px-4 py-3.5 sm:px-5"
              style={{ borderBottom: "1px solid var(--malv-exec-divider)" }}
            >
              <div className="min-w-0 flex-1">
                {/* Row 1: status badge + context annotation */}
                <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                  <span className="relative flex h-[6px] w-[6px] shrink-0">
                    {doPing ? (
                      <span
                        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-35 ${dotClass}`}
                        style={{ animationDuration: "1.4s" }}
                      />
                    ) : null}
                    <span className={`relative inline-flex h-[6px] w-[6px] rounded-full ${dotClass}`} />
                  </span>
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: statusColor }}>
                    {statusLabel}
                  </span>
                  {session && presence.contextLine ? (
                    <span className="text-[9.5px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.38)" }}>
                      · {presence.contextLine}
                    </span>
                  ) : !session && entryContext?.sourceAction ? (
                    <span className="text-[9.5px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.35)" }}>
                      · {ENTRY_ANNOTATION[entryContext.sourceAction] ?? entryContext.sourceAction}
                    </span>
                  ) : null}
                </div>

                {/* Row 2: task title */}
                <h2
                  id="malv-runtime-title"
                  className="line-clamp-2 text-[14px] font-semibold leading-snug"
                  style={{ color: "rgb(var(--malv-text-rgb) / 0.92)" }}
                >
                  {displayTitle ?? "…"}
                </h2>

                {/* Row 3: current intent.
                    Before session loads: show entry context intent immediately so
                    the drawer feels action-aware from the first frame.
                    After session loads: animate to live presence.intent derived from
                    server state. AnimatePresence mode="wait" handles the transition. */}
                {(session || entryContext?.intent) ? (
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={session ? presence.intent : (entryContext?.intent ?? "")}
                      initial={{ opacity: 0, y: 1 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      className="mt-0.5 text-[11.5px] leading-snug"
                      style={{ color: "rgb(var(--malv-text-rgb) / 0.58)" }}
                    >
                      {session ? presence.intent : entryContext?.intent}
                    </motion.p>
                  </AnimatePresence>
                ) : null}
              </div>

              {/* Controls */}
              <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                {(status === "running" || status === "idle") && sessionTask ? (
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => void cancelTask()}
                    className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors disabled:opacity-50"
                    style={{ background: "var(--malv-rose-surface)", color: "rgba(248,113,113,0.82)", border: "1px solid var(--malv-rose-border)" }}
                    title="Cancel execution"
                  >
                    {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                    Cancel
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors"
                  style={{ background: "var(--malv-exec-surface)", border: "1px solid var(--malv-exec-border)", color: "rgb(var(--malv-muted-rgb) / 0.55)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--malv-exec-surface-hi)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--malv-exec-surface)"; }}
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                </button>
              </div>
            </div>

            {/* ── Body ─────────────────────────────────────────────────────── */}
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">

              {/* Error banner */}
              {error ? (
                <div
                  className="mx-4 mt-3 rounded-lg px-3.5 py-2.5 text-[12px]"
                  style={{ background: "var(--malv-rose-surface)", border: "1px solid var(--malv-rose-border)", color: "rgba(248,113,113,0.9)" }}
                >
                  {error}
                  <button type="button" className="ml-2 underline" style={{ opacity: 0.65 }} onClick={() => { setError(null); void load(); }}>
                    Retry
                  </button>
                </div>
              ) : null}

              {/* Loading skeleton */}
              {loading && !session ? (
                <div className="space-y-3 px-4 py-5">
                  {[60, 88, 72, 50].map((w, i) => (
                    <div key={i} className="h-2.5 animate-pulse rounded-full" style={{ width: `${w}%`, background: "var(--malv-exec-surface-hi)" }} />
                  ))}
                </div>
              ) : !session ? null : (
                <div className="px-4 py-4 space-y-3 sm:px-5">

                  {/* ── Global short-lived signals ─────────────────────────
                      These appear at the top of the body scroll area.
                      They bridge the gap between operator action and the
                      next server-confirmed state change. ─────────────────── */}

                  {/* Transition message: "Starting execution…", "Approved…", etc. */}
                  <AnimatePresence>
                    {presence.transitionMsg ? (
                      <motion.div
                        key={presence.transitionMsg}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.22 }}
                        className="flex items-center gap-2"
                        style={{ color: "rgba(52,211,153,0.75)" }}
                      >
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                        <span className="text-[11.5px] font-medium">{presence.transitionMsg}</span>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {/* Guidance applied: visible reaction to operator input */}
                  <AnimatePresence>
                    {presence.guidanceJustApplied ? (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-2 rounded-lg px-3.5 py-2.5"
                        style={{ background: "var(--malv-emerald-surface)", border: "1px solid var(--malv-emerald-border)" }}
                      >
                        <Check className="h-3 w-3 shrink-0" style={{ color: "rgba(52,211,153,0.82)" }} />
                        <span className="text-[12px]" style={{ color: "rgba(52,211,153,0.9)" }}>
                          {presence.lastGuidanceSummary ?? "Guidance received — adjusting execution path"}
                        </span>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {/* ── Queued / idle ──────────────────────────────────────── */}
                  {status === "idle" ? (
                    <>
                      <div
                        className="rounded-xl px-4 py-3.5"
                        style={{ background: "var(--malv-exec-surface)", border: "1px solid var(--malv-exec-border)" }}
                      >
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className="h-[5px] w-[5px] rounded-full" style={{ background: "var(--malv-exec-dot)" }} />
                          <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.48)" }}>
                            Queued
                          </span>
                        </div>
                        <p className="text-[13.5px] font-semibold leading-snug" style={{ color: "rgb(var(--malv-text-rgb) / 0.9)" }}>
                          {displayTitle ?? "Task ready"}
                        </p>
                        <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "rgb(var(--malv-muted-rgb) / 0.52)" }}>
                          Trigger execution to hand this task to MALV. You can redirect,
                          add guidance, or approve actions at any point during the run.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={starting}
                        onClick={() => void startExecution()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold transition-all disabled:opacity-60"
                        style={{ background: "var(--malv-emerald-surface)", color: "rgba(52,211,153,0.92)", border: "1px solid var(--malv-emerald-border)" }}
                        onMouseEnter={(e) => { if (!starting) (e.currentTarget as HTMLElement).style.background = "var(--malv-emerald-surface-hi)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--malv-emerald-surface)"; }}
                      >
                        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        {starting ? "Starting execution…" : "Start execution"}
                      </button>

                      {executionFeed.length > 0 ? (
                        <div className="space-y-1.5">
                          <SectionLabel>Guidance added</SectionLabel>
                          {executionFeed.map((entry) => <ExecutionEntry key={entry.id} entry={entry} />)}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {/* ── Running ──────────────────────────────────────────────
                      Intent is already in the header. Body shows:
                        1. Progress row (step count + phase + animated bar)
                        2. Posture signal (subtle secondary cue)
                        3. Execution log (secondary — record, not story)    ── */}
                  {status === "running" ? (
                    <>
                      {/* Progress block — forward motion + phase anchoring + posture */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                          <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: "rgba(52,211,153,0.7)" }}>
                            {sortedLogs.length === 0 ? "Initializing" : `Step ${sortedLogs.length}`}
                          </span>
                          <div className="min-w-0 flex-1 h-[2px] overflow-hidden rounded-full" style={{ background: "var(--malv-exec-surface-hi)" }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: "rgba(52,211,153,0.52)" }}
                              animate={{ width: `${presence.progressPct}%` }}
                              transition={{ duration: 1.2, ease: "easeOut" }}
                            />
                          </div>
                          {presence.progressPct > 0 ? (
                            <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "rgb(var(--malv-muted-rgb) / 0.32)" }}>
                              {presence.progressPct}%
                            </span>
                          ) : null}
                        </div>
                        {/* Phase label + posture — secondary signals, low visual weight */}
                        {sortedLogs.length > 0 && (presence.phase || presence.posture) ? (
                          <div className="flex items-center gap-2">
                            {presence.phase ? (
                              <AnimatePresence mode="wait">
                                <motion.span
                                  key={presence.phase}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="shrink-0 rounded-full px-1.5 py-px text-[9.5px] font-medium"
                                  style={{ background: "var(--malv-exec-surface-hi)", color: "rgb(var(--malv-muted-rgb) / 0.45)" }}
                                >
                                  {presence.phase}
                                </motion.span>
                              </AnimatePresence>
                            ) : null}
                            {presence.posture ? (
                              <span className="text-[10px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.3)" }}>
                                {presence.posture}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      {/* Execution log — subordinate, supports intent+progress above */}
                      {executionFeed.length > 0 ? (
                        <div className="space-y-1.5">
                          <SectionLabel>Execution log</SectionLabel>
                          {executionFeed.map((entry) => <ExecutionEntry key={entry.id} entry={entry} />)}
                        </div>
                      ) : (
                        <div className="rounded-lg px-4 py-4 text-center" style={{ background: "var(--malv-exec-surface)" }}>
                          <p className="text-[12px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.4)" }}>
                            Execution started — log entries appear as steps complete.
                          </p>
                        </div>
                      )}
                    </>
                  ) : null}

                  {/* ── Decision gate ─────────────────────────────────────────
                      Intent in the header tells the operator WHAT is blocked.
                      The gate here tells them WHY it matters and what to do. ── */}
                  {status === "waiting_approval" ? (
                    <>
                      {/* Paused gate — makes the block on progress visceral */}
                      <div
                        className="rounded-xl px-4 py-3.5"
                        style={{ background: "var(--malv-amber-surface)", border: "2px solid var(--malv-amber-border)" }}
                      >
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className="relative flex h-[7px] w-[7px] shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-35" style={{ animationDuration: "1.4s" }} />
                            <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-amber-400" />
                          </span>
                          <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: "rgba(251,191,36,0.9)" }}>
                            Execution paused
                          </span>
                        </div>
                        <p className="text-[12.5px] leading-relaxed" style={{ color: "rgb(var(--malv-text-rgb) / 0.82)" }}>
                          {presence.blockedContext ??
                            "MALV cannot proceed without your decision. Execution resumes immediately after you respond."}
                        </p>
                      </div>

                      {/* Approval cards */}
                      {pendingApprovals.length ? (
                        <ul className="space-y-2.5">
                          {pendingApprovals.map((a) => (
                            <li
                              key={a.id}
                              className="overflow-hidden rounded-xl"
                              style={{ background: "var(--malv-exec-surface)", border: "1px solid var(--malv-exec-border-hi)" }}
                            >
                              <div className="px-4 pb-2.5 pt-4">
                                <p className="text-[13px] font-semibold leading-snug" style={{ color: "rgb(var(--malv-text-rgb) / 0.9)" }}>
                                  {a.actionDescription}
                                </p>
                                <p className="mt-1 text-[11px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.5)" }}>
                                  Risk level: {a.riskLevel}
                                </p>
                              </div>

                              {/* Consequence statement — answers "what happens next?" */}
                              <div className="mx-4 mb-3 rounded-lg px-3 py-2.5" style={{ background: "var(--malv-exec-surface-hi)" }}>
                                <p className="text-[11.5px] leading-relaxed" style={{ color: "rgb(var(--malv-muted-rgb) / 0.55)" }}>
                                  <strong style={{ color: "rgb(var(--malv-muted-rgb) / 0.72)", fontWeight: 600 }}>Approve</strong>
                                  {" — "}MALV proceeds with this action immediately.
                                  <br />
                                  <strong style={{ color: "rgb(var(--malv-muted-rgb) / 0.72)", fontWeight: 600 }}>Reject</strong>
                                  {" — "}MALV finds an alternative approach.
                                </p>
                              </div>

                              <div className="flex gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--malv-exec-divider)" }}>
                                <button
                                  type="button"
                                  disabled={decidingId === a.id}
                                  onClick={() => void onDecide(a.id, "approved")}
                                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition-opacity disabled:opacity-50"
                                  style={{ background: "var(--malv-emerald-surface-hi)", border: "1px solid var(--malv-emerald-border)", color: "rgba(52,211,153,0.92)" }}
                                >
                                  {decidingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={decidingId === a.id}
                                  onClick={() => void onDecide(a.id, "rejected")}
                                  className="rounded-lg px-4 py-2 text-[12.5px] font-medium transition-opacity disabled:opacity-50"
                                  style={{ background: "var(--malv-rose-surface)", border: "1px solid var(--malv-rose-border)", color: "rgba(248,113,113,0.84)" }}
                                >
                                  Reject
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[12.5px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.5)" }}>
                          No pending decisions — checking…
                        </p>
                      )}

                      {executionFeed.length > 0 ? (
                        <div className="space-y-1.5">
                          <SectionLabel>Execution log</SectionLabel>
                          {executionFeed.map((entry) => <ExecutionEntry key={entry.id} entry={entry} />)}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {/* ── Execution complete ─────────────────────────────────── */}
                  {status === "completed" ? (
                    <>
                      <div
                        className="rounded-xl px-4 py-4"
                        style={{ background: "var(--malv-emerald-surface)", border: "1px solid var(--malv-emerald-border)" }}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "rgba(52,211,153,0.78)" }} />
                          <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: "rgba(52,211,153,0.65)" }}>
                            Execution complete
                          </span>
                          {outputs[0]?.createdAt ? (
                            <span className="ml-auto text-[9.5px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.35)" }}>
                              {relativeTime(outputs[0].createdAt)}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[13px] leading-relaxed" style={{ color: "rgb(var(--malv-text-rgb) / 0.84)" }}>
                          {outputs[0]?.preview?.trim() || "Task completed successfully."}
                        </p>
                      </div>

                      {patches.length ? (
                        <div
                          className="flex items-center gap-2 rounded-lg px-3.5 py-2.5"
                          style={{ background: "var(--malv-exec-surface)", border: "1px solid var(--malv-exec-border)" }}
                        >
                          <FileDiff className="h-3.5 w-3.5 shrink-0" style={{ color: "rgb(var(--malv-muted-rgb) / 0.55)" }} />
                          <span className="text-[12px] font-medium" style={{ color: "rgb(var(--malv-muted-rgb) / 0.72)" }}>
                            {patches.length} change{patches.length !== 1 ? "s" : ""} proposed
                          </span>
                        </div>
                      ) : null}

                      {executionFeed.length > 0 ? (
                        <div className="space-y-1.5">
                          <SectionLabel>Run log</SectionLabel>
                          {executionFeed.map((entry) => <ExecutionEntry key={entry.id} entry={entry} />)}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {/* ── Execution failed ───────────────────────────────────── */}
                  {status === "failed" ? (
                    <>
                      <div
                        className="rounded-xl px-4 py-3.5"
                        style={{ background: "var(--malv-rose-surface)", border: "1px solid var(--malv-rose-border)" }}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "rgba(248,113,113,0.82)" }} strokeWidth={1.75} />
                          <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: "rgba(248,113,113,0.65)" }}>
                            Execution failed
                          </span>
                        </div>
                        <p className="text-[13px] leading-relaxed" style={{ color: "rgb(var(--malv-text-rgb) / 0.8)" }}>
                          Execution stopped before completing. Add guidance below to
                          redirect — or retry to re-run with the same approach.
                        </p>
                      </div>

                      {executionFeed.length > 0 ? (
                        <div className="space-y-1.5">
                          <SectionLabel>Run log</SectionLabel>
                          {executionFeed.map((entry) => <ExecutionEntry key={entry.id} entry={entry} />)}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void startExecution()}
                        disabled={starting}
                        className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-medium transition-all disabled:opacity-50"
                        style={{ background: "var(--malv-exec-surface)", border: "1px solid var(--malv-exec-border)", color: "rgb(var(--malv-muted-rgb) / 0.8)" }}
                      >
                        {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        Retry
                      </button>
                    </>
                  ) : null}

                </div>
              )}
            </div>

            {/* ── Task guidance input ──────────────────────────────────────── */}
            {session && status !== "completed" ? (
              <div
                className="shrink-0 px-4 pb-3 pt-2.5 sm:px-5"
                style={{ borderTop: "1px solid var(--malv-exec-divider)" }}
              >
                <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.3)" }}>
                  Task guidance
                </p>
                <div
                  className="malv-task-input-surface flex items-end gap-2 rounded-xl px-3.5 py-2.5"
                  style={{ background: "var(--malv-exec-surface)", border: "1px solid var(--malv-exec-border)" }}
                >
                  <textarea
                    ref={inputRef}
                    value={inputDraft}
                    onChange={(e) => setInputDraft(e.target.value)}
                    onKeyDown={handleInputKey}
                    disabled={sending || starting}
                    rows={1}
                    placeholder={inputPlaceholder}
                    className="malv-task-input-field min-h-0 flex-1 resize-none text-[12.5px] leading-relaxed"
                    style={{ color: "rgb(var(--malv-text-rgb) / 0.85)", caretColor: "rgb(var(--malv-text-rgb) / 0.85)", maxHeight: "88px", overflowY: "auto" }}
                  />
                  <button
                    type="button"
                    disabled={!inputDraft.trim() || sending || starting}
                    onClick={() => void sendGuidance()}
                    className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all disabled:opacity-30"
                    style={{
                      background: inputDraft.trim() ? "var(--malv-emerald-surface-hi)" : "var(--malv-exec-surface-hi)",
                      border:     inputDraft.trim() ? "1px solid var(--malv-emerald-border)" : "1px solid transparent",
                      color:      inputDraft.trim() ? "rgba(52,211,153,0.9)" : "rgb(var(--malv-muted-rgb) / 0.4)",
                    }}
                    title="Submit guidance"
                  >
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="mt-1 text-center text-[9.5px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.25)" }}>
                  ↵ to submit · Shift+↵ new line
                </p>
              </div>
            ) : null}

            {/* Mobile safe area */}
            {mobile ? (
              <div className="shrink-0" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }} aria-hidden />
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
