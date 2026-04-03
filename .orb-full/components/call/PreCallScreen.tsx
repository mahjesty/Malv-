'use client'

import { Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
import LivingOrbVisualizer from './LivingOrbVisualizer'

interface PreCallScreenProps {
  onStartCall: () => void
}

export default function PreCallScreen({ onStartCall }: PreCallScreenProps) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-between bg-[var(--call-bg)] overflow-hidden select-none">
      {/* Full-screen animated orb */}
      <LivingOrbVisualizer state="idle" audioLevel={0.12} />

      {/* Overlay UI */}
      <div className="absolute inset-0 flex flex-col items-center justify-between pointer-events-none">
        {/* Top wordmark */}
        <div className="relative z-10 pt-16 flex flex-col items-center gap-1.5">
          <span className="text-[10px] font-mono tracking-[0.38em] uppercase text-muted-foreground/30">
            AI Voice
          </span>
          <span className="text-[22px] font-sans font-light tracking-[0.18em] uppercase text-foreground/80">
            MALV
          </span>
        </div>

        {/* Bottom CTA */}
        <div className="relative z-10 pb-16 flex flex-col items-center gap-5 pointer-events-auto">
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
    </div>
  )
}
