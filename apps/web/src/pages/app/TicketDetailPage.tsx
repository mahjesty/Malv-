import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import { fetchSupportTicket, postTicketMessage } from "../../lib/api/dataPlane";
import { ModuleShell } from "./common/ModuleShell";
import { Card, Button, StatusChip } from "@malv/ui";

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<Array<{ id: string; fromRole: string; content: string; createdAt: string }>>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetchSupportTicket(token, id);
        if (c) return;
        const t = r.ticket as { subject?: string; status?: string };
        setSubject(t.subject ?? "");
        setStatus(t.status ?? "");
        setMessages(r.messages as typeof messages);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : "Failed to load ticket.");
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [token, id]);

  async function sendReply() {
    if (!token || !id || !reply.trim()) return;
    setErr(null);
    try {
      await postTicketMessage(token, id, reply.trim());
      setReply("");
      const r = await fetchSupportTicket(token, id);
      setMessages(r.messages as typeof messages);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Send failed.");
    }
  }

  return (
    <ModuleShell
      kicker="Support"
      title={subject || "Ticket"}
      subtitle={id ?? ""}
      right={<StatusChip label={status || "—"} status="neutral" />}
    >
      {err ? (
        <Card variant="glass" className="p-4 border border-red-500/25 mb-3">
          <div className="text-sm text-red-200">{err}</div>
        </Card>
      ) : null}

      {loading ? (
        <div className="text-sm text-malv-text/55">Loading…</div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <Card key={m.id} variant="glass" className="p-4">
              <div className="text-xs text-malv-text/50">
                {m.fromRole} · {new Date(m.createdAt).toLocaleString()}
              </div>
              <div className="text-sm mt-2 whitespace-pre-wrap">{m.content}</div>
            </Card>
          ))}
          <Card variant="glass" className="p-4 space-y-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Reply…"
              className="w-full min-h-[88px] rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
            />
            <Button onClick={() => void sendReply()} disabled={!reply.trim() || status === "closed"}>
              Send
            </Button>
            {status === "closed" ? <div className="text-xs text-malv-text/50">Ticket is closed.</div> : null}
          </Card>
        </div>
      )}
    </ModuleShell>
  );
}
