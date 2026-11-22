import { z } from 'zod'

import { BROADCAST_STATUSES, RECIPIENT_STATUSES } from '../constants/status.js'
import { MAX_DELAY_SECONDS, MIN_DELAY_SECONDS, isValidDelayRange } from '../constants/limits.js'

export const broadcastRecipientInputSchema = z.object({
  to: z.string().min(8).max(32),
  name: z.string().max(255).optional(),
  ref: z.string().min(1).max(191).optional(),
})

const broadcastInputSchema = z.object({
  recipients: z.array(broadcastRecipientInputSchema).min(1).max(1000),
  text: z.string().min(1).max(4096),
  minDelay: z.number().int().min(MIN_DELAY_SECONDS).max(MAX_DELAY_SECONDS),
  maxDelay: z.number().int().min(MIN_DELAY_SECONDS).max(MAX_DELAY_SECONDS),
  clientRef: z.string().min(1).max(191),
})

const delayRangeRefinement = {
  message: 'Delay harus 10-600 detik dan max tidak boleh kurang dari min',
  path: ['maxDelay'],
}

export const createBroadcastSchema = broadcastInputSchema.refine(
  (value) => isValidDelayRange(value.minDelay, value.maxDelay),
  delayRangeRefinement,
)

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>

export const broadcastV1Schema = broadcastInputSchema
  .extend({
    sessionId: z
      .string()
      .regex(
        /^[A-Za-z0-9_-]{1,32}$/,
        'sessionId hanya boleh huruf, angka, _ dan -, maksimal 32 karakter',
      ),
    scheduledAt: z.iso.datetime().optional(),
  })
  .refine((value) => isValidDelayRange(value.minDelay, value.maxDelay), delayRangeRefinement)

export type BroadcastV1Input = z.infer<typeof broadcastV1Schema>

export const broadcastRecipientSchema = z.object({
  id: z.number(),
  to: z.string(),
  name: z.string().nullable(),
  ref: z.string().nullable(),
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
  skipped: z.number(),
  optedOut: z.number(),
  scheduledAt: z.string().nullable(),
  pauseReason: z.string().nullable(),
  recipients: z.array(broadcastRecipientSchema),
})

export type BroadcastCurrentDto = z.infer<typeof broadcastCurrentSchema>

export const broadcastV1ResponseSchema = broadcastCurrentSchema.extend({
  id: z.string(),
  sessionId: z.string(),
  text: z.string(),
  clientRef: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
})

export type BroadcastV1ResponseDto = z.infer<typeof broadcastV1ResponseSchema>

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
