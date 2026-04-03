import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth/AuthContext";
import { addVaultEntry, closeVaultSession, fetchVaultEntries, openVaultSession } from "../../lib/api/dataPlane";
import { setMalvVaultSessionId } from "../../lib/malvOperatorPrefs";
import { ModuleShell } from "./common/ModuleShell";
import { Card, Button, Input, StatusChip } from "@malv/ui";

type EntryRow = { id: string; vaultSessionId: string; entryType: string; label: string | null; content: string; createdAt: string };

export function VaultCenterPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [phrase, setPhrase] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchVaultEntries(token, sessionId);
      setEntries(res.items as EntryRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to list vault entries.");
    }
  }, [token, sessionId]);

  useEffect(() => {
    if (sessionId) void loadEntries();
    else setEntries([]);
  }, [sessionId, loadEntries]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("malv_vault_pending_note");
      if (!raw) return;
      sessionStorage.removeItem("malv_vault_pending_note");
      const parsed = JSON.parse(raw) as { label?: string; content?: string };
      if (typeof parsed.content === "string" && parsed.content.trim()) setBody(parsed.content);
      if (typeof parsed.label === "string" && parsed.label.trim()) setLabel(parsed.label);
    } catch {
      /* noop */
    }
  }, []);

  async function onOpen() {
    if (!token || !phrase.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await openVaultSession(token, { secretPhrase: phrase.trim(), accessLabel: "web" });
      setSessionId(res.sessionId);
      setMalvVaultSessionId(res.sessionId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Vault open failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onClose() {
    if (!token || !sessionId) return;
    setLoading(true);
    setErr(null);
    try {
      await closeVaultSession(token, sessionId);
      setSessionId(null);
      setMalvVaultSessionId(null);
      setPhrase("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Close failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onAdd() {
    if (!token || !sessionId || !body.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      await addVaultEntry(token, {
        vaultSessionId: sessionId,
        entryType: "note",
        label: label.trim() || null,
        content: body.trim()
      });
      setBody("");
      setLabel("");
      await loadEntries();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setLoading(false);
    }
  }

  const chip =
    sessionId != null
      ? { label: "Vault open", status: "ok" as const }
      : { label: "Vault locked", status: "neutral" as const };

  return (
    <ModuleShell
      kicker="Isolation plane"
      title="Vault"
      subtitle="Sealed memory outside normal chat. Phrase verified server-side (see MALV_VAULT_UNLOCK_SECRET)."
      right={<StatusChip {...chip} />}
    >
      {err ? (
        <Card variant="glass" className="p-4 border border-red-500/25 mb-3">
          <div className="text-sm text-red-200">{err}</div>
        </Card>
      ) : null}

      <Card variant="glass" className="p-4 space-y-3">
        {sessionId == null ? (
          <>
            <div className="text-sm font-semibold">Unlock with secret phrase</div>
            <div className="flex gap-2 flex-col sm:flex-row">
              <Input value={phrase} onChange={setPhrase} type="password" placeholder="Secret phrase" className="flex-1" />
              <Button onClick={() => void onOpen()} disabled={loading || !phrase.trim()} className="px-6">
                Open vault
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">Session {sessionId.slice(0, 8)}…</div>
              <Button variant="secondary" size="sm" onClick={() => void onClose()} disabled={loading}>
                Close vault
              </Button>
            </div>
            <div className="grid gap-2">
              <Input value={label} onChange={setLabel} placeholder="Label (optional)" />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Vault note content"
                className="min-h-[100px] rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-malv-text"
              />
              <Button onClick={() => void onAdd()} disabled={loading || !body.trim()}>
                Save entry
              </Button>
            </div>
          </>
        )}
      </Card>

      {sessionId ? (
        <div className="mt-4 space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wide text-malv-text/40">Entries</div>
          {entries.map((e) => (
            <Card key={e.id} variant="glass" className="p-3">
              <div className="text-xs text-malv-text/50">
                {e.entryType} · {new Date(e.createdAt).toLocaleString()}
              </div>
              <div className="text-sm font-semibold mt-1">{e.label ?? "(note)"}</div>
              <div className="text-sm text-malv-text/75 mt-1 whitespace-pre-wrap">{e.content}</div>
            </Card>
          ))}
        </div>
      ) : null}
    </ModuleShell>
  );
}
