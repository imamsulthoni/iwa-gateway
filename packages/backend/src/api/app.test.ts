import { describe, expect, it, vi } from 'vitest'

import type { WaSessionRow } from '../db/schema.js'
import type { QueueRegistry } from '../infra/queue.js'
import { createLogger } from '../infra/logger.js'
import type { RedisClient } from '../infra/redis.js'
import { hashSessionToken } from '../modules/auth/session-token.js'
import { ValidationError } from '../modules/errors.js'
import type { MessagesService } from '../modules/messages/service.js'
import type { SessionsService } from '../modules/sessions/service.js'
import { createApp, type AppDependencies } from './app.js'

const TOKEN = 'token-sesi'
const SESSION_ID = '01a1ddfa-295a-7557-9bd3-00293fdc047b'

const SESSION: WaSessionRow = {
  id: SESSION_ID,
  publicId: 'smoke',
  label: 'Smoke',
  engine: 'baileys',
  phoneNumber: null,
  status: 'connected',
  lastQr: null,
  lastConnectedAt: null,
  tokenHash: hashSessionToken(TOKEN),
  tokenRotatedAt: null,
  salesId: null,
  agentId: null,
  dailySendLimit: 200,
  authFormat: 'v7',
  pairingMethod: 'qr',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

function createTestApp(overrides: Partial<AppDependencies> = {}) {
  const redis = {
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    ping: vi.fn(async () => 'PONG'),
    publish: vi.fn(async () => 1),
    get: vi.fn(async () => null),
    hmget: vi.fn(async () => []),
  } as unknown as RedisClient

  const db = {
    execute: vi.fn(async () => []),
  } as unknown as AppDependencies['db']

  const sessions = {
    get: vi.fn(async (id: string) => {
      if (id !== SESSION_ID) throw new Error('tidak dipakai')
      return SESSION
    }),
    getByPublicId: vi.fn(async (publicId: string) => {
      if (publicId !== SESSION.publicId) throw new Error('tidak dipakai')
      return SESSION
    }),
    list: vi.fn(async () => [SESSION]),
    updateStatus: vi.fn(async (_id: string, status: WaSessionRow['status'], patch = {}) => ({
      ...SESSION,
      status,
      ...patch,
    })),
  } as unknown as SessionsService

  const messages = {
    findByClientRef: vi.fn(async () => null),
    createOutgoing: vi.fn(async () => ({
      message: {
        id: 'message-1',
        sessionId: SESSION_ID,
        to: '628123456789@s.whatsapp.net',
        clientRef: 'ref-1',
        body: 'Halo',
        status: 'queued' as const,
        waMessageId: null,
        error: null,
        createdAt: new Date().toISOString(),
        deletedAt: null,
      },
      duplicate: false,
    })),
    retry: vi.fn(async () => ({
      id: 'message-1',
      sessionId: SESSION_ID,
      to: '628123456789@s.whatsapp.net',
      clientRef: 'ref-1',
      body: 'Halo',
      status: 'queued' as const,
      waMessageId: null,
      error: null,
      customerName: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    })),
  } as unknown as MessagesService

  const queue = { add: vi.fn(async () => undefined) }
  const queues = {
    send: queue,
    broadcast: queue,
  } as unknown as QueueRegistry

  const conversations = {
    findBySessionAndAddress: vi.fn(async () => null),
    listRooms: vi.fn(async () => ({ items: [], nextCursor: null })),
    listMessages: vi.fn(async () => ({ items: [], nextCursor: null })),
    markRead: vi.fn(async () => ({})),
  } as unknown as AppDependencies['conversations']

  const deps: AppDependencies = {
    env: {
      NODE_ENV: 'test',
      PORT: 3000,
      DATABASE_URL: 'mysql://x',
      REDIS_URL: 'redis://x',
      AUTH_ENC_KEY: Buffer.alloc(32).toString('base64'),
      LOG_LEVEL: 'silent',
      APP_TIMEZONE: 'Asia/Jakarta',
      CORS_ORIGIN: 'http://localhost:5173',
      BROWSER_NAME: 'test',
      SESSION_LOCK_TTL_MS: 30000,
      RATE_LIMIT_PER_MIN: 60,
      BROADCAST_AUTO_PAUSE_RATIO: 0.2,
    },
    logger: createLogger('silent'),
    redis,
    db,
    auth: {
      findActive: async (plaintext) => (plaintext === 'valid-key' ? { id: 'key-1' } : null),
    },
    sessions,
    messages,
    conversations,
    broadcasts: {
      current: async () => null,
      create: async () => {
        throw new Error('tidak dipakai')
      },
    } as unknown as AppDependencies['broadcasts'],
    stats: {
      get: async () => ({
        connectedSessions: 0,
        todayMessages: 0,
        totalMessages: 0,
        runningBroadcasts: 0,
      }),
    } as unknown as AppDependencies['stats'],
    webhooks: {} as unknown as AppDependencies['webhooks'],
    queues,
    ...overrides,
  }

  return { app: createApp(deps), queue, messages, conversations, redis, sessions }
}

describe('API Hono', () => {
  it('GET / publik mengembalikan nama, versi, status, dan metrik', async () => {
    const { app } = createTestApp()
    const response = await app.request('/')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      name: 'wa-bot-service',
      version: '0.1.0',
      status: 'ok',
      checks: { database: true, redis: true },
      metrics: {
        inbound: { processed: 0, duplicates: 0, nonText: 0 },
        sse: { activeConnections: 0 },
        webhooks: { delivered: 0, failed: 0, retry: 0, pendingDue: 0, outboxLagMs: 0 },
        optOuts: 0,
        broadcastsPaused: 0,
      },
    })
  })

  it('GET / degraded saat outbox webhook tertinggal', async () => {
    const db = {
      execute: vi.fn(async () => [
        [{ optOuts: 2, broadcastsPaused: 1, pendingDue: 3, outboxLagMs: 60_000 }],
        [],
      ]),
    } as unknown as AppDependencies['db']
    const { app } = createTestApp({ db })
    const response = await app.request('/')

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      status: string
      metrics: { webhooks: Record<string, number>; optOuts: number; broadcastsPaused: number }
    }
    expect(body.status).toBe('degraded')
    expect(body.metrics.webhooks).toMatchObject({ pendingDue: 3, outboxLagMs: 60_000 })
    expect(body.metrics.optOuts).toBe(2)
    expect(body.metrics.broadcastsPaused).toBe(1)
  })

  it('GET /stats menolak tanpa API key dan menerima key valid', async () => {
    const { app } = createTestApp()
    const unauthorized = await app.request('/stats')
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'API key wajib dikirim' },
    })

    const invalid = await app.request('/stats', { headers: { 'x-api-key': 'salah' } })
    expect(invalid.status).toBe(401)

    const ok = await app.request('/stats', { headers: { 'x-api-key': 'valid-key' } })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({
      connectedSessions: 0,
      todayMessages: 0,
      totalMessages: 0,
      runningBroadcasts: 0,
    })
  })

  it('endpoint tidak dikenal memakai format error yang sama', async () => {
    const { app } = createTestApp()
    const response = await app.request('/tidak-ada')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' },
    })
  })

  it('error tak terduga menjadi 500 tanpa stack trace', async () => {
    const { app } = createTestApp({
      stats: {
        get: async () => {
          throw new Error('rahasia internal')
        },
      } as unknown as AppDependencies['stats'],
    })
    const response = await app.request('/stats', { headers: { 'x-api-key': 'valid-key' } })
    expect(response.status).toBe(500)
    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(body)).not.toContain('rahasia internal')
  })

  it('kirim pesan memakai Bearer token sesi dan meng-enqueue job', async () => {
    const { app, queue, messages } = createTestApp()
    const response = await app.request(`/sessions/${SESSION_ID}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ to: '628123456789', clientRef: 'ref-1', text: 'Halo' }),
    })

    expect(response.status).toBe(202)
    expect(messages.createOutgoing).toHaveBeenCalledOnce()
    expect(queue.add).toHaveBeenCalledOnce()
  })

  it('kirim pesan ditolak saat sesi belum terhubung', async () => {
    const { app, queue } = createTestApp({
      sessions: {
        get: vi.fn(async () => ({ ...SESSION, status: 'qr_pending' as const })),
      } as unknown as SessionsService,
    })
    const response = await app.request(`/sessions/${SESSION_ID}/messages`, {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key', 'content-type': 'application/json' },
      body: JSON.stringify({ to: '628123456789', clientRef: 'ref-1', text: 'Halo' }),
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    })
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('replay clientRef saat sesi terputus mengembalikan pesan lama', async () => {
    const existing = {
      id: 'message-1',
      sessionId: SESSION_ID,
      to: '628123456789@s.whatsapp.net',
      clientRef: 'ref-1',
      body: 'Halo',
      status: 'sent' as const,
      waMessageId: 'wa-1',
      error: null,
      customerName: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    }
    const createOutgoing = vi.fn()
    const { app, queue } = createTestApp({
      sessions: {
        get: vi.fn(async () => ({ ...SESSION, status: 'disconnected' as const })),
      } as unknown as SessionsService,
      messages: {
        findByClientRef: vi.fn(async () => existing),
        createOutgoing,
      } as unknown as MessagesService,
    })
    const response = await app.request(`/sessions/${SESSION_ID}/messages`, {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key', 'content-type': 'application/json' },
      body: JSON.stringify({ to: '628123456789', clientRef: 'ref-1', text: 'Halo' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      duplicate: true,
      message: { id: 'message-1' },
    })
    expect(createOutgoing).not.toHaveBeenCalled()
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('token sesi salah ditolak', async () => {
    const { app, queue } = createTestApp()
    const response = await app.request(`/sessions/${SESSION_ID}/messages`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token-salah',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ to: '628123456789', clientRef: 'ref-1', text: 'Halo' }),
    })

    expect(response.status).toBe(401)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('riwayat lintas sesi meneruskan filter arah pesan', async () => {
    const listAll = vi.fn(async () => ({ items: [], nextCursor: null }))
    const { app } = createTestApp({
      messages: { listAll } as unknown as MessagesService,
    })
    const response = await app.request('/messages?direction=out', {
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(200)
    expect(listAll).toHaveBeenCalledWith(50, undefined, undefined, 'out')
  })

  it('riwayat sesi meneruskan filter arah pesan', async () => {
    const listBySession = vi.fn(async () => ({ items: [], nextCursor: null }))
    const { app } = createTestApp({
      messages: { listBySession } as unknown as MessagesService,
    })
    const response = await app.request(`/sessions/${SESSION_ID}/messages?direction=out`, {
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(200)
    expect(listBySession).toHaveBeenCalledWith(SESSION_ID, 20, undefined, 'out')
  })

  it('arah pesan tidak dikenal ditolak 422', async () => {
    const listAll = vi.fn()
    const { app } = createTestApp({
      messages: { listAll } as unknown as MessagesService,
    })
    const response = await app.request('/messages?direction=sideways', {
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(422)
    expect(listAll).not.toHaveBeenCalled()
  })

  it('kirim ulang pesan gagal meng-enqueue job dengan id unik', async () => {
    const { app, queue, messages } = createTestApp()
    const response = await app.request('/messages/message-1/retry', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(202)
    expect(messages.retry).toHaveBeenCalledWith('message-1')
    expect(queue.add).toHaveBeenCalledWith(
      'send-message',
      { sessionId: SESSION_ID, messageId: 'message-1' },
      expect.objectContaining({
        jobId: expect.stringContaining('message-1-retry-'),
      }),
    )
  })

  it('kirim ulang ditolak tanpa API key', async () => {
    const { app, queue } = createTestApp()
    const response = await app.request('/messages/message-1/retry', { method: 'POST' })

    expect(response.status).toBe(401)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('kirim ulang menolak pesan yang tidak berstatus gagal', async () => {
    const { app } = createTestApp({
      messages: {
        retry: vi.fn(async () => {
          throw new ValidationError('Hanya pesan berstatus gagal yang bisa dikirim ulang')
        }),
      } as unknown as MessagesService,
    })
    const response = await app.request('/messages/message-1/retry', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    })
  })

  it('live menggabungkan session, qr, pairing code, dan broadcast', async () => {
    const { app } = createTestApp()
    const response = await app.request(`/sessions/${SESSION_ID}/live`, {
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      session: { id: SESSION_ID, status: 'connected' },
      qr: null,
      pairingCode: null,
      broadcast: { jobId: null, total: 0, recipients: [] },
    })
  })

  it('login memulai sesi lewat kanal kontrol worker', async () => {
    const { app, redis } = createTestApp()
    const response = await app.request(`/sessions/${SESSION_ID}/login`, {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(200)
    expect(redis.publish).toHaveBeenCalledWith(
      'wa:session:control',
      JSON.stringify({ sessionId: SESSION_ID, action: 'start' }),
    )
  })

  it('cancel pairing menghentikan sesi dan mengosongkan QR', async () => {
    const pairingSession = { ...SESSION, status: 'qr_pending' as const, lastQr: 'data:image/png' }
    const { app, redis } = createTestApp({
      sessions: {
        get: vi.fn(async () => pairingSession),
        list: vi.fn(async () => [pairingSession]),
        updateStatus: vi.fn(async (_id: string, status: WaSessionRow['status'], patch = {}) => ({
          ...pairingSession,
          status,
          ...patch,
        })),
      } as unknown as SessionsService,
    })

    const response = await app.request(`/sessions/${SESSION_ID}/cancel`, {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'disconnected' })
    expect(redis.publish).toHaveBeenCalledWith(
      'wa:session:control',
      JSON.stringify({ sessionId: SESSION_ID, action: 'stop', clearAuth: true }),
    )
  })

  it('cancel ditolak saat sesi sudah terhubung', async () => {
    const { app } = createTestApp()
    const response = await app.request(`/sessions/${SESSION_ID}/cancel`, {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(409)
  })

  it('rate limit per API key mengembalikan 429 dan Retry-After', async () => {
    const counts = new Map<string, number>()
    const redis = {
      incr: vi.fn(async (key: string) => {
        const next = (counts.get(key) ?? 0) + 1
        counts.set(key, next)
        return next
      }),
      expire: vi.fn(async () => 1),
    } as unknown as RedisClient

    const { app } = createTestApp({
      redis,
      auth: {
        findActive: async (plaintext) =>
          plaintext === 'key-a' || plaintext === 'key-b' ? { id: plaintext } : null,
      },
    })

    for (let i = 0; i < 60; i += 1) {
      const response = await app.request('/stats', { headers: { 'x-api-key': 'key-a' } })
      expect(response.status).toBe(200)
    }

    const limited = await app.request('/stats', { headers: { 'x-api-key': 'key-a' } })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('60')

    const other = await app.request('/stats', { headers: { 'x-api-key': 'key-b' } })
    expect(other.status).toBe(200)
  })

  it('GET /docs menyajikan referensi Scalar sebagai HTML', async () => {
    const { app } = createTestApp()
    const response = await app.request('/docs')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('Scalar')
  })

  it('GET /openapi.json memuat path dan security scheme dari route', async () => {
    const { app } = createTestApp()
    const response = await app.request('/openapi.json')

    expect(response.status).toBe(200)
    const document = (await response.json()) as {
      openapi: string
      info: { description: string }
      paths: Record<string, unknown>
      components: { securitySchemes: Record<string, { type: string }> }
    }

    expect(document.openapi).toBe('3.1.0')
    expect(document.paths).toHaveProperty('/sessions')
    expect(document.paths).toHaveProperty('/sessions/{id}/live')
    expect(document.paths).toHaveProperty('/messages')
    expect(document.paths).toHaveProperty('/stats')
    expect(document.paths).toHaveProperty('/v1/conversations/{id}/messages')
    expect(document.paths).toHaveProperty('/v1/broadcasts')
    expect(document.paths).toHaveProperty('/v1/webhooks')
    expect(document.components.securitySchemes.ApiKey?.type).toBe('apiKey')
    expect(document.components.securitySchemes.SessionToken?.type).toBe('http')
    expect(document.info.description).toContain('X-Signature: sha256=')
    expect(document.info.description).toContain('message.received')
  })

  it('GET /sessions tanpa API key tetap 401 dengan format error yang sama', async () => {
    const { app } = createTestApp()
    const response = await app.request('/sessions')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'API key wajib dikirim' },
    })
  })

  it('POST /sessions dengan body tidak valid mengembalikan 422 VALIDATION_ERROR', async () => {
    const { app } = createTestApp()
    const response = await app.request('/sessions', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key', 'content-type': 'application/json' },
      body: JSON.stringify({ label: '' }),
    })

    expect(response.status).toBe(422)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('daftar room chat memakai public_id sesi dan API key', async () => {
    const { app, conversations } = createTestApp()
    const unauthorized = await app.request(`/v1/sessions/${SESSION.publicId}/conversations`)
    expect(unauthorized.status).toBe(401)

    const response = await app.request(`/v1/sessions/${SESSION.publicId}/conversations`, {
      headers: { 'x-api-key': 'valid-key' },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [], nextCursor: null })
    expect(conversations.listRooms).toHaveBeenCalledWith(SESSION_ID, 20, undefined)
  })

  it('menandai room dibaca dan mengirim pesan lewat /v1', async () => {
    const { app, conversations, queue, messages } = createTestApp()

    const read = await app.request('/v1/conversations/c1/read', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })
    expect(read.status).toBe(200)
    expect(conversations.markRead).toHaveBeenCalledWith('c1')

    const sent = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: SESSION.publicId,
        to: '628123456789',
        text: 'Halo',
        clientRef: 'inbox-1',
      }),
    })
    expect(sent.status).toBe(202)
    expect(messages.createOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, clientRef: 'inbox-1' }),
    )
    expect(queue.add).toHaveBeenCalledOnce()
  })

  it('SSE menolak request tanpa API key', async () => {
    const { app } = createTestApp()
    const response = await app.request(`/v1/sessions/${SESSION.publicId}/events`)
    expect(response.status).toBe(401)
  })
})
