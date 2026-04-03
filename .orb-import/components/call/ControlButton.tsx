'use client'

import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface ControlButtonProps {
  icon: LucideIcon
  activeIcon?: LucideIcon
  label: string
  active?: boolean
  danger?: boolean
  size?: 'md' | 'lg'
  onClick: (e: React.MouseEvent) => void
}

export default function ControlButton({
  icon: Icon,
  activeIcon: ActiveIcon,
  label,
  active = false,
  danger = false,
  size = 'md',
  onClick,
}: ControlButtonProps) {
  const DisplayIcon = active && ActiveIcon ? ActiveIcon : Icon

  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={!danger ? active : undefined}
      className={cn(
        'flex flex-col items-center gap-2.5 group',
        'transition-all duration-200 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl p-1',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full',
          'border transition-all duration-200',
          'group-hover:brightness-110',
          // Sizes
          size === 'lg'
            ? 'w-[72px] h-[72px]'
            : 'w-[60px] h-[60px]',
          // States
          danger
            ? 'bg-[var(--call-end)] border-[var(--call-end)] text-white'
            : active
            ? 'bg-[var(--call-glass)] border-[var(--call-glass-border)] text-[var(--call-muted-icon)] backdrop-blur-sm'
            : 'bg-[var(--call-glass)] border-[var(--call-glass-border)] text-foreground/75 backdrop-blur-sm',
        )}
      >
        <DisplayIcon
          size={size === 'lg' ? 24 : 20}
          strokeWidth={1.75}
          className={cn(
            'transition-all duration-200',
            danger ? '' : active ? 'opacity-50' : 'opacity-80',
          )}
        />
      </span>
      <span
        className={cn(
          'text-[10px] font-mono tracking-wider uppercase leading-none transition-colors duration-200',
          danger
            ? 'text-[var(--call-danger)]'
            : active
            ? 'text-[var(--call-muted-icon)]'
            : 'text-muted-foreground/50',
        )}
      >
        {label}
      </span>
    </button>
  )
}
