'use client'

import { cn } from '@/lib/cn'
import { ChevronDown } from 'lucide-react'

interface CallHeaderProps {
  visible: boolean
  callDuration: string
  onMinimize?: () => void
}

export default function CallHeader({ visible, callDuration, onMinimize }: CallHeaderProps) {
  return (
    <div className="pointer-events-none flex items-start justify-between gap-4 px-6 pb-3 pt-5">
      {onMinimize && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onMinimize()
          }}
          aria-label="Minimize call"
          className={cn(
            'pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.14]',
            'bg-white/[0.07] backdrop-blur-[8px]',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] text-zinc-400 transition-[transform,background-color,box-shadow,color,opacity] duration-[260ms] ease-out',
            'hover:-translate-y-px hover:bg-white/[0.1] hover:text-zinc-300 hover:shadow-[0_4px_14px_rgba(0,0,0,0.35)]',
            'active:scale-[0.97]',
            visible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
          )}
        >
          <ChevronDown size={18} strokeWidth={1.75} />
        </button>
      )}
      <div className="pointer-events-none flex min-h-[4.5rem] flex-1 flex-col items-center justify-end gap-0.5">
        <div
          className={cn(
            'flex flex-col items-center gap-0.5 transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
            visible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
          )}
        >
          <span className="text-[9px] font-medium uppercase tracking-[0.42em] text-zinc-500">
            AI Voice
          </span>
          <span className="text-[17px] font-sans font-extralight uppercase tracking-[0.3em] text-white/90">
            MALV
          </span>
        </div>
        <span
          key={callDuration}
          className="malv-call-timer mt-1 font-mono text-[12px] tabular-nums tracking-[0.26em] text-zinc-400"
        >
          {callDuration}
        </span>
      </div>
      <div className="w-9 shrink-0" aria-hidden />
    </div>
  )
}
