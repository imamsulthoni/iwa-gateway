import { z } from 'zod'

import { MESSAGE_DIRECTIONS, MESSAGE_STATUSES } from '../constants/status.js'

export const sendMessageSchema = z.object({
  to: z.string().min(8).max(32),
  clientRef: z.string().min(1).max(191),
  text: z.string().min(1).max(4096),
  customerId: z.string().max(64).optional(),
  customerName: z.string().max(255).optional(),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>

export const sendMessageV1Schema = sendMessageSchema.extend({
  sessionId: z.string().min(1).max(64).describe('ID internal sesi (wa_session.id)'),
})

export type SendMessageV1Input = z.infer<typeof sendMessageV1Schema>

export const messageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  to: z.string().nullable(),
  clientRef: z.string().nullable(),
  body: z.string().nullable(),
  status: z.enum(MESSAGE_STATUSES),
  waMessageId: z.string().nullable(),
  error: z.string().nullable(),
  customerName: z.string().nullable(),
  salesName: z.string().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
})

export type MessageDto = z.infer<typeof messageSchema>

export const messageListSchema = z.object({
  items: z.array(messageSchema),
  nextCursor: z.string().nullable(),
})

export type MessageListDto = z.infer<typeof messageListSchema>

export const sendMessageResponseSchema = z.object({
  message: messageSchema,
  duplicate: z.boolean(),
})

export type SendMessageResponseDto = z.infer<typeof sendMessageResponseSchema>

export const retryMessageResponseSchema = z.object({
  message: messageSchema,
})

export type RetryMessageResponseDto = z.infer<typeof retryMessageResponseSchema>

export const messageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  direction: z.enum(MESSAGE_DIRECTIONS).optional(),
})

export const crossSessionMessageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sessionId: z.string().optional(),
  direction: z.enum(MESSAGE_DIRECTIONS).optional(),
})
