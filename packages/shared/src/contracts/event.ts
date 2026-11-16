import { z } from 'zod'

import { MESSAGE_STATUSES, SESSION_STATUSES } from '../constants/status.js'
import { roomMessageSchema } from './conversation.js'

export const sseSessionStatusDataSchema = z.object({
  status: z.enum(SESSION_STATUSES),
  phoneNumber: z.string().nullable(),
  lastConnectedAt: z.string().nullable(),
})

export const sseSessionQrDataSchema = z.object({
  qr: z.string().nullable(),
  status: z.enum(SESSION_STATUSES),
})

export const sseMessageReceivedDataSchema = z.object({
  message: roomMessageSchema,
})

export const sseMessageStatusDataSchema = z.object({
  messageId: z.string(),
  sessionId: z.string(),
  status: z.enum(MESSAGE_STATUSES),
  occurredAt: z.string(),
})

export const sseEventSchema = z.discriminatedUnion('event', [
  z.object({
    id: z.string(),
    event: z.literal('session.status'),
    data: sseSessionStatusDataSchema,
  }),
  z.object({
    id: z.string(),
    event: z.literal('session.qr'),
    data: sseSessionQrDataSchema,
  }),
  z.object({
    id: z.string(),
    event: z.literal('message.received'),
    data: sseMessageReceivedDataSchema,
  }),
  z.object({
    id: z.string(),
    event: z.literal('message.status'),
    data: sseMessageStatusDataSchema,
  }),
])

export type SseEvent = z.infer<typeof sseEventSchema>
