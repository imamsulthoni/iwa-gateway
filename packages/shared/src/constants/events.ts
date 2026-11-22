export const WEBHOOK_EVENT_TYPES = [
  'message.status',
  'message.received',
  'session.status',
  'broadcast.recipient',
  'broadcast.status',
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

export const SSE_EVENT_TYPES = [
  'session.status',
  'session.qr',
  'message.received',
  'message.status',
] as const

export type SseEventType = (typeof SSE_EVENT_TYPES)[number]
