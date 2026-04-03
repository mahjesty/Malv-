import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  createWorkspaceRuntimeSession,
  createWorkspaceTask,
  createWorkspaceTaskFromChatOutput,
  decideWorkspaceApproval,
  fetchWorkspaceSurface,
  fetchWorkspaceRuntimeSession,
  type WorkspaceApproval,
  type WorkspaceCallRecap,
  type WorkspaceConversationSummary,
  type WorkspaceOutputSummary,
  type WorkspaceRuntimeLog,
  type WorkspaceRuntimePatch,
  type WorkspaceRuntimeRun,
  type WorkspaceRuntimeSession
} from "../../lib/api/dataPlane";
import { ModuleShell } from "./common/ModuleShell";
import { Card, StatusChip } from "@malv/ui";

export function WorkspacePage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const runtimeSessionIdFromUrl = searchParams.get("runtimeSessionId");
  const focusConversationId = (location.state as { focusConversationId?: string } | null)?.focusConversationId;
  const sourceContext = useMemo(
    () =>
      focusConversationId
        ? { sourceType: "chat" as const, sourceId: focusConversationId }
        : { sourceType: "task" as const, sourceId: "workspace-root" },
    [focusConversationId]
  );
  const [runtimeSessionId, setRuntimeSessionId] = useState<string | null>(runtimeSessionIdFromUrl);
  const [approvals, setApprovals] = useState<WorkspaceApproval[]>([]);
  const [recaps, setRecaps] = useState<WorkspaceCallRecap[]>([]);
  const [conversations, setConversations] = useState<WorkspaceConversationSummary[]>([]);
  const [outputs, setOutputs] = useState<WorkspaceOutputSummary[]>([]);
  const [runtimeSession, setRuntimeSession] = useState<WorkspaceRuntimeSession | null>(null);
  const [runs, setRuns] = useState<WorkspaceRuntimeRun[]>([]);
  const [logs, setLogs] = useState<WorkspaceRuntimeLog[]>([]);
  const [patches, setPatches] = useState<WorkspaceRuntimePatch[]>([]);
  const [commandDraft, setCommandDraft] = useState("");
  const [inspectTab, setInspectTab] = useState<"logs" | "patches" | "approvals" | "outputs">("logs");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (runtimeSessionIdFromUrl) {
      setRuntimeSessionId(runtimeSessionIdFromUrl);
      return;
    }
    setRuntimeSessionId(null);
  }, [runtimeSessionIdFromUrl]);

  useEffect(() => {
    if (!token) return;
    if (runtimeSessionIdFromUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const created = await createWorkspaceRuntimeSession(token, sourceContext);
        if (!created.ok || !created.sessionId || cancelled) return;
        setRuntimeSessionId(created.sessionId);
        const params = new URLSearchParams(location.search);
        params.set("runtimeSessionId", created.sessionId);
        navigate({ pathname: location.pathname, search: params.toString() }, { replace: true, state: location.state });
      } catch {
        /* fallback: surface fetch path already error-handled in refresh */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, runtimeSessionIdFromUrl, sourceContext, location.pathname, location.search, location.state, navigate]);

  const refreshSurface = useCallback(async () => {
    if (!token || !runtimeSessionId) return;
    const [runtime, surface] = await Promise.all([
      fetchWorkspaceRuntimeSession(token, runtimeSessionId),
      fetchWorkspaceSurface(token)
    ]);
    if (!runtime.ok) throw new Error("Failed to load workspace runtime session.");
    if (!surface.ok) throw new Error("Failed to load workspace surface.");
    setRuntimeSession(runtime.session ?? null);
    setRuns(runtime.runs ?? []);
    setLogs(runtime.logs ?? []);
    setPatches(runtime.patches ?? []);
    setApprovals(runtime.approvals ?? []);
    setRecaps(surface.callRecaps ?? []);
    setConversations(surface.conversations ?? []);
    setOutputs(runtime.outputs ?? []);
  }, [token, runtimeSessionId]);

  useEffect(() => {
    if (!token || !runtimeSessionId) return;
    let c = false;
    (async () => {
      try {
        setErr(null);
        await refreshSurface();
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : "History failed.");
      }
    })();
    return () => {
      c = true;
    };
  }, [token, runtimeSessionId, refreshSurface]);

  const decideApproval = useCallback(
    async (approvalId: string, decision: "approved" | "rejected") => {
      if (!token) return;
      try {
        await decideWorkspaceApproval(token, approvalId, decision);
      } catch {
        /* sandbox approvals are resolved elsewhere */
      }
      await refreshSurface();
    },
    [token, refreshSurface]
  );

  const runtimeStatus = runtimeSession?.status ?? "idle";
  const hasActiveRun = Boolean(runtimeSession?.activeRunId) || runs.length > 0;
  const latestRun = runs[0] ?? null;
  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const completedOutputs = outputs.slice(0, 5);

  return (
    <ModuleShell
      kicker="Execution canvas"
      title="Workspace"
      subtitle="Unified runtime context for task execution and continuation."
      right={<StatusChip label="Live" status="neutral" />}
    >
      {err ? (
        <Card variant="glass" className="mb-3 border border-amber-500/20 p-4">
          <div className="text-sm text-amber-100/90">{err}</div>
        </Card>
      ) : null}

      <Card variant="glass" className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-malv-text/75">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
            source: {runtimeSession?.sourceType ?? sourceContext.sourceType}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
            id: {(runtimeSession?.sourceId ?? sourceContext.sourceId).slice(0, 18)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
            status: <span className="text-malv-text">{runtimeStatus}</span>
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
            active run: <span className="text-malv-text">{hasActiveRun ? "yes" : "no"}</span>
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
            last event: <span className="text-malv-text">{runtimeSession?.lastEventAt ? new Date(runtimeSession.lastEventAt).toLocaleString() : "n/a"}</span>
          </span>
          {focusConversationId ? (
            <Link to={`/app/chat?conversationId=${encodeURIComponent(focusConversationId)}`} className="ml-auto text-cyan-200/90 hover:underline">
              linked chat
            </Link>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card variant="glass" className="flex min-h-[64vh] flex-col overflow-hidden p-0">
          <div className="flex-1 px-4 py-5">
            <div className="h-full rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_18%_12%,oklch(0.63_0.12_208/0.08),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-4">
              {runtimeStatus === "idle" ? (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-md text-center">
                    <div className="text-sm font-semibold text-malv-text/90">Runtime ready</div>
                    <p className="mt-2 text-xs leading-relaxed text-malv-text/55">
                      Start a command to create the next execution step for this runtime session.
                    </p>
                  </div>
                </div>
              ) : null}

              {runtimeStatus === "running" ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-malv-text/92">Execution in progress</div>
                  <div className="rounded-xl border border-cyan-400/22 bg-cyan-500/[0.08] px-3 py-2 text-xs text-malv-text/85">
                    {latestRun ? `${latestRun.runType} · ${latestRun.status}` : "Runtime is active."}
                  </div>
                  <div className="text-xs text-malv-text/60">
                    {logs.length} log line{logs.length === 1 ? "" : "s"} · {patches.length} patch{patches.length === 1 ? "" : "es"}
                  </div>
                </div>
              ) : null}

              {runtimeStatus === "waiting_approval" ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-malv-text/92">Approval required</div>
                  <div className="rounded-xl border border-amber-400/22 bg-amber-400/[0.08] px-3 py-2 text-xs text-malv-text/85">
                    {pendingApprovals.length} pending approval{pendingApprovals.length === 1 ? "" : "s"} blocking runtime progress.
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectTab("approvals")}
                    className="rounded-lg border border-white/12 bg-white/[0.02] px-2.5 py-1.5 text-xs text-malv-text/80"
                  >
                    Open approvals in inspect panel
                  </button>
                </div>
              ) : null}

              {runtimeStatus === "completed" ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-malv-text/92">Execution completed</div>
                  <div className="rounded-xl border border-emerald-400/22 bg-emerald-500/[0.08] px-3 py-2 text-xs text-malv-text/85">
                    Latest runtime completed. Review outputs and patches in the inspect panel.
                  </div>
                  <div className="text-xs text-malv-text/60">
                    {completedOutputs.length} recent output{completedOutputs.length === 1 ? "" : "s"} available.
                  </div>
                </div>
              ) : null}

              {runtimeStatus === "failed" ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-malv-text/92">Execution failed</div>
                  <div className="rounded-xl border border-rose-400/22 bg-rose-500/[0.08] px-3 py-2 text-xs text-malv-text/85">
                    Runtime failed or was blocked. Inspect logs for root cause.
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectTab("logs")}
                    className="rounded-lg border border-white/12 bg-white/[0.02] px-2.5 py-1.5 text-xs text-malv-text/80"
                  >
                    Open logs in inspect panel
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="border-t border-white/10 px-3 py-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.02] px-2.5 py-2">
              <input
                value={commandDraft}
                onChange={(e) => setCommandDraft(e.target.value)}
                placeholder="Run: fix sidebar tag spacing and sync runtime status..."
                className="flex-1 bg-transparent px-1 text-sm text-malv-text outline-none placeholder:text-malv-text/35"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!token || !commandDraft.trim()) return;
                  await createWorkspaceTask(token, {
                    title: commandDraft.trim(),
                    source: "manual",
                    status: "todo",
                    conversationId: focusConversationId ?? undefined
                  });
                  setCommandDraft("");
                  await refreshSurface();
                }}
                className="rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-100 disabled:opacity-50"
                disabled={!commandDraft.trim()}
              >
                Add to runtime
              </button>
            </div>
          </div>
        </Card>

        <Card variant="glass" className="flex max-h-[64vh] flex-col overflow-hidden p-0">
          <div className="border-b border-white/10 p-2">
            <div className="grid grid-cols-4 gap-1">
              {(["logs", "patches", "approvals", "outputs"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setInspectTab(tab)}
                  className={[
                    "rounded-md px-2 py-1.5 text-[11px] capitalize transition-colors",
                    inspectTab === tab ? "bg-white/[0.08] text-malv-text" : "text-malv-text/55 hover:bg-white/[0.04]"
                  ].join(" ")}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {inspectTab === "logs" ? (
              <div className="space-y-2">
                {logs.length === 0 ? <div className="px-2 py-2 text-xs text-malv-text/45">No logs yet.</div> : null}
                {logs.slice(0, 80).map((log) => (
                  <div key={log.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-[11px]">
                    <div className="flex items-center justify-between text-malv-text/60">
                      <span>#{log.stepIndex} {log.commandClass}</span>
                      <span>{log.status}</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-malv-text/80">{log.commandText}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {inspectTab === "patches" ? (
              <div className="space-y-2">
                {patches.length === 0 ? <div className="px-2 py-2 text-xs text-malv-text/45">No patches yet.</div> : null}
                {patches.slice(0, 20).map((patch) => (
                  <div key={patch.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-[11px]">
                    <div className="flex items-center justify-between text-malv-text/65">
                      <span>{patch.id.slice(0, 8)}...</span>
                      <span>{patch.status}</span>
                    </div>
                    <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-malv-text/75">{patch.diffText.slice(0, 300)}</pre>
                  </div>
                ))}
              </div>
            ) : null}

            {inspectTab === "approvals" ? (
              <div className="space-y-2">
                {approvals.length === 0 ? <div className="px-2 py-2 text-xs text-malv-text/45">No approvals.</div> : null}
                {approvals.slice(0, 20).map((a) => (
                  <div key={a.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-[11px]">
                    <div className="text-malv-text/80">{a.actionDescription}</div>
                    <div className="mt-1 flex items-center justify-between text-malv-text/55">
                      <span>{a.riskLevel} · {a.status}</span>
                      {a.status === "pending" ? (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => void decideApproval(a.id, "approved")} className="text-emerald-200/85">
                            Approve
                          </button>
                          <button type="button" onClick={() => void decideApproval(a.id, "rejected")} className="text-rose-200/85">
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {inspectTab === "outputs" ? (
              <div className="space-y-2">
                {outputs.length === 0 ? <div className="px-2 py-2 text-xs text-malv-text/45">No outputs yet.</div> : null}
                {outputs.slice(0, 20).map((o) => (
                  <div key={o.messageId} className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-[11px]">
                    <div className="line-clamp-2 text-malv-text/78">{o.preview}</div>
                    <div className="mt-1 flex items-center justify-between">
                      {o.conversationId ? (
                        <Link className="text-cyan-200/80" to={`/app/chat?conversationId=${encodeURIComponent(o.conversationId)}`}>
                          Open chat
                        </Link>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        className="text-cyan-100/75"
                        onClick={async () => {
                          if (!token) return;
                          await createWorkspaceTaskFromChatOutput(token, { messageId: o.messageId });
                          await refreshSurface();
                        }}
                      >
                        Create task
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="mt-3 space-y-2">
        <details className="rounded-xl border border-white/10 bg-white/[0.015] px-3 py-2">
          <summary className="cursor-pointer text-xs text-malv-text/70">
            Context (recaps + conversations)
          </summary>
          <div className="mt-2 grid gap-3 lg:grid-cols-3">
            <div className="space-y-2">
              {conversations.slice(0, 6).map((c) => (
                <div key={c.conversationId} className="rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-2 text-xs">
                  <div className="truncate text-malv-text/85">{c.title ?? "Untitled conversation"}</div>
                  <Link className="mt-1 inline-block text-cyan-200/80" to={`/app/chat?conversationId=${encodeURIComponent(c.conversationId)}`}>
                    Open
                  </Link>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {outputs.slice(0, 6).map((o) => (
                <div key={o.messageId} className="rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-2 text-xs">
                  <div className="line-clamp-2 text-malv-text/75">{o.preview}</div>
                  <button
                    type="button"
                    className="mt-1 text-cyan-100/75"
                    onClick={async () => {
                      if (!token) return;
                      await createWorkspaceTaskFromChatOutput(token, { messageId: o.messageId });
                      await refreshSurface();
                    }}
                  >
                    Create task
                  </button>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {recaps.slice(0, 6).map((h) => (
                <div key={h.callSessionId} className="rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-2 text-xs">
                  <div className="text-malv-text/78">{h.recap?.summary ?? "No summary"}</div>
                  {h.conversationId ? (
                    <Link className="mt-1 inline-block text-cyan-200/80" to={`/app/chat?conversationId=${encodeURIComponent(h.conversationId)}`}>
                      Linked chat
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>
    </ModuleShell>
  );
}
