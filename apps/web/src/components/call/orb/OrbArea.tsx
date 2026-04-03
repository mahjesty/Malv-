import { cn } from "@/lib/cn";

export type OrbCallState = "listening" | "speaking" | "thinking" | "muted" | "reconnecting";

interface OrbAreaProps {
  callState: OrbCallState;
  muted: boolean;
  malvMuted: boolean;
}

const STATE_LABELS: Record<OrbCallState, string> = {
  listening: "Listening",
  speaking: "Speaking",
  thinking: "Thinking",
  muted: "Muted",
  reconnecting: "Reconnecting"
};

export default function OrbArea({ callState, muted, malvMuted }: OrbAreaProps) {
  const displayState: OrbCallState = muted ? "muted" : callState;
  const isSpeaking = displayState === "speaking";
  const isReconnecting = displayState === "reconnecting";
  const isMuted = displayState === "muted";

  return (
    <div className="flex flex-1 select-none flex-col items-center justify-center gap-10 px-6">
      <div className="relative flex items-center justify-center">
        <div
          className="pointer-events-none absolute rounded-full border border-[oklch(0.24_0_0/0.18)] transition-all duration-700"
          style={{ width: 320, height: 320 }}
          aria-hidden="true"
        />
        <div
          className={cn(
            "pointer-events-none absolute rounded-full border border-[oklch(0.26_0_0/0.22)] transition-all duration-700 animate-orb-breathe",
            isSpeaking ? "scale-105 opacity-100" : "scale-100 opacity-40"
          )}
          style={{ width: 290, height: 290 }}
          aria-hidden="true"
        />
        <div
          className={cn(
            "pointer-events-none absolute rounded-full border border-[oklch(0.30_0_0/0.28)] transition-all duration-500",
            isSpeaking ? "scale-105 opacity-100" : "scale-100 opacity-60"
          )}
          style={{ width: 256, height: 256 }}
          aria-hidden="true"
        />
        <div
          className="relative flex items-center justify-center rounded-full bg-[oklch(0.10_0.004_240)] ring-1 ring-[oklch(0.28_0_0/0.45)] transition-all duration-700 ease-in-out"
          style={{ width: 232, height: 232 }}
          role="img"
          aria-label="MALV voice orb"
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle at 50% 30%, oklch(0.18 0.004 240 / 0.25) 0%, transparent 70%)"
            }}
            aria-hidden="true"
          />
          <span className="pointer-events-none z-10 text-[9px] font-mono uppercase tracking-[0.3em] text-[oklch(0.35_0_0)]">
            orb
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <span
          className={cn(
            "font-mono text-[12px] uppercase tracking-[0.22em] transition-all duration-300",
            isReconnecting
              ? "animate-status-blink text-[var(--call-warn)]"
              : isMuted
                ? "text-[var(--call-muted-icon)]"
                : "text-foreground/40"
          )}
        >
          {STATE_LABELS[displayState]}
        </span>
        {malvMuted && !isReconnecting ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--call-muted-icon)]/50">
            MALV muted
          </span>
        ) : null}
      </div>
    </div>
  );
}
