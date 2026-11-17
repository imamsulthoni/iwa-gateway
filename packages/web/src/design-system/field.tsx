import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ComponentProps, KeyboardEvent, ReactNode } from 'react'

import { cn } from './cn'

const FIELD_BASE =
  'w-full rounded-field border bg-bg px-3 font-data text-value text-ink outline-none transition placeholder:text-ink-faint focus:border-ink aria-invalid:border-red disabled:opacity-60'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(FIELD_BASE, 'h-[42px] border-bg', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(FIELD_BASE, 'min-h-24 border-bg py-2.5', className)} {...props} />
}

export type SelectOption = { value: string; label: string }

// Indeks opsi berikutnya dengan wrap-around; -1 = belum ada yang aktif.
export function stepIndex(current: number, direction: 1 | -1, total: number): number {
  if (total === 0) return -1
  if (current < 0) return direction === 1 ? 0 : total - 1
  return (current + direction + total) % total
}

type SelectProps = {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  size?: 'sm' | 'md'
  className?: string
  disabled?: boolean
}

export function Select({
  label,
  value,
  options,
  onChange,
  size = 'md',
  className,
  disabled,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listId = useId()

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function openList() {
    setActive(stepIndex(selectedIndex, 1, options.length))
    setOpen(true)
  }

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function choose(index: number) {
    const option = options[index]
    if (option) onChange(option.value)
    close()
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        openList()
      }
      return
    }
    if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(stepIndex(active, event.key === 'ArrowDown' ? 1 : -1, options.length))
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActive(event.key === 'Home' ? 0 : options.length - 1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(active)
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          FIELD_BASE,
          'flex items-center justify-between gap-2 text-left',
          size === 'sm' ? 'h-[34px]' : 'h-[42px]',
        )}
      >
        <span className="truncate">{selected?.label ?? '—'}</span>
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-ink-faint transition', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-field border border-line-strong bg-surface p-1"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              // Fokus tetap di trigger supaya aria-activedescendant terbaca screen reader.
              onPointerDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-[7px] px-2.5 py-2 text-small',
                index === active ? 'bg-surface-soft text-ink' : 'text-ink-soft',
                option.value === value && 'font-medium',
              )}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value ? <Check className="size-3.5 text-ink" aria-hidden /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
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
