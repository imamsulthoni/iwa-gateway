import '../infra/load-env.js'

import { serve } from '@hono/node-server'

import { createApp } from './app.js'
import { createDb } from '../db/client.js'
import { validateEnv } from '../infra/env.js'
import { setEnv } from '../infra/env.js'
import { createRoleLogger } from '../infra/logger.js'
import { closeQueues, createQueues } from '../infra/queue.js'
import { closeRedis, createRedis } from '../infra/redis.js'
import { createApiKeyAuthenticator } from '../modules/auth/api-key.js'
import { createBroadcastsRepository } from '../modules/broadcasts/repository.js'
import { createBroadcastsService } from '../modules/broadcasts/service.js'
import { createConversationsRepository } from '../modules/conversations/repository.js'
import { createConversationsService } from '../modules/conversations/service.js'
import { createMessagesRepository } from '../modules/messages/repository.js'
import { createMessagesService } from '../modules/messages/service.js'
import { createOptOutsRepository } from '../modules/opt-outs/repository.js'
import { createOptOutsService } from '../modules/opt-outs/service.js'
import { createSessionsRepository } from '../modules/sessions/repository.js'
import { createSessionsService } from '../modules/sessions/service.js'
import { createStatsService } from '../modules/stats/service.js'
import { createWebhooksRepository } from '../modules/webhooks/repository.js'
import { createWebhooksService } from '../modules/webhooks/service.js'

const env = validateEnv()
setEnv(env)

const logger = createRoleLogger(env.LOG_LEVEL, 'api', env.LOG_DIR)
const redis = createRedis(env.REDIS_URL)
const database = createDb(env.DATABASE_URL)
const queues = createQueues(redis)

const sessionsRepo = createSessionsRepository(database.db)
const messagesRepo = createMessagesRepository(database.db)
const conversationsRepo = createConversationsRepository(database.db)
const broadcastsRepo = createBroadcastsRepository(database.db)
const optOutsRepo = createOptOutsRepository(database.db)
const webhooksRepo = createWebhooksRepository(database.db)

const app = createApp({
  env,
  logger,
  redis,
  db: database.db,
  auth: createApiKeyAuthenticator(database.db),
  sessions: createSessionsService(sessionsRepo),
  messages: createMessagesService(messagesRepo),
  conversations: createConversationsService(conversationsRepo),
  broadcasts: createBroadcastsService(broadcastsRepo, createOptOutsService(optOutsRepo)),
  stats: createStatsService({
    sessions: sessionsRepo,
    messages: messagesRepo,
    broadcasts: broadcastsRepo,
    timezone: env.APP_TIMEZONE,
  }),
  webhooks: createWebhooksService(webhooksRepo),
  queues,
})

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'API listening')
})

let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'API shutting down')

  const timeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout')
    process.exit(1)
  }, 10_000)
  timeout.unref()

  await new Promise<void>((resolve) => server.close(() => resolve()))
  await Promise.all([closeQueues(queues), closeRedis(redis)])
  await database.pool.end()
  clearTimeout(timeout)
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
