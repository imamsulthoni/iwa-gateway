import type { ComponentProps } from 'react'

import { cn } from './cn'

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-left', className)} {...props} />
}

export function TableHead({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('[&>tr]:border-b [&>tr]:border-line', className)} {...props} />
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return (
    <tbody
      className={cn('[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('h-[50px] align-middle', className)} {...props} />
}

export function TableHeaderCell({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn('pr-3 font-data text-micro text-ink-soft uppercase last:pr-0', className)}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('py-3 pr-3 align-middle last:pr-0', className)} {...props} />
}
