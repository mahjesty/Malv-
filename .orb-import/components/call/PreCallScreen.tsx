'use client'

import { Phone } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PreCallScreenProps {
  onStartCall: () => void
}

export default function PreCallScreen({ onStartCall }: PreCallScreenProps) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-between bg-[var(--call-bg)] overflow-hidden select-none">
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 35%, oklch(0.04 0 0 / 0.70) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Top wordmark */}
      <div className="relative z-10 pt-16 flex flex-col items-center gap-1.5">
        <span className="text-[10px] font-mono tracking-[0.38em] uppercase text-muted-foreground/30">
          AI Voice
        </span>
        <span className="text-[22px] font-sans font-light tracking-[0.18em] uppercase text-foreground/80">
          MALV
        </span>
      </div>

      {/* Orb rings (static, pre-call idle) */}
      <div className="relative z-10 flex items-center justify-center">
        {/* Outermost ambient ring */}
        <div
          className="absolute rounded-full border border-[oklch(0.22_0_0/0.15)] animate-orb-breathe pointer-events-none"
          style={{ width: 320, height: 320, animationDelay: '0.4s' }}
          aria-hidden="true"
        />
        <div
          className="absolute rounded-full border border-[oklch(0.24_0_0/0.18)] animate-orb-breathe pointer-events-none"
          style={{ width: 280, height: 280, animationDelay: '0.2s' }}
          aria-hidden="true"
        />
        <div
          className="absolute rounded-full border border-[oklch(0.28_0_0/0.22)] pointer-events-none"
          style={{ width: 246, height: 246 }}
          aria-hidden="true"
        />

        {/* Orb disk */}
        <div
          className="relative rounded-full flex items-center justify-center bg-[oklch(0.10_0.004_240)] ring-1 ring-[oklch(0.26_0_0/0.40)]"
          style={{ width: 220, height: 220 }}
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 50% 30%, oklch(0.18 0.004 240 / 0.20) 0%, transparent 65%)',
            }}
          />
          <span className="text-[8px] font-mono tracking-[0.32em] uppercase text-[oklch(0.30_0_0)] z-10">
            orb
          </span>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="relative z-10 pb-16 flex flex-col items-center gap-5">
        <p className="text-[11px] font-mono tracking-[0.22em] uppercase text-muted-foreground/35">
          Ready to connect
        </p>

        {/* Start call button */}
        <button
          onClick={onStartCall}
          aria-label="Start call with MALV"
          className={cn(
            'relative group flex items-center justify-center',
            'w-20 h-20 rounded-full',
            'bg-foreground text-background',
            'shadow-[0_0_0_1px_oklch(0.30_0_0/0.40)]',
            'hover:bg-foreground/90 transition-all duration-300 active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          )}
        >
          {/* Outer pulse ring */}
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-[0.06] bg-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Phone size={26} strokeWidth={1.75} className="relative z-10" />
        </button>

        <span className="text-[10px] font-mono tracking-[0.24em] uppercase text-muted-foreground/25">
          Tap to begin
        </span>
      </div>
    </div>
  )
}
