import type { ZodType } from 'zod'

import { ValidationError } from '../modules/errors.js'

export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new ValidationError(issue?.message ?? 'Data tidak valid')
  }
  return result.data
}
