export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
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

export function apiErrorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } }
}
