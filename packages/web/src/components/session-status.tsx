import { SESSION_STATUS_LABELS } from '@wbc/shared'

import { Badge } from '../design-system'
import type { BadgeTone } from '../design-system'

const TONES: Record<string, BadgeTone> = {
  connected: 'success',
  connecting: 'warning',
  qr_pending: 'warning',
  disconnected: 'info',
  logged_out: 'neutral',
  created: 'neutral',
}

export function SessionStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={TONES[status] ?? 'neutral'}>
      {SESSION_STATUS_LABELS[status as keyof typeof SESSION_STATUS_LABELS] ?? status}
    </Badge>
  )
}
