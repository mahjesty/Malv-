'use client'

import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ConnectionState = 'healthy' | 'weak' | 'unstable' | 'reconnecting'

interface ConnectionBannerProps {
  state: ConnectionState
  visible: boolean
}

const MESSAGES: Record<Exclude<ConnectionState, 'healthy'>, { icon: React.ElementType; text: string }> = {
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

  return (
    <div
      className={cn(
        'w-full px-5 py-3 flex items-center gap-3 transition-all duration-500 ease-in-out',
        'border-b border-[var(--call-glass-border)]',
        'bg-[oklch(0.13_0.008_40/0.85)] backdrop-blur-md',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none',
      )}
      role="alert"
      aria-live="assertive"
    >
      <span
        className={cn(
          'shrink-0 text-[var(--call-warn)]',
          isReconnecting && 'animate-spin',
        )}
        aria-hidden="true"
      >
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <p className="text-xs font-mono tracking-wide text-[var(--call-warn)] leading-relaxed">
        {text}
      </p>
    </div>
  )
}
