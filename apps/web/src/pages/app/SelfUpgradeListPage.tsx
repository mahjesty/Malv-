import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import { apiFetch } from "../../lib/api/http";
import { ModuleShell } from "./common/ModuleShell";
import { Button, Card, Skeleton, StatusChip } from "@malv/ui";

type Row = { id: string; title: string; status: string; createdAt: string; updatedAt: string };

export function SelfUpgradeListPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!token) return;
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch<{ ok: boolean; requests?: Row[]; error?: string }>({
          path: "/v1/admin/self-upgrade/requests",
          accessToken: token
        });
        if (c) return;
        if (!res.ok) throw new Error(res.error ?? "Failed");
        setRows(res.requests ?? []);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [token]);

  async function create() {
    if (!token || !title.trim() || !description.trim()) return;
    setCreating(true);
    setErr(null);
    try {
      const res = await apiFetch<{ ok: boolean; request?: { id: string }; error?: string }>({
        path: "/v1/admin/self-upgrade/requests",
        method: "POST",
        accessToken: token,
        body: { title: title.trim(), description: description.trim() }
      });
      if (!res.ok || !res.request) throw new Error(res.error ?? "Create failed");
      setTitle("");
      setDescription("");
      const list = await apiFetch<{ ok: boolean; requests?: Row[] }>({
        path: "/v1/admin/self-upgrade/requests",
        accessToken: token
      });
      setRows(list.requests ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  function statusTone(s: string): "success" | "warning" | "danger" | "neutral" {
    if (s === "preview_ready" || s === "analysis_complete") return "success";
    if (s === "failed" || s === "rejected") return "danger";
    if (s === "approved_apply" || s === "generating" || s === "analyzing" || s === "validating") return "warning";
    return "neutral";
  }

  return (
    <ModuleShell
      kicker="AI engineering lab"
      title="Self-upgrade requests"
      subtitle="Sandbox generation and validation first — admin preview is a separate control room. Production changes only after explicit apply."
      flush
    >
      <div className="space-y-6">
        <Card variant="glass" className="p-4 sm:p-5 border border-white/10">
          <div className="text-sm font-semibold text-malv-text mb-3">New request</div>
          <div className="space-y-3 max-w-xl">
            <input
              className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-malv-text placeholder:text-malv-text/40"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="w-full min-h-[88px] rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-malv-text placeholder:text-malv-text/40"
              placeholder="What should MALV study and prepare?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Button type="button" variant="primary" disabled={creating || !title.trim() || !description.trim()} onClick={() => void create()}>
              {creating ? "Creating…" : "Create request"}
            </Button>
          </div>
        </Card>

        {err ? (
          <Card variant="glass" className="p-4 border border-red-500/30">
            <div className="text-sm text-red-200">{err}</div>
          </Card>
        ) : null}

        <Card variant="glass" elevation="raised" className="p-0 overflow-hidden border border-white/10">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="text-sm font-semibold">Queue</div>
            <Link to="/app/admin" className="text-xs text-malv-text/55 hover:text-malv-text underline">
              ← Admin home
            </Link>
          </div>
          <div className="p-4 space-y-2">
            {loading ? (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            ) : rows.length === 0 ? (
              <div className="text-sm text-malv-text/55">No self-upgrade requests yet.</div>
            ) : (
              rows.map((r) => (
                <Link
                  key={r.id}
                  to={`/app/admin/self-upgrade/${r.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-malv-text truncate">{r.title}</div>
                    <div className="text-[11px] font-mono text-malv-text/45 truncate">{r.id}</div>
                  </div>
                  <StatusChip label={r.status} status={statusTone(r.status)} />
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>
    </ModuleShell>
  );
}
