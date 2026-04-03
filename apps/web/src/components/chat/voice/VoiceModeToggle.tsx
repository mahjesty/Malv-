import type { MicInteractionMode, VoiceRoute } from "@/lib/voice/voiceAssistantTypes";

export function VoiceModeToggle(props: {
  voiceRoute: VoiceRoute;
  onVoiceRoute: (r: VoiceRoute) => void;
  micInteraction: MicInteractionMode;
  onMicInteraction: (m: MicInteractionMode) => void;
  disabled?: boolean;
}) {
  const { voiceRoute, onVoiceRoute, micInteraction, onMicInteraction, disabled } = props;

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
      <div
        className="inline-flex rounded-lg border border-white/[0.08] bg-black/25 p-0.5"
        role="group"
        aria-label="Voice destination"
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => onVoiceRoute("chat")}
          className={[
            "rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors sm:px-2.5 sm:text-[11px]",
            voiceRoute === "chat"
              ? "bg-white/[0.1] text-malv-text/[0.92]"
              : "text-malv-text/45 hover:text-malv-text/70"
          ].join(" ")}
        >
          Chat
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onVoiceRoute("operator")}
          className={[
            "rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors sm:px-2.5 sm:text-[11px]",
            voiceRoute === "operator"
              ? "bg-[oklch(0.55_0.14_55/0.35)] text-[oklch(0.95_0.04_95)] ring-1 ring-[oklch(0.62_0.12_55/0.4)]"
              : "text-malv-text/45 hover:text-malv-text/70"
          ].join(" ")}
        >
          Operator
        </button>
      </div>

      <div
        className="inline-flex rounded-lg border border-white/[0.06] bg-black/20 p-0.5"
        role="group"
        aria-label="Microphone mode"
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => onMicInteraction("toggle")}
          className={[
            "rounded-md px-2 py-1 text-[10px] font-medium tracking-tight transition-colors sm:text-[11px]",
            micInteraction === "toggle" ? "bg-white/[0.08] text-malv-text/85" : "text-malv-text/40 hover:text-malv-text/65"
          ].join(" ")}
        >
          Tap
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onMicInteraction("press")}
          className={[
            "rounded-md px-2 py-1 text-[10px] font-medium tracking-tight transition-colors sm:text-[11px]",
            micInteraction === "press" ? "bg-white/[0.08] text-malv-text/85" : "text-malv-text/40 hover:text-malv-text/65"
          ].join(" ")}
        >
          Hold
        </button>
      </div>
    </div>
  );
}
