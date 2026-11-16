import '../infra/load-env.js'

import { createDb } from '../db/client.js'
import { createCipher } from '../infra/crypto.js'
import { setEnv, validateEnv } from '../infra/env.js'
import { createLogger } from '../infra/logger.js'
import { closeQueues, createQueues } from '../infra/queue.js'
import { closeRedis, createRedis } from '../infra/redis.js'
import { subscribeSessionControl } from '../infra/session-control.js'
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
import { reconcileSessions } from './reconcile.js'
import { SessionManager } from './session-manager.js'

const env = validateEnv()
setEnv(env)

const logger = createLogger(env.LOG_LEVEL)
const redis = createRedis(env.REDIS_URL)
const workerRedis = createRedis(env.REDIS_URL)
const controlRedis = createRedis(env.REDIS_URL)
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

await bootstrapSessions({ db: database.db, cipher, sessions, manager, logger })

const unsubscribeControl = subscribeSessionControl(controlRedis, async (message) => {
  try {
    if (message.action === 'stop') {
      await manager.stop(message.sessionId, message.clearAuth)
      return
    }
    if (manager.has(message.sessionId)) return
    const row = await sessions.get(message.sessionId).catch(() => null)
    if (!row || row.status === 'logged_out') return
    await manager.start(row)
  } catch (error) {
    logger.error({ err: error, message }, 'Perintah kontrol sesi gagal')
  }
})

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
  await reconcileSessions({ db: database.db, sessions, manager, cipher, logger })
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
  unsubscribeControl()
  await processors.close()
  await manager.stopAll()
  await closeQueues(queues)
  await Promise.all([closeRedis(redis), closeRedis(workerRedis), closeRedis(controlRedis)])
  await database.pool.end()
  clearTimeout(timeout)
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
