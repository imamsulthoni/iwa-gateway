import { Scalar } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'

import type { Env } from '../infra/env.js'
import type { Database } from '../db/client.js'
import type { AppLogger } from '../infra/logger.js'
import type { QueueRegistry } from '../infra/queue.js'
import type { RedisClient } from '../infra/redis.js'
import type { ApiKeyAuthenticator } from '../modules/auth/api-key.js'
import type { AuthService } from '../modules/auth/service.js'
import type { BroadcastsService } from '../modules/broadcasts/service.js'
import type { ConversationsService } from '../modules/conversations/service.js'
import type { MessagesService } from '../modules/messages/service.js'
import type { WaSessionRow } from '../db/schema.js'
import type { SessionsService } from '../modules/sessions/service.js'
import type { SettingsService } from '../modules/settings/service.js'
import type { StatsService } from '../modules/stats/service.js'
import type { WebhooksService } from '../modules/webhooks/service.js'
import type { Actor } from './middleware/auth.js'
import { anyAuthMiddleware, requireAdminMiddleware } from './middleware/auth.js'
import { handleError, notFound } from './middleware/error.js'
import {
  loginRateLimitMiddleware,
  rateLimitMiddleware,
  sessionRateLimitMiddleware,
} from './middleware/rate-limit.js'
import { createOpenApiApp, openApiDocumentConfig } from './openapi.js'
import { createAuthRoute } from './routes/auth.js'
import { createBroadcastsRoute, createBroadcastsV1Route } from './routes/broadcasts.js'
import { createConversationsRoute } from './routes/conversations.js'
import { createEventsRoute } from './routes/events.js'
import { createHealthRoute } from './routes/health.js'
import {
  createMessagesRoute,
  createSessionMessagesRoute,
  createV1MessagesRoute,
} from './routes/messages.js'
import { createSessionsRoute } from './routes/sessions.js'
import { createSettingsRoute } from './routes/settings.js'
import { createStatsRoute } from './routes/stats.js'
import { createWebhooksRoute } from './routes/webhooks.js'

export type AppBindings = {
  Variables: {
    apiKeyId: string
    session: WaSessionRow
    actor?: Actor
  }
}

export type AppDependencies = {
  env: Env
  logger: AppLogger
  redis: RedisClient
  db: Database
  auth: ApiKeyAuthenticator
  userAuth: AuthService
  sessions: SessionsService
  messages: MessagesService
  conversations: ConversationsService
  broadcasts: BroadcastsService
  stats: StatsService
  settings: SettingsService
  webhooks: WebhooksService
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
  const app = createOpenApiApp()
  const anyAuth = anyAuthMiddleware({ apiKey: deps.auth, auth: deps.userAuth })
  const requireAdmin = requireAdminMiddleware()
  const rateLimit = rateLimitMiddleware(deps.redis, deps.env.RATE_LIMIT_PER_MIN)

  app.use('*', cors({ origin: deps.env.CORS_ORIGIN }))
  app.use('*', requestLogger(deps.logger))

  // Dokumentasi API sengaja publik dan didaftarkan sebelum middleware API key.
  app.get('/openapi.json', (c) => c.json(app.getOpenAPI31Document(openApiDocumentConfig)))
  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: openApiDocumentConfig.info.title }))

  app.route('/', createHealthRoute({ db: deps.db, redis: deps.redis }))

  // Login sales publik; /auth/me dan /auth/logout menerima API key atau token login.
  app.use('/auth/login', loginRateLimitMiddleware(deps.redis))
  app.route('/auth', createAuthRoute({ apiKey: deps.auth, auth: deps.userAuth }))

  app.use('/stats', anyAuth, requireAdmin, rateLimit)
  app.route('/', createStatsRoute(deps.stats))

  app.use('/settings', anyAuth, requireAdmin, rateLimit)
  app.route('/', createSettingsRoute(deps.settings))

  // Endpoint pesan per sesi menerima API key, token sesi, atau token login sales.
  const sessionRateLimit = sessionRateLimitMiddleware(deps.redis, deps.env.RATE_LIMIT_PER_MIN)
  app.route(
    '/sessions',
    createSessionMessagesRoute(
      deps.sessions,
      deps.messages,
      deps.queues,
      deps.auth,
      deps.userAuth,
      sessionRateLimit,
    ),
  )

  // Pola wildcard Hono juga cocok dengan path tanpa segmen tambahan, jadi satu
  // pola per prefix cukup dan mencegah middleware/rate limit berjalan dua kali.
  app.use('/sessions/*', anyAuth, rateLimit)
  app.use('/messages/*', anyAuth, requireAdmin, rateLimit)

  app.route(
    '/sessions',
    createSessionsRoute(deps.sessions, deps.broadcasts, deps.redis, deps.settings),
  )
  app.route(
    '/sessions',
    createBroadcastsRoute(deps.broadcasts, deps.sessions, deps.queues, deps.settings),
  )
  app.route('/messages', createMessagesRoute(deps.messages, deps.queues))

  // Kirim pesan dan broadcast menerima admin maupun sales (dibatasi ke sesi
  // miliknya); webhook tetap khusus admin.
  app.use('/v1/broadcasts/*', anyAuth, rateLimit)
  app.use('/v1/webhooks/*', anyAuth, requireAdmin, rateLimit)
  app.use('/v1/sessions/:id/conversations', anyAuth, rateLimit)
  app.use('/v1/conversations/:id/messages', anyAuth, rateLimit)
  app.use('/v1/conversations/:id/read', anyAuth, rateLimit)
  app.use('/v1/sessions/:id/events', anyAuth, rateLimit)
  app.use('/v1/messages', anyAuth, rateLimit)

  app.route(
    '/v1',
    createV1MessagesRoute(deps.messages, deps.conversations, deps.sessions, deps.queues),
  )
  app.route('/v1', createConversationsRoute(deps.conversations, deps.sessions))
  app.route(
    '/v1',
    createBroadcastsV1Route(deps.broadcasts, deps.sessions, deps.queues, deps.settings),
  )
  app.route('/v1', createWebhooksRoute(deps.webhooks))
  app.route('/v1', createEventsRoute(deps.sessions, deps.redis, deps.logger))

  app.notFound(notFound)
  app.onError((error, c) => handleError(error, c, deps.logger))

  return app
}
