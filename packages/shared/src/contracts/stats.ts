import { z } from 'zod'

export const statsPeriodSchema = z.enum(['day', 'week', 'month', 'year'])

export type StatsPeriod = z.infer<typeof statsPeriodSchema>

export const statsQuerySchema = z.object({
  period: statsPeriodSchema.default('day'),
})

export const statsBucketKindSchema = z.enum(['day', 'week', 'month'])

export type StatsBucketKind = z.infer<typeof statsBucketKindSchema>

export const STATS_BUCKET_KIND = {
  day: 'day',
  week: 'day',
  month: 'week',
  year: 'month',
} as const satisfies Record<StatsPeriod, StatsBucketKind>

const dayDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const statsBucketSchema = z.object({
  startDate: dayDateSchema,
  endDate: dayDateSchema,
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})

export type StatsBucketDto = z.infer<typeof statsBucketSchema>

export const statsSchema = z.object({
  connectedSessions: z.number(),
  periodMessages: z.number(),
  previousPeriodMessages: z.number(),
  periodFailed: z.number(),
  totalMessages: z.number(),
  runningBroadcasts: z.number(),
  todayDate: dayDateSchema,
  bucketKind: statsBucketKindSchema,
  buckets: z.array(statsBucketSchema).min(4).max(31),
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
