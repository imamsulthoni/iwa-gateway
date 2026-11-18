import { z } from 'zod'

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'NO_SESSION',
  'SALES_LIMIT_REACHED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export type ApiErrorBody = {
  error: {
    code: ErrorCode
    message: string
  }
}

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
  }),
})

export function apiErrorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } }
}