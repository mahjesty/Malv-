'use client'

import {
  Mic,
  MicOff,
  Volume2,
  Headphones,
  Sparkles,
  PhoneOff,
  Pause,
} from 'lucide-react'
import { cn } from '@/lib/cn'

const ICON = 20
const STROKE = 1.65

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

type ControlVariant = 'mic' | 'speaker' | 'malv'

interface IconButtonProps {
  onClick: (e: React.MouseEvent) => void
  label: string
  sublabel: string
  toggledOn: boolean
  variant: ControlVariant
  children: React.ReactNode
}

function IconButton({ onClick, label, sublabel, toggledOn, variant, children }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={toggledOn}
      className={cn(
        'malv-call-control-hit group flex min-w-[52px] flex-col items-center gap-1 rounded-xl px-0.5 pt-0.5 pb-0.5',
        'transition-[transform] duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#306266]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        'hover:-translate-y-px active:translate-y-0 active:scale-[0.97]',
      )}
    >
      <span
        className={cn(
          'malv-call-control-disc relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border',
          'backdrop-blur-[10px] transition-[box-shadow,border-color,background-color,color,transform] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.11),inset_0_-5px_12px_rgba(0,0,0,0.22)]',
          'group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-4px_10px_rgba(0,0,0,0.18)]',
          variant === 'mic' &&
            (toggledOn
              ? cn(
                  'border-rose-400/40 bg-rose-950/40 text-rose-50',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_0_1px_rgba(244,63,94,0.2),0_4px_16px_rgba(0,0,0,0.35)]',
                )
              : cn(
                  'border-white/[0.14] bg-white/[0.07] text-[#e8f4f3]/95',
                  'group-hover:border-[#84c6c2]/38 group-hover:bg-white/[0.09]',
                  'group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_16px_rgba(48,98,102,0.22)]',
                )),
          variant === 'speaker' &&
            (toggledOn
              ? cn(
                  'border-white/[0.12] bg-white/[0.05] text-zinc-400',
                  'group-hover:border-white/[0.16]',
                )
              : cn(
                  'border-violet-300/28 bg-white/[0.08] text-violet-50',
                  'group-hover:border-violet-200/38 group-hover:bg-white/[0.095]',
                  'group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_14px_oklch(0.58_0.12_280/0.18)]',
                )),
          variant === 'malv' &&
            (toggledOn
              ? cn(
                  'border-white/[0.12] bg-white/[0.045] text-zinc-400',
                  'group-hover:border-white/[0.16]',
                )
              : cn(
                  'malv-control-malv-on border-[#306266]/36 bg-white/[0.08] text-[#e8f4f3]/95',
                  'group-hover:border-[#84c6c2]/45 group-hover:bg-white/[0.1]',
                )),
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          'max-w-[4.5rem] truncate text-center text-[9px] font-medium uppercase leading-none tracking-[0.18em]',
          toggledOn ? 'text-zinc-500' : 'text-zinc-400',
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
        'w-full px-5 pb-9 pt-1 sm:px-6',
        'transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
      )}
    >
      <div
        className={cn(
          'malv-call-control-dock relative overflow-hidden rounded-[20px]',
          'border border-white/[0.12]',
          'bg-white/[0.06] backdrop-blur-[12px]',
          'px-2.5 py-2 sm:px-3',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_6px_20px_rgba(0,0,0,0.55),0_2px_8px_rgba(0,0,0,0.35)]',
        )}
      >
        <div
          className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent"
          aria-hidden
        />
        <div className="flex items-end justify-between gap-1 sm:gap-2">
          <IconButton
            label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            sublabel={micMuted ? 'Muted' : 'Mic'}
            toggledOn={micMuted}
            variant="mic"
            onClick={stopProp(onMicToggle)}
          >
            {micMuted ? (
              <MicOff size={ICON} strokeWidth={STROKE} className="shrink-0" />
            ) : (
              <Mic size={ICON} strokeWidth={STROKE} className="shrink-0" />
            )}
          </IconButton>

          <IconButton
            label={speakerOn ? 'Switch to earpiece' : 'Switch to speaker'}
            sublabel={speakerOn ? 'Speaker' : 'Earpiece'}
            toggledOn={!speakerOn}
            variant="speaker"
            onClick={stopProp(onSpeakerToggle)}
          >
            {speakerOn ? (
              <Volume2 size={ICON} strokeWidth={STROKE} className="shrink-0" />
            ) : (
              <Headphones size={ICON} strokeWidth={STROKE} className="shrink-0" />
            )}
          </IconButton>

          <IconButton
            label={malvMuted ? 'Resume MALV' : 'Pause MALV'}
            sublabel={malvMuted ? 'Paused' : 'MALV'}
            toggledOn={malvMuted}
            variant="malv"
            onClick={stopProp(onMalvMuteToggle)}
          >
            {malvMuted ? (
              <Pause size={ICON} strokeWidth={STROKE} className="shrink-0" />
            ) : (
              <Sparkles size={ICON} strokeWidth={STROKE} className="shrink-0" />
            )}
          </IconButton>

          <button
            type="button"
            onClick={stopProp(onEndCall)}
            aria-label="End call"
            className={cn(
              'malv-call-control-hit group flex min-w-[52px] flex-col items-center gap-1 rounded-xl px-0.5 pt-0.5 pb-0.5',
              'transition-[transform] duration-200 ease-out',
              'hover:-translate-y-px active:translate-y-0 active:scale-[0.97]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--call-danger)]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
            )}
          >
            <span
              className={cn(
                'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                'border border-red-400/45 bg-gradient-to-b from-red-500/35 to-red-950/45',
                'backdrop-blur-[8px]',
                'text-red-50',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-6px_14px_rgba(0,0,0,0.35),0_0_0_1px_rgba(248,113,113,0.15),0_4px_18px_rgba(0,0,0,0.45)]',
                'transition-[box-shadow,transform,border-color,filter] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                'group-hover:border-red-300/55 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_oklch(0.52_0.18_25/0.35)]',
                'group-hover:[filter:brightness(1.05)]',
              )}
            >
              <PhoneOff size={ICON} strokeWidth={STROKE} className="shrink-0" />
            </span>
            <span className="text-[9px] font-medium uppercase leading-none tracking-[0.18em] text-red-300/80">
              End
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
