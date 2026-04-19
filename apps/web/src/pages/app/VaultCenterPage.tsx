import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Lock, LockOpen, Plus, Shield, X } from "lucide-react";
import { useAuth } from "../../lib/auth/AuthContext";
import { addVaultEntry, closeVaultSession, fetchVaultEntries, openVaultSession } from "../../lib/api/dataPlane";
import { setMalvVaultSessionId } from "../../lib/malvOperatorPrefs";

type EntryRow = {
  id: string;
  vaultSessionId: string;
  entryType: string;
  label: string | null;
  content: string;
  createdAt: string;
};

export function VaultCenterPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [phrase, setPhrase] = useState("");
  const [showPhrase, setShowPhrase] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      setPhrase("");
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
      setShowAdd(false);
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
      setShowAdd(false);
      await loadEntries();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setLoading(false);
    }
  }

  const isLocked = sessionId == null;

  return (
    <div className="relative mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
      {isLocked ? (
        <LockedState
          phrase={phrase}
          setPhrase={setPhrase}
          showPhrase={showPhrase}
          setShowPhrase={setShowPhrase}
          loading={loading}
          err={err}
          onOpen={onOpen}
        />
      ) : (
        <OpenState
          sessionId={sessionId}
          entries={entries}
          loading={loading}
          err={err}
          label={label}
          setLabel={setLabel}
          body={body}
          setBody={setBody}
          showAdd={showAdd}
          setShowAdd={setShowAdd}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onAdd={onAdd}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function LockedState({
  phrase,
  setPhrase,
  showPhrase,
  setShowPhrase,
  loading,
  err,
  onOpen
}: {
  phrase: string;
  setPhrase: (v: string) => void;
  showPhrase: boolean;
  setShowPhrase: (v: boolean) => void;
  loading: boolean;
  err: string | null;
  onOpen: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-1 flex-col items-center justify-center py-16"
    >
      <div className="mb-6 flex flex-col items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{
            background: "rgb(var(--malv-surface-raised-rgb))",
            border: "1px solid rgb(var(--malv-border-rgb) / 0.1)"
          }}
        >
          <Lock className="h-6 w-6" style={{ color: "rgb(var(--malv-muted-rgb))" }} />
        </div>
        <div className="text-center">
          <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "rgb(var(--malv-text-rgb))" }}>
            Vault
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "rgb(var(--malv-muted-rgb))" }}>
            Sealed memory. Identity-verified access.
          </p>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <AnimatePresence>
          {err ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="rounded-xl px-3.5 py-2.5 text-[12px]"
              style={{
                background: "rgb(239 68 68 / 0.08)",
                border: "1px solid rgb(239 68 68 / 0.15)",
                color: "rgb(239 68 68 / 0.9)"
              }}
            >
              {err}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div
          className="flex items-center overflow-hidden rounded-2xl"
          style={{
            background: "rgb(var(--malv-surface-raised-rgb))",
            border: "1px solid rgb(var(--malv-border-rgb) / 0.1)"
          }}
        >
          <input
            type={showPhrase ? "text" : "password"}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && phrase.trim()) void onOpen(); }}
            placeholder="Secret phrase"
            autoComplete="current-password"
            className="flex-1 bg-transparent px-4 py-3 text-[14px] outline-none"
            style={{ color: "rgb(var(--malv-text-rgb))" }}
          />
          <button
            type="button"
            onClick={() => setShowPhrase(!showPhrase)}
            className="px-3 transition-opacity hover:opacity-70"
            style={{ color: "rgb(var(--malv-muted-rgb))" }}
          >
            {showPhrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <button
          type="button"
          disabled={loading || !phrase.trim()}
          onClick={() => void onOpen()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[13px] font-medium transition-opacity disabled:opacity-40"
          style={{
            background: "rgb(var(--malv-surface-raised-rgb))",
            border: "1px solid rgb(var(--malv-border-rgb) / 0.12)",
            color: "rgb(var(--malv-text-rgb) / 0.85)"
          }}
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Shield className="h-4 w-4 opacity-60" />
          )}
          {loading ? "Verifying…" : "Unlock vault"}
        </button>
      </div>

      <p className="mt-6 text-[11px] text-center" style={{ color: "rgb(var(--malv-muted-rgb) / 0.45)" }}>
        Phrase verified server-side. Session scoped to this device.
      </p>
    </motion.div>
  );
}

function OpenState({
  sessionId,
  entries,
  loading,
  err,
  label,
  setLabel,
  body,
  setBody,
  showAdd,
  setShowAdd,
  expandedId,
  setExpandedId,
  onAdd,
  onClose
}: {
  sessionId: string;
  entries: EntryRow[];
  loading: boolean;
  err: string | null;
  label: string;
  setLabel: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
  expandedId: string | null;
  setExpandedId: (v: string | null) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex flex-1 flex-col"
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{ background: "rgb(var(--malv-surface-raised-rgb))", border: "1px solid rgb(var(--malv-border-rgb) / 0.08)" }}
          >
            <LockOpen className="h-4 w-4 text-emerald-400/80" />
          </div>
          <div>
            <h1 className="text-[14px] font-semibold tracking-tight" style={{ color: "rgb(var(--malv-text-rgb))" }}>
              Vault
            </h1>
            <p className="text-[10px] font-mono" style={{ color: "rgb(var(--malv-muted-rgb) / 0.6)" }}>
              {sessionId.slice(0, 8)}…
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="flex h-8 items-center gap-1.5 rounded-xl px-3 text-[12px] font-medium transition-colors"
            style={{
              background: showAdd ? "rgb(var(--malv-surface-overlay-rgb))" : "rgb(var(--malv-surface-raised-rgb))",
              border: "1px solid rgb(var(--malv-border-rgb) / 0.1)",
              color: "rgb(var(--malv-text-rgb) / 0.75)"
            }}
          >
            {showAdd ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showAdd ? "Cancel" : "Add note"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onClose()}
            className="flex h-8 items-center rounded-xl px-3 text-[12px] font-medium transition-opacity disabled:opacity-50"
            style={{
              background: "transparent",
              border: "1px solid rgb(var(--malv-border-rgb) / 0.08)",
              color: "rgb(var(--malv-muted-rgb))"
            }}
          >
            Lock
          </button>
        </div>
      </div>

      <AnimatePresence>
        {err ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 overflow-hidden rounded-xl px-3.5 py-2.5 text-[12px]"
            style={{
              background: "rgb(239 68 68 / 0.08)",
              border: "1px solid rgb(239 68 68 / 0.15)",
              color: "rgb(239 68 68 / 0.9)"
            }}
          >
            {err}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showAdd ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="mb-5 space-y-2 rounded-2xl p-4"
            style={{
              background: "rgb(var(--malv-surface-raised-rgb))",
              border: "1px solid rgb(var(--malv-border-rgb) / 0.1)"
            }}
          >
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional)"
              className="w-full rounded-xl bg-transparent px-3 py-2 text-[13px] outline-none"
              style={{
                color: "rgb(var(--malv-text-rgb))",
                border: "1px solid rgb(var(--malv-border-rgb) / 0.08)"
              }}
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Vault note content"
              rows={4}
              className="w-full resize-none rounded-xl bg-transparent px-3 py-2 text-[13px] outline-none"
              style={{
                color: "rgb(var(--malv-text-rgb))",
                border: "1px solid rgb(var(--malv-border-rgb) / 0.08)"
              }}
            />
            <button
              type="button"
              disabled={loading || !body.trim()}
              onClick={() => void onAdd()}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-medium transition-opacity disabled:opacity-40"
              style={{
                background: "rgb(var(--malv-surface-overlay-rgb))",
                border: "1px solid rgb(var(--malv-border-rgb) / 0.12)",
                color: "rgb(var(--malv-text-rgb) / 0.85)"
              }}
            >
              {loading ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Shield className="h-3.5 w-3.5 opacity-60" />
              )}
              Save entry
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {entries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <div
            className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "rgb(var(--malv-surface-raised-rgb))", border: "1px solid rgb(var(--malv-border-rgb) / 0.08)" }}
          >
            <Shield className="h-5 w-5" style={{ color: "rgb(var(--malv-muted-rgb) / 0.6)" }} />
          </div>
          <p className="text-[13px]" style={{ color: "rgb(var(--malv-text-rgb) / 0.5)" }}>No entries yet.</p>
          <p className="mt-0.5 text-[11px]" style={{ color: "rgb(var(--malv-muted-rgb) / 0.5)" }}>Add your first note above.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div
            className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "rgb(var(--malv-muted-rgb) / 0.5)" }}
          >
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </div>
          {entries.map((e, idx) => (
            <VaultEntry
              key={e.id}
              entry={e}
              index={idx}
              expanded={expandedId === e.id}
              onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function VaultEntry({
  entry,
  index,
  expanded,
  onToggle
}: {
  entry: EntryRow;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: index * 0.025 }}
      className="overflow-hidden rounded-xl"
      style={{
        background: "rgb(var(--malv-surface-raised-rgb))",
        border: "1px solid rgb(var(--malv-border-rgb) / 0.08)"
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium" style={{ color: "rgb(var(--malv-text-rgb) / 0.85)" }}>
            {entry.label ?? "(note)"}
          </p>
          <p className="mt-0.5 text-[10px] font-mono" style={{ color: "rgb(var(--malv-muted-rgb) / 0.55)" }}>
            {new Date(entry.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <span
          className="shrink-0 transition-transform duration-150"
          style={{
            color: "rgb(var(--malv-muted-rgb) / 0.5)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)"
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </span>
      </button>
      <AnimatePresence>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="px-4 pb-4 pt-0"
              style={{ borderTop: "1px solid rgb(var(--malv-border-rgb) / 0.06)" }}
            >
              <p
                className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed"
                style={{ color: "rgb(var(--malv-text-rgb) / 0.7)" }}
              >
                {entry.content}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
