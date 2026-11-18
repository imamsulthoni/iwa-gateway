import { z } from 'zod'

import { USER_ROLES } from '../constants/status.js'
import { phoneNumberSchema, pinSchema } from './session.js'

export const loginSchema = z.object({
  phoneNumber: phoneNumberSchema,
  pin: pinSchema,
})

export type LoginInput = z.infer<typeof loginSchema>

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  phoneNumber: z.string(),
  role: z.enum(USER_ROLES),
  active: z.boolean(),
})

export type UserDto = z.infer<typeof userSchema>

export const loginResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  user: userSchema,
})

export type LoginResponseDto = z.infer<typeof loginResponseSchema>

export const authMeSchema = z.object({
  mode: z.enum(['admin', 'sales']),
  user: userSchema.nullable(),
})

export type AuthMeDto = z.infer<typeof authMeSchema>
