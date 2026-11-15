import {
  BROADCAST_STATUS_LABELS,
  MESSAGE_STATUS_LABELS,
  RECIPIENT_STATUS_LABELS,
  SESSION_STATUS_LABELS,
} from '@wa/shared'

const LABELS: Record<string, string> = {
  ...SESSION_STATUS_LABELS,
  ...MESSAGE_STATUS_LABELS,
  ...BROADCAST_STATUS_LABELS,
  ...RECIPIENT_STATUS_LABELS,
}

const TONES: Record<string, string> = {
  connected: 'bg-emerald-100 text-emerald-700',
  done: 'bg-emerald-100 text-emerald-700',
  sent: 'bg-emerald-100 text-emerald-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  read: 'bg-emerald-100 text-emerald-700',
  connecting: 'bg-amber-100 text-amber-700',
  qr_pending: 'bg-amber-100 text-amber-700',
  running: 'bg-amber-100 text-amber-700',
  pending: 'bg-slate-100 text-slate-600',
  queued: 'bg-slate-100 text-slate-600',
  created: 'bg-slate-100 text-slate-600',
  disconnected: 'bg-orange-100 text-orange-700',
  logged_out: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONES[status] ?? 'bg-slate-100 text-slate-600'}`}
    >
      {LABELS[status] ?? status}
    </span>
  )
}
