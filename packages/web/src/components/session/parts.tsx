import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../design-system'
import type { BroadcastCurrentDto } from '../../lib/types'

export const FIELD_INPUT =
  'h-11 w-full rounded-[10px] bg-bg px-[13px] font-data text-small text-ink outline-none transition placeholder:text-ink-faint focus:ring-1 focus:ring-ink/15'

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn('flex flex-col rounded-card border border-line bg-surface p-[22px]', className)}
    >
      {children}
    </div>
  )
}

export function CardLabel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn('font-data text-[9px] tracking-[1.2px] text-ink-faint uppercase', className)}>
      {children}
    </p>
  )
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-data text-label tracking-[1.1px] text-ink-soft uppercase">
      {children}
    </span>
  )
}

type TextFieldProps = ComponentProps<'input'> & { label: string; hint?: string }

export function TextField({ label, hint, className, ...props }: TextFieldProps) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <FieldLabel>{label}</FieldLabel>
      <input className={FIELD_INPUT} {...props} />
      {hint ? <span className="text-note text-ink-faint">{hint}</span> : null}
    </label>
  )
}

type TextareaFieldProps = ComponentProps<'textarea'> & { label: string; hint?: string }

export function TextareaField({ label, hint, className, ...props }: TextareaFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        className={cn(FIELD_INPUT, 'h-auto resize-none py-3 leading-[1.5]', className)}
        {...props}
      />
      {hint ? <span className="text-note text-ink-faint">{hint}</span> : null}
    </label>
  )
}

export function Stat({
  label,
  value,
  tone = 'default',
  className,
}: {
  label: string
  value: string
  tone?: 'default' | 'danger'
  className?: string
}) {
  return (
    <div className={cn('flex flex-1 flex-col gap-[3px]', className)}>
      <p className="font-data text-[8.5px] tracking-[1px] text-ink-faint uppercase">{label}</p>
      <p className={cn('text-base font-semibold', tone === 'danger' ? 'text-red' : 'text-ink')}>
        {value}
      </p>
    </div>
  )
}

export function VRule() {
  return <span className="h-7 w-px shrink-0 self-center bg-line" />
}

export function NoteRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="font-data text-[9px] text-ink-faint">—</span>
      <p className="text-[10.5px] leading-[1.45] text-ink-soft">{children}</p>
    </div>
  )
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-[7px] w-full overflow-hidden rounded-pill bg-surface-soft">
      <div
        className="h-full rounded-pill bg-green transition-[width]"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  )
}

export function BroadcastRail({ broadcast }: { broadcast: BroadcastCurrentDto | null }) {
  if (!broadcast?.jobId) return null
  const percent = broadcast.total === 0 ? 0 : Math.round((broadcast.done / broadcast.total) * 100)
  const running = broadcast.status === 'running' || broadcast.status === 'pending'

  return (
    <Panel className="gap-0 p-5">
      <div className="flex items-center justify-between gap-3">
        <CardLabel>Broadcast berjalan</CardLabel>
        <span
          className={cn(
            'inline-flex items-center gap-[5px] rounded-pill px-2 py-[3px] font-data text-[8.5px] tracking-[0.6px] uppercase',
            running ? 'bg-green-soft text-green' : 'bg-surface-soft text-ink-soft',
          )}
        >
          <span className={cn('size-[5px] rounded-pill', running ? 'bg-green' : 'bg-ink-soft')} />
          {broadcast.status ?? 'idle'}
        </span>
      </div>
      <div className="h-3" />
      <p className="font-data text-[9.5px] break-all text-ink-faint">{broadcast.jobId}</p>
      <div className="h-4" />
      <div className="flex items-center justify-between font-data text-[10px]">
        <span className="text-ink-soft">
          {broadcast.done} / {broadcast.total}
        </span>
        <span className="font-semibold text-ink">{percent}%</span>
      </div>
      <div className="h-[7px]" />
      <ProgressBar percent={percent} />
      <div className="h-4" />
      <div className="flex">
        <Stat label="Terkirim" value={String(broadcast.sent)} />
        <VRule />
        <Stat label="Gagal" value={String(broadcast.failed)} tone="danger" className="px-3" />
        <VRule />
        <Stat label="Dilewati" value={String(broadcast.skipped)} className="px-3" />
        <VRule />
        <Stat label="Opt-out" value={String(broadcast.optedOut)} className="px-3" />
      </div>
      {broadcast.pauseReason ? (
        <p className="pt-3 text-note text-red">{broadcast.pauseReason}</p>
      ) : null}
    </Panel>
  )
}

export function StatusDot({ tone }: { tone: 'green' | 'amber' | 'faint' }) {
  return (
    <span
      className={cn(
        'size-2 rounded-pill',
        tone === 'green' ? 'bg-green' : tone === 'amber' ? 'bg-amber' : 'bg-ink-faint',
      )}
    />
  )
}
