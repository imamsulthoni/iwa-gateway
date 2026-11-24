import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp, type AppDependencies } from '../../src/api/app.js'
import { newId } from '../../src/db/id.js'
import { apiKeys, conversations, messages, optOuts } from '../../src/db/schema.js'
import { validateEnv } from '../../src/infra/env.js'
import { createLogger } from '../../src/infra/logger.js'
import { publishSessionEvent, subscribeSessionEvents } from '../../src/infra/pubsub.js'
import { closeRedis, createRedis, type RedisClient } from '../../src/infra/redis.js'
import { createApiKeyAuthenticator, hashApiKey } from '../../src/modules/auth/api-key.js'
import { createConversationsRepository } from '../../src/modules/conversations/repository.js'
import { createConversationsService } from '../../src/modules/conversations/service.js'
import { createMessagesRepository } from '../../src/modules/messages/repository.js'
import { createMessagesService } from '../../src/modules/messages/service.js'
import { createOptOutsRepository } from '../../src/modules/opt-outs/repository.js'
import { createOptOutsService } from '../../src/modules/opt-outs/service.js'
import { createSessionsRepository } from '../../src/modules/sessions/repository.js'
import { createSessionsService } from '../../src/modules/sessions/service.js'
import { handleMessagesUpsert } from '../../src/worker/events/messages-upsert.js'
import { RUN_INTEGRATION, resetTestDb, setupTestDb } from './setup.js'

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

const PN = '628123456789@s.whatsapp.net'
const LID = '123456789012345@lid'

function incoming(id: string, content: Record<string, unknown>, alt = PN) {
  return {
    type: 'notify',
    messages: [
      {
        key: { id, remoteJid: LID, remoteJidAlt: alt, fromMe: false },
        message: content,
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    ],
  }
}

describeIntegration('integrasi inbox', () => {
  let connection: Awaited<ReturnType<typeof setupTestDb>>
  let redis: RedisClient
  let sessionId: string

  const sessionsRepo = () => createSessionsRepository(connection.db)
  const messagesService = () => createMessagesService(createMessagesRepository(connection.db))
  const conversationsService = () =>
    createConversationsService(createConversationsRepository(connection.db))
  const optOutsService = () => createOptOutsService(createOptOutsRepository(connection.db))

  function deps(published: unknown[] = []) {
    return {
      messages: messagesService(),
      optOuts: optOutsService(),
      publish: async (event: unknown) => {
        published.push(event)
      },
    }
  }

  beforeAll(async () => {
    connection = await setupTestDb()
    redis = createRedis(validateEnv().REDIS_URL)
  })

  afterAll(async () => {
    await closeRedis(redis)
    await connection.pool.end()
  })

  beforeEach(async () => {
    await resetTestDb(connection.pool)
    sessionId = newId()
    await sessionsRepo().insert({
      id: sessionId,
      publicId: 'inbox',
      label: 'Inbox',
      status: 'connected',
    })
  })

  it('menyimpan teks dan non-teks tepat sekali per wa_message_id', async () => {
    const published: unknown[] = []
    const runtime = deps(published)

    await handleMessagesUpsert(sessionId, incoming('wa-1', { conversation: 'Halo' }), runtime)
    await handleMessagesUpsert(sessionId, incoming('wa-1', { conversation: 'Halo' }), runtime)
    await handleMessagesUpsert(
      sessionId,
      incoming('wa-2', { imageMessage: { mimetype: 'image/jpeg' } }),
      runtime,
    )

    const rows = await connection.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.waMessageId === 'wa-1')).toMatchObject({
      direction: 'in',
      type: 'text',
      body: 'Halo',
      status: 'delivered',
    })
    expect(rows.find((row) => row.waMessageId === 'wa-2')).toMatchObject({
      type: 'image',
      body: 'Gambar',
    })
    expect(published).toHaveLength(2)

    const [conversation] = await connection.db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, sessionId))
    expect(conversation).toMatchObject({ waJid: LID, waJidAlt: PN, unreadCount: 2 })
  })

  it('PN dan LID untuk orang yang sama tetap satu room', async () => {
    await handleMessagesUpsert(sessionId, incoming('wa-1', { conversation: 'A' }), deps())
    await handleMessagesUpsert(
      sessionId,
      {
        type: 'notify',
        messages: [
          {
            key: { id: 'wa-2', remoteJid: PN, fromMe: false },
            message: { conversation: 'B' },
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        ],
      },
      deps(),
    )

    const rooms = await connection.db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, sessionId))
    expect(rooms).toHaveLength(1)
  })

  it('mencatat opt-out idempoten dari pesan teks', async () => {
    await handleMessagesUpsert(sessionId, incoming('wa-1', { conversation: 'STOP' }), deps())
    await handleMessagesUpsert(sessionId, incoming('wa-2', { conversation: 'stop' }), deps())
    await handleMessagesUpsert(sessionId, incoming('wa-3', { imageMessage: {} }), deps())

    const rows = await connection.db.select().from(optOuts)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.phoneE164).toBe('628123456789')
  })

  it('pagination room stabil dan pesan keluar tertaut ke conversation_id', async () => {
    await handleMessagesUpsert(sessionId, incoming('wa-1', { conversation: 'A' }), deps())
    const [room] = await connection.db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, sessionId))

    await messagesService().createOutgoing({
      sessionId,
      to: '628123456789',
      text: 'Balasan',
      clientRef: 'inbox-1',
      conversationId: room?.id,
    })

    const first = await conversationsService().listMessages(room?.id ?? '', 1)
    expect(first.items).toHaveLength(1)
    expect(first.nextCursor).not.toBeNull()

    const second = await conversationsService().listMessages(
      room?.id ?? '',
      1,
      first.nextCursor ?? undefined,
    )
    expect(second.items).toHaveLength(1)
    expect(second.items[0]?.direction).toBe('in')

    const outgoing = await connection.db
      .select()
      .from(messages)
      .where(eq(messages.clientRef, 'inbox-1'))
    expect(outgoing[0]?.conversationId).toBe(room?.id)
  })

  it('endpoint SSE memakai API key dan mendorong event pesan', async () => {
    const key = 'wa_integration_inbox'
    await connection.db.insert(apiKeys).values({
      id: newId(),
      name: 'inbox',
      keyHash: hashApiKey(key),
    })

    const app = createApp({
      env: validateEnv(),
      logger: createLogger('silent'),
      redis,
      db: connection.db,
      auth: createApiKeyAuthenticator(connection.db),
      userAuth: {} as unknown as AppDependencies['userAuth'],
      sessions: createSessionsService(sessionsRepo(), {
        getSettings: async () => ({
          maxSales: 10,
          salesCount: 0,
          defaultMinDelay: 10,
          defaultMaxDelay: 30,
        }),
      }),
      messages: messagesService(),
      conversations: conversationsService(),
      broadcasts: { current: async () => null } as unknown as AppDependencies['broadcasts'],
      stats: {
        get: async () => ({
          connectedSessions: 0,
          periodMessages: 0,
          previousPeriodMessages: 0,
          periodFailed: 0,
          totalMessages: 0,
          runningBroadcasts: 0,
          todayDate: '2026-01-01',
          bucketKind: 'day' as const,
          buckets: [],
        }),
      } as unknown as AppDependencies['stats'],
      settings: {
        getSettings: async () => ({
          maxSales: 10,
          salesCount: 0,
          defaultMinDelay: 10,
          defaultMaxDelay: 30,
        }),
        updateSettings: async (values) => ({
          maxSales: values.maxSales ?? 10,
          salesCount: 0,
          defaultMinDelay: values.defaultMinDelay ?? 10,
          defaultMaxDelay: values.defaultMaxDelay ?? 30,
        }),
      },
      webhooks: {} as unknown as AppDependencies['webhooks'],
      queues: { send: { add: vi.fn() }, broadcast: { add: vi.fn() } } as never,
    })

    expect((await app.request('/v1/sessions/inbox/events')).status).toBe(401)
    const rooms = await app.request('/v1/sessions/inbox/conversations', {
      headers: { 'x-api-key': key },
    })
    expect(rooms.status).toBe(200)

    const controller = new AbortController()
    const response = await app.request('/v1/sessions/inbox/events', {
      headers: { 'x-api-key': key },
      signal: controller.signal,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')

    const reader = response.body?.getReader()
    expect(reader).toBeDefined()
    await new Promise((resolve) => setTimeout(resolve, 100))
    await publishSessionEvent(redis, sessionId, {
      id: 'e2',
      event: 'session.status',
      data: { status: 'connected', phoneNumber: null, lastConnectedAt: null },
    })
    const chunk = await reader?.read()
    expect(new TextDecoder().decode(chunk?.value)).toContain('event: session.status')

    controller.abort()
    await reader?.cancel().catch(() => undefined)
  })

  it('mempublikasikan event pesan masuk lewat Redis', async () => {
    const received: unknown[] = []
    const unsubscribe = subscribeSessionEvents(redis, sessionId, (event) => received.push(event))
    try {
      await new Promise((resolve) => setTimeout(resolve, 100))
      await publishSessionEvent(redis, sessionId, {
        id: 'e1',
        event: 'message.received',
        data: {
          message: {
            id: 'm1',
            conversationId: 'c1',
            sessionId,
            direction: 'in',
            type: 'text',
            body: 'Halo',
            status: 'delivered',
            clientRef: null,
            waMessageId: 'wa-1',
            createdAt: new Date().toISOString(),
          },
        },
      })
      await vi.waitFor(() => expect(received).toHaveLength(1))
    } finally {
      await unsubscribe()
    }
  })
})
