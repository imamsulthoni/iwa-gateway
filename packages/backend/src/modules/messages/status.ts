import { MESSAGE_STATUS_RANK, type MessageStatus } from '@wa/shared'

export function mapBaileysStatus(value: number | string | null | undefined): MessageStatus | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'string') {
    const normalized = value.toUpperCase()
    if (normalized === 'ERROR' || normalized === 'FAILED') return 'failed'
    if (normalized === 'PENDING' || normalized === 'QUEUED') return 'queued'
    if (normalized === 'SERVER_ACK' || normalized === 'SENT') return 'sent'
    if (normalized === 'DELIVERY_ACK' || normalized === 'DELIVERED') return 'delivered'
    if (normalized === 'READ' || normalized === 'PLAYED') return 'read'
    return null
  }

  switch (value) {
    case 0:
      return 'failed'
    case 1:
      return 'queued'
    case 2:
      return 'sent'
    case 3:
      return 'delivered'
    case 4:
    case 5:
      return 'read'
    default:
      return null
  }
}

export function shouldAdvanceStatus(current: MessageStatus, next: MessageStatus): boolean {
  if (current === next) return false
  if (next === 'failed') return current !== 'read'
  if (current === 'failed') return false
  return MESSAGE_STATUS_RANK[next] > MESSAGE_STATUS_RANK[current]
}
