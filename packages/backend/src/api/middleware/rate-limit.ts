import { getConnInfo } from '@hono/node-server/conninfo'
import { createMiddleware } from 'hono/factory'
import { apiErrorBody } from '@wa/shared'
import type { Redis } from 'ioredis'

import type { AppBindings } from '../app.js'

export const LOGIN_RATE_LIMIT = 5
export const LOGIN_RATE_WINDOW_SECONDS = 300

function clientIp(c: Parameters<typeof getConnInfo>[0]): string {
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function rateLimitMiddleware(redis: Redis, limitPerMinute: number) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const window = Math.floor(Date.now() / 60_000)
    const actor = c.get('actor')
    const keys: string[] = []
    if (actor?.mode === 'admin') {
      keys.push(`rl:key:${actor.apiKeyId}:${window}`)
      const sessionId = c.req.param('id')
      if (sessionId) keys.push(`rl:sess:${sessionId}:${window}`)
    } else if (actor?.mode === 'sales') {
      keys.push(`rl:user:${actor.user.id}:${window}`)
    } else {
      keys.push(`rl:ip:${clientIp(c)}:${window}`)
    }

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

export function sessionRateLimitMiddleware(redis: Redis, limitPerMinute: number) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const window = Math.floor(Date.now() / 60_000)
    const sessionId = c.req.param('id')
    if (!sessionId) return next()
    const keys: string[] = [`rl:sess:${sessionId}:${window}`]
    const apiKeyId = c.get('apiKeyId')
    if (apiKeyId) keys.push(`rl:key:${apiKeyId}:${window}`)

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

/**
 * Batasi percobaan login per IP dan per nomor. Kunci nomor hanya ditambah
 * setelah body terbaca; body tetap tersedia untuk handler (Hono menyimpannya).
 */
export function loginRateLimitMiddleware(redis: Redis) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const window = Math.floor(Date.now() / (LOGIN_RATE_WINDOW_SECONDS * 1000))
    const keys = [`rl:login:ip:${clientIp(c)}:${window}`]
    const body = (await c.req.json().catch(() => null)) as { phoneNumber?: unknown } | null
    if (typeof body?.phoneNumber === 'string') {
      keys.push(`rl:login:phone:${body.phoneNumber}:${window}`)
    }

    for (const key of keys) {
      const count = await redis.incr(key)
      if (count === 1) await redis.expire(key, LOGIN_RATE_WINDOW_SECONDS)
      if (count > LOGIN_RATE_LIMIT) {
        c.header('Retry-After', String(LOGIN_RATE_WINDOW_SECONDS))
        return c.json(apiErrorBody('RATE_LIMITED', 'Terlalu banyak percobaan login'), 429)
      }
    }

    await next()
  })
}