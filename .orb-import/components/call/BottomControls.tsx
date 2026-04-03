'use client'

import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  BrainCircuit,
  PhoneOff,
  Pause,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BottomControlsProps {
  visible: boolean
  micMuted: boolean
  speakerOn: boolean
  malvMuted: boolean
  onMicToggle: () => void
  onSpeakerToggle: () => void
  onMalvMuteToggle: () => void
  onEndCall: () => void
}

interface IconButtonProps {
  onClick: (e: React.MouseEvent) => void
  label: string
  sublabel: string
  active?: boolean
  children: React.ReactNode
}

function IconButton({ onClick, label, sublabel, active = false, children }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-center gap-1.5',
        'transition-all duration-200 active:scale-90',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg p-0.5',
      )}
    >
      <span
        className={cn(
          'w-10 h-10 flex items-center justify-center rounded-lg',
          'border transition-all duration-250',
          active
            ? 'bg-[oklch(0.18_0_0)] border-[oklch(0.28_0_0/0.50)] text-foreground/40'
            : 'bg-[oklch(0.14_0.004_240/0.70)] border-[oklch(0.28_0_0/0.35)] text-foreground/80',
          'backdrop-blur-md',
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          'text-[8px] font-mono tracking-[0.10em] uppercase leading-none whitespace-nowrap',
          active ? 'text-muted-foreground/35' : 'text-muted-foreground/50',
        )}
      >
        {sublabel}
      </span>
    </button>
  )
}

export default function BottomControls({
  visible,
  micMuted,
  speakerOn,
  malvMuted,
  onMicToggle,
  onSpeakerToggle,
  onMalvMuteToggle,
  onEndCall,
}: BottomControlsProps) {
  const stopProp = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  return (
    <div
      className={cn(
        'w-full pb-12 pt-2 px-8',
        'transition-all duration-500 ease-in-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5 pointer-events-none',
      )}
    >
      {/* Glassmorphism tray */}
      <div
        className={cn(
          'rounded-2xl border border-[oklch(0.22_0_0/0.50)] px-4 py-3',
          'bg-[oklch(0.10_0.004_240/0.55)] backdrop-blur-2xl',
        )}
      >
        {/* Control row */}
        <div className="flex items-center justify-between gap-3">
          {/* Mic */}
          <IconButton
            label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            sublabel={micMuted ? 'Muted' : 'Mic'}
            active={micMuted}
            onClick={stopProp(onMicToggle)}
          >
            {micMuted
              ? <MicOff size={22} strokeWidth={1.6} />
              : <Mic size={22} strokeWidth={1.6} />}
          </IconButton>

          {/* Speaker */}
          <IconButton
            label={speakerOn ? 'Switch to earpiece' : 'Switch to speaker'}
            sublabel={speakerOn ? 'Speaker' : 'Earpiece'}
            active={!speakerOn}
            onClick={stopProp(onSpeakerToggle)}
          >
            {speakerOn
              ? <Volume2 size={22} strokeWidth={1.6} />
              : <VolumeX size={22} strokeWidth={1.6} />}
          </IconButton>

          {/* Pause MALV */}
          <IconButton
            label={malvMuted ? 'Resume MALV' : 'Pause MALV'}
            sublabel={malvMuted ? 'Paused' : 'MALV'}
            active={malvMuted}
            onClick={stopProp(onMalvMuteToggle)}
          >
            {malvMuted
              ? <Pause size={22} strokeWidth={1.6} />
              : <BrainCircuit size={22} strokeWidth={1.6} />}
          </IconButton>

          {/* End call */}
          <button
            onClick={stopProp(onEndCall)}
            aria-label="End call"
            className={cn(
              'flex flex-col items-center gap-1.5',
              'transition-all duration-200 active:scale-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--call-danger)] rounded-lg p-0.5',
            )}
          >
            <span
              className={cn(
                'w-10 h-10 flex items-center justify-center rounded-lg',
                'bg-[oklch(0.52_0.18_25/0.85)] border border-[oklch(0.55_0.20_25/0.40)]',
                'text-white transition-all duration-250 hover:brightness-110',
              )}
            >
              <PhoneOff size={18} strokeWidth={1.8} />
            </span>
            <span className="text-[8px] font-mono tracking-[0.10em] uppercase leading-none whitespace-nowrap text-[var(--call-danger)]/60">
              End
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
