import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "../../lib/auth/AuthContext";
import { useMalvAppShell } from "../../lib/context/MalvAppShellContext";
import {
  decideWorkspaceApproval,
  fetchWorkspaceApprovals,
  fetchWorkspaceRuntimeSessionsList,
  type WorkspaceApproval,
  type WorkspaceRuntimeSession
} from "../../lib/api/dataPlane";
import { parseNestErrorMessage } from "../../lib/api/http-core";
import { ensureChatRuntimeSessionId, findChatRuntimeSessionId } from "../../lib/workspace/resolveRuntimeSession";
import { MobileSidebarTrigger } from "../../components/navigation/MobileSidebarTrigger";

export function InboxPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();
  const { openRuntimeDrawer } = useMalvAppShell();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [openingConvId, setOpeningConvId] = useState<string | null>(null);

  const approvalsQ = useQuery({
    queryKey: ["workspace", "approvals", "inbox"],
    queryFn: async () => {
      const [pending, approved, rejected] = await Promise.all([
        fetchWorkspaceApprovals(token!, { status: "pending", limit: 40 }),
        fetchWorkspaceApprovals(token!, { status: "approved", limit: 20 }),
        fetchWorkspaceApprovals(token!, { status: "rejected", limit: 20 })
      ]);
      return {
        pending: pending.ok ? pending.approvals ?? [] : [],
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
    (sessionId: string) => {
      openRuntimeDrawer({ sessionId });
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
        pushRuntime(sid);
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

  const loading = approvalsQ.isLoading || sessionsQ.isLoading;
  const err = approvalsQ.error ?? sessionsQ.error;
  const pending = approvalsQ.data?.pending ?? [];
  const approvedRecent = approvalsQ.data?.approved ?? [];
  const rejectedRecent = approvalsQ.data?.rejected ?? [];

  return (
    <div className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-3 pb-28 pt-4 sm:px-6 lg:pb-10">
      <header className="mb-6 flex items-start gap-3">
        <MobileSidebarTrigger />
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-malv-text sm:text-xl">Inbox</h1>
          <p className="mt-1 text-[13px] text-malv-text/48">Approvals, outcomes, and anything that needs you.</p>
        </div>
      </header>

      {err ? (
        <p className="text-sm text-rose-200/90">{err instanceof Error ? parseNestErrorMessage(err) : "Could not load inbox."}</p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-malv-text/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-malv-text/40">Approvals</h2>
            {pending.length ? (
              <ul className="space-y-3">
                {pending.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-2xl border border-amber-400/18 bg-amber-500/[0.05] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  >
                    <p className="text-[14px] leading-snug text-malv-text/88">{a.actionDescription}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={decidingId === a.id}
                        onClick={() => void onDecide(a, "approved")}
                        className="rounded-xl border border-emerald-400/28 bg-emerald-500/15 px-3 py-1.5 text-[12px] font-medium text-emerald-100/95 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={decidingId === a.id}
                        onClick={() => void onDecide(a, "rejected")}
                        className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-malv-text/80 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-malv-text/42">Nothing waiting on you.</p>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-malv-text/40">Completed</h2>
            {approvedRecent.length ? (
              <ul className="space-y-2">
                {approvedRecent.slice(0, 12).map((a) => (
                  <li key={a.id}>
                    {a.conversationId ? (
                      <button
                        type="button"
                        disabled={openingConvId === a.conversationId}
                        onClick={() => void openCompletedRuntime(a.conversationId!)}
                        className="flex w-full items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 text-left transition-colors hover:border-white/[0.1] hover:bg-white/[0.04] disabled:opacity-50"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/70" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-malv-text/80">{a.actionDescription}</p>
                          <p className="mt-1 text-[11px] text-cyan-200/55">
                            {openingConvId === a.conversationId ? "Opening runtime…" : "View runtime details"}
                          </p>
                        </div>
                        {openingConvId === a.conversationId ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-malv-text/45" aria-hidden />
                        ) : null}
                      </button>
                    ) : (
                      <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/70" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-malv-text/80">{a.actionDescription}</p>
                          <p className="mt-1 text-[11px] text-malv-text/38">Approved</p>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-malv-text/42">No recent approvals yet.</p>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-malv-text/40">Alerts</h2>
            {failedSessions.length || rejectedRecent.length ? (
              <ul className="space-y-2">
                {failedSessions.map((s) => (
                  <li key={`fail-${s.id}`}>
                    <button
                      type="button"
                      onClick={() => pushRuntime(s.id)}
                      className="w-full rounded-2xl border border-rose-400/20 bg-rose-500/[0.06] px-3.5 py-3 text-left transition-colors hover:bg-rose-500/[0.1]"
                    >
                      <p className="text-[13px] font-medium text-malv-text/88">Run needs attention</p>
                      <p className="mt-1 text-[11px] text-malv-text/45">
                        {s.sourceType} · {formatTime(s.updatedAt)}
                      </p>
                    </button>
                  </li>
                ))}
                {rejectedRecent.slice(0, 8).map((a) => (
                  <li key={`rej-${a.id}`}>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                      <p className="text-[12px] font-medium text-malv-text/75">Approval declined</p>
                      <p className="mt-1 text-[13px] text-malv-text/65">{a.actionDescription}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-malv-text/42">No failures or blocks.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
