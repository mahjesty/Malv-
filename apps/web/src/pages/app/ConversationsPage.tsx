import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth/AuthContext";
import { fetchConversations } from "../../lib/api/dataPlane";
import { parseNestErrorMessage } from "../../lib/api/http-core";
import { ModuleShell } from "./common/ModuleShell";
import { StatusChip } from "@malv/ui";
import { Card } from "@malv/ui";
import { MalvConversationList } from "../../components/malv";

type Row = { id: string; title: string | null; mode: string; updatedAt: string };

export function ConversationsPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let c = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetchConversations(token, { limit: 50, offset: 0 });
        if (c) return;
        setItems(res.items as Row[]);
        setTotal(res.total);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? parseNestErrorMessage(e) : "Failed to load conversations.");
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [token]);

  const rows = items.map((c) => ({
    id: c.id,
    title: c.title?.trim() || "Untitled session",
    meta: `${c.mode} · ${new Date(c.updatedAt).toLocaleString()}`
  }));

  return (
    <ModuleShell
      kicker="Session index"
      title="Conversation history"
      subtitle="Threads persisted in MALV — policy-bound, auditable."
      right={<StatusChip status="neutral" label={`${total} total`} />}
    >
      {err ? (
        <Card variant="glass" className="border border-red-500/25 p-4">
          <div className="text-sm text-red-200">{err}</div>
        </Card>
      ) : null}

      <MalvConversationList
        items={rows}
        loading={loading}
        title="Recent sessions"
        emptyHint="No conversations yet. Send a message in Operator to create one."
        className="min-h-[320px]"
      />
    </ModuleShell>
  );
}
