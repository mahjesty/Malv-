import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import { createSupportTicket, fetchSupportTickets } from "../../lib/api/dataPlane";
import { ModuleShell } from "./common/ModuleShell";
import { Card, Button, StatusChip, Input } from "@malv/ui";

export function TicketListPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [items, setItems] = useState<
    Array<{ id: string; subject: string; status: string; priority: string; updatedAt: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [subj, setSubj] = useState("");
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!token) return;
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetchSupportTickets(token);
        if (c) return;
        setItems(r.items as typeof items);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : "Failed to load tickets.");
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [token]);

  async function onCreateTicket() {
    if (!token || !subj.trim() || !msg.trim()) return;
    setCreating(true);
    setErr(null);
    try {
      const r = await createSupportTicket(token, { subject: subj.trim(), message: msg.trim(), priority: "normal" });
      setSubj("");
      setMsg("");
      const list = await fetchSupportTickets(token);
      setItems(list.items as typeof items);
      navigate(`/app/tickets/${r.ticketId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <ModuleShell
      kicker="Support"
      title="Tickets"
      subtitle="Real tickets stored in MALV — threaded messages in detail view."
      right={<StatusChip label="API" status="ok" />}
    >
      {err ? (
        <Card variant="glass" className="p-4 border border-red-500/25 mb-3">
          <div className="text-sm text-red-200">{err}</div>
        </Card>
      ) : null}

      <Card variant="glass" className="p-4 space-y-3 mb-4">
        <div className="font-bold text-sm">New ticket</div>
        <Input value={subj} onChange={setSubj} placeholder="Subject" />
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Describe the issue"
          className="w-full min-h-[88px] rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
        />
        <Button onClick={() => void onCreateTicket()} disabled={creating || !subj.trim() || !msg.trim()}>
          Open ticket
        </Button>
      </Card>

      <div className="space-y-2">
        {loading ? (
          <div className="text-sm text-malv-text/55">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-malv-text/55">No tickets yet.</div>
        ) : (
          items.map((t) => (
            <Link
              key={t.id}
              to={`/app/tickets/${t.id}`}
              className="block rounded-2xl border border-white/10 bg-white/[0.02] p-3 hover:bg-white/[0.05] transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{t.subject}</div>
                  <div className="text-xs text-malv-text/60 mt-1">
                    {t.priority} · #{t.id.slice(0, 8)}
                  </div>
                </div>
                <StatusChip
                  label={t.status}
                  status={t.status === "closed" ? "ok" : t.status === "open" ? "warning" : "neutral"}
                />
              </div>
            </Link>
          ))
        )}
      </div>
    </ModuleShell>
  );
}
