import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'

import type { Env } from '../infra/env.js'
import type { Database } from '../db/client.js'
import type { AppLogger } from '../infra/logger.js'
import type { QueueRegistry } from '../infra/queue.js'
import type { RedisClient } from '../infra/redis.js'
import type { ApiKeyAuthenticator } from '../modules/auth/api-key.js'
import type { BroadcastsService } from '../modules/broadcasts/service.js'
import type { MessagesService } from '../modules/messages/service.js'
import type { WaSessionRow } from '../db/schema.js'
import type { SessionsService } from '../modules/sessions/service.js'
import type { StatsService } from '../modules/stats/service.js'
import { apiKeyMiddleware } from './middleware/api-key.js'
import { handleError, notFound } from './middleware/error.js'
import { rateLimitMiddleware, sessionRateLimitMiddleware } from './middleware/rate-limit.js'
import { createBroadcastsRoute } from './routes/broadcasts.js'
import { createHealthRoute } from './routes/health.js'
import { createMessagesRoute, createSessionMessagesRoute } from './routes/messages.js'
import { createSessionsRoute } from './routes/sessions.js'
import { createStatsRoute } from './routes/stats.js'

export type AppBindings = {
  Variables: {
    apiKeyId: string
    session: WaSessionRow
  }
}

export type AppDependencies = {
  env: Env
  logger: AppLogger
  redis: RedisClient
  db: Database
  auth: ApiKeyAuthenticator
  sessions: SessionsService
  messages: MessagesService
  broadcasts: BroadcastsService
  stats: StatsService
  queues: QueueRegistry
}

function requestLogger(logger: AppLogger) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const start = Date.now()
    await next()
    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - start,
      },
      'request',
    )
  })
}

export function createApp(deps: AppDependencies) {
  const app = new Hono<AppBindings>()
  const requireApiKey = apiKeyMiddleware(deps.auth)
  const rateLimit = rateLimitMiddleware(deps.redis, deps.env.RATE_LIMIT_PER_MIN)

  app.use('*', cors({ origin: deps.env.CORS_ORIGIN }))
  app.use('*', requestLogger(deps.logger))

  app.route('/', createHealthRoute({ db: deps.db, redis: deps.redis }))

  app.use('/stats', requireApiKey, rateLimit)
  app.route('/', createStatsRoute(deps.stats))

  // Endpoint pesan per sesi memakai Bearer token sesi, bukan API key.
  const sessionRateLimit = sessionRateLimitMiddleware(deps.redis, deps.env.RATE_LIMIT_PER_MIN)
  app.route(
    '/sessions',
    createSessionMessagesRoute(deps.sessions, deps.messages, deps.queues, deps.auth, sessionRateLimit),
  )

  app.use('/sessions', requireApiKey, rateLimit)
  app.use('/sessions/*', requireApiKey, rateLimit)
  app.use('/messages', requireApiKey, rateLimit)
  app.use('/messages/*', requireApiKey, rateLimit)

  app.route('/sessions', createSessionsRoute(deps.sessions, deps.broadcasts, deps.redis))
  app.route('/sessions', createBroadcastsRoute(deps.broadcasts, deps.queues))
  app.route('/messages', createMessagesRoute(deps.messages))

  app.notFound(notFound)
  app.onError((error, c) => handleError(error, c, deps.logger))

  return app
}
