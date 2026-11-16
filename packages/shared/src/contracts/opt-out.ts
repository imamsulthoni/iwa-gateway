import { z } from 'zod'

import { OPT_OUT_SOURCES } from '../constants/status.js'
import { pageSchema, paginationQuerySchema } from './pagination.js'
import { phoneNumberSchema } from './session.js'

export const createOptOutSchema = z.object({
  phone: phoneNumberSchema,
})

export type CreateOptOutInput = z.infer<typeof createOptOutSchema>

export const optOutSchema = z.object({
  id: z.string(),
  phoneE164: z.string(),
  source: z.enum(OPT_OUT_SOURCES),
  optedOutAt: z.string(),
})

export type OptOutDto = z.infer<typeof optOutSchema>

export const optOutListSchema = pageSchema(optOutSchema)

export type OptOutListDto = z.infer<typeof optOutListSchema>

export const optOutQuerySchema = paginationQuerySchema
