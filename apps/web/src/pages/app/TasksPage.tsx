import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, MoreHorizontal, RotateCcw, XCircle } from "lucide-react";
import { useAuth } from "../../lib/auth/AuthContext";
import { useMalvAppShell } from "../../lib/context/MalvAppShellContext";
import {
  completeWorkspaceTask,
  createWorkspaceTask,
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

type UiStatus = "pending" | "running" | "scheduled" | "completed" | "failed";

type Row =
  | {
      key: string;
      kind: "session";
      title: string;
      subtitle?: string;
      status: WorkspaceRuntimeSession["status"];
      timeLabel: string;
      sessionId: string;
      conversationId: string | null;
      sortTime: number;
    }
  | {
      key: string;
      kind: "task";
      title: string;
      status: UiStatus;
      timeLabel: string;
      task: WorkspaceTask;
      sessionId: string | null;
      sortTime: number;
    };

function sessionTitle(s: WorkspaceRuntimeSession) {
  const m = s.metadata;
  if (m && typeof m === "object" && typeof (m as Record<string, unknown>).title === "string") {
    const t = String((m as Record<string, unknown>).title).trim();
    if (t) return t;
  }
  if (s.sourceType === "chat") return "Chat execution";
  if (s.sourceType === "studio") return "Studio execution";
  return "Task execution";
}

function formatTime(iso: string | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function taskToUiStatus(task: WorkspaceTask): UiStatus {
  if (task.status === "done") return "completed";
  if (task.status === "in_progress") return "running";
  return "pending";
}

export function TasksPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();
  const { openRuntimeDrawer } = useMalvAppShell();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createDraft, setCreateDraft] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const tasksQ = useQuery({
    queryKey: ["workspace", "tasks", "all"],
    queryFn: () => fetchWorkspaceTasks(token!, { limit: 80 }),
    enabled: Boolean(token),
    refetchInterval: 12_000
  });

  const sessionsQ = useQuery({
    queryKey: ["workspace", "runtime-sessions"],
    queryFn: () => fetchWorkspaceRuntimeSessionsList(token!, { limit: 60 }),
    enabled: Boolean(token),
    refetchInterval: 8000
  });

  const workspaceTasks = tasksQ.data?.ok ? tasksQ.data.tasks ?? [] : [];
  const runtimeSessions = sessionsQ.data?.ok ? sessionsQ.data.sessions ?? [] : [];

  const rows = useMemo<Row[]>(() => {
    const byConv = new Map<string, WorkspaceRuntimeSession>();
    for (const s of runtimeSessions) {
      if (s.sourceType === "chat") byConv.set(s.sourceId, s);
    }

    const out: Row[] = [];

    for (const s of runtimeSessions) {
      const sortTime = new Date(s.updatedAt).getTime();
      out.push({
        key: `session:${s.id}`,
        kind: "session",
        title: sessionTitle(s),
        subtitle:
          s.sourceType === "chat"
            ? "Chat"
            : s.sourceType === "studio"
              ? "Studio"
              : "Task source",
        status: s.status,
        timeLabel: formatTime(s.updatedAt),
        sessionId: s.id,
        conversationId: s.sourceType === "chat" ? s.sourceId : null,
        sortTime: Number.isFinite(sortTime) ? sortTime : 0
      });
    }

    for (const t of workspaceTasks) {
      if (t.conversationId && byConv.has(t.conversationId)) continue;
      const sortIso = t.updatedAt ?? t.createdAt;
      const sortTime = sortIso ? new Date(sortIso).getTime() : 0;
      out.push({
        key: `task:${t.id}`,
        kind: "task",
        title: t.title?.trim() || "Untitled task",
        status: taskToUiStatus(t),
        timeLabel: formatTime(sortIso),
        task: t,
        sessionId: null,
        sortTime: Number.isFinite(sortTime) ? sortTime : 0
      });
    }

    out.sort((a, b) => b.sortTime - a.sortTime);

    return out;
  }, [runtimeSessions, workspaceTasks]);

  const urlSessionId = searchParams.get("runtimeSessionId")?.trim() ?? "";

  useEffect(() => {
    if (!urlSessionId) return;
    openRuntimeDrawer({ sessionId: urlSessionId });
  }, [urlSessionId, openRuntimeDrawer]);

  useEffect(() => {
    if (!menuKey) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-malv-task-menu-root]")) return;
      setMenuKey(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [menuKey]);

  const pushRuntimeUrl = useCallback(
    (sessionId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("runtimeSessionId", sessionId);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const onRowActivate = useCallback(
    async (row: Row) => {
      if (row.kind === "session") {
        openRuntimeDrawer({
          sessionId: row.sessionId,
          conversationId: row.conversationId
        });
        pushRuntimeUrl(row.sessionId);
        return;
      }
      if (!token) return;
      const task = row.task;
      setRowBusy(row.key);
      try {
        const conv = task.conversationId?.trim();
        if (conv) {
          let sid = findChatRuntimeSessionId(runtimeSessions, conv);
          if (!sid) sid = await ensureChatRuntimeSessionId(token, conv);
          await queryClient.invalidateQueries({ queryKey: ["workspace", "runtime-sessions"] });
          openRuntimeDrawer({ sessionId: sid, conversationId: conv });
          pushRuntimeUrl(sid);
          return;
        }
        const sid = await ensureTaskSourceRuntimeSessionId(token, task.id);
        await queryClient.invalidateQueries({ queryKey: ["workspace", "runtime-sessions"] });
        openRuntimeDrawer({ sessionId: sid, conversationId: null });
        pushRuntimeUrl(sid);
      } catch (e) {
        window.alert(e instanceof Error ? parseNestErrorMessage(e) : "Could not open runtime.");
        navigate("/app/chat?fresh=1");
      } finally {
        setRowBusy(null);
      }
    },
    [navigate, openRuntimeDrawer, pushRuntimeUrl, queryClient, runtimeSessions, token]
  );

  const completeTask = async (task: WorkspaceTask) => {
    if (!token) return;
    try {
      await completeWorkspaceTask(token, task.id);
      await queryClient.invalidateQueries({ queryKey: ["workspace", "tasks"] });
    } catch (e) {
      window.alert(e instanceof Error ? parseNestErrorMessage(e) : "Could not complete task.");
    }
    setMenuKey(null);
  };

  const cancelTask = async (task: WorkspaceTask) => {
    if (!token) return;
    try {
      if (task.status === "in_progress") {
        await patchWorkspaceTask(token, task.id, { status: "todo" });
      } else {
        await completeWorkspaceTask(token, task.id);
      }
      await queryClient.invalidateQueries({ queryKey: ["workspace", "tasks"] });
    } catch (e) {
      window.alert(e instanceof Error ? parseNestErrorMessage(e) : "Could not update task.");
    }
    setMenuKey(null);
  };

  const rescheduleTask = (task: WorkspaceTask) => {
    const hint = `Schedule follow-up for workspace task: ${task.title}`.slice(0, 4000);
    navigate(`/app/chat?fresh=1&explorePrompt=${encodeURIComponent(hint)}&ensureRuntime=1`);
    setMenuKey(null);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = createDraft.trim();
    if (!t || !token) return;
    setCreateBusy(true);
    try {
      const res = await createWorkspaceTask(token, {
        title: t.slice(0, 500),
        description: null,
        source: "manual",
        status: "todo"
      });
      if (!res.ok || !res.task) throw new Error("Create task failed.");
      setCreateDraft("");
      await queryClient.invalidateQueries({ queryKey: ["workspace", "tasks"] });
      const q = encodeURIComponent(t.slice(0, 4000));
      navigate(`/app/chat?fresh=1&explorePrompt=${q}&ensureRuntime=1`);
    } catch (e) {
      window.alert(e instanceof Error ? parseNestErrorMessage(e) : "Could not create task.");
    } finally {
      setCreateBusy(false);
    }
  };

  const loading = tasksQ.isLoading || sessionsQ.isLoading;
  const err = tasksQ.error ?? sessionsQ.error;

  return (
    <div className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-3 pb-28 pt-4 sm:px-6 lg:pb-10">
      <header className="mb-6 flex items-start gap-3">
        <MobileSidebarTrigger />
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-malv-text sm:text-xl">Tasks</h1>
          <p className="mt-1 text-[13px] text-malv-text/48">What MALV is doing and what you have queued.</p>
        </div>
      </header>

      <form onSubmit={(e) => void submitCreate(e)} className="mb-6">
        <label className="sr-only" htmlFor="tasks-quick-create">
          What do you want MALV to do?
        </label>
        <input
          id="tasks-quick-create"
          value={createDraft}
          onChange={(e) => setCreateDraft(e.target.value)}
          disabled={createBusy}
          placeholder="What do you want MALV to do?"
          className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 text-[14px] text-malv-text/90 outline-none transition-[border-color,box-shadow] placeholder:text-malv-text/35 focus:border-cyan-400/30 focus:shadow-[0_0_0_2px_rgba(34,211,238,0.1)] disabled:opacity-50"
        />
      </form>

      {err ? (
        <p className="text-sm text-rose-200/90">{err instanceof Error ? parseNestErrorMessage(err) : "Could not load tasks."}</p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-malv-text/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key}>
              <motion.button
                type="button"
                disabled={rowBusy === row.key}
                onClick={() => void onRowActivate(row)}
                className="group relative flex w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 text-left transition-[background-color,border-color,transform] duration-200 hover:border-white/[0.1] hover:bg-white/[0.04] active:scale-[0.998] disabled:opacity-60"
                whileHover={{ y: -1 }}
                transition={{ duration: 0.2 }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-malv-text/92">{row.title}</span>
                    <span
                      className={[
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        row.status === "failed"
                          ? "border-rose-400/25 bg-rose-500/10 text-rose-100/85"
                          : row.status === "completed" || row.status === "idle"
                            ? "border-white/[0.08] bg-white/[0.03] text-malv-text/55"
                            : row.status === "running"
                              ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-100/85"
                              : row.status === "waiting_approval"
                                ? "border-amber-400/25 bg-amber-500/10 text-amber-100/85"
                                : row.status === "pending" || row.status === "scheduled"
                                  ? "border-white/[0.08] bg-white/[0.03] text-malv-text/60"
                                  : "border-white/[0.08] bg-white/[0.03] text-malv-text/60"
                      ].join(" ")}
                    >
                      {row.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-malv-text/42">
                    {row.kind === "session" ? <span>{row.subtitle}</span> : <span>Workspace task</span>}
                    <span>·</span>
                    <span>{row.timeLabel}</span>
                  </div>
                </div>
                {row.kind === "task" ? (
                  <div className="relative shrink-0" data-malv-task-menu-root>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-malv-text/45 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Task actions"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuKey((k) => (k === row.key ? null : row.key));
                      }}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuKey === row.key ? (
                      <div
                        className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] rounded-xl border border-white/[0.1] bg-[rgba(12,14,22,0.98)] py-1 shadow-xl backdrop-blur-xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-malv-text/80 hover:bg-white/[0.06]"
                          onClick={() => void completeTask(row.task)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Mark complete
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-malv-text/80 hover:bg-white/[0.06]"
                          onClick={() => void cancelTask(row.task)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {row.task.status === "in_progress" ? "Pause (back to queue)" : "Cancel / remove"}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-malv-text/80 hover:bg-white/[0.06]"
                          onClick={() => rescheduleTask(row.task)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reschedule in chat
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-malv-text/80 hover:bg-white/[0.06]"
                          onClick={() => {
                            setMenuKey(null);
                            const conv = row.task.conversationId?.trim();
                            navigate(conv ? `/app/chat?conversationId=${encodeURIComponent(conv)}` : "/app/chat?fresh=1");
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Open in chat
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {rowBusy === row.key ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-malv-text/45" aria-hidden />
                ) : null}
              </motion.button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !rows.length ? (
        <p className="text-[13px] text-malv-text/45">No tasks yet — start from chat or add one above.</p>
      ) : null}
    </div>
  );
}
