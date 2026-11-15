import { cn } from '../design-system'

type PlaceholderPageProps = {
  title: string
  note?: string
}

export function PlaceholderPage({
  title,
  note = 'Konten halaman ini belum dibuat.',
}: PlaceholderPageProps) {
  return (
    <div
      className={cn('flex min-h-[70vh] flex-col rounded-card border border-line bg-surface p-card')}
    >
      <p className="font-data text-micro tracking-[1.6px] text-ink-faint uppercase">SEGERA</p>
      <h1 className="mt-2 text-heading text-ink">{title}</h1>
      <p className="mt-2 text-body text-ink-soft">{note}</p>
    </div>
  )
}
