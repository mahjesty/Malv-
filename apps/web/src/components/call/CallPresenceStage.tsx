import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Card, Button, StatusChip } from "@malv/ui";
import { MalvVideoCallPanel } from "../malv/call/MalvVideoCallPanel";
import { MalvPresenceSurface } from "../malv/call/MalvPresenceSurface";
import type { PresenceState } from "../malv/presence/types";
import { enqueueMultimodalDeep, fetchMultimodalDeep, patchCallControls, uploadFileToStorage } from "../../lib/api/dataPlane";

/**
 * Immersive call presentation layer — realtime/session logic stays in pages; this is motion + chrome.
 * @see ../lib/ui/premiumUiBoundary.ts
 */

export type CallPhase = "idle" | "creating" | "active" | "ended";

function derivePresenceState(phase: CallPhase, socketConnected: boolean): PresenceState {
  if (phase === "idle" || phase === "ended") return "idle";
  if (phase === "creating") return "thinking";
  if (phase === "active" && !socketConnected) return "reconnecting";
  return "listening";
}

export function CallPresenceStage(props: {
  variant: "video";
  phase: CallPhase;
  socketConnected: boolean;
  callSessionId: string | null;
  statusLabel: string;
  connectionLabel: string;
  error?: string | null;
  onStart: () => void;
  onEnd: () => void;
  startDisabled?: boolean;
  aside?: ReactNode;
  /** `stack` = single column (immersive video page); `split` = sidebar controls (default). */
  layout?: "split" | "stack";
  /** `group` = collaboration stability — character/avatar switching stays fixed (blueprint). */
  participationScope?: "direct" | "group";
  runtime?: Record<string, unknown> | null;
  accessToken?: string;
}) {
  const {
    phase,
    socketConnected,
    callSessionId,
    statusLabel,
    connectionLabel,
    error,
    onStart,
    onEnd,
    startDisabled,
    aside,
    layout = "split",
    participationScope = "direct",
    runtime,
    accessToken
  } = props;

  const [durationSeconds, setDurationSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [assistBusy, setAssistBusy] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assistInsight, setAssistInsight] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const canUseCameraAssist = participationScope === "direct" && phase === "active";
  const cameraAssistEnabled = Boolean(runtime?.cameraAssistEnabled);

  const stopLocalStream = useCallback(() => {
    for (const track of localStreamRef.current?.getTracks() ?? []) track.stop();
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  }, []);

  const immersive = phase === "active" || phase === "creating";
  const presenceState = derivePresenceState(phase, socketConnected);

  useEffect(() => {
    if (!immersive) {
      setDurationSeconds(0);
      return;
    }
    const t = window.setInterval(() => setDurationSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [immersive]);

  useEffect(() => {
    if (phase !== "active" || !socketConnected || muted) {
      setAudioLevel(0);
      return;
    }
    const t = window.setInterval(() => {
      setAudioLevel(0.15 + Math.sin(Date.now() / 400) * 0.08 + Math.random() * 0.05);
    }, 80);
    return () => window.clearInterval(t);
  }, [phase, socketConnected, muted]);

  useEffect(() => {
    if (phase !== "active" || !cameraOn) {
      stopLocalStream();
      return;
    }
    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        setAssistError("Camera permission is required for camera assist.");
      });
    return () => {
      cancelled = true;
      stopLocalStream();
    };
  }, [phase, cameraOn, stopLocalStream]);

  useEffect(() => {
    if (!cameraAssistEnabled) {
      setAssistInsight(null);
      setAssistError(null);
    }
  }, [cameraAssistEnabled]);

  const setCameraAssist = useCallback(
    async (enabled: boolean) => {
      if (!accessToken || !callSessionId || participationScope !== "direct") return;
      setAssistBusy(true);
      setAssistError(null);
      try {
        await patchCallControls(accessToken, callSessionId, { cameraAssistEnabled: enabled });
      } catch (e) {
        setAssistError(e instanceof Error ? e.message : "Could not update camera assist.");
      } finally {
        setAssistBusy(false);
      }
    },
    [accessToken, callSessionId, participationScope]
  );

  const interpretFrame = useCallback(async () => {
    if (!accessToken || !cameraAssistEnabled || !localVideoRef.current) return;
    const video = localVideoRef.current;
    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
      setAssistError("Live camera preview is not ready yet.");
      return;
    }
    setAssistBusy(true);
    setAssistError(null);
    setAssistInsight(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not prepare capture surface.");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Frame capture failed."))), "image/jpeg", 0.88)
      );
      const file = new File([blob], `camera-assist-${Date.now()}.jpg`, { type: "image/jpeg" });
      const up = await uploadFileToStorage(accessToken, { file, fileKind: "image" });
      await enqueueMultimodalDeep(accessToken, up.fileId);
      let lastErr = "Timed out waiting for interpretation.";
      for (let i = 0; i < 8; i += 1) {
        await new Promise((r) => window.setTimeout(r, 1200));
        const out = await fetchMultimodalDeep(accessToken, up.fileId).catch((e) => {
          lastErr = e instanceof Error ? e.message : "Interpretation not ready";
          return null;
        });
        if (!out?.ok) continue;
        const extraction = out.extraction as Record<string, unknown>;
        const unified = extraction.unifiedResult as Record<string, unknown> | null;
        const retrievalText = typeof extraction.retrievalText === "string" ? extraction.retrievalText : "";
        const image = (unified?.image as Record<string, unknown> | undefined) ?? null;
        const insight =
          retrievalText.trim() ||
          (image ? `Observed frame dimensions ${String(image.width ?? "?")}x${String(image.height ?? "?")}.` : "");
        setAssistInsight(insight || "Frame received and interpreted.");
        setAssistBusy(false);
        return;
      }
      throw new Error(lastErr);
    } catch (e) {
      setAssistError(e instanceof Error ? e.message : "Frame interpretation failed.");
    } finally {
      setAssistBusy(false);
    }
  }, [accessToken, cameraAssistEnabled]);

  const signalLabel = phase === "active" && !socketConnected ? "Reconnecting" : "Stable";
  const secureLabel = "Secure";

  const idleVideo = (
    <motion.div
      key="idle-video"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center text-center px-4 py-6"
    >
      <div className="relative mb-8 flex w-full max-w-[320px] aspect-square items-center justify-center">
        <span className="absolute inset-[-12%] rounded-full bg-gradient-to-br from-violet-500/20 via-brand/15 to-cyan-400/10 blur-3xl opacity-90 animate-call-breathe" aria-hidden />
        <MalvPresenceSurface variant="holographic" state="idle" audioLevel={0} caption="Video link" presenceClassName="w-[min(52vw,200px)] h-[min(52vw,200px)] sm:w-52 sm:h-52" />
      </div>
      <p className="max-w-md min-h-[3rem] text-sm leading-relaxed text-malv-text/70">
        Same session pattern as voice — immersive presentation with unchanged transport wiring.
      </p>
      <div className="mt-4 font-mono text-[10px] text-malv-text/40">{connectionLabel}</div>
      <div className="mt-2 font-mono text-[10px] text-malv-text/35 truncate max-w-[280px]">{callSessionId ?? "—"}</div>
    </motion.div>
  );

  const endedCopy = (
    <motion.div
      key="ended"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center text-center px-4 py-10"
    >
      <p className="text-sm text-malv-text/75 max-w-md">Session ended server-side. Start again when you are ready.</p>
      <div className="mt-4 font-mono text-[10px] text-malv-text/40">{connectionLabel}</div>
    </motion.div>
  );

  const gridClass = layout === "stack" ? "flex flex-col gap-5" : "grid items-start gap-5 lg:grid-cols-[1fr_minmax(260px,320px)]";

  return (
    <div className={gridClass}>
      <Card variant="glass" elevation="deep" className="relative min-h-0 flex-1 overflow-hidden border border-white/[0.08] p-0 shadow-panel-deep">
        <div
          className="pointer-events-none absolute inset-0 opacity-90 bg-[radial-gradient(ellipse_90%_60%_at_50%_18%,rgba(96,165,250,0.1),transparent_58%),radial-gradient(ellipse_72%_52%_at_82%_78%,rgba(34,211,238,0.05),transparent_56%)]"
          aria-hidden
        />
        <div className="relative flex items-center justify-between gap-3 border-b border-white/[0.06] bg-surface-base/50 px-5 py-3.5 backdrop-blur-md">
          <div className="min-w-0 text-left">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-malv-text/42">Video session</div>
            <p className="mt-0.5 truncate text-[12px] text-malv-text/55">Presence + capture</p>
          </div>
          <StatusChip label={statusLabel} status={phase === "active" ? "success" : "neutral"} />
        </div>

        <div className="relative px-3 py-4 sm:px-5 sm:py-6">
          {participationScope === "group" && phase === "active" ? (
            <div
              className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-center text-[11px] leading-snug text-amber-100/85"
              role="status"
            >
              Group stability mode: avatar / character switching is fixed for this session.
            </div>
          ) : null}
          <AnimatePresence mode="wait">
            {phase === "idle" ? idleVideo : null}
            {phase === "ended" ? endedCopy : null}
            {immersive ? (
              <MalvVideoCallPanel
                key="video-panel"
                variant="holographic"
                presenceState={presenceState}
                audioLevel={audioLevel}
                durationSeconds={durationSeconds}
                muted={muted}
                cameraOn={cameraOn}
                isExpanded={expanded}
                signalLabel={signalLabel}
                secureLabel={secureLabel}
                showEndCall={phase === "active"}
                onToggleMute={() => setMuted((m) => !m)}
                onToggleCamera={() => setCameraOn((c) => !c)}
                onToggleExpand={() => setExpanded((e) => !e)}
                onEndCall={onEnd}
                localVideoRef={(node) => {
                  localVideoRef.current = node;
                }}
              />
            ) : null}
          </AnimatePresence>

          {immersive && phase === "active" && !socketConnected ? (
            <motion.div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-brand/80"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </motion.div>
          ) : null}
        </div>

        {error ? <div className="border-t border-red-500/20 bg-red-500/5 px-5 py-3 text-sm text-red-100/90">{error}</div> : null}
      </Card>

      <div className={layout === "stack" ? "space-y-3 lg:max-w-xl lg:mx-auto w-full" : "space-y-3"}>
        <Card elevation="raised" className="space-y-3 border border-white/[0.08] p-5 shadow-panel">
          {phase !== "active" ? (
            <Button onClick={onStart} disabled={startDisabled || phase === "creating"} className="min-h-[48px] w-full justify-center">
              {phase === "creating" ? "Establishing…" : "Establish session"}
            </Button>
          ) : (
            <p className="text-[11px] leading-relaxed text-malv-text/52">
              End the session from the video surface when you are finished. The channel closes server-side.
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-malv-text/42">
            Call API and socket wiring are unchanged — this surface is presentation only.
          </p>
          {participationScope === "group" ? (
            <p className="text-[11px] leading-relaxed text-amber-100/80">
              Camera assist is unavailable in group sessions for this milestone.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                <div>
                  <div className="text-[11px] font-semibold text-malv-text/86">Camera assist</div>
                  <p className="text-[10px] text-malv-text/55">Optional and user-controlled. Never enabled silently.</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-white/20 bg-white/[0.05] px-3 py-1.5 text-[11px]"
                  disabled={!canUseCameraAssist || assistBusy}
                  onClick={() => void setCameraAssist(!cameraAssistEnabled)}
                >
                  {cameraAssistEnabled ? "Disable" : "Enable"}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                <StatusChip label={cameraAssistEnabled ? "Assist active" : "Assist off"} status={cameraAssistEnabled ? "success" : "neutral"} />
                <button
                  type="button"
                  className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-100 disabled:opacity-50"
                  disabled={!cameraAssistEnabled || assistBusy || !cameraOn}
                  onClick={() => void interpretFrame()}
                >
                  {assistBusy ? "Interpreting…" : "Interpret frame"}
                </button>
              </div>
              <p className="text-[10px] text-malv-text/55">
                Privacy: only manually captured frames are sent for analysis after opt-in.
              </p>
              {assistInsight ? <p className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] px-3 py-2 text-[11px] text-cyan-100/90">{assistInsight}</p> : null}
              {assistError ? <p className="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-100/90">{assistError}</p> : null}
            </>
          )}
        </Card>
        {aside}
      </div>
    </div>
  );
}
