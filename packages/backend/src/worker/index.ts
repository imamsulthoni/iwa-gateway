import '../infra/load-env.js'

import { hasAuthState, useDbAuthState } from '../baileys/auth-store.js'
import { createDb } from '../db/client.js'
import { createCipher } from '../infra/crypto.js'
import { setEnv, validateEnv } from '../infra/env.js'
import { createLogger } from '../infra/logger.js'
import { closeQueues, createQueues } from '../infra/queue.js'
import { closeRedis, createRedis } from '../infra/redis.js'
import { createBroadcastsRepository } from '../modules/broadcasts/repository.js'
import { createBroadcastsService } from '../modules/broadcasts/service.js'
import { createMessagesRepository } from '../modules/messages/repository.js'
import { createMessagesService } from '../modules/messages/service.js'
import { createSessionsRepository } from '../modules/sessions/repository.js'
import { createSessionsService } from '../modules/sessions/service.js'
import { bootstrapSessions } from './bootstrap.js'
import { createBroadcastRunProcessor } from './processors/broadcast-run.js'
import { startProcessors } from './processors/registry.js'
import { createSendMessageProcessor } from './processors/send-message.js'
import { SessionManager } from './session-manager.js'

const env = validateEnv()
setEnv(env)

const logger = createLogger(env.LOG_LEVEL)
const redis = createRedis(env.REDIS_URL)
const workerRedis = createRedis(env.REDIS_URL)
const database = createDb(env.DATABASE_URL)
const cipher = createCipher(env.AUTH_ENC_KEY)

const sessionsRepo = createSessionsRepository(database.db)
const messagesRepo = createMessagesRepository(database.db)
const broadcastsRepo = createBroadcastsRepository(database.db)
const sessions = createSessionsService(sessionsRepo)
const messages = createMessagesService(messagesRepo)
const broadcasts = createBroadcastsService(broadcastsRepo)

const manager = new SessionManager({
  db: database.db,
  redis,
  cipher,
  logger,
  browserName: env.BROWSER_NAME,
  lockTtlMs: env.SESSION_LOCK_TTL_MS,
  sessions: sessionsRepo,
  messages,
})

await bootstrapSessions({ db: database.db, sessions, manager, logger })

const processors = startProcessors(
  workerRedis,
  {
    sendMessage: createSendMessageProcessor({ manager, messages, logger }),
    broadcastRun: createBroadcastRunProcessor({
      manager,
      broadcasts,
      messages,
      sessions,
      logger,
      timezone: env.APP_TIMEZONE,
    }),
  },
  logger,
)

const queues = createQueues(redis)

async function reconcile(): Promise<void> {
  const rows = await sessions.startable()
  for (const row of rows) {
    if (row.status === 'logged_out') {
      if (manager.has(row.id)) await manager.stop(row.id, true)
      continue
    }
    if (manager.has(row.id)) continue
    const hasAuth = await hasAuthState(database.db, row.id)
    if (!hasAuth && row.status !== 'connecting') continue
    if (!hasAuth && row.status === 'connecting') {
      await useDbAuthState(row.id, { db: database.db, cipher, logger })
    }
    await manager.start(row)
  }
}

const reconcileTimer = setInterval(() => {
  void reconcile().catch((error: unknown) => {
    logger.error({ err: error }, 'Rekonsiliasi sesi gagal')
  })
}, 15_000)
reconcileTimer.unref()

logger.info('Worker siap')

let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'Worker shutting down')

  const timeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout')
    process.exit(1)
  }, 10_000)
  timeout.unref()

  clearInterval(reconcileTimer)
  await processors.close()
  await manager.stopAll()
  await closeQueues(queues)
  await Promise.all([closeRedis(redis), closeRedis(workerRedis)])
  await database.pool.end()
  clearTimeout(timeout)
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
