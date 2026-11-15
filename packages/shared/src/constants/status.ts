export const SESSION_STATUSES = [
  'created',
  'qr_pending',
  'connecting',
  'connected',
  'disconnected',
  'logged_out',
] as const

export type SessionStatus = (typeof SESSION_STATUSES)[number]

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  created: 'Dibuat',
  qr_pending: 'Menunggu QR',
  connecting: 'Menghubungkan',
  connected: 'Terhubung',
  disconnected: 'Terputus',
  logged_out: 'Keluar',
}

export const MESSAGE_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'] as const

export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  queued: 'Antre',
  sent: 'Terkirim',
  delivered: 'Diterima',
  read: 'Dibaca',
  failed: 'Gagal',
}

export const MESSAGE_STATUS_RANK: Record<MessageStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 3,
}

export const BROADCAST_STATUSES = ['pending', 'running', 'done', 'failed', 'cancelled'] as const

export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number]

export const BROADCAST_STATUS_LABELS: Record<BroadcastStatus, string> = {
  pending: 'Menunggu',
  running: 'Berjalan',
  done: 'Selesai',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
}

export const RECIPIENT_STATUSES = ['pending', 'sent', 'failed'] as const

export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number]

export const RECIPIENT_STATUS_LABELS: Record<RecipientStatus, string> = {
  pending: 'Menunggu',
  sent: 'Terkirim',
  failed: 'Gagal',
}

export const MESSAGE_DIRECTIONS = ['in', 'out'] as const

export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number]
