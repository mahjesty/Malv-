import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import { fetchConversationDetail } from "../../lib/api/dataPlane";
import { parseNestErrorMessage } from "../../lib/api/http-core";
import { ModuleShell } from "./common/ModuleShell";
import { Button, Card, Skeleton, StatusChip } from "@malv/ui";

export function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [title, setTitle] = useState<string | null>(null);
  const [mode, setMode] = useState<string>("");
  const [messages, setMessages] = useState<Array<{ id: string; role: string; content: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchConversationDetail(token, id);
      setTitle(res.conversation.title);
      setMode(res.conversation.mode);
      setMessages(
        res.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt
        }))
      );
    } catch (e) {
      setErr(e instanceof Error ? parseNestErrorMessage(e) : "We couldn’t load this session.");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    if (!token || !id) return;
    void load();
  }, [token, id, load]);

  return (
    <ModuleShell
      kicker="Session"
      title={title?.trim() || "Conversation"}
      subtitle={`${mode || "—"} · ${id ?? ""}`}
      right={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {id ? (
            <Link
              to={`/app/chat?conversationId=${encodeURIComponent(id)}`}
              className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-malv-text/90 hover:bg-white/[0.07]"
            >
              Open in chat
            </Link>
          ) : null}
          <StatusChip label="Server transcript" status="success" />
        </div>
      }
    >
      {err ? (
        <Card variant="glass" className="p-4 border border-red-500/25 mb-3">
          <div className="text-sm text-red-200">{err}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
            {id ? (
              <Link
                to={`/app/chat?conversationId=${encodeURIComponent(id)}`}
                className="inline-flex items-center justify-center rounded-xl border border-white/[0.10] px-3 py-2 text-sm text-malv-text/85 hover:bg-white/[0.06]"
              >
                Open in chat
              </Link>
            ) : null}
          </div>
        </Card>
      ) : null}

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-3">
          {messages.filter((m) => m.role !== "system").map((m) => (
            <Card key={m.id} variant="glass" className="p-4">
              <div className="text-[11px] font-mono uppercase tracking-wide text-malv-text/45 mb-2">
                {m.role} · {new Date(m.createdAt).toLocaleString()}
              </div>
              <div className="text-sm text-malv-text/90 whitespace-pre-wrap leading-relaxed">{m.content || "(empty)"}</div>
            </Card>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}
