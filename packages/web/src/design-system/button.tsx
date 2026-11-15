import type { ComponentProps } from 'react'

import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-ink/85',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-soft',
  destructive: 'border border-line bg-surface text-red hover:bg-red-soft',
  ghost: 'text-ink-soft hover:bg-surface-soft hover:text-ink',
  link: 'text-ink underline underline-offset-2 hover:text-ink-soft',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 gap-1.5 px-2.5 text-small',
  md: 'h-[38px] gap-1.5 px-4 text-body',
  lg: 'h-12 gap-2 px-4 text-[13px]',
  icon: 'size-[34px] gap-0 p-0',
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-pill font-medium transition outline-none',
        'focus-visible:ring-2 focus-visible:ring-ink/15 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
