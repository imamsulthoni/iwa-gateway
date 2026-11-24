import { z } from 'zod'

import { MESSAGE_DIRECTIONS, MESSAGE_STATUSES } from '../constants/status.js'
import { pageSchema, paginationQuerySchema } from './pagination.js'

export const conversationSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  waJid: z.string(),
  waJidAlt: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  unreadCount: z.number().int().nonnegative(),
  customerNames: z.string().nullable(),
})

export type ConversationDto = z.infer<typeof conversationSchema>

export const conversationListSchema = pageSchema(conversationSchema)

export type ConversationListDto = z.infer<typeof conversationListSchema>

export const conversationQuerySchema = paginationQuerySchema

export const roomMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  sessionId: z.string(),
  direction: z.enum(MESSAGE_DIRECTIONS),
  type: z.string(),
  body: z.string().nullable(),
  status: z.enum(MESSAGE_STATUSES),
  clientRef: z.string().nullable(),
  waMessageId: z.string().nullable(),
  createdAt: z.string(),
})

export type RoomMessageDto = z.infer<typeof roomMessageSchema>

export const roomMessageListSchema = pageSchema(roomMessageSchema)

export type RoomMessageListDto = z.infer<typeof roomMessageListSchema>

export const roomMessageQuerySchema = paginationQuerySchema
