'use client'

import type { ElementType } from 'react'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ConnectionState = 'healthy' | 'weak' | 'unstable' | 'reconnecting'

interface ConnectionBannerProps {
  state: ConnectionState
  visible: boolean
}

const MESSAGES: Record<Exclude<ConnectionState, 'healthy'>, { icon: ElementType; text: string }> = {
  weak: {
    icon: Wifi,
    text: 'Weak connection detected. Audio quality may be affected.',
  },
  unstable: {
    icon: WifiOff,
    text: 'Your network is unstable. MALV is trying to restore the call.',
  },
  reconnecting: {
    icon: RefreshCw,
    text: 'Reconnecting…',
  },
}

export default function ConnectionBanner({ state, visible }: ConnectionBannerProps) {
  if (state === 'healthy') return null

  const { icon: Icon, text } = MESSAGES[state]
  const isReconnecting = state === 'reconnecting'
  const isWeak = state === 'weak'
  const isUnstable = state === 'unstable'

  return (
    <div
      className={cn(
        'pointer-events-none w-full flex justify-center px-5 pt-3 pb-1',
        'transition-all duration-500 ease-in-out',
        visible ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 -translate-y-2',
      )}
      role="alert"
      aria-live="assertive"
    >
      <div
        className={cn(
          'inline-flex max-w-[min(100%,36rem)] items-center gap-3 rounded-full border px-5 py-2.5',
          'backdrop-blur-[16px] transition-[box-shadow,background-color,border-color] duration-500 ease-out',
          'bg-[rgba(255,255,255,0.045)] [box-shadow:inset_0_0_20px_rgba(255,255,255,0.03),0_4px_24px_oklch(0_0_0/0.25)]',
          isWeak &&
            'border-amber-400/18 [box-shadow:inset_0_0_20px_rgba(255,255,255,0.03),0_0_28px_oklch(0.75_0.12_75/0.12)]',
          isUnstable &&
            'border-red-400/22 animate-pulse [box-shadow:inset_0_0_20px_rgba(255,255,255,0.03),0_0_32px_oklch(0.55_0.2_25/0.14)]',
          isReconnecting &&
            'malv-conn-banner-shimmer border-[#306266]/22 [box-shadow:inset_0_0_20px_rgba(255,255,255,0.04),0_0_24px_rgba(48,98,102,0.14)]',
        )}
      >
        <span
          className={cn(
            'shrink-0 transition-colors duration-300',
            isWeak && 'text-amber-200/85',
            isUnstable && 'text-red-300/90',
            isReconnecting && 'text-[#a8dad6]/88',
          )}
          aria-hidden="true"
        >
          <Icon size={15} strokeWidth={1.85} className={cn(isReconnecting && 'animate-spin')} />
        </span>
        <p
          className={cn(
            'text-[11px] font-mono leading-relaxed tracking-wide',
            isWeak && 'text-amber-100/75',
            isUnstable && 'text-red-200/80',
            isReconnecting && 'text-[#c8e8e4]/80',
          )}
        >
          {text}
        </p>
      </div>
    </div>
  )
}
