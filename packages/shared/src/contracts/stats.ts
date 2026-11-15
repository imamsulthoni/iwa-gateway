import { z } from 'zod'

export const statsSchema = z.object({
  connectedSessions: z.number(),
  todayMessages: z.number(),
  totalMessages: z.number(),
  runningBroadcasts: z.number(),
})

export type StatsDto = z.infer<typeof statsSchema>

export const healthSchema = z.object({
  name: z.string(),
  version: z.string(),
  status: z.enum(['ok', 'degraded']),
})

export type HealthDto = z.infer<typeof healthSchema>
