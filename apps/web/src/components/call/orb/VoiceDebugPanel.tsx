import { cn } from "@/lib/cn";

export type VoiceDebugPanelProps = {
  visible: boolean;
  micActive: boolean;
  signalingConnected: boolean;
  remoteStreamAttached: boolean;
  remoteAudioTrackCount: number;
  /** Last final transcript from HTTP test-trigger (or legacy socket). */
  lastSttText: string | null;
  lastSttNormalized: string | null;
  /** Server-side substring match for malv test voice; null = no response yet. */
  serverTriggerMatched: boolean | null;
  sttErrorCode: string | null;
  pipelineError: string | null;
  playbackMode: string | null;
  /** Voice call page uses POST /v1/voice/test-trigger for utterances. */
  httpPipeline?: boolean;
  playbackRequested: boolean;
  playbackEnded: boolean;
  cannedTriggerDetected: boolean;
  playbackStarted: boolean;
  playbackError: string | null;
  lastAssetUrl: string | null;
  className?: string;
};

/**
 * Dev surface for voice-call verification: HTTP STT → trigger → HTMLAudio playback (not WebRTC assistant track).
 */
export function VoiceDebugPanel(props: VoiceDebugPanelProps) {
  if (!props.visible) return null;

  const trunc = (s: string | null, n: number) => {
    if (s == null || s === "") return "—";
    return s.length <= n ? s : `${s.slice(0, n)}...`;
  };

  const rows: Array<{ k: string; v: string; ok?: boolean }> = [
    { k: "Mic active", v: props.micActive ? "yes" : "no", ok: props.micActive },
    { k: "Signaling (socket)", v: props.signalingConnected ? "connected" : "no", ok: props.signalingConnected },
    {
      k: "Utterance pipeline",
      v: props.httpPipeline ? "POST /v1/voice/test-trigger" : "socket chunk + voice:stop",
      ok: props.httpPipeline === true
    },
    {
      k: "Remote stream (WebRTC)",
      v: props.remoteStreamAttached ? "attached" : "not used for canned test",
      ok: true
    },
    {
      k: "Remote audio tracks",
      v: `${props.remoteAudioTrackCount} (N/A for HTTP test)`,
      ok: true
    },
    { k: "Last STT text", v: trunc(props.lastSttText, 48), ok: Boolean(props.lastSttText) },
    { k: "STT normalized", v: trunc(props.lastSttNormalized, 48), ok: props.serverTriggerMatched !== null },
    {
      k: "Trigger (malv test voice)",
      v:
        props.serverTriggerMatched === null
          ? "— (awaiting response)"
          : props.serverTriggerMatched
            ? "matched"
            : "no",
      ok: props.serverTriggerMatched === true
    },
    {
      k: "STT / pipeline error",
      v: trunc(props.sttErrorCode ?? props.pipelineError, 40),
      ok: !props.sttErrorCode && !props.pipelineError
    },
    { k: "Playback mode (server)", v: props.playbackMode ?? "—", ok: props.playbackMode != null || props.serverTriggerMatched !== true },
    {
      k: "Playback requested",
      v: props.playbackRequested ? "yes" : "no",
      ok: !props.serverTriggerMatched || props.playbackRequested
    },
    {
      k: "Playback started",
      v: props.playbackStarted ? "yes" : "no",
      ok: !props.serverTriggerMatched || props.playbackStarted
    },
    {
      k: "Playback ended",
      v: props.playbackEnded ? "yes" : "no",
      ok: !props.playbackStarted || props.playbackEnded
    },
    {
      k: "Playback error",
      v: props.playbackError ?? "—",
      ok: !props.playbackError
    },
    {
      k: "Last asset / audio URL",
      v: props.lastAssetUrl ? props.lastAssetUrl.slice(0, 72) + (props.lastAssetUrl.length > 72 ? "..." : "") : "—"
    },
    {
      k: "Canned / HTTP reply path",
      v: props.cannedTriggerDetected ? "active" : "—",
      ok: props.cannedTriggerDetected
    }
  ];

  return (
    <div
      className={cn(
        "pointer-events-auto max-w-[min(100%,22rem)] rounded-lg border border-emerald-500/25 bg-zinc-950/90 px-3 py-2 font-mono text-[10px] leading-snug text-emerald-100/90 shadow-lg backdrop-blur-md",
        props.className
      )}
      role="region"
      aria-label="Voice debug"
    >
      <p className="mb-1.5 border-b border-emerald-500/20 pb-1 text-[9px] uppercase tracking-[0.2em] text-emerald-400/80">
        Voice debug
      </p>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.k} className="flex justify-between gap-3">
            <span className="shrink-0 text-zinc-500">{r.k}</span>
            <span
              className={cn(
                "min-w-0 break-all text-right",
                r.ok === true && "text-emerald-300",
                r.ok === false && "text-amber-200/90"
              )}
            >
              {r.v}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
