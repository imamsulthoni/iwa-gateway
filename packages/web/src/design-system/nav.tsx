import { ChevronLeft } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from './cn'

export function Tabs({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-end gap-[22px]', className)} {...props} />
}

type TabProps = ComponentProps<'button'> & {
  active?: boolean
}

export function Tab({ active = false, className, ...props }: TabProps) {
  return (
    <button
      type="button"
      className={cn(
        'border-b-2 pb-2 text-small transition outline-none',
        active
          ? 'border-ink font-semibold text-ink'
          : 'border-line font-medium text-ink-faint hover:text-ink-soft',
        className,
      )}
      {...props}
    />
  )
}

export function navItemClass(active = false): string {
  return cn(
    'inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-small font-medium transition',
    active ? 'bg-ink text-white' : 'bg-bg text-ink-soft hover:text-ink',
  )
}

type NavItemProps = ComponentProps<'a'> & {
  active?: boolean
}

export function NavItem({ active = false, className, ...props }: NavItemProps) {
  return <a className={cn(navItemClass(active), className)} {...props} />
}

export function Breadcrumb({ className, children, ...props }: ComponentProps<'nav'>) {
  return (
    <nav className={cn('flex h-8 items-center gap-1.5', className)} {...props}>
      <ChevronLeft className="size-[11px] text-ink-faint" aria-hidden />
      <span className="font-data text-label text-ink-faint">{children}</span>
    </nav>
  )
}
