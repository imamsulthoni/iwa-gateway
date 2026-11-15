import type { ComponentProps } from 'react'

import { cn } from './cn'

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-card border border-line bg-surface p-card', className)}
      {...props}
    />
  )
}

type CardHeaderProps = {
  eyebrow: string
  note?: string
  className?: string
}

export function CardHeader({ eyebrow, note, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <p className="font-data text-label text-ink-faint uppercase">{eyebrow}</p>
      {note ? <p className="font-data text-caption text-ink-faint">{note}</p> : null}
    </div>
  )
}

export function Divider({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('h-px w-full bg-line', className)} {...props} />
}
