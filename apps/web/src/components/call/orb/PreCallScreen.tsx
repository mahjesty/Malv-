'use client'

import { Phone } from 'lucide-react'
import { cn } from '@/lib/cn'
import LivingOrbVisualizer from './LivingOrbVisualizer'

interface PreCallScreenProps {
  onStartCall: () => void | Promise<void>
  disabled?: boolean
  error?: string | null
}

export default function PreCallScreen({ onStartCall, disabled, error }: PreCallScreenProps) {
  return (
    <div className="malv-call-screen-bg fixed inset-0 flex flex-col items-center justify-between overflow-hidden select-none">
      <div className="malv-call-vignette" aria-hidden />
      <div className="malv-pre-call-canvas absolute inset-0 pointer-events-none z-[1]" aria-hidden />
      <LivingOrbVisualizer state="idle" audioLevel={0.12} className="z-[2]" />

      {/* Overlay UI */}
      <div className="absolute inset-0 z-[3] flex flex-col items-center justify-between pointer-events-none">
        {/* Top wordmark */}
        <div className="relative z-10 pt-16 flex flex-col items-center gap-1.5">
          <span
            className={cn(
              'malv-pre-call-title malv-pre-call-title-delay text-[10px] font-mono tracking-[0.42em] uppercase',
              'text-zinc-500',
            )}
          >
            AI Voice
          </span>
          <span
            className={cn(
              'malv-pre-call-title malv-pre-call-title-delay-2 text-[22px] font-sans font-extralight tracking-[0.32em] uppercase',
              'text-white/92 [text-shadow:0_1px_24px_rgba(110,123,255,0.22)]',
            )}
          >
            MALV
          </span>
        </div>

        {/* Bottom CTA */}
        <div className="relative z-10 flex flex-col items-center gap-4 pb-14 pointer-events-auto">
          <p className="text-[11px] font-mono tracking-[0.24em] uppercase text-zinc-500">
            Ready to connect
          </p>

          {error ? <p className="max-w-xs px-4 text-center text-sm text-red-300/90">{error}</p> : null}

          {/* Start call button */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => void onStartCall()}
            aria-label="Start call with MALV"
            className={cn(
              'malv-join-call-btn group relative flex items-center justify-center',
              'h-[5.25rem] w-[5.25rem] rounded-full',
              'transition-[transform] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
              'hover:-translate-y-0.5 hover:scale-[1.015] active:translate-y-0 active:scale-[0.985]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6e7bff]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--call-bg)]',
              'disabled:pointer-events-none disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:active:scale-100',
            )}
          >
            <Phone
              size={25}
              strokeWidth={1.5}
              className="malv-join-call-icon shrink-0"
            />
          </button>

          <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-zinc-500">
            Join call
          </span>
        </div>
      </div>
    </div>
  )
}
