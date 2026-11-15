import type { ComponentProps, ReactNode } from 'react'

import { cn } from './cn'

const FIELD_BASE =
  'w-full rounded-field border bg-bg px-3 font-data text-value text-ink outline-none transition placeholder:text-ink-faint focus:border-ink aria-invalid:border-red disabled:opacity-60'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(FIELD_BASE, 'h-[42px] border-bg', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(FIELD_BASE, 'min-h-24 border-bg py-2.5', className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(FIELD_BASE, 'h-[42px] border-bg', className)} {...props} />
}

type FieldProps = {
  label: string
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="block font-data text-caption text-ink-soft uppercase">{label}</span>
      {children}
      {error ? (
        <span className="block text-help text-red">{error}</span>
      ) : hint ? (
        <span className="block text-help text-ink-soft">{hint}</span>
      ) : null}
    </label>
  )
}
