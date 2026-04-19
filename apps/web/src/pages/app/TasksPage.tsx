import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  MessageSquare,
  MoreHorizontal,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
  XCircle,
  Zap
} from "lucide-react";
import { useAuth } from "../../lib/auth/AuthContext";
import { useMalvAppShell, type RuntimeEntryContext } from "../../lib/context/MalvAppShellContext";
import {
  archiveWorkspaceTask,
  completeWorkspaceTask,
  createWorkspaceTask,
  fetchArchivedWorkspaceTasks,
  fetchWorkspaceRuntimeSessionsList,
  fetchWorkspaceTasks,
  patchWorkspaceTask,
  type WorkspaceRuntimeSession,
  type WorkspaceTask
} from "../../lib/api/dataPlane";
import { parseNestErrorMessage } from "../../lib/api/http-core";
import {
  ensureChatRuntimeSessionId,
  ensureTaskSourceRuntimeSessionId,
  findChatRuntimeSessionId
} from "../../lib/workspace/resolveRuntimeSession";
import { MobileSidebarTrigger } from "../../components/navigation/MobileSidebarTrigger";
import {
  buildSessionRow,
  buildTaskRow,
  getSourceBadge,
  parseTaskIntent,
  rowMatchesFilter
} from "../../lib/tasks/taskUtils";
import {
  TASK_FILTER_LABELS,
  type TaskDisplayRow,
  type TaskFilter
} from "../../lib/tasks/taskTypes";

// ─── Constants ──────────────────────────────────────────────────────────────

const FILTERS: TaskFilter[] = [
  "all", "active", "queued", "waiting", "completed", "from_chat", "from_studio", "from_call"
];

const QUICK_STARTERS = [
  "Remind me tomorrow morning",
  "Follow up on this later",
  "Schedule a weekly review",
  "Queue for next session",
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface ToastMsg {
  id:   string;
  type: "error" | "success";
  text: string;
}

type CtaState = "idle" | "submitting" | "queued";

// ─── Page ───────────────────────────────────────────────────────────────────

export function TasksPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();
  const { openRuntimeDrawer, runtimeDrawerSessionId: currentDrawerSessionId } = useMalvAppShell();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // "archived" view is toggled via ?view=archived in the URL
  const viewMode = searchParams.get("view") === "archived" ? "archived" : "queue";
  const isArchivedView = viewMode === "archived";

  const [createDraft, setCreateDraft] = useState("");
  const [ctaState, setCtaState]       = useState<CtaState>("idle");
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [filter, setFilter]   = useState<TaskFilter>("all");
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [toasts, setToasts]   = useState<ToastMsg[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const pushToast = useCallback((type: ToastMsg["type"], text: string) => {
    const id = String(Date.now());
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  // ── Queries ───────────────────────────────────────────────────────────────

  const tasksQ = useQuery({
    queryKey: ["workspace", "tasks", "all"],
    queryFn:  () => fetchWorkspaceTasks(token!, { limit: 80 }),
    enabled:  Boolean(token),
    refetchInterval: 5_000,
    refetchOnWindowFocus: true
  });

  const sessionsQ = useQuery({
    queryKey: ["workspace", "runtime-sessions"],
    queryFn:  () => fetchWorkspaceRuntimeSessionsList(token!, { limit: 60 }),
    enabled:  Boolean(token),
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    retry: 1
  });

  // Dedicated archived query — only active when in archived view.
  // Uses status=archived so it is never polluted by active task limit.
  const archivedQ = useQuery({
    queryKey: ["workspace", "tasks", "archived"],
    queryFn:  () => fetchArchivedWorkspaceTasks(token!),
    enabled:  Boolean(token) && isArchivedView,
    refetchOnWindowFocus: true,
    staleTime: 0
  });

  const workspaceTasks: WorkspaceTask[]            = tasksQ.data?.ok    ? (tasksQ.data.tasks    ?? []) : [];
  const archivedTasks: WorkspaceTask[]             = archivedQ.data?.ok ? (archivedQ.data.tasks  ?? []) : [];
  const runtimeSessions: WorkspaceRuntimeSession[] = sessionsQ.data?.ok ? (sessionsQ.data.sessions ?? []) : [];

  // ── Derived rows ──────────────────────────────────────────────────────────

  const allRows = useMemo<TaskDisplayRow[]>(() => {
    if (isArchivedView) {
      // Archived view — source is the dedicated archivedTasks query, not the queue query.
      // Sorted newest-archived-first.
      return archivedTasks
        .map(buildTaskRow)
        .sort((a, b) => b.sortTime - a.sortTime);
    }

    const chatConvIds = new Set(
      runtimeSessions.filter((s) => s.sourceType === "chat").map((s) => s.sourceId)
    );
    const rows: TaskDisplayRow[] = [
      ...runtimeSessions.map(buildSessionRow),
      ...workspaceTasks
        // Archived tasks are fully removed from the active queue — no ghost entries
        .filter((t) => t.status !== "archived")
        .filter((t) => !(t.conversationId && chatConvIds.has(t.conversationId)))
        .map(buildTaskRow)
    ];
    rows.sort((a, b) => b.sortTime - a.sortTime);
    return rows;
  }, [runtimeSessions, workspaceTasks, archivedTasks, isArchivedView]);

  const counts = useMemo(() => {
    const c: Partial<Record<TaskFilter, number>> = {};
    for (const f of FILTERS) {
      if (f !== "all") c[f] = allRows.filter((r) => rowMatchesFilter(r, f)).length;
    }
    // "completed" count is also shown in filter bar — always compute it
    c.completed = allRows.filter((r) => r.uiStatus === "completed").length;
    return c;
  }, [allRows]);

  const visibleRows = useMemo(
    // In archived view, allRows is already the correct set — no filter needed.
    // Applying rowMatchesFilter here would incorrectly exclude archived tasks
    // because they have uiStatus === "completed" which "all" filter excludes.
    () => isArchivedView ? allRows : allRows.filter((r) => rowMatchesFilter(r, filter)),
    [allRows, filter, isArchivedView]
  );

  const activeCount   = allRows.filter((r) => r.uiStatus === "running").length;
  const waitingCount  = allRows.filter((r) => r.uiStatus === "awaiting_input" || r.uiStatus === "awaiting_approval").length;
  const failedCount   = allRows.filter((r) => r.uiStatus === "failed").length;
  // Active queue count — excludes completed tasks so header reflects live work only
  const queuedCount   = allRows.filter((r) => r.uiStatus !== "completed").length;
  const completedCount = allRows.filter((r) => r.uiStatus === "completed").length;

  // ── Intent parsing ────────────────────────────────────────────────────────

  const intent  = useMemo(() => parseTaskIntent(createDraft), [createDraft]);
  const hasChips = Boolean(intent.dueHint || intent.priorityHint || intent.actionHint);

  // Derive CTA label from parsed intent
  const ctaLabel =
    intent.actionHint === "remind"   ? "Set reminder" :
    intent.actionHint === "schedule" ? "Schedule"     :
    intent.actionHint === "execute"  ? "Run this"     : "Queue";

  // ── URL → drawer ──────────────────────────────────────────────────────────

  const urlSessionId = searchParams.get("runtimeSessionId")?.trim() ?? "";
  useEffect(() => {
    if (!urlSessionId) return;
    // Skip if already open for this exact session — prevents wiping taskTitle
    // that was set synchronously when onRowActivate called openRuntimeDrawer
    if (currentDrawerSessionId === urlSessionId) return;
    openRuntimeDrawer({ sessionId: urlSessionId });
  }, [urlSessionId, openRuntimeDrawer, currentDrawerSessionId]);

  // ── Close menu on outside click ───────────────────────────────────────────

  useEffect(() => {
    if (!menuKey) return;
    const onDown = (e: PointerEvent) => {
      // composedPath() is used instead of e.target.closest() because e.target may be
      // a deep SVG child element (e.g. <path> inside <MoreHorizontal>) which can fail
      // to traverse into parent HTML elements in some browsers/React-18 flush cycles,
      // causing the outside-click handler to fire and close the menu mid-toggle.
      const inMenu = e.composedPath().some(
        (el) => el instanceof Element && el.hasAttribute("data-malv-task-menu")
      );
      if (inMenu) return;
      setMenuKey(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [menuKey]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const pushRuntimeUrl = useCallback(
    (sessionId: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("runtimeSessionId", sessionId);
        return next;
      }, { replace: true });
    },
    [setSearchParams]
  );

  const onRowActivate = useCallback(
    async (row: TaskDisplayRow, entryContext?: RuntimeEntryContext) => {
      if (row.kind === "session" && row.sessionId) {
        openRuntimeDrawer({ sessionId: row.sessionId, conversationId: row.conversationId, entryContext });
        pushRuntimeUrl(row.sessionId);
        return;
      }
      if (!token || !row.task) return;
      const task = row.task;
      setRowBusy(row.key);
      try {
        const conv = task.conversationId?.trim();
        if (conv) {
          let sid = findChatRuntimeSessionId(runtimeSessions, conv);
          if (!sid) sid = await ensureChatRuntimeSessionId(token, conv);
          await queryClient.invalidateQueries({ queryKey: ["workspace", "runtime-sessions"] });
          openRuntimeDrawer({ sessionId: sid, conversationId: conv, taskTitle: task.title, entryContext });
          pushRuntimeUrl(sid);
          return;
        }
        const sid = await ensureTaskSourceRuntimeSessionId(token, task.id);
        await queryClient.invalidateQueries({ queryKey: ["workspace", "runtime-sessions"] });
        openRuntimeDrawer({ sessionId: sid, conversationId: null, taskTitle: task.title, entryContext });
        pushRuntimeUrl(sid);
      } catch (e) {
        pushToast("error", e instanceof Error ? parseNestErrorMessage(e) : "Could not open runtime.");
      } finally {
        setRowBusy(null);
      }
    },
    [openRuntimeDrawer, pushRuntimeUrl, pushToast, queryClient, runtimeSessions, token]
  );

  const completeTask = async (task: WorkspaceTask) => {
    if (!token) return;
    try {
      await completeWorkspaceTask(token, task.id);
      await queryClient.invalidateQueries({ queryKey: ["workspace", "tasks"] });
    } catch (e) {
      pushToast("error", e instanceof Error ? parseNestErrorMessage(e) : "Could not complete task.");
    }
    setMenuKey(null);
  };

  const dismissTask = async (task: WorkspaceTask) => {
    if (!token) return;
    try {
      // In-progress → pause back to todo; todo → complete (dismiss from queue)
      if (task.status === "in_progress") {
        await patchWorkspaceTask(token, task.id, { status: "todo" });
      } else {
        await completeWorkspaceTask(token, task.id);
      }
      await queryClient.invalidateQueries({ queryKey: ["workspace", "tasks"] });
    } catch (e) {
      pushToast("error", e instanceof Error ? parseNestErrorMessage(e) : "Could not update task.");
    }
    setMenuKey(null);
  };

  const doArchive = async (task: WorkspaceTask) => {
    if (!token) return;
    try {
      await archiveWorkspaceTask(token, task.id);
      // Invalidate both queues so both views update immediately
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace", "tasks", "all"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace", "tasks", "archived"] })
      ]);
    } catch (e) {
      pushToast("error", e instanceof Error ? parseNestErrorMessage(e) : "Could not archive task.");
    }
    setMenuKey(null);
  };

  const restoreTask = async (task: WorkspaceTask) => {
    if (!token) return;
    try {
      await patchWorkspaceTask(token, task.id, { status: "todo" });
      // Invalidate both queues so both views update immediately
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace", "tasks", "all"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace", "tasks", "archived"] })
      ]);
    } catch (e) {
      pushToast("error", e instanceof Error ? parseNestErrorMessage(e) : "Could not restore task.");
    }
    setMenuKey(null);
  };

  // Open the runtime drawer for a task — session status drives the displayed state
  const runTask = useCallback(
    async (row: TaskDisplayRow, entryContext?: RuntimeEntryContext) => {
      if (!token || !row.task) return;
      await onRowActivate(row, entryContext);
    },
    [token, onRowActivate]
  );

  const openInChat = (task: WorkspaceTask) => {
    const conv = task.conversationId?.trim();
    // Guard: only navigate when a real conversation exists.
    // Never fall back to a fresh disconnected chat.
    if (!conv) return;
    navigate(`/app/chat?conversationId=${encodeURIComponent(conv)}`);
    setMenuKey(null);
  };

  // ── Create — stays on Tasks page, no chat redirect ────────────────────────

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = createDraft.trim();
    if (!title || !token || ctaState !== "idle") return;
    setCtaState("submitting");
    try {
      const res = await createWorkspaceTask(token, {
        title: title.slice(0, 500),
        description: null,
        source:       "manual",
        sourceSurface:"manual",
        status:       "todo",
        priority:     intent.priorityHint === "high" ? "high" : "normal",
        executionType:
          intent.actionHint === "remind"   ? "reminder"  :
          intent.actionHint === "schedule" ? "scheduled" : "manual"
      });
      if (!res.ok || !res.task) throw new Error("Could not queue task.");
      setCreateDraft("");
      setCtaState("queued");
      setJustCreatedId(res.task.id);
      setTimeout(() => { setCtaState("idle"); setJustCreatedId(null); }, 1600);
      await queryClient.invalidateQueries({ queryKey: ["workspace", "tasks"] });
    } catch (e) {
      pushToast("error", e instanceof Error ? parseNestErrorMessage(e) : "Could not create task.");
      setCtaState("idle");
    }
  };

  const loading      = isArchivedView ? archivedQ.isLoading : tasksQ.isLoading;
  const tasksError   = isArchivedView ? archivedQ.error    : tasksQ.error;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="mb-7 flex items-start gap-3">
        {!isArchivedView && <MobileSidebarTrigger />}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {isArchivedView ? (
                /* ── Archived view header ── */
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    aria-label="Back to queue"
                    onClick={() => setSearchParams((p) => { const n = new URLSearchParams(p); n.delete("view"); return n; }, { replace: true })}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-opacity duration-150 hover:opacity-80"
                    style={{
                      background: "rgb(var(--malv-surface-raised-rgb))",
                      border:     "1px solid rgb(var(--malv-border-rgb) / 0.1)"
                    }}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" style={{ color: "rgb(var(--malv-muted-rgb))" }} />
                  </button>
                  <div>
                    <h1 className="text-[19px] font-semibold tracking-tight sm:text-[21px]" style={{ color: "rgb(var(--malv-text-rgb))" }}>
                      Archive
                    </h1>
                    <p className="mt-0.5 text-[12.5px]" style={{ color: "rgb(var(--malv-muted-rgb))", opacity: 0.5 }}>
                      {loading ? "Loading…" : allRows.length > 0 ? `${allRows.length} archived task${allRows.length !== 1 ? "s" : ""}` : "Nothing archived"}
                    </p>
                  </div>
                </div>
              ) : (
                /* ── Queue view header ── */
                <div>
                  <h1 className="text-[19px] font-semibold tracking-tight sm:text-[21px]" style={{ color: "rgb(var(--malv-text-rgb))" }}>
                    Tasks
                  </h1>
                  <p className="mt-0.5 text-[12.5px]" style={{ color: "rgb(var(--malv-muted-rgb))", opacity: 0.55 }}>
                    {loading
                      ? "Loading…"
                      : failedCount > 0
                        ? `${failedCount} need attention${activeCount > 0 ? ` · ${activeCount} running` : ""}`
                        : activeCount > 0 || waitingCount > 0
                          ? [
                              activeCount  > 0 ? `${activeCount} running`   : null,
                              waitingCount > 0 ? `${waitingCount} waiting`   : null,
                            ].filter(Boolean).join(" · ")
                          : queuedCount > 0
                            ? `${queuedCount} in queue${completedCount > 0 ? ` · ${completedCount} done` : ""}`
                            : "Queue is clear"}
                  </p>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 pt-1">
              {/* Live indicator — only shown when tasks are actively running; refresh is silent */}
              {!isArchivedView && activeCount > 0 ? (
                <div className="flex h-4 w-4 items-center justify-center">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-25" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                </div>
              ) : null}

              {/* Archive icon — stable position, unaffected by indicator changes */}
              {!isArchivedView ? (
                <button
                  type="button"
                  aria-label="View archived tasks"
                  title="Archived tasks"
                  onClick={() => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("view", "archived"); return n; }, { replace: true })}
                  className="malv-archive-btn flex h-7 w-7 items-center justify-center rounded-lg"
                >
                  <Archive className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* ── Task capture — hidden in archived view ─────────────────────────── */}
      <form onSubmit={(e) => void submitCreate(e)} className={isArchivedView ? "hidden" : "mb-6"}>

        {/* Input row — malv-task-input-surface kills ALL browser focus rings at the CSS layer */}
        <div
          className="malv-task-input-surface flex items-center gap-2 rounded-xl px-4 py-3 sm:px-5 sm:py-3.5"
          style={{
            background: "rgb(var(--malv-surface-raised-rgb))",
            border:     "1px solid rgb(var(--malv-border-rgb) / 0.12)"
          }}
        >
          <label className="sr-only" htmlFor="task-capture">New task for MALV</label>
          <input
            ref={inputRef}
            id="task-capture"
            value={createDraft}
            onChange={(e) => setCreateDraft(e.target.value)}
            disabled={ctaState === "submitting"}
            autoComplete="off"
            spellCheck={false}
            placeholder="What should MALV handle next?"
            className="malv-task-input-field min-w-0 flex-1 text-[14px] sm:text-[14.5px]"
            style={{
              color:      "rgb(var(--malv-text-rgb))",
              caretColor: "rgb(var(--malv-text-rgb))"
            }}
          />

          {/* State-aware CTA */}
          <AnimatePresence mode="wait">
            {ctaState === "queued" ? (
              <motion.span
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{   opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.12 }}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
                style={{
                  background: "rgb(var(--malv-surface-raised-rgb))",
                  color:      "rgb(52 211 153 / 0.85)",
                  border:     "1px solid rgb(52 211 153 / 0.18)"
                }}
              >
                <Check className="h-3 w-3" />
                Queued
              </motion.span>
            ) : ctaState === "submitting" ? (
              <motion.span
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{   opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5"
                style={{
                  background: "rgb(var(--malv-text-rgb) / 0.08)",
                  color:      "rgb(var(--malv-muted-rgb))"
                }}
              >
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              </motion.span>
            ) : createDraft.trim() ? (
              <motion.button
                key="cta"
                type="submit"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{   opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.12 }}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity duration-100 hover:opacity-80"
                style={{
                  background: "rgb(var(--malv-text-rgb) / 0.08)",
                  color:      "rgb(var(--malv-text-rgb) / 0.75)",
                  border:     "1px solid rgb(var(--malv-border-rgb) / 0.12)"
                }}
              >
                <span>{ctaLabel}</span>
                <svg className="h-3 w-3 opacity-50" viewBox="0 0 12 12" fill="none">
                  <path d="M1 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Intent chips — below input, only when detected */}
        <AnimatePresence>
          {hasChips && ctaState === "idle" ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{   opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="mt-2 flex flex-wrap items-center gap-1.5 px-0.5">
                <span className="text-[10.5px] uppercase tracking-widest" style={{ color: "rgb(var(--malv-muted-rgb))", opacity: 0.38 }}>
                  Detected
                </span>
                {intent.actionHint ? (
                  <IntentChip
                    icon={intent.actionHint === "execute" ? Zap : Clock}
                    label={
                      intent.actionHint === "remind"   ? "Reminder"  :
                      intent.actionHint === "schedule" ? "Schedule"  : "Execute"
                    }
                  />
                ) : null}
                {intent.dueHint     ? <IntentChip icon={Clock} label={intent.dueHint} /> : null}
                {intent.priorityHint ? <IntentChip icon={Zap}  label="High priority" urgent /> : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Quick starters */}
        <AnimatePresence>
          {!createDraft.trim() && !loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{   opacity: 0 }}
              transition={{ duration: 0.18, delay: 0.06 }}
              className="mt-2.5 flex flex-wrap gap-1.5"
            >
              {QUICK_STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setCreateDraft(s); inputRef.current?.focus(); }}
                  className="rounded-full px-2.5 py-1 text-[11px] transition-opacity duration-150 hover:opacity-100"
                  style={{
                    background: "rgb(var(--malv-surface-raised-rgb))",
                    border:     "1px solid rgb(var(--malv-border-rgb) / 0.09)",
                    color:      "rgb(var(--malv-muted-rgb))",
                    opacity:    0.6
                  }}
                >
                  {s}
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </form>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      {!isArchivedView && <div className="mb-5 h-px" style={{ background: "rgb(var(--malv-border-rgb) / 0.07)" }} aria-hidden />}

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {tasksError ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{   opacity: 0, height: 0 }}
            className="mb-5 overflow-hidden"
          >
            <div
              className="flex items-start gap-3 rounded-xl px-4 py-3"
              style={{
                background: "rgb(239 68 68 / 0.05)",
                border:     "1px solid rgb(239 68 68 / 0.13)"
              }}
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "rgb(248 113 113 / 0.75)" }} />
              <div className="min-w-0">
                <p className="text-[12px] font-medium" style={{ color: "rgb(248 113 113 / 0.88)" }}>Queue unavailable</p>
                <p className="mt-0.5 text-[11px]" style={{ color: "rgb(248 113 113 / 0.5)" }}>
                  {tasksError instanceof Error ? parseNestErrorMessage(tasksError) : "Will retry automatically."}
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── Filter bar — queue view only ───────────────────────────────────── */}
      <AnimatePresence>
        {!isArchivedView && !loading && (queuedCount > 0 || completedCount > 0) ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-4 flex gap-0.5 overflow-x-auto pb-0.5"
            style={{ scrollbarWidth: "none" }}
          >
            {FILTERS.map((f) => {
              const count  = f === "all" ? queuedCount : (counts[f] ?? 0);
              const active = filter === f;
              if (f !== "all" && count === 0) return null;

              const t = FILTER_CHIP_THEME[f] ?? FILTER_CHIP_THEME.all;

              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-all duration-150"
                  style={
                    active
                      ? { background: t.activeBg, color: t.activeColor, border: `1px solid ${t.activeBorder}` }
                      : { background: "transparent", color: "rgba(140,140,145,0.7)", border: "1px solid transparent" }
                  }
                >
                  {/* Color dot */}
                  {t.dot ? (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full transition-opacity duration-150"
                      style={{ background: t.dot, opacity: active ? 1 : 0.55 }}
                    />
                  ) : null}

                  {TASK_FILTER_LABELS[f]}

                  {/* Count badge */}
                  {count > 0 ? (
                    <span
                      className="tabular-nums rounded-full px-1.5 py-px text-[10px] font-semibold"
                      style={
                        active
                          ? { background: t.countBg, color: t.countColor }
                          : { background: "rgba(148,163,184,0.1)", color: "rgba(148,163,184,0.65)" }
                      }
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── Task list ──────────────────────────────────────────────────────── */}
      {loading ? (
        <SkeletonList />
      ) : visibleRows.length === 0 ? (
        isArchivedView
          ? <ArchivedEmptyState />
          : <EmptyState filter={filter} hasAny={queuedCount > 0 || completedCount > 0} />
      ) : (
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {visibleRows.map((row, idx) => (
              <TaskRow
                key={row.key}
                row={row}
                index={idx}
                busy={rowBusy === row.key}
                menuOpen={menuKey === row.key}
                isNew={justCreatedId !== null && row.task?.id === justCreatedId}
                onActivate={() => {
                  const ctx: RuntimeEntryContext | undefined =
                    row.uiStatus === "running"
                      ? { intent: "Resuming execution",     sourceAction: "open_run" }
                      : row.uiStatus === "awaiting_approval" || row.uiStatus === "awaiting_input"
                        ? { intent: "Reviewing decision",   sourceAction: "open_run" }
                        : row.uiStatus === "failed"
                          ? { intent: "Reviewing failure",  sourceAction: "open_run" }
                          : undefined;
                  void onRowActivate(row, ctx);
                }}
                onRun={
                  row.task && (row.uiStatus === "queued" || row.uiStatus === "failed")
                    ? () => { void runTask(row, { intent: "Ready to begin execution", sourceAction: "open_run" }); setMenuKey(null); }
                    : undefined
                }
                onMenuToggle={() => setMenuKey(menuKey === row.key ? null : row.key)}
                onComplete={
                  !isArchivedView && row.task && row.task.status !== "done" && row.task.status !== "archived"
                    ? () => void completeTask(row.task!)
                    : undefined
                }
                onDismiss={
                  !isArchivedView && row.task && row.task.status !== "done" && row.task.status !== "archived"
                    ? () => void dismissTask(row.task!)
                    : undefined
                }
                onArchive={
                  !isArchivedView && row.task && row.task.status !== "archived"
                    ? () => void doArchive(row.task!)
                    : undefined
                }
                onRestore={
                  isArchivedView && row.task
                    ? () => void restoreTask(row.task!)
                    : undefined
                }
                onReschedule={
                  !isArchivedView && row.task && row.task.status !== "done" && row.task.status !== "archived"
                    ? () => { void runTask(row, { intent: "Adjusting task schedule", sourceAction: "reschedule" }); setMenuKey(null); }
                    : undefined
                }
                onOpenInChat={
                  // Only expose "Open in Chat" when the task has a real linked conversation.
                  // Never route to a fresh disconnected chat.
                  row.task?.conversationId?.trim()
                    ? () => openInChat(row.task!)
                    : undefined
                }
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* ── Toast stack ────────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[9999] flex -translate-x-1/2 flex-col-reverse gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 14, scale: 0.95 }}
              animate={{ opacity: 1, y: 0,  scale: 1    }}
              exit={{   opacity: 0, y: 6,   scale: 0.95 }}
              transition={{ duration: 0.18, type: "spring", stiffness: 360, damping: 28 }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-[13px]"
              style={{
                background:     "rgb(var(--malv-surface-overlay-rgb))",
                border:         t.type === "error" ? "1px solid rgb(239 68 68 / 0.18)" : "1px solid rgb(52 211 153 / 0.18)",
                boxShadow:      "0 8px 28px rgb(0 0 0 / 0.25)",
                backdropFilter: "blur(12px)"
              }}
            >
              {t.type === "error"
                ? <AlertCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "rgb(248 113 113 / 0.82)" }} />
                : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "rgb(52 211 153 / 0.82)" }} />
              }
              <span style={{ color: "rgb(var(--malv-text-rgb))", opacity: 0.88 }}>{t.text}</span>
              <button
                type="button"
                className="ml-0.5 opacity-30 transition-opacity hover:opacity-65"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              >
                <X className="h-3 w-3" style={{ color: "rgb(var(--malv-muted-rgb))" }} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Intent Chip ─────────────────────────────────────────────────────────────

function IntentChip({ icon: Icon, label, urgent }: { icon: typeof Clock; label: string; urgent?: boolean }) {
  return (
    <span
      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
      style={{
        background: urgent ? "rgb(251 191 36 / 0.09)" : "rgb(var(--malv-surface-overlay-rgb))",
        border:     urgent ? "1px solid rgb(251 191 36 / 0.18)" : "1px solid rgb(var(--malv-border-rgb) / 0.11)",
        color:      urgent ? "rgb(251 191 36 / 0.82)"           : "rgb(var(--malv-muted-rgb))"
      }}
    >
      <Icon className="h-2.5 w-2.5 opacity-55" />
      {label}
    </span>
  );
}

// ─── Task Status Dot ─────────────────────────────────────────────────────────
// Small left-side indicator — color-coded, animated for running state.

function TaskStatusDot({ status }: { status: TaskDisplayRow["uiStatus"] }) {
  if (status === "running") {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-30" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </span>
    );
  }
  const dotStyle: Record<string, React.CSSProperties> = {
    failed:            { background: "rgba(248,113,113,0.9)" },
    awaiting_approval: { background: "rgba(251,191,36,0.9)"  },
    awaiting_input:    { background: "rgba(251,191,36,0.9)"  },
    scheduled:         { background: "rgba(167,139,250,0.75)" },
    completed:         { background: "rgba(52,211,153,0.55)"  },
  };
  const s = dotStyle[status];
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={s ?? { border: "1.5px solid rgba(148,163,184,0.35)" }}
    />
  );
}

// ─── Status chip config — module-level, never rebuilt on render ──────────────

const STATUS_CHIP_CFG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  running:           { label: "Running",         bg: "rgba(52,211,153,0.15)",  color: "rgba(52,211,153,1)",    border: "1px solid rgba(52,211,153,0.3)"  },
  queued:            { label: "In queue",        bg: "rgba(148,163,184,0.13)", color: "rgba(148,163,184,1)",   border: "1px solid rgba(148,163,184,0.26)" },
  scheduled:         { label: "Scheduled",       bg: "rgba(167,139,250,0.15)", color: "rgba(167,139,250,1)",   border: "1px solid rgba(167,139,250,0.28)" },
  awaiting_input:    { label: "Needs input",     bg: "rgba(251,191,36,0.14)",  color: "rgba(251,191,36,1)",    border: "1px solid rgba(251,191,36,0.28)"  },
  awaiting_approval: { label: "Needs approval",  bg: "rgba(251,191,36,0.14)",  color: "rgba(251,191,36,1)",    border: "1px solid rgba(251,191,36,0.28)"  },
  failed:            { label: "Failed",          bg: "rgba(248,113,113,0.15)", color: "rgba(248,113,113,1)",   border: "1px solid rgba(248,113,113,0.3)"  },
  completed:         { label: "Done",            bg: "rgba(52,211,153,0.1)",   color: "rgba(52,211,153,0.82)", border: "1px solid rgba(52,211,153,0.22)"  },
};

// ─── Filter bar color theme — module-level, never rebuilt on render ───────────

const FILTER_CHIP_THEME: Record<string, { dot: string; activeBg: string; activeBorder: string; activeColor: string; countBg: string; countColor: string }> = {
  all:         { dot: "",                  activeBg: "rgb(var(--malv-text-rgb) / 0.08)", activeBorder: "rgb(var(--malv-text-rgb) / 0.14)", activeColor: "rgb(var(--malv-text-rgb))", countBg: "rgb(var(--malv-text-rgb) / 0.1)", countColor: "rgb(var(--malv-text-rgb) / 0.72)"  },
  active:      { dot: "rgba(52,211,153,1)", activeBg: "rgba(52,211,153,0.13)",  activeBorder: "rgba(52,211,153,0.3)",  activeColor: "rgba(52,211,153,1)",     countBg: "rgba(52,211,153,0.2)",   countColor: "rgba(52,211,153,1)"      },
  queued:      { dot: "rgba(148,163,184,1)",activeBg: "rgba(148,163,184,0.11)", activeBorder: "rgba(148,163,184,0.25)",activeColor: "rgba(148,163,184,1)",    countBg: "rgba(148,163,184,0.16)", countColor: "rgba(148,163,184,1)"     },
  waiting:     { dot: "rgba(251,191,36,1)", activeBg: "rgba(251,191,36,0.12)",  activeBorder: "rgba(251,191,36,0.28)", activeColor: "rgba(251,191,36,1)",     countBg: "rgba(251,191,36,0.18)",   countColor: "rgba(251,191,36,1)"      },
  completed:   { dot: "rgba(52,211,153,1)", activeBg: "rgba(52,211,153,0.11)",  activeBorder: "rgba(52,211,153,0.26)", activeColor: "rgba(52,211,153,0.9)",   countBg: "rgba(52,211,153,0.16)",  countColor: "rgba(52,211,153,0.9)"    },
  from_chat:   { dot: "rgba(96,165,250,1)", activeBg: "rgba(96,165,250,0.12)",  activeBorder: "rgba(96,165,250,0.28)", activeColor: "rgba(96,165,250,1)",     countBg: "rgba(96,165,250,0.18)",  countColor: "rgba(96,165,250,1)"      },
  from_studio: { dot: "rgba(167,139,250,1)",activeBg: "rgba(167,139,250,0.12)", activeBorder: "rgba(167,139,250,0.28)",activeColor: "rgba(167,139,250,1)",    countBg: "rgba(167,139,250,0.18)", countColor: "rgba(167,139,250,1)"     },
  from_call:   { dot: "rgba(34,211,238,1)", activeBg: "rgba(34,211,238,0.11)",  activeBorder: "rgba(34,211,238,0.26)", activeColor: "rgba(34,211,238,1)",     countBg: "rgba(34,211,238,0.17)",  countColor: "rgba(34,211,238,1)"      },
};

// ─── Task Status Chip ─────────────────────────────────────────────────────────

function TaskStatusChip({ status }: { status: TaskDisplayRow["uiStatus"] }) {
  const c = STATUS_CHIP_CFG[status] ?? STATUS_CHIP_CFG.queued;
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: c.bg, color: c.color, border: c.border }}
    >
      {c.label}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div className="space-y-1.5">
      {[1, 0.6, 0.38, 0.18].map((op, i) => (
        <div
          key={i}
          className="h-[66px] animate-pulse rounded-xl sm:h-[70px]"
          style={{ background: "rgb(var(--malv-surface-raised-rgb))", opacity: op }}
        />
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ filter, hasAny }: { filter: TaskFilter; hasAny: boolean }) {
  if (hasAny) {
    return (
      <div className="py-14 text-center">
        <p className="text-[13px]" style={{ color: "rgb(var(--malv-muted-rgb))", opacity: 0.42 }}>
          No {TASK_FILTER_LABELS[filter].toLowerCase()} tasks.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26 }}
      className="flex flex-col items-center px-4 py-14 text-center"
    >
      <div
        className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{
          background: "rgb(var(--malv-surface-raised-rgb))",
          border:     "1px solid rgb(var(--malv-border-rgb) / 0.1)"
        }}
      >
        <Zap className="h-5 w-5" style={{ color: "rgb(var(--malv-muted-rgb))", opacity: 0.38 }} />
      </div>

      <p className="text-[15px] font-medium" style={{ color: "rgb(var(--malv-text-rgb))", opacity: 0.62 }}>
        Queue is clear
      </p>
      <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed" style={{ color: "rgb(var(--malv-muted-rgb))", opacity: 0.5 }}>
        Add a task above. MALV also picks up tasks from chat, Studio, and active calls.
      </p>

      <div className="mt-7 grid w-full max-w-sm grid-cols-1 gap-1.5 text-left sm:grid-cols-2">
        {EMPTY_PATTERNS.map((p) => (
          <div
            key={p.title}
            className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
            style={{ background: "rgb(var(--malv-surface-raised-rgb))", border: "1px solid rgb(var(--malv-border-rgb) / 0.07)" }}
          >
            <p.icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "rgb(var(--malv-text-rgb))", opacity: 0.25 }} />
            <div>
              <p className="text-[12px] font-medium" style={{ color: "rgb(var(--malv-text-rgb))", opacity: 0.68 }}>{p.title}</p>
              <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "rgb(var(--malv-muted-rgb))", opacity: 0.48 }}>{p.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

const EMPTY_PATTERNS = [
  { icon: MessageSquare, title: "Say it in chat",  desc: '"Do this later", "Remind me", "Review after"' },
  { icon: Sparkles,      title: "From Studio",     desc: "Turn a proposed change into a task" },
  { icon: Clock,         title: "Schedule it",     desc: '"Tomorrow morning", "Next week", "At 5pm"' },
  { icon: Zap,           title: "Direct capture",  desc: "Type above and MALV queues it instantly" },
];

// ─── Archived empty state ─────────────────────────────────────────────────────

function ArchivedEmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="flex flex-col items-center px-4 py-14 text-center"
    >
      <div
        className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl"
        style={{
          background: "rgb(var(--malv-surface-raised-rgb))",
          border:     "1px solid rgb(var(--malv-border-rgb) / 0.1)"
        }}
      >
        <Archive className="h-4.5 w-4.5" style={{ color: "rgb(var(--malv-muted-rgb))", opacity: 0.38 }} />
      </div>
      <p className="text-[14px] font-medium" style={{ color: "rgb(var(--malv-text-rgb))", opacity: 0.58 }}>
        No archived tasks
      </p>
      <p className="mt-1 text-[12.5px]" style={{ color: "rgb(var(--malv-muted-rgb))", opacity: 0.45 }}>
        Tasks you archive from the queue appear here.
      </p>
    </motion.div>
  );
}

// ─── Operator menu helpers ────────────────────────────────────────────────────

interface MenuButtonProps {
  icon: React.ElementType;
  label: string;
  desc?: string;
  variant?: "default" | "muted" | "destructive";
  onClick: () => void;
}

function MenuButton({ icon: Icon, label, desc, variant = "default", onClick }: MenuButtonProps) {
  const [hovered, setHovered] = useState(false);

  const labelColor =
    variant === "destructive"
      ? `rgba(248,113,113,${hovered ? 0.88 : 0.62})`
      : variant === "muted"
        ? (hovered ? "rgb(var(--malv-text-rgb) / 0.68)" : "rgb(var(--malv-text-rgb) / 0.46)")
        : (hovered ? "rgb(var(--malv-text-rgb) / 0.92)" : "rgb(var(--malv-text-rgb) / 0.72)");

  return (
    <button
      type="button"
      style={{
        display:    "flex",
        width:      "100%",
        alignItems: "flex-start",
        gap:        "0.625rem",
        padding:    "0.4375rem 0.875rem",
        textAlign:  "left",
        background: hovered ? "rgb(var(--malv-border-rgb) / 0.07)" : "transparent",
        border:     "none",
        cursor:     "pointer",
        transition: "background 100ms"
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <Icon
        style={{
          width:      "0.8125rem",
          height:     "0.8125rem",
          flexShrink: 0,
          marginTop:  "0.15rem",
          color:      labelColor,
          opacity:    hovered ? 0.9 : 0.55,
          transition: "opacity 100ms"
        }}
      />
      <div style={{ minWidth: 0 }}>
        <p style={{
          fontSize:   "12.5px",
          fontWeight: 500,
          lineHeight: 1.25,
          color:      labelColor,
          margin:     0
        }}>
          {label}
        </p>
        {desc ? (
          <p style={{
            fontSize:  "10.5px",
            lineHeight: 1.4,
            marginTop: "0.2rem",
            color:     "rgb(var(--malv-muted-rgb))",
            opacity:   0.38,
            margin:    "0.2rem 0 0"
          }}>
            {desc}
          </p>
        ) : null}
      </div>
    </button>
  );
}

function MenuSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      padding:       "0.3rem 0.875rem 0.15rem",
      fontSize:      "9.5px",
      fontWeight:    600,
      letterSpacing: "0.07em",
      textTransform: "uppercase" as const,
      color:         "rgb(var(--malv-muted-rgb))",
      opacity:       0.33,
      margin:        0,
      userSelect:    "none" as const
    }}>
      {children}
    </p>
  );
}

function MenuDivider() {
  return (
    <div style={{
      height:     "1px",
      background: "rgb(var(--malv-border-rgb) / 0.09)",
      margin:     "0.2rem 0"
    }} />
  );
}

// ─── Floating menu — portal-based to escape all overflow-hidden ancestors ────

interface FloatingMenuProps {
  open:       boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  children:   React.ReactNode;
}

function FloatingMenu({ open, triggerRef, children }: FloatingMenuProps) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, triggerRef]);

  if (!open || !pos) return null;

  return createPortal(
    <motion.div
      key="floating-menu"
      initial={{ opacity: 0, scale: 0.94, y: 4 }}
      animate={{ opacity: 1, scale: 1,    y: 0 }}
      exit={{   opacity: 0, scale: 0.94,  y: 4 }}
      transition={{ duration: 0.1 }}
      data-malv-task-menu
      style={{
        position:       "fixed",
        top:            pos.top,
        right:          pos.right,
        zIndex:         9999,
        minWidth:       "15.5rem",
        maxWidth:       "18rem",
        borderRadius:   "0.75rem",
        overflow:       "hidden",
        background:     "rgb(var(--malv-surface-overlay-rgb))",
        border:         "1px solid rgb(var(--malv-border-rgb) / 0.14)",
        boxShadow:      "0 20px 56px rgb(0 0 0 / 0.32), 0 6px 16px rgb(0 0 0 / 0.12)",
        backdropFilter: "blur(20px)",
        padding:        "0"
      }}
    >
      {children}
    </motion.div>,
    document.body
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

interface TaskRowProps {
  row:          TaskDisplayRow;
  index:        number;
  busy:         boolean;
  menuOpen:     boolean;
  isNew?:       boolean;
  onActivate:   () => void;
  onRun?:       () => void;
  onMenuToggle: () => void;
  onComplete?:  () => void;
  onDismiss?:   () => void;
  onArchive?:   () => void;
  onRestore?:   () => void;
  onReschedule?:() => void;
  onOpenInChat?:() => void;
}

function TaskRow({
  row, index, busy, menuOpen, isNew = false,
  onActivate, onRun, onMenuToggle,
  onComplete, onDismiss, onArchive, onRestore, onReschedule, onOpenInChat
}: TaskRowProps) {
  const menuBtnRef  = useRef<HTMLButtonElement>(null);
  const sourceBadge = getSourceBadge(row.sourceSurface);
  const isCompleted = row.uiStatus === "completed";
  const isRunning   = row.uiStatus === "running";
  const isFailed    = row.uiStatus === "failed";
  const isWaiting   = row.uiStatus === "awaiting_approval" || row.uiStatus === "awaiting_input";
  const isScheduled = row.uiStatus === "scheduled";

  // ── Per-state card config ────────────────────────────────────────────────

  type StateTheme = {
    border:      string;
    shadow:      string;
    accentBg:    string;
    hoverBg:     string;
  };

  const theme: StateTheme = isRunning ? {
    border:   "1px solid rgb(52 211 153 / 0.22)",
    shadow:   "0 1px 3px rgb(0 0 0 / 0.06), 0 0 0 1px rgb(52 211 153 / 0.08)",
    accentBg: "rgb(52 211 153)",
    hoverBg:  "rgb(52 211 153 / 0.04)"
  } : isFailed ? {
    border:   "1px solid rgb(248 113 113 / 0.2)",
    shadow:   "0 1px 3px rgb(0 0 0 / 0.06)",
    accentBg: "rgb(248 113 113 / 0.9)",
    hoverBg:  "rgb(248 113 113 / 0.03)"
  } : isWaiting ? {
    border:   "1px solid rgb(251 191 36 / 0.18)",
    shadow:   "0 1px 3px rgb(0 0 0 / 0.05)",
    accentBg: "rgb(251 191 36 / 0.8)",
    hoverBg:  "rgb(251 191 36 / 0.03)"
  } : isScheduled ? {
    border:   "1px solid rgb(167 139 250 / 0.16)",
    shadow:   "0 1px 2px rgb(0 0 0 / 0.04)",
    accentBg: "rgb(167 139 250 / 0.7)",
    hoverBg:  "rgb(167 139 250 / 0.03)"
  } : isCompleted ? {
    border:   "1px solid rgb(var(--malv-border-rgb) / 0.06)",
    shadow:   "none",
    accentBg: "transparent",
    hoverBg:  "rgb(var(--malv-border-rgb) / 0.02)"
  } : {
    border:   `1px solid rgb(var(--malv-border-rgb) / ${isNew ? "0.22" : "0.09"})`,
    shadow:   isNew ? "0 0 0 2px rgb(var(--malv-brand-rgb) / 0.12)" : "0 1px 2px rgb(0 0 0 / 0.04)",
    accentBg: "rgb(var(--malv-border-rgb) / 0.2)",
    hoverBg:  "rgb(var(--malv-border-rgb) / 0.035)"
  };

  // ── Operator control menu — structured sections ──────────────────────────

  const isInProgress  = row.task?.status === "in_progress";
  const showOpenRun   = isRunning || !!onRun;
  const hasMenuContent = showOpenRun || !!(
    onRestore || onComplete || onOpenInChat || onReschedule || onDismiss || onArchive
  );

  return (
    <motion.li
      layout
      initial={isNew ? { opacity: 0, y: -8 } : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.18, delay: isNew ? 0 : Math.min(index * 0.018, 0.1) }}
      className="group relative"
    >
      <div
        className={[
          "relative rounded-xl transition-[border-color,box-shadow] duration-200",
          "malv-task-card",
          // neutral = no state-specific color; needs extra border help in light mode
          !isRunning && !isFailed && !isWaiting && !isScheduled ? "malv-task-card-neutral" : "",
        ].join(" ")}
        style={{
          background: "rgb(var(--malv-surface-raised-rgb))",
          border:     theme.border,
          boxShadow:  theme.shadow
        }}
      >
        {/* Left accent bar — per-state color */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-3 left-0 w-[3px] rounded-full transition-colors duration-300"
          style={{ background: theme.accentBg }}
        />

        {/* Running shimmer — subtle animated background for active tasks */}
        {isRunning ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-xl"
            style={{
              background: "linear-gradient(90deg, transparent 0%, rgb(52 211 153 / 0.03) 50%, transparent 100%)",
              animation:  "malv-task-shimmer 2.8s ease-in-out infinite"
            }}
          />
        ) : null}

        {/* Row button — extra right padding when ⋯ menu exists to avoid overlap */}
        <button
          type="button"
          disabled={busy}
          onClick={onRun ?? onActivate}
          className={[
            "relative flex w-full items-center gap-3.5 rounded-xl py-3.5 text-left outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:gap-4 sm:py-4",
            hasMenuContent
              ? "pl-4 pr-11 sm:pl-5 sm:pr-12"   /* extra right clearance for ⋯ button */
              : "px-4 sm:px-5"
          ].join(" ")}
          style={{ background: "transparent" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = theme.hoverBg; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          {/* Status indicator — left of content */}
          <TaskStatusDot status={row.uiStatus} />

          {/* Content */}
          <div className="min-w-0 flex-1">

            {/* Title row */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className="min-w-0 text-[13.5px] font-medium leading-snug sm:text-[14px]"
                style={{
                  color:               isCompleted ? "rgb(var(--malv-muted-rgb) / 0.5)" : "rgb(var(--malv-text-rgb) / 0.92)",
                  textDecoration:      isCompleted ? "line-through"                      : "none",
                  textDecorationColor: isCompleted ? "rgb(var(--malv-muted-rgb) / 0.35)" : "transparent"
                }}
              >
                {row.title}
              </span>

              {/* Priority badge */}
              {(row.task?.priority === "urgent" || row.task?.priority === "high") && !isCompleted ? (
                <span
                  className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    background: "rgb(251 191 36 / 0.09)",
                    border:     "1px solid rgb(251 191 36 / 0.16)",
                    color:      "rgb(251 191 36 / 0.82)"
                  }}
                >
                  {row.task!.priority}
                </span>
              ) : null}

              {/* Source badge */}
              {row.sourceSurface !== "manual" && row.sourceSurface !== "system" ? (
                <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${sourceBadge.colorClass}`}>
                  {sourceBadge.label}
                </span>
              ) : null}
            </div>

            {/* Meta row — status chip + time + context */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {/* Status chip — first-class state signal */}
              <TaskStatusChip status={row.uiStatus} />

              {/* Due date */}
              {row.task?.dueAt && !isCompleted ? (
                <span className="text-[11px]" style={{ color: "rgb(var(--malv-muted-rgb))", opacity: 0.5 }}>
                  due {new Date(row.task.dueAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                </span>
              ) : null}

              {/* Time */}
              <span className="text-[11px]" style={{ color: "rgb(var(--malv-muted-rgb))", opacity: 0.35 }}>
                {row.timeLabel}
              </span>

              {/* Chat link */}
              {row.conversationId && !isCompleted ? (
                <span className="flex items-center gap-0.5 text-[11px]" style={{ color: "rgb(var(--malv-muted-rgb))", opacity: 0.3 }}>
                  <MessageSquare className="h-2.5 w-2.5" />
                  linked
                </span>
              ) : null}
            </div>
          </div>

          {/* Right — per-state primary action */}
          <div className="shrink-0">
            {busy ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" style={{ color: "rgba(148,163,184,0.5)" }} />
            ) : isRunning ? (
              /* Running: open live drawer */
              <span
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: "rgba(52,211,153,0.12)", color: "rgba(52,211,153,0.95)", border: "1px solid rgba(52,211,153,0.22)" }}
              >
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                Live
              </span>
            ) : isWaiting ? (
              /* Waiting: review */
              <span
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: "rgba(251,191,36,0.1)", color: "rgba(251,191,36,0.9)", border: "1px solid rgba(251,191,36,0.2)" }}
              >
                <Activity className="h-3 w-3" />
                Review
              </span>
            ) : !isCompleted && row.uiStatus === "queued" ? (
              /* Queued: run now */
              <span
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                style={{ background: "rgba(148,163,184,0.1)", color: "rgba(148,163,184,0.85)", border: "1px solid rgba(148,163,184,0.2)" }}
              >
                <Play className="h-3 w-3" />
                Run
              </span>
            ) : isFailed ? (
              /* Failed: retry */
              <span
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: "rgba(248,113,113,0.1)", color: "rgba(248,113,113,0.9)", border: "1px solid rgba(248,113,113,0.2)" }}
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </span>
            ) : (
              <ChevronRight
                className="h-3.5 w-3.5 opacity-0 transition-opacity duration-150 group-hover:opacity-20"
                style={{ color: "rgba(148,163,184,0.7)" }}
              />
            )}
          </div>
        </button>

        {/* Context menu trigger — always at fixed right edge, never overlaps row content */}
        {row.kind === "task" && hasMenuContent ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2" data-malv-task-menu>
            <button
              ref={menuBtnRef}
              type="button"
              aria-label="Task actions"
              aria-expanded={menuOpen}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150"
              style={{
                color:      "rgba(148,163,184,0.55)",
                background: menuOpen ? "rgba(148,163,184,0.1)" : "transparent",
                border:     menuOpen ? "1px solid rgba(148,163,184,0.15)" : "1px solid transparent"
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color      = "rgb(var(--malv-text-rgb) / 0.75)";
                (e.currentTarget as HTMLElement).style.background = "rgba(148,163,184,0.1)";
                (e.currentTarget as HTMLElement).style.border     = "1px solid rgba(148,163,184,0.15)";
              }}
              onMouseLeave={(e) => {
                if (menuOpen) return;
                (e.currentTarget as HTMLElement).style.color      = "rgba(148,163,184,0.55)";
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.border     = "1px solid transparent";
              }}
              onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            <FloatingMenu open={menuOpen} triggerRef={menuBtnRef}>

              {/* Context header — task identity at a glance */}
              <div style={{
                padding:      "0.625rem 0.875rem 0.5rem",
                borderBottom: "1px solid rgb(var(--malv-border-rgb) / 0.1)"
              }}>
                <p style={{
                  fontSize:     "12px",
                  fontWeight:   500,
                  lineHeight:   1.3,
                  color:        "rgb(var(--malv-text-rgb))",
                  opacity:      0.82,
                  overflow:     "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace:   "nowrap",
                  margin:       0
                }}>
                  {row.title}
                </p>
                <div style={{ marginTop: "0.35rem" }}>
                  <TaskStatusChip status={row.uiStatus} />
                </div>
              </div>

              {/* Execution — navigation + context actions */}
              {(showOpenRun || onOpenInChat) ? (
                <div style={{ padding: "0.3rem 0 0.15rem" }}>
                  <MenuSectionLabel>Execution</MenuSectionLabel>
                  {showOpenRun ? (
                    <MenuButton
                      icon={Play}
                      label="Open run"
                      desc={isRunning ? "View live execution" : "Run this task now"}
                      onClick={() => {
                        // onRun already calls setMenuKey(null) for queued/failed tasks.
                        // For running tasks onRun is undefined; use onMenuToggle to close.
                        if (onRun) { onRun(); } else { onMenuToggle(); onActivate(); }
                      }}
                    />
                  ) : null}
                  {onOpenInChat ? (
                    <MenuButton
                      icon={MessageSquare}
                      label="Open in Chat"
                      desc="Continue this task in conversational context"
                      onClick={onOpenInChat}
                    />
                  ) : null}
                </div>
              ) : null}

              {/* Schedule — reschedule only; no snooze (unsupported) */}
              {onReschedule ? (
                <>
                  <MenuDivider />
                  <div style={{ padding: "0.15rem 0" }}>
                    <MenuSectionLabel>Schedule</MenuSectionLabel>
                    <MenuButton
                      icon={Clock}
                      label="Reschedule"
                      desc="Change when MALV should return to this task"
                      onClick={onReschedule}
                    />
                  </div>
                </>
              ) : null}

              {/* State — mark complete, restore, pause/dismiss */}
              {(onRestore || onComplete || onDismiss) ? (
                <>
                  <MenuDivider />
                  <div style={{ padding: "0.15rem 0" }}>
                    <MenuSectionLabel>State</MenuSectionLabel>
                    {onRestore ? (
                      <MenuButton
                        icon={RotateCcw}
                        label="Restore to queue"
                        desc="Move back to active queue"
                        onClick={onRestore}
                      />
                    ) : null}
                    {onComplete ? (
                      <MenuButton
                        icon={CheckCircle2}
                        label="Mark complete"
                        desc="Finalize this task and remove it from active execution"
                        onClick={onComplete}
                      />
                    ) : null}
                    {onDismiss ? (
                      <MenuButton
                        icon={XCircle}
                        label={isInProgress ? "Pause" : "Dismiss task"}
                        desc={isInProgress ? "Return to queue without completing" : "Remove from queue"}
                        variant="muted"
                        onClick={onDismiss}
                      />
                    ) : null}
                  </div>
                </>
              ) : null}

              {/* Storage — archive, kept visually distinct */}
              {onArchive ? (
                <>
                  <MenuDivider />
                  <div style={{ padding: "0.15rem 0 0.3rem" }}>
                    <MenuSectionLabel>Storage</MenuSectionLabel>
                    <MenuButton
                      icon={Archive}
                      label="Archive"
                      desc="Remove from active lists while keeping history"
                      variant="destructive"
                      onClick={onArchive}
                    />
                  </div>
                </>
              ) : null}

            </FloatingMenu>
          </div>
        ) : null}
      </div>
    </motion.li>
  );
}
