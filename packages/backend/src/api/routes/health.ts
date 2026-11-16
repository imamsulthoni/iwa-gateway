import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { healthSchema } from '@wa/shared'
import { sql } from 'drizzle-orm'
import type { Redis } from 'ioredis'

import type { Database } from '../../db/client.js'
import { APP_NAME, APP_VERSION } from '../version.js'
import { openApiError } from '../openapi.js'

export type HealthDeps = {
  db: Database
  redis: Redis
}

const healthRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  summary: 'Status layanan API',
  responses: {
    200: {
      description: 'Status API beserta hasil ping database dan Redis',
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
    return c.json(
      {
        name: APP_NAME,
        version: APP_VERSION,
        status: database && cache ? ('ok' as const) : ('degraded' as const),
        checks: { database, redis: cache },
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
}