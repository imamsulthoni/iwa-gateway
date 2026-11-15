import { z } from 'zod'

import { SESSION_STATUSES } from '../constants/status.js'

export const publicIdSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{1,32}$/,
    'public_id hanya boleh huruf, angka, _ dan -, maksimal 32 karakter',
  )

export const phoneNumberSchema = z
  .string()
  .regex(/^\d{8,15}$/, 'Nomor harus 8-15 digit tanpa spasi atau tanda baca')

export const sessionModeSchema = z.enum(['qr', 'pairing'])

export const createSessionSchema = z.object({
  label: z.string().min(1).max(255),
  publicId: publicIdSchema.optional(),
  mode: sessionModeSchema.default('qr'),
  phoneNumber: phoneNumberSchema.optional(),
})

export type CreateSessionInput = z.infer<typeof createSessionSchema>

export const sessionSchema = z.object({
  id: z.string(),
  publicId: z.string(),
  label: z.string(),
  phoneNumber: z.string().nullable(),
  status: z.enum(SESSION_STATUSES),
  lastConnectedAt: z.string().nullable(),
  salesId: z.string().nullable(),
  agentId: z.string().nullable(),
  createdAt: z.string(),
})

export type SessionDto = z.infer<typeof sessionSchema>

export const sessionListSchema = z.object({
  items: z.array(sessionSchema),
  nextCursor: z.string().nullable(),
})

export type SessionListDto = z.infer<typeof sessionListSchema>

export const sessionTokenSchema = z.object({
  token: z.string(),
  session: sessionSchema,
})

export type SessionTokenDto = z.infer<typeof sessionTokenSchema>

export const sessionStatusSchema = z.object({
  status: z.enum(SESSION_STATUSES),
  statusLabel: z.string(),
  phoneNumber: z.string().nullable(),
  salesId: z.string().nullable(),
  agentId: z.string().nullable(),
})

export type SessionStatusDto = z.infer<typeof sessionStatusSchema>

export const qrResponseSchema = z.object({
  qr: z.string().nullable(),
  status: z.enum(SESSION_STATUSES),
})

export type QrResponseDto = z.infer<typeof qrResponseSchema>

export const pairingRequestSchema = z.object({
  phoneNumber: phoneNumberSchema,
})

export type PairingRequestInput = z.infer<typeof pairingRequestSchema>

export const pairingResponseSchema = z.object({
  code: z.string().nullable(),
  status: z.enum(SESSION_STATUSES),
})

export type PairingResponseDto = z.infer<typeof pairingResponseSchema>

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
})
