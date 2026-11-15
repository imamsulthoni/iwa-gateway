import type { ComponentProps, ReactNode } from 'react'

import { cn } from './cn'

export type BannerTone = 'neutral' | 'success' | 'warning' | 'danger'

const TONES: Record<BannerTone, string> = {
  neutral: 'bg-surface-soft text-ink-soft',
  success: 'bg-green-soft text-green',
  warning: 'bg-amber-soft text-amber',
  danger: 'bg-red-soft text-red',
}

type BannerProps = ComponentProps<'div'> & {
  tone?: BannerTone
  icon?: ReactNode
}

export function Banner({ tone = 'neutral', icon, className, children, ...props }: BannerProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-2 text-note',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span>{children}</span>
    </div>
  )
}
