import type { ComponentProps } from 'react'

import { cn } from './cn'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<BadgeTone, { chip: string; dot: string }> = {
  neutral: { chip: 'bg-surface-soft text-ink-soft', dot: 'bg-ink-soft' },
  success: { chip: 'bg-green-soft text-green', dot: 'bg-green' },
  warning: { chip: 'bg-amber-soft text-amber', dot: 'bg-amber' },
  danger: { chip: 'bg-red-soft text-red', dot: 'bg-red' },
  info: { chip: 'bg-blue-soft text-blue', dot: 'bg-blue' },
}

type BadgeProps = ComponentProps<'span'> & {
  tone?: BadgeTone
  dot?: boolean
}

export function Badge({ tone = 'neutral', dot = true, className, children, ...props }: BadgeProps) {
  const styles = TONES[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-[9px] py-1',
        'font-data text-[9.5px] font-semibold tracking-[0.08em] uppercase',
        styles.chip,
        className,
      )}
      {...props}
    >
      {dot ? <span className={cn('size-1.5 rounded-pill', styles.dot)} /> : null}
      {children}
    </span>
  )
}

type ChipProps = ComponentProps<'span'>

export function Chip({ className, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill bg-surface-soft px-2 py-[3px]',
        'font-data text-label text-ink-soft',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

type FilterChipProps = ComponentProps<'button'> & {
  active?: boolean
}

export function FilterChip({ active = false, className, ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-pill px-2.5 py-[5px]',
        'font-data text-[8.5px] tracking-[0.3px] uppercase transition outline-none',
        'focus-visible:ring-2 focus-visible:ring-ink/15',
        active ? 'bg-ink text-white' : 'bg-bg text-ink-soft hover:text-ink',
        className,
      )}
      {...props}
    />
  )
}
