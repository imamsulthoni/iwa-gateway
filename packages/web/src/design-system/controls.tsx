import { Check, Search } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from './cn'

type CheckboxProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: ReactNode
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-[7px]', className)}>
      <input type="checkbox" className="peer sr-only" {...props} />
      <span
        className={cn(
          'flex size-[15px] shrink-0 items-center justify-center rounded-chip border border-line-strong bg-surface',
          'peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ink/15',
          '[&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100',
        )}
      >
        <Check className="size-2.5 text-white" aria-hidden />
      </span>
      <span className="text-note text-ink-soft">{label}</span>
    </label>
  )
}

type SegmentedOption<T extends string> = {
  value: T
  label: string
}

type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[]
  value: T
  onValueChange: (value: T) => void
  className?: string
}

export function Segmented<T extends string>({
  options,
  value,
  onValueChange,
  className,
}: SegmentedProps<T>) {
  return (
    <div className={cn('inline-flex rounded-control bg-bg p-[3px]', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onValueChange(option.value)}
            className={cn(
              'rounded-[7px] px-2.5 py-[5px] text-note transition outline-none',
              active
                ? 'border border-line bg-surface font-medium text-ink'
                : 'border border-transparent text-ink-faint hover:text-ink-soft',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

type SearchInputProps = ComponentProps<'input'>

export function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <div
      className={cn(
        'flex h-8 items-center gap-[7px] rounded-lg bg-bg px-2.5 text-ink-faint',
        className,
      )}
    >
      <Search className="size-[11px] shrink-0" aria-hidden />
      <input
        type="search"
        className="w-full bg-transparent font-data text-label text-ink outline-none placeholder:text-ink-faint"
        {...props}
      />
    </div>
  )
}
