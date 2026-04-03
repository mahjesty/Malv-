import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth/AuthContext";
import { deleteMemoryEntry, fetchMemoryEntries } from "../../lib/api/dataPlane";
import { ModuleShell } from "./common/ModuleShell";
import { Card, StatusChip, Button } from "@malv/ui";

type Entry = {
  id: string;
  memoryScope: string;
  memoryType: string;
  title: string | null;
  content: string;
  source: string;
  createdAt: string;
};

export function MemoryCenterPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchMemoryEntries(token, { limit: 80, offset: 0 });
      setItems(res.items as Entry[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load memory.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDelete(id: string) {
    if (!token) return;
    setBusyId(id);
    setErr(null);
    try {
      await deleteMemoryEntry(token, id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ModuleShell
      kicker="Recall scopes"
      title="Memory center"
      subtitle="Entries you or the system store under explicit scopes. Chat turns are not auto-logged unless ops enable MALV_MEMORY_AUTO_LOG_CHAT_TURNS."
      right={<StatusChip label="API-backed" status="ok" />}
    >
      {err ? (
        <Card variant="glass" className="p-4 border border-red-500/25 mb-3">
          <div className="text-sm text-red-200">{err}</div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card variant="glass" className="p-4">
          <div className="font-bold text-sm">Scopes</div>
          <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">
            Session, long-term, project, device — vault-only lives in the vault plane, not here.
          </div>
        </Card>
        <Card variant="glass" className="p-4">
          <div className="font-bold text-sm">Actions</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-6 space-y-2">
        {loading ? (
          <div className="text-sm text-malv-text/55">Loading…</div>
        ) : items.length === 0 ? (
          <Card variant="glass" className="p-4">
            <div className="text-sm text-malv-text/65">No memory entries yet.</div>
          </Card>
        ) : (
          items.map((e) => (
            <Card key={e.id} variant="glass" className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-mono text-malv-text/50">
                    {e.memoryScope} · {e.memoryType} · {e.source}
                  </div>
                  <div className="font-semibold text-sm mt-1">{e.title ?? "(untitled)"}</div>
                </div>
                <Button size="sm" variant="danger" disabled={busyId === e.id} onClick={() => void onDelete(e.id)}>
                  Delete
                </Button>
              </div>
              <div className="text-sm text-malv-text/75 mt-2 whitespace-pre-wrap line-clamp-6">{e.content}</div>
              <div className="text-[11px] text-malv-text/45 mt-2">{new Date(e.createdAt).toLocaleString()}</div>
            </Card>
          ))
        )}
      </div>
    </ModuleShell>
  );
}
