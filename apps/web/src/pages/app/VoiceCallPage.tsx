import ConnectionBanner from "../../components/call/orb/ConnectionBanner";
import CallHeader from "../../components/call/orb/CallHeader";
import LivingOrbVisualizer from "../../components/call/orb/LivingOrbVisualizer";
import BottomControls from "../../components/call/orb/BottomControls";
import PreCallScreen from "../../components/call/orb/PreCallScreen";
import { useVoiceCallShell } from "../../lib/voice/VoiceCallShellContext";

function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function VoiceCallPage() {
  const call = useVoiceCallShell();
  const stageLabel =
    call.livingState === "listening"
      ? "listening"
      : call.livingState === "thinking"
        ? "thinking"
        : call.livingState === "speaking"
          ? "speaking"
          : call.malvPaused
            ? "acting"
            : "listening";
  const confidenceHint = String((call.runtime as Record<string, unknown> | null)?.confidence ?? "").toLowerCase();
  const lowConfidence = confidenceHint === "low";

  if (call.callPhase === "precall" || call.callPhase === "idle") {
    return (
      <div className="malv-voice-call-root">
        <PreCallScreen
          onStartCall={call.handleStartCall}
          disabled={false}
          error={call.err}
        />
      </div>
    );
  }

  if (call.callPhase === "ended") {
    const recap = call.endedCallBrief?.recap;
    return (
      <div className="malv-voice-call-root malv-call-screen-bg flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground/40">Call ended</p>
        <p className="font-mono text-[13px] tracking-widest text-muted-foreground/25">{formatDuration(call.elapsed)}</p>
        {recap?.summary?.trim() ? (
          <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left backdrop-blur-md">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/45">Recap</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground/85">{recap.summary}</p>
          </div>
        ) : null}
        {recap?.actionItems && recap.actionItems.length > 0 ? (
          <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left backdrop-blur-md">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/45">Action items</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/80">
              {recap.actionItems.map((item, i) => (
                <li key={`${i}:${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {!recap?.summary?.trim() && !(recap?.actionItems && recap.actionItems.length) ? (
          <p className="max-w-sm text-center text-[11px] leading-relaxed text-muted-foreground/35">
            Call notes appear here when a recap is saved for this session (e.g. via PATCH /v1/calls/…/recap).
          </p>
        ) : null}
        <button
          type="button"
          onClick={call.navigateBackToChat}
          className="mt-4 rounded-full px-8 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/60 border border-[var(--call-glass-border)] bg-[var(--call-glass)] backdrop-blur-xl transition-all duration-200 hover:text-foreground active:scale-95"
        >
          Back to chat
        </button>
      </div>
    );
  }

  if (call.callPhase === "connecting" || call.callPhase === "ending") {
    const ending = call.callPhase === "ending";
    return (
      <div className="malv-voice-call-root">
        <div className="malv-call-screen-bg fixed inset-0 flex flex-col items-center justify-between overflow-hidden select-none">
          <div className="malv-call-vignette pointer-events-none fixed inset-0 z-0" aria-hidden />
          <div className="malv-pre-call-canvas absolute inset-0 pointer-events-none z-[1]" aria-hidden />
          <LivingOrbVisualizer state="idle" audioLevel={0.12} className="z-[2]" />
          <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center pointer-events-none gap-3 px-6">
            <div className="w-full max-w-xs rounded-2xl border border-white/12 bg-white/[0.06] px-5 py-4 text-center backdrop-blur-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_12px_30px_rgba(0,0,0,0.45)]">
              <div className="mb-2 flex items-center justify-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
                <span className="h-2 w-2 rounded-full bg-cyan-200/80 animate-pulse [animation-delay:120ms]" />
                <span className="h-2 w-2 rounded-full bg-cyan-100/70 animate-pulse [animation-delay:240ms]" />
              </div>
              <p className="text-[11px] font-mono tracking-[0.26em] uppercase text-zinc-300">
                {ending ? "Ending call" : "Starting call"}
              </p>
              <p className="mt-1 text-[10px] font-mono tracking-[0.16em] text-zinc-400/95">
                {ending ? "Wrapping up session..." : "Connecting to MALV voice session..."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="malv-voice-call-root malv-call-screen-bg fixed inset-0 flex flex-col overflow-hidden select-none"
      data-orb-state={call.livingState}
      role="main"
      aria-label="MALV voice call"
    >
      {call.callMinimized ? null : (
        <>
          <div className="malv-call-vignette" aria-hidden />
          <div className="malv-call-ambient-layer" aria-hidden />
          <div className="malv-call-orb-aura" aria-hidden />
          <LivingOrbVisualizer
            state={call.livingState}
            micLevelRef={call.voice.inputAudioLevelRef}
            orbContextRef={call.orbContextRef}
            orbOutputLevelRef={call.orbOutputLevelRef}
            className="z-10"
          />

          {/* Full-screen wake layer: canvas is pointer-events none; header/banner are non-blocking except minimize */}
          <div
            className="fixed inset-0 z-[11]"
            aria-hidden
            onClick={call.handleScreenTap}
          />

          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
            {call.runtime?.participationScope === "group" && call.callPhase === "active" ? (
              <div
                className="pointer-events-none mx-auto mt-[max(0.5rem,env(safe-area-inset-top))] max-w-md rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-3 py-1 text-center text-[10px] font-medium tracking-wide text-amber-100/90"
                role="status"
              >
                Group stability mode — fixed presence policy
              </div>
            ) : null}
            <div className="pointer-events-none mt-[max(0.5rem,env(safe-area-inset-top))] flex items-center justify-center gap-2 px-4">
              <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white/75">
                {stageLabel}
              </span>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-100/80">
                private voice
              </span>
              {lowConfidence ? (
                <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100">
                  ambiguity detected
                </span>
              ) : null}
            </div>
            <ConnectionBanner state={call.conn} visible={call.conn !== "healthy"} />
            <CallHeader
              visible={call.controlsVisible}
              callDuration={formatDuration(call.elapsed)}
              onMinimize={call.minimizeToReturnTarget}
            />
          </div>

          <div
            className="pointer-events-auto absolute bottom-0 left-0 right-0 z-20 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {call.voice.errorMessage ? (
              <p className="max-w-sm self-center px-6 pb-2 text-center text-xs text-red-300/90">{call.voice.errorMessage}</p>
            ) : null}

            <BottomControls
              visible={call.controlsVisible}
              micMuted={call.micMuted}
              speakerOn={call.speakerOn}
              malvMuted={call.malvPaused}
              onMicToggle={() => {
                void call.toggleMic();
                call.handleControlInteract();
              }}
              onSpeakerToggle={() => {
                call.toggleSpeaker();
                call.handleControlInteract();
              }}
              onMalvMuteToggle={() => {
                void call.toggleMalvPause();
                call.handleControlInteract();
              }}
              onEndCall={() => void call.handleEndCall()}
            />
          </div>
        </>
      )}

      {call.err ? (
        <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-2 text-center text-xs text-red-200">{call.err}</div>
      ) : null}
    </div>
  );
}
