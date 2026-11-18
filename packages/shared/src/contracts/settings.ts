import { z } from 'zod'

export const settingsSchema = z.object({
  maxSales: z.number().int().min(1).max(100),
  salesCount: z.number().int().min(0),
})

export type SettingsDto = z.infer<typeof settingsSchema>

export const updateSettingsSchema = settingsSchema.pick({ maxSales: true })

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>