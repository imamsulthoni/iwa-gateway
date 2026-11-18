import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { newId } from '../../src/db/id.js'
import { messages } from '../../src/db/schema.js'
import { validateEnv } from '../../src/infra/env.js'
import { createLogger } from '../../src/infra/logger.js'
import { closeQueues, createQueues, enqueue, type QueueRegistry } from '../../src/infra/queue.js'
import { closeRedis, createRedis, type RedisClient } from '../../src/infra/redis.js'
import { createBroadcastsRepository } from '../../src/modules/broadcasts/repository.js'
import {
  createBroadcastsService,
  type BroadcastsService,
} from '../../src/modules/broadcasts/service.js'
import { createMessagesRepository } from '../../src/modules/messages/repository.js'
import { createMessagesService } from '../../src/modules/messages/service.js'
import { createOptOutsRepository } from '../../src/modules/opt-outs/repository.js'
import { createOptOutsService } from '../../src/modules/opt-outs/service.js'
import { createSessionsRepository } from '../../src/modules/sessions/repository.js'
import { createSessionsService } from '../../src/modules/sessions/service.js'
import { createBroadcastRunProcessor } from '../../src/worker/processors/broadcast-run.js'
import type { SessionManager } from '../../src/worker/session-manager.js'
import { RUN_INTEGRATION, resetTestDb, setupTestDb } from './setup.js'

vi.mock('@wa/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wa/shared')>()
  return { ...actual, pickDelayMs: () => 0 }
})

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip
const logger = createLogger('silent')

function recipients(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    to: `6282222${String(index).padStart(4, '0')}`,
  }))
}

describeIntegration('integrasi broadcast lanjutan', () => {
  let connection: Awaited<ReturnType<typeof setupTestDb>>
  let redis: RedisClient
  let queues: QueueRegistry
  let sessionId: string

  const sessionsRepo = () => createSessionsRepository(connection.db)
  const broadcastsRepo = () => createBroadcastsRepository(connection.db)
  const optOutsRepo = () => createOptOutsRepository(connection.db)

  function sessionsService() {
    return createSessionsService(sessionsRepo(), {
      getSettings: async () => ({
        maxSales: 10,
        salesCount: 0,
        defaultMinDelay: 10,
        defaultMaxDelay: 30,
      }),
    })
  }

  function messagesService() {
    return createMessagesService(createMessagesRepository(connection.db))
  }

  function broadcastsService(): BroadcastsService {
    return createBroadcastsService(broadcastsRepo(), createOptOutsService(optOutsRepo()))
  }

  function processor(manager: SessionManager, autoPauseRatio = 0.2) {
    return createBroadcastRunProcessor({
      manager,
      broadcasts: broadcastsService(),
      messages: messagesService(),
      sessions: sessionsService(),
      logger,
      timezone: 'Asia/Jakarta',
      autoPauseRatio,
    })
  }

  function job(broadcastId: string) {
    return { data: { sessionId, broadcastId } } as never
  }

  async function createSession(dailySendLimit = 200) {
    sessionId = newId()
    await sessionsRepo().insert({
      id: sessionId,
      publicId: `bc-${sessionId.slice(-12)}`,
      label: 'Broadcast',
      status: 'connected',
      dailySendLimit,
    })
  }

  beforeAll(async () => {
    connection = await setupTestDb()
    redis = createRedis(validateEnv().REDIS_URL)
    queues = createQueues(redis)
  })

  afterAll(async () => {
    await closeQueues(queues)
    await closeRedis(redis)
    await connection.pool.end()
  })

  beforeEach(async () => {
    await resetTestDb(connection.pool)
    await createSession()
  })

  it('idempotensi clientRef per sesi', async () => {
    const broadcasts = broadcastsService()
    const input = {
      recipients: recipients(1),
      text: 'Halo',
      minDelay: 10,
      maxDelay: 20,
      clientRef: 'bc-same',
    }

    const first = await broadcasts.create(sessionId, input)
    const second = await broadcasts.create(sessionId, input)

    expect(second.duplicate).toBe(true)
    expect(second.broadcast.id).toBe(first.broadcast.id)
    expect(await broadcastsRepo().listRecipients(first.broadcast.id)).toHaveLength(1)
  })

  it('menjadwalkan broadcast dan tidak membuat job ganda', async () => {
    const broadcasts = broadcastsService()
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000)
    const { broadcast } = await broadcasts.create(
      sessionId,
      {
        recipients: recipients(1),
        text: 'Halo',
        minDelay: 10,
        maxDelay: 20,
        clientRef: 'bc-schedule',
      },
      scheduledAt,
    )
    expect(broadcast.status).toBe('scheduled')

    const jobId = `sched-${Date.now()}`
    const before = await queues.broadcast.getDelayedCount()
    for (let index = 0; index < 2; index += 1) {
      await enqueue(
        queues.broadcast,
        'broadcast-run',
        { sessionId, broadcastId: broadcast.id },
        jobId,
        scheduledAt.getTime() - Date.now(),
      )
    }
    expect(await queues.broadcast.getDelayedCount()).toBe(before + 1)

    const manager = { sendText: vi.fn(async () => ({ key: { id: 'wa-1' } })) }
    await processor(manager as unknown as SessionManager)(job(broadcast.id))

    const done = await broadcasts.get(broadcast.id)
    expect(done.status).toBe('done')
    expect(done.startedAt).not.toBeNull()
    expect(done.finishedAt).not.toBeNull()
    expect(manager.sendText).toHaveBeenCalledTimes(1)

    await (await queues.broadcast.getJob(jobId))?.remove()
  })

  it('melewati nomor opt-out tanpa mengirim', async () => {
    const optedPhone = '62822220000'
    await optOutsRepo().insertIfAbsent({
      id: newId(),
      phoneE164: optedPhone,
      source: 'manual',
      optedOutAt: new Date(),
    })

    const broadcasts = broadcastsService()
    const { broadcast } = await broadcasts.create(sessionId, {
      recipients: recipients(2),
      text: 'Halo',
      minDelay: 10,
      maxDelay: 20,
      clientRef: 'bc-optout',
    })

    const rows = await broadcastsRepo().listRecipients(broadcast.id)
    expect(rows.find((row) => row.toJid.startsWith(optedPhone))).toMatchObject({
      status: 'skipped',
      error: 'opted_out',
    })

    const manager = { sendText: vi.fn(async () => ({ key: { id: 'wa-1' } })) }
    await processor(manager as unknown as SessionManager)(job(broadcast.id))

    expect(manager.sendText).toHaveBeenCalledTimes(1)
    const detail = await broadcasts.detail(broadcast.id)
    expect(detail).toMatchObject({ sent: 1, skipped: 1, optedOut: 1, status: 'done' })
  })

  it('berhenti tepat di batas harian', async () => {
    await createSession(1)
    const broadcasts = broadcastsService()
    const { broadcast } = await broadcasts.create(sessionId, {
      recipients: recipients(2),
      text: 'Halo',
      minDelay: 10,
      maxDelay: 20,
      clientRef: 'bc-limit',
    })

    const manager = { sendText: vi.fn(async () => ({ key: { id: 'wa-1' } })) }
    await processor(manager as unknown as SessionManager)(job(broadcast.id))

    expect(manager.sendText).toHaveBeenCalledTimes(1)
    const detail = await broadcasts.detail(broadcast.id)
    expect(detail.sent).toBe(1)
    expect(detail.failed).toBe(1)
    expect(detail.recipients.find((recipient) => recipient.status === 'failed')?.error).toContain(
      'Batas harian',
    )
  })

  it('pause menghentikan batch dan resume tidak menduplikasi pesan', async () => {
    const broadcasts = broadcastsService()
    const { broadcast } = await broadcasts.create(sessionId, {
      recipients: recipients(3),
      text: 'Halo',
      minDelay: 10,
      maxDelay: 20,
      clientRef: 'bc-pause',
    })

    let calls = 0
    const pausingManager = {
      sendText: vi.fn(async () => {
        calls += 1
        if (calls === 1) await broadcasts.pause(broadcast.id)
        return { key: { id: `wa-${calls}` } }
      }),
    }
    await processor(pausingManager as unknown as SessionManager)(job(broadcast.id))

    expect(pausingManager.sendText).toHaveBeenCalledTimes(1)
    const paused = await broadcasts.detail(broadcast.id)
    expect(paused.status).toBe('paused')
    expect(paused).toMatchObject({ sent: 1, failed: 0, skipped: 0 })
    expect(paused.recipients.filter((recipient) => recipient.status === 'pending')).toHaveLength(2)

    const started = await broadcasts.start(broadcast.id)
    expect(started.status).toBe('pending')

    let resumed = 0
    const manager = {
      sendText: vi.fn(async () => {
        resumed += 1
        return { key: { id: `wa-resume-${resumed}` } }
      }),
    }
    await processor(manager as unknown as SessionManager)(job(broadcast.id))

    expect(manager.sendText).toHaveBeenCalledTimes(2)
    const done = await broadcasts.detail(broadcast.id)
    expect(done.recipients.map((recipient) => recipient.status)).toEqual(['sent', 'sent', 'sent'])
    expect(done).toMatchObject({ status: 'done', sent: 3 })
    const rows = await connection.db
      .select()
      .from(messages)
      .where(eq(messages.broadcastId, broadcast.id))
    expect(rows).toHaveLength(3)
  })

  it('batas harian tetap berlaku setelah resume', async () => {
    await createSession(2)
    const broadcasts = broadcastsService()
    const { broadcast } = await broadcasts.create(sessionId, {
      recipients: recipients(3),
      text: 'Halo',
      minDelay: 10,
      maxDelay: 20,
      clientRef: 'bc-limit-resume',
    })

    let calls = 0
    await processor({
      sendText: vi.fn(async () => {
        calls += 1
        if (calls === 1) await broadcasts.pause(broadcast.id)
        return { key: { id: `wa-limit-${calls}` } }
      }),
    } as unknown as SessionManager)(job(broadcast.id))

    await broadcasts.start(broadcast.id)
    await processor({
      sendText: vi.fn(async () => ({ key: { id: 'wa-limit-2' } })),
    } as unknown as SessionManager)(job(broadcast.id))

    const done = await broadcasts.detail(broadcast.id)
    expect(done.sent).toBe(2)
    expect(done.failed).toBe(1)
    expect(done.recipients.find((recipient) => recipient.status === 'failed')?.error).toContain(
      'Batas harian',
    )
  })

  it('menjeda otomatis saat tingkat gagal tinggi', async () => {
    const broadcasts = broadcastsService()
    const { broadcast } = await broadcasts.create(sessionId, {
      recipients: recipients(21),
      text: 'Halo',
      minDelay: 10,
      maxDelay: 20,
      clientRef: 'bc-auto-pause',
    })

    const manager = {
      sendText: vi.fn(async () => {
        throw new Error('gagal kirim')
      }),
    }
    await processor(manager as unknown as SessionManager)(job(broadcast.id))

    expect(manager.sendText).toHaveBeenCalledTimes(20)
    const detail = await broadcasts.detail(broadcast.id)
    expect(detail.status).toBe('paused')
    expect(detail.pauseReason).toContain('Tingkat gagal')
    expect(detail.recipients.filter((recipient) => recipient.status === 'pending')).toHaveLength(1)
  })
})
