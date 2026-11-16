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
  checks: z.object({
    database: z.boolean(),
    redis: z.boolean(),
  }),
  metrics: z.object({
    inbound: z.object({
      processed: z.number(),
      duplicates: z.number(),
      nonText: z.number(),
    }),
    sse: z.object({
      activeConnections: z.number(),
    }),
    webhooks: z.object({
      delivered: z.number(),
      failed: z.number(),
      retry: z.number(),
      pendingDue: z.number(),
      outboxLagMs: z.number(),
    }),
    optOuts: z.number(),
    broadcastsPaused: z.number(),
  }),
})

export type HealthDto = z.infer<typeof healthSchema>
