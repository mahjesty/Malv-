import MinimizedBar from "./orb/MinimizedBar";
import { useVoiceCallShell } from "../../lib/voice/VoiceCallShellContext";

function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function VoiceCallGlobalLayer() {
  const call = useVoiceCallShell();
  const minimizedDockShouldRender = call.callActive && call.callMinimized;

  return (
    <>
      <audio
        ref={call.assistantOutputAudioRef}
        playsInline
        muted={false}
        preload="auto"
        className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0"
        aria-hidden
      />
      {minimizedDockShouldRender ? (
        <MinimizedBar
          micMuted={call.micMuted}
          speakerOn={call.speakerOn}
          status={call.callStatus}
          audioLevel={0}
          audioLevelRef={call.orbOutputLevelRef}
          callDuration={formatDuration(call.elapsed)}
          side={call.callDockSide}
          y={call.callDockY}
          hidden={call.callDockHidden}
          unreadCount={call.unreadTranscriptCount}
          pulse={call.liveActivityPulse}
          onSideChange={call.setCallDockSide}
          onYChange={call.setCallDockY}
          onHiddenChange={call.setCallDockHidden}
          onDraggingChange={call.setCallDockDragging}
          onExpand={() => {
            call.clearUnreadTranscript();
            call.openFullCall();
          }}
          onMicToggle={() => void call.toggleMic()}
          onSpeakerToggle={call.toggleSpeaker}
          onEndCall={() => void call.handleEndCall()}
        />
      ) : null}
    </>
  );
}
