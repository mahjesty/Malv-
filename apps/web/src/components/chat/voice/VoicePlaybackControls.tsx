import { useSyncExternalStore } from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import {
  getMalvSpeechPlaybackSnapshot,
  pauseMalvSpeech,
  playMalvSpeech,
  resumeMalvSpeech,
  stopMalvSpeech,
  stripForSpeech,
  subscribeMalvSpeechPlayback
} from "@/lib/voice/malvSpeechPlayback";

function snapSubscribe(cb: () => void) {
  return subscribeMalvSpeechPlayback(cb);
}

function snapGet() {
  return getMalvSpeechPlaybackSnapshot();
}

function snapServer() {
  return getMalvSpeechPlaybackSnapshot();
}

export function VoicePlaybackControls(props: { messageId: string; text: string; enabled: boolean }) {
  const { messageId, text, enabled } = props;
  const snap = useSyncExternalStore(snapSubscribe, snapGet, snapServer);

  if (!enabled) return null;
  const plain = stripForSpeech(text);
  if (!plain) return null;

  const isThis = snap.activeMessageId === messageId;
  const playing = isThis && snap.status === "playing";
  const paused = isThis && snap.status === "paused";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-white/[0.05] pt-2">
      <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-malv-text/38">Read aloud</span>
      <button
        type="button"
        className="rounded-md p-1 text-malv-text/55 transition-colors hover:bg-white/[0.06] hover:text-malv-text/85"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => {
          if (playing) pauseMalvSpeech();
          else if (paused) resumeMalvSpeech();
          else playMalvSpeech(messageId, text);
        }}
      >
        {playing ? <Pause className="h-3.5 w-3.5" strokeWidth={2.2} /> : <Play className="h-3.5 w-3.5" strokeWidth={2.2} />}
      </button>
      <button
        type="button"
        className="rounded-md p-1 text-malv-text/55 transition-colors hover:bg-white/[0.06] hover:text-malv-text/85 disabled:opacity-30"
        aria-label="Stop playback"
        onClick={() => stopMalvSpeech()}
        disabled={snap.status === "idle"}
      >
        <Square className="h-3 w-3" strokeWidth={2.2} />
      </button>
      <button
        type="button"
        className="rounded-md p-1 text-malv-text/55 transition-colors hover:bg-white/[0.06] hover:text-malv-text/85"
        aria-label="Replay"
        onClick={() => {
          playMalvSpeech(messageId, text);
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>
    </div>
  );
}
