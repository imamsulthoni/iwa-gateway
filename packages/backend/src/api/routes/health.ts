import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import type { Redis } from 'ioredis'

import type { Database } from '../../db/client.js'
import { APP_NAME, APP_VERSION } from '../version.js'

export type HealthDeps = {
  db: Database
  redis: Redis
}

export function createHealthRoute({ db, redis }: HealthDeps) {
  const router = new Hono()

  router.get('/', async (c) => {
    const database = await pingDatabase()
    const cache = await pingRedis()
    return c.json({
      name: APP_NAME,
      version: APP_VERSION,
      status: database && cache ? 'ok' : 'degraded',
      checks: { database, redis: cache },
    })
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
