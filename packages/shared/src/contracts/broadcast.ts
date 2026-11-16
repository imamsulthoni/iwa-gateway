import { z } from 'zod'

import { BROADCAST_STATUSES, RECIPIENT_STATUSES } from '../constants/status.js'
import { MAX_DELAY_SECONDS, MIN_DELAY_SECONDS, isValidDelayRange } from '../constants/limits.js'

export const broadcastRecipientInputSchema = z.object({
  to: z.string().min(8).max(32),
  name: z.string().max(255).optional(),
})

export const createBroadcastSchema = z
  .object({
    recipients: z.array(broadcastRecipientInputSchema).min(1).max(1000),
    text: z.string().min(1).max(4096),
    minDelay: z.number().int().min(MIN_DELAY_SECONDS).max(MAX_DELAY_SECONDS),
    maxDelay: z.number().int().min(MIN_DELAY_SECONDS).max(MAX_DELAY_SECONDS),
    referenceId: z.string().min(1).max(191),
  })
  .refine((value) => isValidDelayRange(value.minDelay, value.maxDelay), {
    message: 'Delay harus 10-600 detik dan max tidak boleh kurang dari min',
    path: ['maxDelay'],
  })

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>

export const broadcastRecipientSchema = z.object({
  id: z.number(),
  to: z.string(),
  name: z.string().nullable(),
  status: z.enum(RECIPIENT_STATUSES),
  error: z.string().nullable(),
})

export type BroadcastRecipientDto = z.infer<typeof broadcastRecipientSchema>

export const broadcastCurrentSchema = z.object({
  jobId: z.string().nullable(),
  status: z.enum(BROADCAST_STATUSES).nullable(),
  total: z.number(),
  done: z.number(),
  sent: z.number(),
  failed: z.number(),
  recipients: z.array(broadcastRecipientSchema),
})

export type BroadcastCurrentDto = z.infer<typeof broadcastCurrentSchema>

export const createBroadcastResponseSchema = z.object({
  broadcastId: z.string(),
  jobId: z.string(),
  status: z.enum(BROADCAST_STATUSES),
})

export type CreateBroadcastResponseDto = z.infer<typeof createBroadcastResponseSchema>

export const broadcastCancelResponseSchema = z.object({
  broadcastId: z.string(),
  status: z.enum(BROADCAST_STATUSES),
})

export type BroadcastCancelResponseDto = z.infer<typeof broadcastCancelResponseSchema>
