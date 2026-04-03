'use client'

import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

interface CallHeaderProps {
  visible: boolean
  callDuration: string
  onMinimize?: () => void
}

export default function CallHeader({ visible, callDuration, onMinimize }: CallHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between pt-6 pb-4 px-6 gap-4 pointer-events-auto',
        'transition-all duration-500 ease-in-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3 pointer-events-none',
      )}
    >
      {onMinimize && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onMinimize()
          }}
          aria-label="Minimize call"
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[oklch(0.14_0_0)] transition-colors pointer-events-auto"
        >
          <ChevronDown size={18} className="text-muted-foreground/60" />
        </button>
      )}
      <div className="flex-1 flex flex-col items-center gap-0.5">
        <span className="text-[10px] font-mono tracking-[0.36em] uppercase text-muted-foreground/35">
          AI Voice
        </span>
        <span className="text-[18px] font-sans font-light tracking-[0.18em] uppercase text-foreground/75">
          MALV
        </span>
        <span className="text-[13px] font-mono tabular-nums tracking-widest text-muted-foreground/40 mt-0.5">
          {callDuration}
        </span>
      </div>
      <div className="w-8" />
    </div>
  )
}
