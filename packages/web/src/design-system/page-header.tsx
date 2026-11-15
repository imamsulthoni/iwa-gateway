import type { ReactNode } from 'react'

import { cn } from './cn'

type PageHeaderProps = {
  eyebrow: string
  title: string
  description?: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-6', className)}>
      <div className="space-y-1.5">
        <p className="font-data text-micro text-ink-faint uppercase">{eyebrow}</p>
        <h1 className="text-heading text-ink">{title}</h1>
        {description ? <p className="text-body text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2.5">{actions}</div> : null}
      {meta ? <div className="pt-2 font-data text-caption text-ink-faint">{meta}</div> : null}
    </div>
  )
}

type SectionLabelProps = {
  title: string
  note?: string
  className?: string
}

export function SectionLabel({ title, note, className }: SectionLabelProps) {
  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <p className="font-data text-label text-ink-faint uppercase">{title}</p>
      {note ? <p className="font-data text-caption text-ink-faint">{note}</p> : null}
    </div>
  )
}
