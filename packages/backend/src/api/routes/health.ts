import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { healthSchema } from '@wbc/shared'
import { sql } from 'drizzle-orm'
import type { Redis } from 'ioredis'

import type { Database } from '../../db/client.js'
import { activeSseConnections, readCounters } from '../../infra/metrics.js'
import { APP_NAME, APP_VERSION } from '../version.js'
import { openApiError } from '../openapi.js'

export type HealthDeps = {
  db: Database
  redis: Redis
}

// Outbox yang tertua sudah lewat 30 detik menandakan dispatcher tertinggal.
const OUTBOX_LAG_WARN_MS = 30_000

type Gauges = {
  optOuts: number
  broadcastsPaused: number
  pendingDue: number
  outboxLagMs: number
}

const NO_GAUGES: Gauges = { optOuts: 0, broadcastsPaused: 0, pendingDue: 0, outboxLagMs: 0 }

const healthRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  summary: 'Status layanan API',
  responses: {
    200: {
      description: 'Status API, hasil ping database/Redis, dan metrik operasional',
      content: { 'application/json': { schema: healthSchema } },
    },
    500: openApiError('Kesalahan internal'),
  },
})

export function createHealthRoute({ db, redis }: HealthDeps) {
  const router = new OpenAPIHono()

  router.openapi(healthRoute, async (c) => {
    const database = await pingDatabase()
    const cache = await pingRedis()
    const [counters, gauges] = await Promise.all([
      cache ? readCounters(redis).catch(() => null) : null,
      database ? readGauges().catch(() => null) : null,
    ])
    const outboxLagMs = gauges?.outboxLagMs ?? 0
    const healthy = database && cache && outboxLagMs <= OUTBOX_LAG_WARN_MS

    return c.json(
      {
        name: APP_NAME,
        version: APP_VERSION,
        status: healthy ? ('ok' as const) : ('degraded' as const),
        checks: { database, redis: cache },
        metrics: {
          inbound: {
            processed: counters?.inboundProcessed ?? 0,
            duplicates: counters?.inboundDuplicates ?? 0,
            nonText: counters?.inboundNonText ?? 0,
          },
          sse: { activeConnections: activeSseConnections() },
          webhooks: {
            delivered: counters?.webhookDelivered ?? 0,
            failed: counters?.webhookFailed ?? 0,
            retry: counters?.webhookRetry ?? 0,
            pendingDue: gauges?.pendingDue ?? 0,
            outboxLagMs,
          },
          optOuts: gauges?.optOuts ?? 0,
          broadcastsPaused: gauges?.broadcastsPaused ?? 0,
        },
      },
      200,
    )
  })

  return router

  async function pingDatabase(): Promise<boolean> {
    try {
      await db.execute(sql`select 1`)
      return true
    } catch {
      return false
    }
  }

  async function pingRedis(): Promise<boolean> {
    try {
      return (await redis.ping()) === 'PONG'
    } catch {
      return false
    }
  }

  async function readGauges(): Promise<Gauges> {
    // Drizzle mengetik execute() sebagai hasil mentah mysql2; hasil SELECT ada di elemen pertama.
    const [rows] = (await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM opt_outs) AS optOuts,
        (SELECT COUNT(*) FROM broadcasts WHERE status = 'paused') AS broadcastsPaused,
        (SELECT COUNT(*) FROM webhook_deliveries
          WHERE status = 'pending' AND next_attempt_at <= NOW(3)) AS pendingDue,
        (SELECT COALESCE(TIMESTAMPDIFF(MICROSECOND, MIN(next_attempt_at), NOW(3)) DIV 1000, 0)
          FROM webhook_deliveries
          WHERE status = 'pending' AND next_attempt_at <= NOW(3)) AS outboxLagMs
    `)) as unknown as [Gauges[]]
    const row = rows?.[0]
    if (!row) return NO_GAUGES
    return {
      optOuts: Number(row.optOuts),
      broadcastsPaused: Number(row.broadcastsPaused),
      pendingDue: Number(row.pendingDue),
      outboxLagMs: Number(row.outboxLagMs),
    }
  }
}
