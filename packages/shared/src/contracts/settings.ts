import { z } from 'zod'

import { MAX_DELAY_SECONDS, MIN_DELAY_SECONDS, isValidDelayRange } from '../constants/limits.js'

const delaySeconds = z.number().int().min(MIN_DELAY_SECONDS).max(MAX_DELAY_SECONDS)

export const settingsSchema = z.object({
  maxSales: z.number().int().min(1).max(100),
  salesCount: z.number().int().min(0),
  defaultMinDelay: delaySeconds,
  defaultMaxDelay: delaySeconds,
})

export type SettingsDto = z.infer<typeof settingsSchema>

export const updateSettingsSchema = z
  .object({
    maxSales: z.number().int().min(1).max(100).optional(),
    defaultMinDelay: delaySeconds.optional(),
    defaultMaxDelay: delaySeconds.optional(),
  })
  .refine(
    (value) =>
      value.maxSales !== undefined ||
      value.defaultMinDelay !== undefined ||
      value.defaultMaxDelay !== undefined,
    { message: 'Minimal satu pengaturan harus diisi' },
  )
  .refine(
    (value) => (value.defaultMinDelay === undefined) === (value.defaultMaxDelay === undefined),
    {
      message: 'defaultMinDelay dan defaultMaxDelay wajib diisi bersama',
      path: ['defaultMaxDelay'],
    },
  )
  .refine(
    (value) =>
      value.defaultMinDelay === undefined ||
      value.defaultMaxDelay === undefined ||
      isValidDelayRange(value.defaultMinDelay, value.defaultMaxDelay),
    {
      message: 'Delay maksimum tidak boleh lebih kecil dari minimum',
      path: ['defaultMaxDelay'],
    },
  )

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
