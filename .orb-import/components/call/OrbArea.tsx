'use client'

import { cn } from '@/lib/utils'

export type CallState = 'listening' | 'speaking' | 'thinking' | 'muted' | 'reconnecting'

interface OrbAreaProps {
  callState: CallState
  muted: boolean
  malvMuted: boolean
}

const STATE_LABELS: Record<CallState, string> = {
  listening: 'Listening',
  speaking: 'Speaking',
  thinking: 'Thinking',
  muted: 'Muted',
  reconnecting: 'Reconnecting',
}

export default function OrbArea({ callState, muted, malvMuted }: OrbAreaProps) {
  const displayState: CallState = muted ? 'muted' : callState

  const isSpeaking = displayState === 'speaking'
  const isReconnecting = displayState === 'reconnecting'
  const isMuted = displayState === 'muted'

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-10 px-6 select-none">

      {/* Orb container */}
      <div className="relative flex items-center justify-center">

        {/* Outermost ambient ring */}
        <div
          className={cn(
            'absolute rounded-full border border-[oklch(0.24_0_0/0.18)] pointer-events-none',
            'transition-all duration-700',
          )}
          style={{ width: 320, height: 320 }}
          aria-hidden="true"
        />

        {/* Mid ring */}
        <div
          className={cn(
            'absolute rounded-full border border-[oklch(0.26_0_0/0.22)] pointer-events-none',
            'transition-all duration-700 animate-orb-breathe',
            isSpeaking ? 'opacity-100 scale-105' : 'opacity-40 scale-100',
          )}
          style={{ width: 290, height: 290 }}
          aria-hidden="true"
        />

        {/* Inner ring */}
        <div
          className={cn(
            'absolute rounded-full border border-[oklch(0.30_0_0/0.28)] pointer-events-none',
            'transition-all duration-500',
            isSpeaking ? 'opacity-100 scale-105' : 'opacity-60 scale-100',
          )}
          style={{ width: 256, height: 256 }}
          aria-hidden="true"
        />

        {/* Orb placeholder disk */}
        <div
          className={cn(
            'relative rounded-full flex items-center justify-center',
            'bg-[oklch(0.10_0.004_240)]',
            'ring-1 ring-[oklch(0.28_0_0/0.45)]',
            'transition-all duration-700 ease-in-out',
          )}
          style={{ width: 232, height: 232 }}
          role="img"
          aria-label="MALV orb — live visualizer placeholder"
        >
          {/* Subtle inner vignette */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 50% 30%, oklch(0.18 0.004 240 / 0.25) 0%, transparent 70%)',
            }}
            aria-hidden="true"
          />

          {/* Placeholder label — remove when real orb is integrated */}
          <span className="text-[9px] font-mono tracking-[0.3em] uppercase text-[oklch(0.35_0_0)] pointer-events-none z-10">
            orb
          </span>
        </div>
      </div>

      {/* State label */}
      <div className="flex flex-col items-center gap-2">
        <span
          className={cn(
            'text-[12px] font-mono tracking-[0.22em] uppercase transition-all duration-400',
            isReconnecting
              ? 'text-[var(--call-warn)] animate-status-blink'
              : isMuted
              ? 'text-[var(--call-muted-icon)]'
              : 'text-foreground/40',
          )}
        >
          {STATE_LABELS[displayState]}
        </span>

        {malvMuted && !isReconnecting && (
          <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-[var(--call-muted-icon)]/50">
            MALV muted
          </span>
        )}
      </div>
    </div>
  )
}
