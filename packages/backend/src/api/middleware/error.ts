import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { apiErrorBody, type ErrorCode } from '@wa/shared'

import type { AppLogger } from '../../infra/logger.js'
import { DomainError, ValidationError } from '../../modules/errors.js'

export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
) {
  return c.json(apiErrorBody(code, message), status)
}

export function notFound(c: Context) {
  return errorResponse(c, 404, 'NOT_FOUND', 'Endpoint tidak ditemukan')
}

export function handleError(error: unknown, c: Context, logger: AppLogger) {
  if (error instanceof DomainError) {
    const statusByCode: Record<string, ContentfulStatusCode> = {
      VALIDATION_ERROR: 422,
      NOT_FOUND: 404,
      CONFLICT: 409,
      NO_SESSION: 403,
      SALES_LIMIT_REACHED: 409,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      RATE_LIMITED: 429,
    }
    const status = statusByCode[error.code] ?? 400
    return errorResponse(c, status, error.code as ErrorCode, error.message)
  }

  if (error instanceof ValidationError) {
    return errorResponse(c, 422, 'VALIDATION_ERROR', error.message)
  }

  // Body JSON rusak / content-type tidak didukung dari validator zod-openapi.
  if (error instanceof HTTPException) {
    const status = error.status === 400 ? 422 : error.status
    return errorResponse(c, status, 'VALIDATION_ERROR', error.message)
  }

  logger.error({ err: error }, 'Unhandled API error')
  return errorResponse(c, 500, 'INTERNAL_ERROR', 'Terjadi kesalahan internal')
}
