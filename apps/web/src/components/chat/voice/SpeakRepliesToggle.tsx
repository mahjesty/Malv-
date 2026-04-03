import { Volume2, VolumeX } from "lucide-react";

export function SpeakRepliesToggle(props: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { enabled, onChange, disabled } = props;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={[
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors sm:text-[11px]",
        enabled
          ? "border-[oklch(0.5_0.12_220/0.35)] bg-[oklch(0.55_0.1_220/0.12)] text-malv-text/80"
          : "border-white/[0.06] bg-black/20 text-malv-text/45 hover:text-malv-text/65"
      ].join(" ")}
      aria-pressed={enabled}
      aria-label={enabled ? "Speak replies: on" : "Speak replies: off"}
    >
      {enabled ? <Volume2 className="h-3 w-3" strokeWidth={2.2} /> : <VolumeX className="h-3 w-3" strokeWidth={2.2} />}
      Speak replies
    </button>
  );
}
