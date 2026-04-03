import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import { apiFetch } from "../../lib/api/http";
import { ModuleShell } from "./common/ModuleShell";
import { Button, Card, Skeleton, StatusChip } from "@malv/ui";

type Detail = {
  request: Record<string, unknown> & { id: string; title: string; description: string; status: string; failureReason?: string | null };
  reports: Array<Record<string, unknown>>;
  patchSets: Array<Record<string, unknown> & { diffText?: string }>;
  reviews: Array<Record<string, unknown>>;
  timeline: Array<{ id: string; eventType: string; message?: string | null; occurredAt: string; metadata?: Record<string, unknown> | null }>;
};

type Preview = {
  preview: {
    id: string;
    previewStatus: string;
    readyForApply: boolean;
    fullDiff: string | null;
    changedFiles: Record<string, unknown>;
    diffSummary: string;
    validationSummary: Record<string, unknown>;
    riskSummary: string;
    rollbackSummary: string;
    adminNotes?: string | null;
  } | null;
};

export function SelfUpgradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [preview, setPreview] = useState<Preview["preview"]>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!token || !id) return;
    setErr(null);
    const d = await apiFetch<{ ok?: boolean; error?: string } & Partial<Detail>>({
      path: `/v1/admin/self-upgrade/requests/${id}`,
      accessToken: token
    });
    if (d.ok === false || !d.request) throw new Error(d.error ?? "Load failed");
    setDetail({
      request: d.request as Detail["request"],
      reports: (d.reports as Detail["reports"]) ?? [],
      patchSets: (d.patchSets as Detail["patchSets"]) ?? [],
      reviews: (d.reviews as Detail["reviews"]) ?? [],
      timeline: (d.timeline as Detail["timeline"]) ?? []
    });
    const p = await apiFetch<{ ok?: boolean; preview?: Preview["preview"] }>({
      path: `/v1/admin/self-upgrade/requests/${id}/preview`,
      accessToken: token
    });
    if (p.ok !== false) setPreview(p.preview ?? null);
  }, [token, id]);

  useEffect(() => {
    if (!token || !id) return;
    let c = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [token, id, load]);

  async function run(action: string) {
    if (!token || !id) return;
    setBusy(action);
    setErr(null);
    try {
      const path = `/v1/admin/self-upgrade/requests/${id}/${action.replace(/^\//, "")}`;
      const res = await apiFetch<{ ok: boolean; error?: string }>({
        path,
        method: "POST",
        accessToken: token,
        body: note.trim() ? { note: note.trim() } : undefined
      });
      if (!res.ok) throw new Error(res.error ?? "Action failed");
      setNote("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const req = detail?.request;
  const latestReport = detail?.reports?.[0] as Record<string, unknown> | undefined;
  const arch = latestReport?.architectureUnderstanding as Record<string, unknown> | undefined;
  const filesExamined = latestReport?.filesExamined as Record<string, unknown> | undefined;
  const affected = latestReport?.affectedModules as Record<string, unknown> | undefined;
  const deps = latestReport?.dependencyNotes as Record<string, unknown> | undefined;

  return (
    <ModuleShell
      kicker="Internal control room"
      title={req?.title ?? "Self-upgrade"}
      subtitle="Study → sandbox staging → validation → preview package. Production applies only from the Apply action after approval."
      flush
      right={
        req ? <StatusChip label={req.status} status={req.status === "preview_ready" ? "success" : req.status === "failed" ? "danger" : "neutral"} /> : null
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Link to="/app/admin/self-upgrade" className="text-xs text-malv-text/55 hover:text-malv-text underline">
            ← All requests
          </Link>
        </div>

        {err ? (
          <Card variant="glass" className="p-4 border border-red-500/30">
            <div className="text-sm text-red-200">{err}</div>
          </Card>
        ) : null}

        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : !detail ? (
          <div className="text-sm text-malv-text/55">Not found.</div>
        ) : (
          <>
            <Section title="Overview" id="overview">
              <div className="text-sm text-malv-text/80 whitespace-pre-wrap">{String(req?.description ?? "")}</div>
              {req?.failureReason ? (
                <div className="mt-3 text-sm text-red-200/90 border border-red-500/20 rounded-lg p-3 bg-red-500/5">{String(req.failureReason)}</div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={!!busy} onClick={() => void run("analyze")}>
                  {busy === "analyze" ? "…" : "1. Analyze"}
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={!!busy} onClick={() => void run("generate")}>
                  {busy === "generate" ? "…" : "2. Generate + validate + preview"}
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={!!busy} onClick={() => void run("validate")}>
                  {busy === "validate" ? "…" : "Re-validate"}
                </Button>
              </div>
            </Section>

            <Section title="Study report" id="study">
              {latestReport ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-malv-text/45 mb-1">Architecture understanding</div>
                    <pre className="text-xs font-mono text-malv-text/75 whitespace-pre-wrap overflow-x-auto max-h-[320px]">
                      {JSON.stringify(arch ?? {}, null, 2)}
                    </pre>
                  </div>
                  {latestReport.studySummary ? <div className="text-malv-text/70">{String(latestReport.studySummary)}</div> : null}
                </div>
              ) : (
                <div className="text-sm text-malv-text/55">Run analyze to produce a study report.</div>
              )}
            </Section>

            <Section title="Files examined & modules" id="files">
              <pre className="text-xs font-mono text-malv-text/75 whitespace-pre-wrap overflow-x-auto">{JSON.stringify(filesExamined ?? {}, null, 2)}</pre>
              <div className="mt-3 text-[11px] uppercase tracking-wider text-malv-text/45 mb-1">Affected modules</div>
              <pre className="text-xs font-mono text-malv-text/75 whitespace-pre-wrap overflow-x-auto">{JSON.stringify(affected ?? {}, null, 2)}</pre>
              <div className="mt-3 text-[11px] uppercase tracking-wider text-malv-text/45 mb-1">Dependency notes</div>
              <pre className="text-xs font-mono text-malv-text/75 whitespace-pre-wrap overflow-x-auto">{JSON.stringify(deps ?? {}, null, 2)}</pre>
            </Section>

            <Section title="Diff review" id="diff">
              {preview?.fullDiff ? (
                <pre className="text-[11px] leading-relaxed font-mono text-emerald-100/90 bg-black/40 border border-white/10 rounded-xl p-4 overflow-x-auto max-h-[480px]">
                  {preview.fullDiff}
                </pre>
              ) : (
                <div className="text-sm text-malv-text/55">No staged diff yet — run generate to build the sandbox patch.</div>
              )}
              {preview?.diffSummary ? <div className="mt-2 text-xs text-malv-text/60">{preview.diffSummary}</div> : null}
            </Section>

            <Section title="Validation" id="validation">
              <pre className="text-xs font-mono text-malv-text/75 whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(preview?.validationSummary ?? {}, null, 2)}
              </pre>
            </Section>

            <Section title="Risk analysis" id="risk">
              <pre className="text-xs font-mono text-malv-text/75 whitespace-pre-wrap overflow-x-auto">{preview?.riskSummary ?? "—"}</pre>
            </Section>

            <Section title="Rollback notes" id="rollback">
              <div className="text-sm text-malv-text/80 whitespace-pre-wrap">{preview?.rollbackSummary ?? "—"}</div>
            </Section>

            <Section title="Approval actions" id="actions">
              <textarea
                className="w-full min-h-[72px] rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-malv-text mb-3"
                placeholder="Optional note (stored on audit trail)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={!!busy} onClick={() => void run("request-revision")}>
                  {busy === "request-revision" ? "…" : "Request revision"}
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={!!busy} onClick={() => void run("reject")}>
                  {busy === "reject" ? "…" : "Reject"}
                </Button>
                <Button type="button" size="sm" disabled={!!busy} onClick={() => void run("approve-apply")}>
                  {busy === "approve-apply" ? "…" : "Approve apply"}
                </Button>
                <Button type="button" size="sm" variant="primary" disabled={!!busy} onClick={() => void run("apply")}>
                  {busy === "apply" ? "…" : "Apply to production"}
                </Button>
              </div>
              <p className="mt-3 text-xs text-malv-text/50">
                Approve apply authorizes the patch; Apply runs git apply on the real workspace. No deploy or push is performed here.
              </p>
            </Section>

            <Section title="Audit timeline" id="audit">
              <div className="space-y-2">
                {(detail.timeline ?? []).length === 0 ? (
                  <div className="text-sm text-malv-text/55">No events yet.</div>
                ) : (
                  detail.timeline.map((t) => (
                    <div key={t.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-mono">
                      <div className="text-malv-text/55">{new Date(t.occurredAt).toISOString()}</div>
                      <div className="text-malv-text/90">{t.eventType}</div>
                      {t.message ? <div className="text-malv-text/70 mt-1">{t.message}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </Section>
          </>
        )}
      </div>
    </ModuleShell>
  );
}

function Section(props: { title: string; id: string; children: ReactNode }) {
  return (
    <div id={props.id} className="scroll-mt-24">
      <Card variant="glass" elevation="raised" className="p-0 overflow-hidden border border-white/10">
        <div className="px-4 py-3 border-b border-white/10 text-sm font-semibold tracking-tight">{props.title}</div>
        <div className="p-4 sm:p-5">{props.children}</div>
      </Card>
    </div>
  );
}
