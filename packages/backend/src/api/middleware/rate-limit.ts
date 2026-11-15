import { createMiddleware } from 'hono/factory'
import { apiErrorBody } from '@wa/shared'
import type { Redis } from 'ioredis'

import type { AppBindings } from '../app.js'

export function rateLimitMiddleware(redis: Redis, limitPerMinute: number) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const window = Math.floor(Date.now() / 60_000)
    const keys = [`rl:key:${c.get('apiKeyId')}:${window}`]
    const sessionId = c.req.param('id')
    if (sessionId) keys.push(`rl:sess:${sessionId}:${window}`)

    for (const key of keys) {
      const count = await redis.incr(key)
      if (count === 1) await redis.expire(key, 60)
      if (count > limitPerMinute) {
        c.header('Retry-After', '60')
        return c.json(apiErrorBody('RATE_LIMITED', 'Terlalu banyak permintaan'), 429)
      }
    }

    await next()
  })
}
