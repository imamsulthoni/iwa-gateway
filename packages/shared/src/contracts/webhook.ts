import { z } from 'zod'

import { WEBHOOK_EVENT_TYPES } from '../constants/events.js'
import { MESSAGE_STATUSES, SESSION_STATUSES } from '../constants/status.js'
import { pageSchema, paginationQuerySchema } from './pagination.js'

export const webhookMessageStatusDataSchema = z.object({
  message_id: z.string(),
  client_ref: z.string().nullable(),
  status: z.enum(MESSAGE_STATUSES),
  occurred_at: z.string(),
})

export const webhookMessageReceivedDataSchema = z.object({
  message_id: z.string(),
  conversation_id: z.string(),
  from: z.string(),
  type: z.string(),
  body: z.string().nullable(),
  occurred_at: z.string(),
})

export const webhookSessionStatusDataSchema = z.object({
  status: z.enum(SESSION_STATUSES),
  phone_number: z.string().nullable(),
  occurred_at: z.string(),
})

export const webhookPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('message.status'),
    session_id: z.string(),
    data: webhookMessageStatusDataSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal('message.received'),
    session_id: z.string(),
    data: webhookMessageReceivedDataSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal('session.status'),
    session_id: z.string(),
    data: webhookSessionStatusDataSchema,
  }),
])

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'delivered', 'failed'] as const

export const webhookEndpointSchema = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)),
  active: z.boolean(),
  createdAt: z.string(),
})

export type WebhookEndpointDto = z.infer<typeof webhookEndpointSchema>

export const webhookEndpointCreatedSchema = webhookEndpointSchema.extend({
  secret: z.string(),
})

export type WebhookEndpointCreatedDto = z.infer<typeof webhookEndpointCreatedSchema>

export const webhookEndpointListSchema = z.object({
  items: z.array(webhookEndpointSchema),
})

export type WebhookEndpointListDto = z.infer<typeof webhookEndpointListSchema>

export const createWebhookEndpointSchema = z.object({
  url: z.url(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
  active: z.boolean().optional(),
})

export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>

export const updateWebhookEndpointSchema = z.object({
  url: z.url().optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).optional(),
  active: z.boolean().optional(),
})

export type UpdateWebhookEndpointInput = z.infer<typeof updateWebhookEndpointSchema>

export const webhookDeliverySchema = z.object({
  id: z.string(),
  endpointId: z.string(),
  eventType: z.string(),
  status: z.enum(WEBHOOK_DELIVERY_STATUSES),
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: z.string(),
  lastStatusCode: z.number().int().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
})

export type WebhookDeliveryDto = z.infer<typeof webhookDeliverySchema>

export const webhookDeliveryListSchema = pageSchema(webhookDeliverySchema)

export type WebhookDeliveryListDto = z.infer<typeof webhookDeliveryListSchema>

export const webhookDeliveryQuerySchema = paginationQuerySchema.extend({
  status: z.enum(WEBHOOK_DELIVERY_STATUSES).optional(),
})

export const webhookSecretSchema = z.object({
  secret: z.string(),
})

export type WebhookSecretDto = z.infer<typeof webhookSecretSchema>
