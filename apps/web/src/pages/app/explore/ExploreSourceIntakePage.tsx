import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import { Button, Card } from "@malv/ui";
import { useAuth } from "../../../lib/auth/AuthContext";
import {
  createSourceIntakeSession,
  fetchSourceIntakeSession,
  publishSourceIntake,
  type ApiSourceIntakeSession
} from "../../../lib/api/dataPlane";
import { parseNestErrorMessage } from "../../../lib/api/http-core";
import { pushExploreContinue } from "../../../lib/explore/exploreContinueStorage";

function sessionBusy(s: ApiSourceIntakeSession) {
  return s.status === "uploaded" || s.status === "detecting" || s.status === "auditing";
}

export function ExploreSourceIntakePage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<ApiSourceIntakeSession | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);

  const clearPoll = () => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    pushExploreContinue({
      href: "/app/explore/import",
      title: "Audited source import",
      subtitle: "Upload & policy review"
    });
  }, []);

  const refreshSession = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        const res = await fetchSourceIntakeSession(token, id);
        if (res.ok && res.session) {
          setSession(res.session);
          if (!sessionBusy(res.session)) clearPoll();
        }
      } catch {
        /* polling — ignore transient errors */
      }
    },
    [token]
  );

  useEffect(() => {
    return () => clearPoll();
  }, []);

  useEffect(() => {
    if (!session?.id || !token || !sessionBusy(session)) return;
    clearPoll();
    void refreshSession(session.id);
    pollRef.current = window.setInterval(() => void refreshSession(session.id), 2500);
    return () => clearPoll();
  }, [session?.id, session?.status, token, refreshSession]);

  const onUpload = async () => {
    if (!token || !file) {
      setErr("Choose a file and ensure you are signed in.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await createSourceIntakeSession(token, file);
      if (!res.ok || !res.session) throw new Error(res.error ?? "Upload failed");
      setSession(res.session);
    } catch (e) {
      setErr(e instanceof Error ? parseNestErrorMessage(e) : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async () => {
    if (!token || !session) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await publishSourceIntake(token, session.id, {});
      if (!res.ok || !res.buildUnit) throw new Error(res.error ?? "Publish failed");
      setSession(res.session);
    } catch (e) {
      setErr(e instanceof Error ? parseNestErrorMessage(e) : "Publish failed.");
    } finally {
      setBusy(false);
    }
  };

  const publishAllowed =
    session &&
    !session.buildUnitId &&
    !sessionBusy(session) &&
    session.auditDecision !== "declined" &&
    session.auditDecision !== "pending" &&
    (session.normalizedReview?.publishAllowed === true ||
      session.auditDecision === "approved" ||
      session.auditDecision === "approved_with_warnings");

  return (
    <div className="mx-auto max-w-[760px] px-4 pb-20 sm:px-6 lg:px-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-malv-text/45">Explore · Import</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-malv-text sm:text-4xl">Audited source intake</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-malv-text/65">
          Upload a bundle for static policy review. Publishing creates a build unit when the server allows — previews remain optional, never the hero of Explore.
        </p>
      </motion.div>

      <Card variant="glass" elevation="raised" className="mt-10 border-white/10 p-0">
        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2 text-malv-text">
            <ShieldCheck className="h-5 w-5 text-malv-f-live" aria-hidden />
            <h2 className="text-sm font-semibold">Upload</h2>
          </div>
          <p className="mt-1 text-[13px] text-malv-text/55">Server-side auditing is authoritative — UI never invents approvals.</p>
        </div>

        <div className="space-y-5 px-5 py-6 sm:px-6">
          <div>
            <label className="text-[13px] font-medium text-malv-text/75" htmlFor="intake-file">
              Source file
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                id="intake-file"
                type="file"
                className="block w-full text-[13px] text-malv-text/70 file:mr-3 file:rounded-lg file:border-0 file:bg-malv-f-live/14 file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-malv-f-live"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="primary" className="min-h-[44px] shrink-0" disabled={busy || !file || !token} onClick={() => void onUpload()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UploadCloud className="h-4 w-4" aria-hidden />}
                <span className="ml-2">Upload &amp; review</span>
              </Button>
            </div>
          </div>

          {err ? <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100/90">{err}</div> : null}

          {session ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-[14px] leading-relaxed text-malv-text/80">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-malv-text/45">Session</p>
              <p className="mt-2">
                <span className="text-malv-text/55">Status:</span> {session.status}
              </p>
              <p className="mt-1">
                <span className="text-malv-text/55">Audit:</span> {session.auditDecision}
              </p>
              {session.auditSummary ? (
                <p className="mt-2 text-malv-text/70">
                  <span className="text-malv-text/55">Summary:</span> {session.auditSummary}
                </p>
              ) : null}
              {sessionBusy(session) ? (
                <p className="mt-3 flex items-center gap-2 text-[13px] text-malv-text/55">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Processing on the server…
                </p>
              ) : null}
              {session.buildUnitId ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to={`/app/studio?unitId=${encodeURIComponent(session.buildUnitId)}&fromSurface=explore_import`}
                    className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-white/[0.12] bg-surface-raised px-4 text-sm font-semibold text-malv-text shadow-panel transition hover:border-malv-f-live/28 hover:bg-surface-overlay"
                  >
                    Open in Studio
                  </Link>
                  <Link
                    to="/app/explore"
                    className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-white/[0.12] bg-surface-raised px-4 text-sm font-semibold text-malv-text shadow-panel transition hover:border-malv-f-live/28 hover:bg-surface-overlay"
                  >
                    Back to hub
                  </Link>
                </div>
              ) : (
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="primary"
                    className="min-h-[44px]"
                    disabled={busy || !publishAllowed}
                    onClick={() => void onPublish()}
                  >
                    Publish build unit
                  </Button>
                  {!publishAllowed ? (
                    <p className="mt-2 text-[12px] text-malv-text/50">Publishing unlocks only when policy + server gates allow.</p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
