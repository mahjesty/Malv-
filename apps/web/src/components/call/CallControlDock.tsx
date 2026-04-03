import { motion } from "motion/react";
import { Camera, CameraOff, Mic, MicOff, PhoneOff, SlidersHorizontal, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { malvTheme } from "@/styles/malv-theme";
import type { LiveAvatarState } from "@/components/avatar/LiveAvatarPanel";

export interface CallControlDockProps {
  micOn?: boolean;
  cameraOn?: boolean;
  onMicToggle?: () => void;
  onCameraToggle?: () => void;
  onEndCall?: () => void;
  onAvatarAction?: () => void;
  state?: LiveAvatarState;
  className?: string;
}

function ControlButton({
  label,
  icon,
  active = false,
  dangerous = false,
  onClick
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  dangerous?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.div whileHover={{ y: -2, scale: 1.01 }} whileTap={{ scale: 0.97 }}>
      <Button
        type="button"
        onClick={onClick}
        className={cn(
          "relative h-12 min-w-12 rounded-2xl px-3 text-slate-100 transition sm:h-12",
          "border border-white/14 bg-white/[0.09] shadow-[0_8px_24px_rgba(2,10,28,0.45)] backdrop-blur-xl hover:bg-white/[0.13]",
          active && !dangerous && "border-cyan-200/40 bg-cyan-300/18 text-cyan-100 shadow-[0_10px_26px_rgba(34,211,238,0.32)]",
          dangerous && "h-14 min-w-14 rounded-[1.1rem] border-red-300/45 bg-gradient-to-br from-red-500/95 to-rose-600/95 text-white shadow-[0_12px_36px_rgba(244,63,94,0.45)] hover:from-red-500 hover:to-rose-600"
        )}
      >
        <span className="flex items-center justify-center">{icon}</span>
        <span className="sr-only">{label}</span>
      </Button>
    </motion.div>
  );
}

export function CallControlDock({
  micOn = true,
  cameraOn = true,
  onMicToggle,
  onCameraToggle,
  onEndCall,
  onAvatarAction,
  state = "live",
  className
}: CallControlDockProps) {
  const avatarIcon = state === "live" ? <SlidersHorizontal className="h-[18px] w-[18px]" /> : <WandSparkles className="h-[18px] w-[18px]" />;

  return (
    <motion.footer
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
      className={cn("sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mt-auto w-full", className)}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-md items-center justify-center gap-2.5 px-2.5 py-2.5 sm:gap-3 sm:px-3 sm:py-3",
          malvTheme.radius.lg,
          malvTheme.surfaces.glassStrong
        )}
      >
        <ControlButton
          label={micOn ? "Mute microphone" : "Unmute microphone"}
          icon={micOn ? <Mic className="h-[18px] w-[18px]" /> : <MicOff className="h-[18px] w-[18px]" />}
          active={!micOn}
          onClick={onMicToggle}
        />
        <ControlButton
          label={cameraOn ? "Turn camera off" : "Turn camera on"}
          icon={cameraOn ? <Camera className="h-[18px] w-[18px]" /> : <CameraOff className="h-[18px] w-[18px]" />}
          active={!cameraOn}
          onClick={onCameraToggle}
        />
        <ControlButton label="End call" icon={<PhoneOff className="h-5 w-5" />} dangerous onClick={onEndCall} />
        <ControlButton label="Avatar settings" icon={avatarIcon} active={state !== "live"} onClick={onAvatarAction} />
      </div>
    </motion.footer>
  );
}
