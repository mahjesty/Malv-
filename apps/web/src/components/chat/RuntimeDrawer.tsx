import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, FileDiff, RotateCcw, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  decideWorkspaceApproval,
  fetchWorkspaceRuntimeSession,
  type WorkspaceApproval,
  type WorkspaceRuntimeLog,
  type WorkspaceRuntimeSession,
  type WorkspaceRuntimePatch
} from "../../lib/api/dataPlane";

function useMobileRuntimeLayout() {
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

function statusLabel(s: WorkspaceRuntimeSession["status"]) {
  switch (s) {
    case "waiting_approval":
      return "Awaiting approval";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Idle";
  }
}

function humanizeStep(log: WorkspaceRuntimeLog): string {
  const text = (log.commandText || "").replace(/\s+/g, " ").trim();
  if (text && text.length < 120) return text;
  const cls = (log.commandClass || "").replace(/^.*\./, "").replace(/([a-z])([A-Z])/g, "$1 $2");
  if (cls) return cls;
  return "Step";
}

function phaseFromSession(session: WorkspaceRuntimeSession | null, logs: WorkspaceRuntimeLog[]) {
  const meta = session?.metadata;
  if (meta && typeof meta === "object" && typeof (meta as Record<string, unknown>).phase === "string") {
    return String((meta as Record<string, unknown>).phase);
  }
  if (meta && typeof meta === "object" && typeof (meta as Record<string, unknown>).runtimePhase === "string") {
    return String((meta as Record<string, unknown>).runtimePhase);
  }
  const last = logs[0];
  if (last) return humanizeStep(last);
  return "Ready";
}

function titleFromSession(session: WorkspaceRuntimeSession | null) {
  const meta = session?.metadata;
  if (meta && typeof meta === "object") {
    const t = (meta as Record<string, unknown>).title;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  if (session?.sourceType === "chat") return "Chat run";
  if (session?.sourceType === "studio") return "Studio run";
  if (session?.sourceType === "task") return "Task run";
  return "MALV run";
}

function sortedProgressLogs(logs: WorkspaceRuntimeLog[]) {
  return [...logs].sort((a, b) => a.stepIndex - b.stepIndex || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function RuntimeDrawer(props: {
  open: boolean;
  sessionId: string | null;
  conversationId: string | null;
  onClose: () => void;
}) {
  const { open, sessionId, conversationId, onClose } = props;
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const mobile = useMobileRuntimeLayout();

  const [session, setSession] = useState<WorkspaceRuntimeSession | null>(null);
  const [logs, setLogs] = useState<WorkspaceRuntimeLog[]>([]);
  const [approvals, setApprovals] = useState<WorkspaceApproval[]>([]);
  const [patches, setPatches] = useState<WorkspaceRuntimePatch[]>([]);
  const [outputs, setOutputs] = useState<Array<{ preview: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [footerDraft, setFooterDraft] = useState("");
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWorkspaceRuntimeSession(accessToken, sessionId);
      if (!res || (res as { ok?: boolean }).ok === false) {
        setError("Could not load runtime.");
        setSession(null);
        setLogs([]);
        setApprovals([]);
        setPatches([]);
        setOutputs([]);
        return;
      }
      setSession(res.session ?? null);
      setLogs(res.logs ?? []);
      setApprovals(res.approvals ?? []);
      setPatches(res.patches ?? []);
      setOutputs(
        (res.outputs ?? []).map((o) => ({
          preview: o.preview,
          createdAt: o.createdAt
        }))
      );
    } catch {
      setError("Could not load runtime.");
      setSession(null);
      setLogs([]);
      setApprovals([]);
      setPatches([]);
      setOutputs([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, sessionId]);

  useEffect(() => {
    if (!open || !sessionId) {
      setSession(null);
      setLogs([]);
      setApprovals([]);
      setPatches([]);
      setOutputs([]);
      setError(null);
      setFooterDraft("");
      return;
    }
    void load();
  }, [open, sessionId, load]);

  useEffect(() => {
    if (!open || !sessionId) return;
    if (session?.status !== "running" && session?.status !== "waiting_approval") return;
    const id = window.setInterval(() => void load(), 4500);
    return () => window.clearInterval(id);
  }, [open, sessionId, session?.status, load]);

  const effectiveConversationId = useMemo(() => {
    if (conversationId?.trim()) return conversationId.trim();
    if (session?.sourceType === "chat") return session.sourceId;
    return null;
  }, [conversationId, session]);

  const status = session?.status ?? "idle";
  const progressSteps = useMemo(() => sortedProgressLogs(logs).slice(-12), [logs]);
  const pendingApprovals = useMemo(() => approvals.filter((a) => a.status === "pending"), [approvals]);

  const studioHref = "/app/studio";

  const chatHref = effectiveConversationId
    ? `/app/chat?conversationId=${encodeURIComponent(effectiveConversationId)}`
    : "/app/chat?fresh=1";

  const onDecide = async (approvalId: string, decision: "approved" | "rejected") => {
    if (!accessToken) return;
    setDecidingId(approvalId);
    try {
      await decideWorkspaceApproval(accessToken, approvalId, decision);
      await load();
    } finally {
      setDecidingId(null);
    }
  };

  const onFooterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = footerDraft.trim();
    if (!t) {
      navigate(chatHref);
      onClose();
      return;
    }
    const sep = chatHref.includes("?") ? "&" : "?";
    navigate(`${chatHref}${sep}runtimeContinue=${encodeURIComponent(t.slice(0, 2000))}`);
    setFooterDraft("");
    onClose();
  };

  const onRetry = () => {
    navigate(chatHref);
    onClose();
  };

  const headerTitle = loading ? "…" : titleFromSession(session);
  const phase = phaseFromSession(session, logs);

  return (
    <AnimatePresence>
      {open && sessionId ? (
        <>
          <motion.button
            type="button"
            aria-label="Close runtime panel"
            className="fixed inset-0 z-[100] cursor-default border-0 bg-black/50 backdrop-blur-[3px] lg:bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="malv-runtime-drawer-title"
            className={[
              "fixed z-[110] flex flex-col overflow-hidden border border-white/[0.09] bg-[rgba(10,12,20,0.96)] text-malv-text shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl",
              mobile
                ? "inset-0 max-h-[100dvh] rounded-none"
                : "inset-y-3 right-3 w-[min(440px,calc(100vw-1.5rem))] rounded-2xl"
            ].join(" ")}
            initial={mobile ? { opacity: 0, y: 12 } : { x: "104%", opacity: 0.98 }}
            animate={mobile ? { opacity: 1, y: 0 } : { x: 0, opacity: 1 }}
            exit={mobile ? { opacity: 0, y: 16 } : { x: "104%", opacity: 0.98 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-4 pb-3 pt-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-malv-text/40">Runtime</p>
                <h2 id="malv-runtime-drawer-title" className="mt-1 line-clamp-2 text-[16px] font-semibold tracking-tight text-malv-text/95">
                  {headerTitle}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-malv-text/55">
                  <span
                    className={[
                      "rounded-full border px-2.5 py-0.5",
                      status === "failed"
                        ? "border-rose-400/25 bg-rose-500/10 text-rose-100/90"
                        : status === "completed"
                          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/85"
                          : status === "running"
                            ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-100/85"
                            : status === "waiting_approval"
                              ? "border-amber-400/25 bg-amber-500/10 text-amber-100/90"
                              : "border-white/[0.08] bg-white/[0.03] text-malv-text/70"
                    ].join(" ")}
                  >
                    {statusLabel(status)}
                  </span>
                  <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-0.5 text-malv-text/60">
                    {phase}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-malv-text/70 transition-colors hover:bg-white/[0.08] hover:text-malv-text active:scale-95"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2.2} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              {error ? <p className="text-sm text-amber-100/85">{error}</p> : null}

              {loading ? (
                <p className="text-[13px] text-malv-text/50">Loading…</p>
              ) : !session ? null : status === "idle" ? (
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center">
                  <p className="text-[14px] text-malv-text/75">MALV is ready</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-malv-text/45">When execution starts, progress appears here.</p>
                </div>
              ) : status === "running" ? (
                <div className="space-y-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-malv-text/42">Progress</p>
                  <ul className="space-y-2">
                    {progressSteps.length ? (
                      progressSteps.map((log, i) => (
                        <li
                          key={log.id}
                          className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                        >
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-500/10 text-[11px] font-semibold text-cyan-100/90">
                            {i + 1}
                          </span>
                          <span className="text-[13px] leading-snug text-malv-text/80">{humanizeStep(log)}</span>
                        </li>
                      ))
                    ) : (
                      <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[13px] text-malv-text/55">
                        Working… structured steps will appear as commands run.
                      </li>
                    )}
                  </ul>
                </div>
              ) : status === "waiting_approval" ? (
                <div className="space-y-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-malv-text/42">Approvals</p>
                  {pendingApprovals.length ? (
                    <ul className="space-y-3">
                      {pendingApprovals.map((a) => (
                        <li
                          key={a.id}
                          className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                        >
                          <p className="text-[13px] leading-snug text-malv-text/88">{a.actionDescription}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={decidingId === a.id}
                              onClick={() => void onDecide(a.id, "approved")}
                              className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-[12px] font-medium text-emerald-100/95 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={decidingId === a.id}
                              onClick={() => void onDecide(a.id, "rejected")}
                              className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-malv-text/80 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-malv-text/55">No pending approvals — refreshing…</p>
                  )}
                </div>
              ) : status === "completed" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.05] px-3 py-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-100/50">Result</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-malv-text/78">
                      {outputs[0]?.preview?.trim()
                        ? outputs[0].preview.slice(0, 400) + (outputs[0].preview.length > 400 ? "…" : "")
                        : "Run finished successfully."}
                    </p>
                  </div>
                  {patches.length ? (
                    <Link
                      to={session.sourceType === "studio" ? studioHref : chatHref}
                      onClick={onClose}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-malv-text/85 transition-colors hover:bg-white/[0.07]"
                    >
                      <FileDiff className="h-4 w-4 opacity-80" />
                      Review diff / preview
                      <ChevronRight className="h-4 w-4 opacity-50" />
                    </Link>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.06] px-3 py-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-rose-100/55">Issue</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-malv-text/75">
                      This run stopped before completion. Open the chat thread to retry or adjust the request.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-malv-text/85 transition-colors hover:bg-white/[0.08]"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retry in chat
                  </button>
                </div>
              )}
            </div>

            <form
              onSubmit={onFooterSubmit}
              className="shrink-0 border-t border-white/[0.06] px-4 py-3 sm:px-5"
            >
              <label className="sr-only" htmlFor="malv-runtime-drawer-footer-input">
                Refine or continue
              </label>
              <input
                id="malv-runtime-drawer-footer-input"
                value={footerDraft}
                onChange={(e) => setFooterDraft(e.target.value)}
                placeholder="Refine or continue…"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-malv-text/90 outline-none transition-[border-color,box-shadow] placeholder:text-malv-text/35 focus:border-cyan-400/35 focus:shadow-[0_0_0_2px_rgba(34,211,238,0.12)]"
              />
            </form>

            {mobile ? (
              <div className="shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-0">
                <div className="mx-auto h-1 w-10 rounded-full bg-white/12 opacity-80" aria-hidden />
              </div>
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
