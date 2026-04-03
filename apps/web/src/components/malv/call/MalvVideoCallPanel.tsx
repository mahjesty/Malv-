import { motion } from "framer-motion";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2, Minimize2, Signal, Shield, Disc } from "lucide-react";
import { MALVPresence } from "../presence";
import type { PresenceState, PresenceVariant } from "../presence/types";
import { formatCallDuration } from "./malvCallFormat";

function videoStatusLabel(state: PresenceState, muted: boolean): string {
  if (muted) return "Standby";
  switch (state) {
    case "listening":
      return "Observing";
    case "thinking":
      return "Analyzing";
    case "speaking":
      return "Presenting";
    case "reconnecting":
      return "Reconnecting";
    case "muted":
      return "Standby";
    default:
      return "Vision ready";
  }
}

export function MalvVideoCallPanel(props: {
  variant?: PresenceVariant;
  presenceState: PresenceState;
  audioLevel: number;
  durationSeconds: number;
  muted: boolean;
  cameraOn: boolean;
  isExpanded?: boolean;
  signalLabel?: string;
  secureLabel?: string;
  qualityLabel?: string;
  fpsLabel?: string;
  showEndCall?: boolean;
  localPreviewLabel?: string;
  localVideoRef?: (node: HTMLVideoElement | null) => void;
  onToggleMute?: () => void;
  onToggleCamera?: () => void;
  onToggleExpand?: () => void;
  onEndCall?: () => void;
  className?: string;
}) {
  const {
    variant = "holographic",
    presenceState,
    audioLevel,
    durationSeconds,
    muted,
    cameraOn,
    isExpanded = false,
    signalLabel = "Signal stable",
    secureLabel = "Encrypted",
    qualityLabel = "HD",
    fpsLabel = "60 FPS",
    showEndCall = true,
    localPreviewLabel = "You",
    localVideoRef,
    onToggleMute,
    onToggleCamera,
    onToggleExpand,
    onEndCall,
    className = ""
  } = props;

  const displayState: PresenceState = muted ? "muted" : presenceState;

  return (
    <motion.div
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{
        background: "linear-gradient(180deg, oklch(0.08 0.015 260) 0%, oklch(0.05 0.01 260) 100%)",
        border: "1px solid oklch(0.25 0.04 260 / 0.5)"
      }}
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background: `conic-gradient(from 0deg, 
            oklch(0.6 0.2 280 / 0.3), 
            oklch(0.7 0.18 200 / 0.3), 
            oklch(0.6 0.2 280 / 0.3))`,
          padding: "1px",
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude"
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />

      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <motion.div
              className="flex items-center gap-1 rounded px-2 py-0.5"
              style={{ background: "oklch(0.5 0.2 25 / 0.3)" }}
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Disc className="h-3 w-3 text-red-400" />
              <span className="text-xs font-medium text-red-400">REC</span>
            </motion.div>
            <span className="ml-1 font-mono text-xs text-malv-text/60">{formatCallDuration(durationSeconds)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="rounded px-2 py-0.5 text-xs font-medium"
            style={{
              background: "oklch(0.2 0.03 260 / 0.8)",
              border: "1px solid oklch(0.35 0.05 260 / 0.5)",
              color: "oklch(0.75 0.12 200)"
            }}
          >
            {qualityLabel}
          </div>
          <div
            className="rounded px-2 py-0.5 text-xs font-medium"
            style={{
              background: "oklch(0.2 0.03 260 / 0.8)",
              border: "1px solid oklch(0.35 0.05 260 / 0.5)",
              color: "oklch(0.75 0.15 280)"
            }}
          >
            {fpsLabel}
          </div>
        </div>
      </div>

      <div className={`relative flex flex-col items-center justify-center ${isExpanded ? "py-20 md:py-32" : "py-14 md:py-20"}`}>
        <div
          className="pointer-events-none absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, oklch(0.7 0.1 200) 2px, oklch(0.7 0.1 200) 3px)"
          }}
        />

        <motion.div
          className="absolute left-1/2 top-8 z-10 -translate-x-1/2"
          key={displayState}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div
            className="rounded-full px-4 py-1.5 text-xs font-medium tracking-wide"
            style={{
              background: "oklch(0.15 0.025 260 / 0.9)",
              border: "1px solid oklch(0.4 0.08 280 / 0.5)",
              color: "oklch(0.8 0.15 280)",
              backdropFilter: "blur(8px)"
            }}
          >
            {videoStatusLabel(presenceState, muted)}
          </div>
        </motion.div>

        <MALVPresence
          variant={variant}
          state={displayState}
          audioLevel={audioLevel}
          className={isExpanded ? "h-56 w-56 md:h-72 md:w-72" : "h-36 w-36 md:h-48 md:w-48"}
        />

        <div className="mt-6 flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-emerald-400/90">
            <Signal className="h-3.5 w-3.5" />
            <span>{signalLabel}</span>
          </div>
          <div className="h-3 w-px bg-white/10" />
          <div className="flex items-center gap-1 text-xs text-cyan-400/90">
            <Shield className="h-3.5 w-3.5" />
            <span>{secureLabel}</span>
          </div>
        </div>
      </div>

      {cameraOn ? (
        <motion.div
          className="absolute bottom-20 right-4 w-24 overflow-hidden rounded-xl md:h-40 md:w-32"
          style={{
            background: "linear-gradient(135deg, oklch(0.15 0.02 260) 0%, oklch(0.1 0.015 260) 100%)",
            border: "2px solid oklch(0.3 0.04 260 / 0.5)",
            boxShadow: "0 8px 32px oklch(0 0 0 / 0.4)"
          }}
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
        >
          <div className="flex h-full w-full items-center justify-center">
            {localVideoRef ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
                aria-label="Local camera preview"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-500/30">
                <span className="text-lg font-medium text-malv-text/60">{localPreviewLabel}</span>
              </div>
            )}
          </div>
          <div className="absolute left-1 top-1 h-3 w-3 rounded-tl border-l-2 border-t-2 border-cyan-400/50" />
          <div className="absolute right-1 top-1 h-3 w-3 rounded-tr border-r-2 border-t-2 border-cyan-400/50" />
          <div className="absolute bottom-1 left-1 h-3 w-3 rounded-bl border-b-2 border-l-2 border-cyan-400/50" />
          <div className="absolute bottom-1 right-1 h-3 w-3 rounded-br border-b-2 border-r-2 border-cyan-400/50" />
        </motion.div>
      ) : null}

      <div className="relative flex items-center justify-center gap-3 bg-gradient-to-t from-black/60 to-transparent px-4 py-4 md:gap-4">
        <motion.button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full md:h-12 md:w-12"
          style={{
            background: muted ? "oklch(0.5 0.2 25)" : "oklch(0.18 0.03 260)",
            border: "1px solid oklch(0.3 0.04 260 / 0.5)"
          }}
          whileHover={{ scale: 1.08, boxShadow: "0 0 25px oklch(0.7 0.18 200 / 0.4)" }}
          whileTap={{ scale: 0.95 }}
          onClick={onToggleMute}
        >
          {muted ? <MicOff className="h-5 w-5 text-malv-text" /> : <Mic className="h-5 w-5 text-malv-text" />}
        </motion.button>

        <motion.button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full md:h-12 md:w-12"
          style={{
            background: !cameraOn ? "oklch(0.5 0.2 25)" : "oklch(0.18 0.03 260)",
            border: "1px solid oklch(0.3 0.04 260 / 0.5)"
          }}
          whileHover={{ scale: 1.08, boxShadow: "0 0 25px oklch(0.65 0.2 280 / 0.4)" }}
          whileTap={{ scale: 0.95 }}
          onClick={onToggleCamera}
        >
          {cameraOn ? <Video className="h-5 w-5 text-malv-text" /> : <VideoOff className="h-5 w-5 text-malv-text" />}
        </motion.button>

        {showEndCall ? (
          <motion.button
            type="button"
            className="flex h-14 w-14 items-center justify-center rounded-full md:h-16 md:w-16"
            style={{
              background: "linear-gradient(135deg, oklch(0.55 0.24 25) 0%, oklch(0.45 0.22 20) 100%)",
              boxShadow: "0 6px 30px oklch(0.5 0.2 25 / 0.5)"
            }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={onEndCall}
          >
            <PhoneOff className="h-6 w-6 text-malv-text md:h-7 md:w-7" />
          </motion.button>
        ) : (
          <div className="h-14 w-14 md:h-16 md:w-16" aria-hidden />
        )}

        {onToggleExpand ? (
          <motion.button
            type="button"
            className="absolute right-4 flex h-9 w-9 items-center justify-center rounded-lg"
            style={{
              background: "oklch(0.15 0.02 260)",
              border: "1px solid oklch(0.25 0.03 260 / 0.5)"
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <Minimize2 className="h-4 w-4 text-malv-text/60" />
            ) : (
              <Maximize2 className="h-4 w-4 text-malv-text/60" />
            )}
          </motion.button>
        ) : null}
      </div>
    </motion.div>
  );
}
